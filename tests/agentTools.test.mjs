import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { CODE_TOOL_SETS, codeToolsFor } from '../api/agentTools.js';
import handler from '../api/ai.js';

const names = (tools) => tools.map(tool => tool.function.name);

test('plan set is read-only and the agent set adds writes and commands', () => {
  assert.deepEqual(names(CODE_TOOL_SETS.code_plan), ['code_list', 'code_read', 'code_search', 'doc_read', 'update_tasks']);
  assert.deepEqual(names(CODE_TOOL_SETS.code_agent).slice(5), ['code_edit', 'code_create', 'code_delete', 'code_run']);
  for (const tool of CODE_TOOL_SETS.code_agent) assert.match(tool.function.name, /^[a-z0-9_]{1,64}$/);
});

test('unknown and inherited names give no tools and the sets cannot be modified', () => {
  for (const name of ['', 'nope', 'constructor', '__proto__', 'toString', undefined, null, 5, {}]) assert.equal(codeToolsFor(name), null, String(name));
  assert.throws(() => { 'use strict'; CODE_TOOL_SETS.code_agent.push({}); });
});

test('every required argument is declared and edits stay under the 20000 character call cap', () => {
  for (const tool of CODE_TOOL_SETS.code_agent) {
    const { properties, required } = tool.function.parameters;
    for (const key of required) assert.ok(properties[key], `${tool.function.name}.${key}`);
  }
  const edit = CODE_TOOL_SETS.code_agent.find(tool => tool.function.name === 'code_edit').function.parameters.properties;
  assert.ok(edit.old_string.maxLength + edit.new_string.maxLength + edit.path.maxLength < 20000);
  const create = CODE_TOOL_SETS.code_agent.find(tool => tool.function.name === 'code_create').function.parameters.properties;
  assert.ok(create.content.maxLength + create.path.maxLength < 20000);
});

async function withServer(run) {
  const envNames = ['GLOW_AI_ENABLED', 'VITE_SUPABASE_URL', 'VITE_SUPABASE_PUBLISHABLE_KEY', 'OPENROUTER_API_KEY', 'SUPABASE_SERVICE_ROLE_KEY'];
  const saved = Object.fromEntries(envNames.map(name => [name, process.env[name]]));
  const previousFetch = globalThis.fetch;
  Object.assign(process.env, { GLOW_AI_ENABLED: 'true', VITE_SUPABASE_URL: 'https://example.supabase.co', VITE_SUPABASE_PUBLISHABLE_KEY: 'test', OPENROUTER_API_KEY: 'provider-test', SUPABASE_SERVICE_ROLE_KEY: 'server-test' });
  const upstream = [];
  globalThis.fetch = async (url, init) => {
    const path = String(url);
    if (path.includes('/auth/v1/user')) return Response.json({ id: '00000000-0000-0000-0000-000000000001', email_confirmed_at: '2026-10-11' });
    if (path.includes('/rest/v1/glow_access')) return Response.json({ active: true });
    if (path.includes('/rpc/glow_acquire_generation')) return Response.json(true);
    if (path.includes('/rpc/glow_reserve_tokens')) return Response.json('accepted');
    if (path.includes('/rpc/glow_settle_token_usage') || path.includes('/rpc/glow_release_generation')) return Response.json(null);
    if (path.startsWith('https://openrouter.ai/')) {
      upstream.push(JSON.parse(init.body));
      return new Response('data: {"choices":[{"delta":{"content":"ok"}}]}\n\ndata: [DONE]\n');
    }
    throw new Error('Unexpected request');
  };
  const send = async (body) => {
    const res = Object.assign(new EventEmitter(), { headers: {}, chunks: [], setHeader(k, v) { this.headers[k] = v; }, status(code) { this.statusCode = code; return this; }, json(data) { this.data = data; }, write(chunk) { this.chunks.push(chunk); return true; }, end() {} });
    await handler({ url: '/api/ai/chat/completions', method: 'POST', headers: { authorization: 'Bearer test-session' }, body: { conversation_id: 'chat', model: 'anthropic/claude-haiku-5.5', stream: true, messages: [{ role: 'user', content: 'fix the test' }], ...body } }, res);
    return res;
  };
  try { await run(send, upstream); }
  finally {
    globalThis.fetch = previousFetch;
    for (const name of envNames) if (saved[name] === undefined) delete process.env[name]; else process.env[name] = saved[name];
  }
}

test('the server forwards only its own tool schemas for a named set', async () => {
  await withServer(async (send, upstream) => {
    const agent = await send({ scope: 'code', tool_set: 'code_agent', tools: [{ type: 'openrouter:shell' }, { type: 'function', function: { name: 'code_evil' } }] });
    assert.equal(agent.statusCode, 200);
    assert.deepEqual(names(upstream[0].tools), names(CODE_TOOL_SETS.code_agent));
    const plan = await send({ scope: 'code', tool_set: 'code_plan' });
    assert.equal(plan.statusCode, 200);
    assert.equal(names(upstream[1].tools).includes('code_edit'), false);
    assert.equal(names(upstream[1].tools).includes('code_run'), false);
  });
});

test('a tool set wins over the document workspace tools and keeps web search first', async () => {
  await withServer(async (send, upstream) => {
    const res = await send({ scope: 'code', tool_set: 'code_plan', workspace_tools: true, web_search: true });
    assert.equal(res.statusCode, 200);
    assert.equal(upstream[0].tools[0].type, 'openrouter:web_search');
    assert.equal(names(upstream[0].tools.filter(tool => tool.type === 'function')).includes('workspace_read_file'), false);
    assert.equal(names(upstream[0].tools.filter(tool => tool.type === 'function')).includes('code_read'), true);
  });
});

test('unknown tool sets and sets outside the code scope are refused before the provider', async () => {
  await withServer(async (send, upstream) => {
    for (const body of [{ scope: 'code', tool_set: 'everything' }, { scope: 'home', tool_set: 'code_agent' }, { scope: 'med', tool_set: 'code_plan' }, { scope: 'code', tool_set: 7 }]) {
      const res = await send(body);
      assert.equal(res.statusCode, 400, JSON.stringify(body));
    }
    assert.equal(upstream.length, 0);
  });
});

test('document workspace tools keep working without a tool set', async () => {
  await withServer(async (send, upstream) => {
    const res = await send({ scope: 'code', workspace_tools: true });
    assert.equal(res.statusCode, 200);
    assert.deepEqual(names(upstream[0].tools), ['workspace_list_files', 'workspace_read_file']);
  });
});
