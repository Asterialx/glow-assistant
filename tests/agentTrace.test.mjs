import test from 'node:test';
import assert from 'node:assert/strict';
import { appendAgentTrace, splitAgentTrace } from '../src/lib/agent/trace.ts';

const trace = {
  v: 1, taskId: 'task-1', stopped: 'done',
  steps: [{ id: 'c1', name: 'code_edit', summary: 'Правлю a.ts', status: 'done', diff: '-a\n+b', ms: 12 }, { id: 'c2', name: 'code_run', summary: 'Запускаю npm test', status: 'error', detail: 'код 1' }],
  tasks: [{ id: 't1', title: 'Починить', status: 'done' }],
  changedFiles: ['a.ts'],
};

test('a trace survives storage and leaves the answer text untouched', () => {
  const stored = appendAgentTrace('Готово. Тесты зелёные.\n', trace);
  const { text, trace: restored } = splitAgentTrace(stored);
  assert.equal(text, 'Готово. Тесты зелёные.');
  assert.deepEqual(restored, trace);
});

test('answers without a trace are returned as they are', () => {
  assert.deepEqual(splitAgentTrace('Просто ответ'), { text: 'Просто ответ', trace: null });
  assert.deepEqual(splitAgentTrace('```glow-agent\nне в конце\n```\nи дальше текст'), { text: '```glow-agent\nне в конце\n```\nи дальше текст', trace: null });
});

test('a damaged or forged trace is dropped instead of being shown or trusted', () => {
  const broken = splitAgentTrace('Текст\n\n```glow-agent\n{bad json\n```');
  assert.equal(broken.trace, null);
  assert.equal(broken.text, 'Текст');
  const cut = splitAgentTrace('Текст\n\n```glow-agent\n{"v":1,"taskId":"a"');
  assert.equal(cut.trace, null);
  assert.equal(cut.text, 'Текст');
  const stored = (value) => `T\n\n\`\`\`glow-agent\n${JSON.stringify(value)}\n\`\`\``;
  for (const forged of [{ ...trace, v: 2 }, { ...trace, taskId: 'x'.repeat(65) }, { ...trace, stopped: 'hacked' }, { ...trace, steps: 'no' }, { ...trace, tasks: null }, null, 7]) {
    assert.equal(splitAgentTrace(stored(forged)).trace, null, JSON.stringify(forged)?.slice(0, 60));
  }
});

test('invalid steps and tasks are filtered and oversized diffs are capped', () => {
  const noisy = { ...trace, steps: [...trace.steps, { id: 1, name: 'x' }, { id: 'c3', name: 'code_edit', summary: 's', status: 'weird' }, { id: 'c4', name: 'code_edit', summary: 'big', status: 'done', diff: 'd'.repeat(10000) }], tasks: [...trace.tasks, { id: 't2', title: 'x', status: 'nope' }] };
  const { trace: restored } = splitAgentTrace(appendAgentTrace('T', noisy));
  assert.deepEqual(restored.steps.map(step => step.id), ['c1', 'c2', 'c4']);
  assert.equal(restored.steps[2].diff.length, 3000);
  assert.deepEqual(restored.tasks.map(task => task.id), ['t1']);
});

test('a run that failed keeps its trace so the changes can still be undone', () => {
  const failed = { ...trace, stopped: 'error' };
  assert.equal(splitAgentTrace(appendAgentTrace('Часть ответа', failed)).trace.stopped, 'error');
});
