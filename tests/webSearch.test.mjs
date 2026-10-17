import test from 'node:test';
import assert from 'node:assert/strict';
import { webSearchOptions } from '../api/webSearch.js';
import handler from '../api/ai.js';
import { EventEmitter } from 'node:events';

test('search is opt-in and tools/cost bounds are server-owned', () => {
  assert.deepEqual(webSearchOptions(false), {});
  assert.deepEqual(webSearchOptions('true'), {});
  const tool = webSearchOptions(true).tools[0];
  assert.equal(tool.type, 'openrouter:web_search');
  assert.equal(tool.parameters.max_uses, 5);
  assert.equal(tool.parameters.max_total_results, 30);
  assert.equal(webSearchOptions(true).tools[1].parameters.max_uses, 5);
});
test('authenticated search is forwarded, user-injected tools ignored, and actual usage settled', async () => {
  const names = ['GLOW_AI_ENABLED','VITE_SUPABASE_URL','VITE_SUPABASE_PUBLISHABLE_KEY','OPENROUTER_API_KEY','SUPABASE_SERVICE_ROLE_KEY'];
  const saved = Object.fromEntries(names.map(name => [name, process.env[name]]));
  const previousFetch = globalThis.fetch;
  Object.assign(process.env, { GLOW_AI_ENABLED:'true', VITE_SUPABASE_URL:'https://example.supabase.co', VITE_SUPABASE_PUBLISHABLE_KEY:'test', OPENROUTER_API_KEY:'provider-test', SUPABASE_SERVICE_ROLE_KEY:'server-test' });
  const upstream = [], settlements = [];
  let released = 0, ended = 0;
  globalThis.fetch = async (url, init) => {
    const path = String(url);
    if (path.includes('/auth/v1/user')) return Response.json({ id:'00000000-0000-0000-0000-000000000001', email_confirmed_at:'2026-10-11' });
    if (path.includes('/rest/v1/glow_access')) return Response.json({ active:true });
    if (path.includes('/rpc/glow_acquire_generation')) return Response.json(true);
    if (path.includes('/rpc/glow_reserve_tokens')) return Response.json('accepted');
    if (path.includes('/rpc/glow_settle_token_usage')) { settlements.push(JSON.parse(init.body)); return Response.json(null); }
    if (path.includes('/rpc/glow_release_generation')) { released++; return Response.json(null); }
    if (path.startsWith('https://openrouter.ai/')) {
      upstream.push(JSON.parse(init.body));
      return new Response('data: {"choices":[{"delta":{"content":"Answer"}}]}\n\ndata: {"usage":{"prompt_tokens":120,"completion_tokens":10,"total_tokens":130,"cost":0.004}}\n\ndata: [DONE]\n');
    }
    throw new Error('Unexpected request');
  };
  try {
    for (const enabled of [true, false]) {
      const res = Object.assign(new EventEmitter(), { headers:{}, chunks:[], setHeader(k,v) { this.headers[k]=v; }, status(code) { this.statusCode=code; return this; }, json(data) { this.data=data; }, write(chunk) { this.chunks.push(chunk); return true; }, end() { assert.equal(released, ended + 1, 'release conversation before closing stream'); assert.equal(settlements.length, ended + 1, 'settle usage before next agent turn'); ended++; } });
      const hasClientResearchPolicy = enabled && upstream.length === 0;
      const messages = hasClientResearchPolicy ? [{ role:'system', content:'Current research timestamp: 2026-10-13T00:00:00.000Z UTC.' }, {role:'user',content:'Find current info'}] : [{role:'user',content:'Find current info'}];
      await handler({ url:'/api/ai/chat/completions', method:'POST', headers:{authorization:'Bearer test-session'}, body:{ conversation_id:'chat', scope:'home', model:'z-ai/glm-5.3-flash', stream:true, messages, web_search:enabled, workspace_tools:enabled, tools:[{type:'openrouter:shell'}] } }, res);
      assert.equal(res.statusCode, 200);
      assert.match(Buffer.concat(res.chunks).toString(), /Answer/);
    }
    assert.deepEqual(upstream[0].tools.slice(0, 2), webSearchOptions(true).tools);
    assert.deepEqual(upstream[0].tools.slice(2).map(tool => tool.function.name), ['workspace_list_files', 'workspace_read_file']);
    assert.equal(upstream[0].tools.some(tool => tool.type === 'openrouter:shell'), false);
    assert.equal(upstream[0].messages.filter(message => message.role === 'system' && message.content.includes('Current research timestamp:')).length, 1);
    assert.equal(upstream[1].messages.some(message => message.role === 'system' && message.content.includes('Current research timestamp:')), false);
    assert.equal(upstream[1].tools, undefined);
    assert.equal(settlements[0].p_total, 130);
    assert.equal(settlements[0].p_cost, 0.004);
    assert.equal(ended, 2);
  } finally {
    globalThis.fetch=previousFetch;
    for (const name of names) if (saved[name] === undefined) delete process.env[name]; else process.env[name]=saved[name];
  }
});
