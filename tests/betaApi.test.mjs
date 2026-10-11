import test from 'node:test';
import assert from 'node:assert/strict';
import handler from '../api/ai/[...path].js';

function response() {
  return { headers: {}, setHeader(k, v) { this.headers[k] = v; },
    status(code) { this.code = code; return this; }, json(body) { this.body = body; return this; } };
}
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
