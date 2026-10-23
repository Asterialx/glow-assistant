import test from 'node:test';
import assert from 'node:assert/strict';
import { runAgent } from '../src/lib/agent/loop.ts';
import { compactMessages, clipText } from '../src/lib/agent/context.ts';

const call = (id, name, args = {}) => ({ id, name, arguments: JSON.stringify(args) });
const usage = (n = 100) => ({ inputTokens: n, outputTokens: 10, costUnits: 0 });

/** A scripted model: each entry is one turn; the loop's tool results are captured for assertions. */
function harness({ turns, confirmAnswers = [], classify = () => ({ decision: 'allow' }), exec } = {}) {
  const seen = { toolSets: [], messages: [], exec: [], confirms: [], steps: [], text: '' };
  let turn = 0, confirmIndex = 0;
  const deps = {
    async turn(messages, toolSet, onToken) {
      seen.toolSets.push(toolSet);
      seen.messages.push(messages);
      const next = turns[Math.min(turn++, turns.length - 1)];
      if (next.text) onToken(next.text);
      return { calls: next.calls ?? [], usage: next.usage ?? usage() };
    },
    async exec(name, args, approved) {
      seen.exec.push({ name, args, approved });
      if (exec) return exec(name, args, approved);
      return { ok: true };
    },
    async classifyCommand(command) { return classify(command); },
    async confirm(request) { seen.confirms.push(request); return confirmAnswers[confirmIndex++] ?? 'deny'; },
    onToken(token) { seen.text += token; },
    onStep(step) { seen.steps.push(step); },
  };
  return { deps, seen };
}
const user = [{ role: 'user', content: 'fix the test' }];
const tools = (seen, turnIndex) => seen.messages[turnIndex].filter(message => message.role === 'tool').map(message => JSON.parse(message.content));

test('reads, then answers; usage and steps are collected', async () => {
  const { deps, seen } = harness({ turns: [{ calls: [call('1', 'code_list')], usage: usage(100) }, { calls: [call('2', 'code_read', { path: 'a.ts' })], usage: usage(200) }, { text: 'Готово', usage: usage(300) }] });
  const result = await runAgent(user, deps, { mode: 'auto', autonomy: 'important' });
  assert.equal(result.stopped, 'done');
  assert.equal(result.usage.inputTokens, 600);
  assert.deepEqual(result.steps.map(step => [step.name, step.status]), [['code_list', 'done'], ['code_read', 'done']]);
  assert.equal(seen.exec.length, 2);
  assert.equal(seen.exec[1].approved, false);
  assert.equal(seen.text, 'Готово');
});

test('plan mode offers the read-only set and refuses writes even if the model asks', async () => {
  const { deps, seen } = harness({ turns: [{ calls: [call('1', 'code_edit', { path: 'a.ts', old_string: 'a', new_string: 'b' }), call('2', 'code_run', { command: 'npm test' })] }, { text: 'plan' }] });
  const result = await runAgent(user, deps, { mode: 'plan', autonomy: 'important' });
  assert.deepEqual(seen.toolSets, ['code_plan', 'code_plan']);
  assert.equal(seen.exec.length, 0);
  assert.deepEqual(result.steps.map(step => step.status), ['denied', 'denied']);
  assert.match(tools(seen, 1)[0].error, /Плана/);
});

test('a command that needs approval waits for the user and runs only with it', async () => {
  const classify = () => ({ decision: 'ask', reason: 'вне белого списка' });
  const allowed = harness({ turns: [{ calls: [call('1', 'code_run', { command: 'node x.js' })] }, { text: 'ok' }], confirmAnswers: ['once'], classify });
  await runAgent(user, allowed.deps, { mode: 'auto', autonomy: 'important' });
  assert.equal(allowed.seen.confirms.length, 1);
  assert.equal(allowed.seen.confirms[0].kind, 'command');
  assert.deepEqual(allowed.seen.exec.map(item => item.approved), [true]);

  const refused = harness({ turns: [{ calls: [call('1', 'code_run', { command: 'node x.js' })] }, { text: 'ok' }], confirmAnswers: ['deny'], classify });
  const result = await runAgent(user, refused.deps, { mode: 'auto', autonomy: 'important' });
  assert.equal(refused.seen.exec.length, 0);
  assert.equal(result.steps[0].status, 'denied');
  assert.match(tools(refused.seen, 1)[0].error, /отклонил/);
});

test('allowing for the whole task asks once for the same command', async () => {
  const classify = () => ({ decision: 'ask' });
  const { deps, seen } = harness({ turns: [{ calls: [call('1', 'code_run', { command: 'node a.js' })] }, { calls: [call('2', 'code_run', { command: 'node a.js', timeout_sec: 30 })] }, { calls: [call('3', 'code_run', { command: 'node b.js' })] }, { text: 'ok' }], confirmAnswers: ['task', 'deny'], classify });
  await runAgent(user, deps, { mode: 'auto', autonomy: 'important' });
  assert.equal(seen.confirms.length, 2, 'a different command asks again');
  assert.deepEqual(seen.exec.map(item => item.args.command), ['node a.js', 'node a.js']);
});

test('a denied command never runs, even in autopilot', async () => {
  const { deps, seen } = harness({ turns: [{ calls: [call('1', 'code_run', { command: 'git push' })] }, { text: 'ok' }], classify: () => ({ decision: 'deny', reason: 'git push запрещён' }) });
  const result = await runAgent(user, deps, { mode: 'auto', autonomy: 'autopilot' });
  assert.equal(seen.exec.length, 0);
  assert.equal(seen.confirms.length, 0);
  assert.equal(result.steps[0].status, 'denied');
  assert.match(tools(seen, 1)[0].error, /git push/);
});

test('autopilot skips questions about commands but still asks before deleting', async () => {
  const { deps, seen } = harness({ turns: [{ calls: [call('1', 'code_run', { command: 'node x.js' }), call('2', 'code_delete', { path: 'old.ts' })] }, { text: 'ok' }], confirmAnswers: ['deny'], classify: () => ({ decision: 'ask' }) });
  await runAgent(user, deps, { mode: 'auto', autonomy: 'autopilot' });
  assert.deepEqual(seen.confirms.map(request => request.kind), ['delete']);
  assert.deepEqual(seen.exec.map(item => [item.name, item.approved]), [['code_run', false]]);
});

test('the eleventh changed file asks first, except in autopilot', async () => {
  const edits = Array.from({ length: 11 }, (_, index) => call(`e${index}`, 'code_edit', { path: `f${index}.ts`, old_string: 'a', new_string: 'b' }));
  const turns = [{ calls: edits.slice(0, 5) }, { calls: edits.slice(5, 10) }, { calls: edits.slice(10) }, { text: 'ok' }];
  const careful = harness({ turns, confirmAnswers: ['once'] });
  const result = await runAgent(user, careful.deps, { mode: 'auto', autonomy: 'important' });
  assert.deepEqual(careful.seen.confirms.map(request => request.kind), ['many_files']);
  assert.equal(result.changedFiles.length, 11);
  const auto = harness({ turns });
  await runAgent(user, auto.deps, { mode: 'auto', autonomy: 'autopilot' });
  assert.equal(auto.seen.confirms.length, 0);
});

test('task approval mode asks before each task starts and a refusal is passed to the model', async () => {
  const list = (statuses) => call('t', 'update_tasks', { tasks: statuses.map((status, index) => ({ id: `t${index + 1}`, title: `Задача ${index + 1}`, status })) });
  const { deps, seen } = harness({ turns: [{ calls: [list(['in_progress', 'pending'])] }, { calls: [list(['pending', 'in_progress'])] }, { text: 'ok' }], confirmAnswers: ['deny', 'once'] });
  const result = await runAgent(user, deps, { mode: 'auto', autonomy: 'tasks' });
  assert.deepEqual(seen.confirms.map(request => [request.kind, request.title]), [['task', 'Задача 1'], ['task', 'Задача 2']]);
  assert.match(tools(seen, 1)[0].error, /Задача 1/);
  assert.deepEqual(result.tasks.map(task => task.status), ['pending', 'in_progress']);
});

test('other levels do not interrupt for tasks, and invalid task lists are rejected', async () => {
  const bad = call('b', 'update_tasks', { tasks: [{ id: 'a', title: 'x', status: 'in_progress' }, { id: 'b', title: 'y', status: 'in_progress' }] });
  const good = call('g', 'update_tasks', { tasks: [{ id: 'a', title: 'x', status: 'in_progress' }] });
  const { deps, seen } = harness({ turns: [{ calls: [bad] }, { calls: [good] }, { text: 'ok' }] });
  const result = await runAgent(user, deps, { mode: 'auto', autonomy: 'important' });
  assert.equal(seen.confirms.length, 0);
  assert.match(tools(seen, 1)[0].error, /in_progress/);
  assert.equal(result.tasks.length, 1);
});

test('tool errors and malformed calls are returned to the model instead of crashing the run', async () => {
  const { deps, seen } = harness({
    turns: [{ calls: [call('1', 'code_read', { path: 'missing.ts' }), { id: '2', name: 'code_read', arguments: '{bad' }, call('3', 'rm_everything')] }, { text: 'ok' }],
    exec: () => { throw 'Файл или папка не найдены.'; },
  });
  const result = await runAgent(user, deps, { mode: 'auto', autonomy: 'important' });
  assert.equal(result.stopped, 'done');
  const answers = tools(seen, 1);
  assert.equal(answers[0].error, 'Файл или папка не найдены.');
  assert.match(answers[1].error, /JSON/);
  assert.match(answers[2].error, /rm_everything/);
});

test('a failing command is marked as an error step and keeps its output for the model', async () => {
  const { deps, seen } = harness({ turns: [{ calls: [call('1', 'code_run', { command: 'npm test' })] }, { text: 'ok' }], exec: () => ({ exit_code: 1, stdout: '', stderr: '1 failing', timed_out: false }) });
  const result = await runAgent(user, deps, { mode: 'auto', autonomy: 'important' });
  assert.equal(result.steps[0].status, 'error');
  assert.equal(result.steps[0].detail, 'код 1');
  assert.equal(tools(seen, 1)[0].stderr, '1 failing');
});

test('an edit step carries its diff', async () => {
  const { deps } = harness({ turns: [{ calls: [call('1', 'code_edit', { path: 'a.ts', old_string: 'a', new_string: 'b' })] }, { text: 'ok' }], exec: () => ({ replacements: 1, diff: '-a\n+b' }) });
  const result = await runAgent(user, deps, { mode: 'auto', autonomy: 'important' });
  assert.equal(result.steps[0].diff, '-a\n+b');
});

test('the same call three times is refused so the model cannot loop forever', async () => {
  const same = call('x', 'code_read', { path: 'a.ts' });
  const { deps, seen } = harness({ turns: [{ calls: [{ ...same, id: '1' }] }, { calls: [{ ...same, id: '2' }] }, { calls: [{ ...same, id: '3' }] }, { text: 'ok' }] });
  await runAgent(user, deps, { mode: 'auto', autonomy: 'important' });
  assert.equal(seen.exec.length, 2);
  assert.match(tools(seen, 3)[2].error, /повторяете/);
});

test('turn limit, token budget and abort stop the run with a reason', async () => {
  const forever = { calls: [call('1', 'code_list')] };
  const unique = (turns) => turns.map((turn, index) => ({ ...turn, calls: turn.calls.map(item => ({ ...item, id: `c${index}`, arguments: JSON.stringify({ path: `d${index}` }) })) }));
  const limited = harness({ turns: unique(Array(10).fill(forever)) });
  assert.equal((await runAgent(user, limited.deps, { mode: 'auto', autonomy: 'important', maxTurns: 4 })).stopped, 'max_turns');
  assert.equal(limited.seen.toolSets.length, 4);
  const costly = harness({ turns: unique(Array(10).fill({ ...forever, usage: usage(5000) })) });
  assert.equal((await runAgent(user, costly.deps, { mode: 'auto', autonomy: 'important', budgetTokens: 8000 })).stopped, 'budget');
  const controller = new AbortController();
  const aborted = harness({ turns: unique(Array(10).fill(forever)) });
  const original = aborted.deps.exec;
  aborted.deps.exec = async (...args) => { controller.abort(); return original(...args); };
  assert.equal((await runAgent(user, aborted.deps, { mode: 'auto', autonomy: 'important', signal: controller.signal })).stopped, 'aborted');
});

test('a model failure mid-task still returns the steps and changed files so the work can be undone', async () => {
  const { deps } = harness({ turns: [{ calls: [call('1', 'code_edit', { path: 'a.ts', old_string: 'a', new_string: 'b' })] }, { text: 'never' }] });
  const original = deps.turn;
  let turns = 0;
  deps.turn = async (...args) => { if (++turns === 2) throw new Error('Ответ оборван: не хватило лимита длины.'); return original(...args); };
  const result = await runAgent(user, deps, { mode: 'auto', autonomy: 'important' });
  assert.equal(result.stopped, 'error');
  assert.match(result.error, /оборван/);
  assert.deepEqual(result.changedFiles, ['a.ts']);
  assert.equal(result.steps.length, 1);
});

test('assistant text from different turns is separated by a blank line', async () => {
  const { deps, seen } = harness({ turns: [{ text: 'Смотрю.', calls: [call('1', 'code_list')] }, { text: 'Готово.' }] });
  await runAgent(user, deps, { mode: 'auto', autonomy: 'important' });
  assert.equal(seen.text, 'Смотрю.\n\nГотово.');
});

test('old tool results shrink while recent ones and the call pairing stay intact', () => {
  const messages = [{ role: 'user', content: 'task' }];
  for (let index = 0; index < 14; index++) {
    messages.push({ role: 'assistant', content: null, tool_calls: [{ id: `c${index}`, type: 'function', function: { name: 'code_read', arguments: '{}' } }] });
    messages.push({ role: 'tool', tool_call_id: `c${index}`, name: 'code_read', content: `RESULT ${index} ` + 'x'.repeat(5000) });
  }
  const compact = compactMessages(messages, 10);
  const tool = compact.filter(message => message.role === 'tool');
  assert.equal(tool.length, 14);
  assert.ok(tool.slice(0, 4).every(message => message.content.startsWith('[сокращено') && message.content.length < 260));
  assert.ok(tool.slice(4).every(message => message.content.length > 5000));
  assert.deepEqual(compact.map(message => message.tool_call_id ?? message.tool_calls?.[0].id ?? null), messages.map(message => message.tool_call_id ?? message.tool_calls?.[0].id ?? null));
  assert.equal(messages[2].content.startsWith('RESULT 0'), true, 'the original history is not modified');
  const short = messages.slice(0, 5);
  assert.equal(compactMessages(short, 10), short, 'nothing old enough means the same array comes back');
});

test('clipText keeps the beginning and the end of long output', () => {
  const clipped = clipText('A'.repeat(50) + 'MIDDLE' + 'Z'.repeat(50), 40);
  assert.ok(clipped.startsWith('AAAA') && clipped.endsWith('ZZZZ') && clipped.includes('пропущено'));
  assert.equal(clipText('short', 40), 'short');
});
