import test from 'node:test';
import assert from 'node:assert/strict';
import handler, { resolveAiPath } from '../api/ai.js';
import { EventEmitter } from 'node:events';

test('Vercel routes resolve from the request URL without query.path', () => {
  assert.equal(resolveAiPath({ url: '/api/ai/models', query: {} }), 'models');
  assert.equal(resolveAiPath({ url: '/api/ai/chat/completions?test=1' }), 'chat/completions');
  assert.equal(resolveAiPath({ query: { path: ['chat', 'completions'] } }), 'chat/completions');
  assert.equal(resolveAiPath({ url: '/api/ai?path=chat/completions', query: { path: 'chat/completions' } }), 'chat/completions');
});

function response() {
  return { headers: {}, setHeader(k, v) { this.headers[k] = v; },
    status(code) { this.code = code; return this; }, json(body) { this.body = body; return this; } };
}
test('authenticated catalog works without a Vercel catch-all query parameter', async () => {
  const originalFetch = globalThis.fetch;
  const names = ['GLOW_AI_ENABLED', 'VITE_SUPABASE_URL', 'VITE_SUPABASE_PUBLISHABLE_KEY', 'OPENROUTER_API_KEY'];
  const originalEnv = Object.fromEntries(names.map(name => [name, process.env[name]]));
  Object.assign(process.env, { GLOW_AI_ENABLED: 'true', VITE_SUPABASE_URL: 'https://example.supabase.co', VITE_SUPABASE_PUBLISHABLE_KEY: 'test', OPENROUTER_API_KEY: 'server-only-test' });
  globalThis.fetch = async (url) => {
    const path = String(url);
    if (path.includes('/auth/v1/user')) return Response.json({ id: '00000000-0000-0000-0000-000000000001', email_confirmed_at: '2026-10-11' });
    if (path.includes('/rest/v1/glow_access')) return Response.json({ active: true });
    throw new Error('Unexpected outbound call');
  };
  try {
    const res = response();
    await handler({ url: '/api/ai/models', query: {}, method: 'GET', headers: { authorization: 'Bearer test-session' } }, res);
    assert.equal(res.code, 200);
    assert.deepEqual(res.body.data.map(model => model.id), ['z-ai/glm-5.3-flash', 'anthropic/claude-haiku-5.5', 'openai/gpt-6-luna']);
  } finally {
    globalThis.fetch = originalFetch;
    for (const name of names) {
      if (originalEnv[name] === undefined) delete process.env[name];
      else process.env[name] = originalEnv[name];
    }
  }
});
const ABLIT = 'abliterated-model-large-flash';
const ablitEnv = ['GLOW_AI_ENABLED', 'VITE_SUPABASE_URL', 'VITE_SUPABASE_PUBLISHABLE_KEY', 'OPENROUTER_API_KEY', 'SUPABASE_SERVICE_ROLE_KEY', 'ABLITERATION_API_KEY'];
async function withAblitEnv(key, run) {
  const saved = Object.fromEntries(ablitEnv.map(name => [name, process.env[name]]));
  const previousFetch = globalThis.fetch;
  Object.assign(process.env, { GLOW_AI_ENABLED: 'true', VITE_SUPABASE_URL: 'https://example.supabase.co', VITE_SUPABASE_PUBLISHABLE_KEY: 'public-test', OPENROUTER_API_KEY: 'openrouter-secret', SUPABASE_SERVICE_ROLE_KEY: 'server-test' });
  if (key) process.env.ABLITERATION_API_KEY = key; else delete process.env.ABLITERATION_API_KEY;
  try { await run(); } finally {
    globalThis.fetch = previousFetch;
    for (const name of ablitEnv) if (saved[name] === undefined) delete process.env[name]; else process.env[name] = saved[name];
  }
}
const streamRes = () => Object.assign(new EventEmitter(), response(), { chunks: [], destroyed: false, writableEnded: false, write(chunk) { this.chunks.push(Buffer.from(chunk).toString()); return true; }, end() { this.writableEnded = true; } });

test('the abliterated model is listed only when its key is configured', async () => {
  for (const [key, expected] of [['', false], ['ablit-secret', true]]) {
    await withAblitEnv(key, async () => {
      globalThis.fetch = async url => {
        const path = String(url);
        if (path.includes('/auth/v1/user')) return Response.json({ id: '00000000-0000-0000-0000-000000000001', email_confirmed_at: '2026-10-11' });
        if (path.includes('/rest/v1/glow_access')) return Response.json({ active: true });
        throw new Error('Unexpected outbound call');
      };
      const res = response();
      await handler({ url: '/api/ai/models', query: {}, method: 'GET', headers: { authorization: 'Bearer test-session' } }, res);
      assert.equal(res.body.data.some(model => model.id === ABLIT), expected);
    });
  }
});

test('the abliterated model is sent to its own provider with its own key and without OpenRouter options', async () => {
  await withAblitEnv('ablit-secret', async () => {
    let upstream;
    globalThis.fetch = async (url, init) => {
      const path = String(url);
      if (path.includes('/auth/v1/user')) return Response.json({ id: '00000000-0000-0000-0000-000000000001', email_confirmed_at: '2026-10-11' });
      if (path.includes('/rest/v1/glow_access')) return Response.json({ active: true });
      if (path.includes('/rpc/glow_acquire_generation')) return Response.json(true);
      if (path.includes('/rpc/glow_reserve_tokens')) return Response.json('accepted');
      if (path.includes('/rpc/glow_settle_token_usage') || path.includes('/rpc/glow_release_generation')) return new Response(null, { status: 204 });
      if (path.startsWith('https://api.abliteration.ai/')) {
        upstream = { url: path, headers: init.headers, body: JSON.parse(init.body) };
        return new Response('data: {"choices":[{"delta":{"content":"ok"}}],"usage":{"prompt_tokens":10,"completion_tokens":2,"total_tokens":12}}\n\ndata: [DONE]\n\n');
      }
      throw new Error(`Unexpected outbound call ${path}`);
    };
    const res = streamRes();
    await handler({ url: '/api/ai/chat/completions', method: 'POST', headers: { authorization: 'Bearer user-test' }, body: { conversation_id: 'chat', scope: 'home', model: ABLIT, stream: true, web_search: true, messages: [{ role: 'user', content: 'Hi' }] } }, res);
    assert.equal(upstream.url, 'https://api.abliteration.ai/v1/chat/completions');
    assert.equal(upstream.headers.Authorization, 'Bearer ablit-secret');
    assert.equal(upstream.body.model, ABLIT);
    assert.deepEqual(upstream.body.stream_options, { include_usage: true });
    assert.equal(upstream.body.reasoning_effort, 'none');
    for (const field of ['reasoning', 'plugins', 'tools', 'session_id']) assert.ok(!(field in upstream.body), `${field} must not be sent`);
    assert.ok(!JSON.stringify(upstream).includes('openrouter-secret'));
    assert.ok(res.chunks.join('').includes('"content":"ok"'));
  });
});

test('the per-model daily limit answers 429 with its own message and never calls the provider', async () => {
  await withAblitEnv('ablit-secret', async () => {
    let providerCalls = 0;
    globalThis.fetch = async url => {
      const path = String(url);
      if (path.includes('/auth/v1/user')) return Response.json({ id: '00000000-0000-0000-0000-000000000001', email_confirmed_at: '2026-10-11' });
      if (path.includes('/rest/v1/glow_access')) return Response.json({ active: true });
      if (path.includes('/rpc/glow_acquire_generation')) return Response.json(true);
      if (path.includes('/rpc/glow_reserve_tokens')) return Response.json('model_limit');
      if (path.includes('/rpc/glow_release_generation')) return new Response(null, { status: 204 });
      providerCalls++; throw new Error('Unexpected provider request');
    };
    const res = streamRes();
    await handler({ url: '/api/ai/chat/completions', method: 'POST', headers: { authorization: 'Bearer user-test' }, body: { conversation_id: 'chat', scope: 'home', model: ABLIT, stream: true, messages: [{ role: 'user', content: 'Hi' }] } }, res);
    assert.equal(res.code, 429);
    assert.match(res.body.error.message, /Daily limit for this model reached/);
    assert.ok(!/wait a minute/i.test(res.body.error.message), 'must not trigger the per-minute retry of the agent');
    assert.equal(providerCalls, 0);
  });
});

test('AI server fails closed before release', async () => {
  delete process.env.GLOW_AI_ENABLED;
  const res = response();
  await handler({ headers: {} }, res);
  assert.equal(res.code, 503);
  assert.equal(res.headers['Cache-Control'], 'no-store');
});
test('AI server rejects anonymous calls before contacting provider', async () => {
  process.env.GLOW_AI_ENABLED = 'true';
  process.env.VITE_SUPABASE_URL = 'https://example.supabase.co';
  process.env.VITE_SUPABASE_PUBLISHABLE_KEY = 'test';
  process.env.OPENROUTER_API_KEY = 'server-only-test';
  try {
    const res = response();
    await handler({ headers: {} }, res);
    assert.equal(res.code, 401);
    assert.ok(!JSON.stringify(res.body).includes('server-only-test'));
  } finally { delete process.env.GLOW_AI_ENABLED; }
});

test('chat rejects missing quota configuration or exhausted allowance before provider call', async () => {
  const names=['GLOW_AI_ENABLED','VITE_SUPABASE_URL','VITE_SUPABASE_PUBLISHABLE_KEY','OPENROUTER_API_KEY','SUPABASE_SERVICE_ROLE_KEY'];
  const saved=Object.fromEntries(names.map(name=>[name,process.env[name]]));
  const previousFetch=globalThis.fetch;
  Object.assign(process.env,{GLOW_AI_ENABLED:'true',VITE_SUPABASE_URL:'https://example.supabase.co',VITE_SUPABASE_PUBLISHABLE_KEY:'public-test',OPENROUTER_API_KEY:'provider-test'});
  let providerCalls=0, released=0;
  globalThis.fetch=async url=>{
    const path=String(url);
    if(path.includes('/auth/v1/user')) return Response.json({id:'00000000-0000-0000-0000-000000000001',email_confirmed_at:'2026-10-11'});
    if(path.includes('/rest/v1/glow_access')) return Response.json({active:true});
    if(path.includes('/rpc/glow_acquire_generation')) return Response.json(true);
    if(path.includes('/rpc/glow_reserve_tokens')) return Response.json('credits');
    if(path.includes('/rpc/glow_release_generation')) { released++; return new Response(null,{status:204}); }
    providerCalls++; throw new Error('Unexpected provider request');
  };
  const req={url:'/api/ai/chat/completions',method:'POST',headers:{authorization:'Bearer user-test'},body:{conversation_id:'chat',scope:'home',model:'z-ai/glm-5.3-flash',stream:true,messages:[{role:'user',content:'Hi'}]}};
  try {
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    const missing=response(); await handler(req,missing); assert.equal(missing.code,503);
    process.env.SUPABASE_SERVICE_ROLE_KEY='server-test';
    const exhausted=Object.assign(new EventEmitter(),response());
    await handler(req,exhausted);
    assert.equal(exhausted.code,429); assert.equal(providerCalls,0); assert.equal(released,1);
  } finally {
    globalThis.fetch=previousFetch;
    for(const name of names) if(saved[name]===undefined) delete process.env[name]; else process.env[name]=saved[name];
  }
});
