import { createClient } from '@supabase/supabase-js';
import { randomUUID } from 'node:crypto';
import { admitRequest, waitForDrain } from './admission.js';

export function resolveAiPath(req) {
  const pathname = new URL(req.url || '/', 'http://localhost').pathname;
  if (pathname.startsWith('/api/ai/')) return pathname.slice('/api/ai/'.length).replace(/\/$/, '');
  const path = req.query?.path;
  return Array.isArray(path) ? path.join('/') : path;
}

// Provider credentials never leave this server. This endpoint is closed by default.
export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  const fail = (status, message) => res.status(status).json({ error: { message } });
  if (process.env.GLOW_AI_ENABLED !== 'true') return fail(503, 'AI temporarily unavailable');
  const url = process.env.VITE_SUPABASE_URL;
  const key = process.env.VITE_SUPABASE_PUBLISHABLE_KEY;
  const providerKey = process.env.OPENROUTER_API_KEY;
  if (!url || !key || !providerKey) return fail(503, 'Server configuration incomplete');
  const authorization = req.headers.authorization || '';
  if (!/^Bearer \S+$/.test(authorization)) return fail(401, 'Sign in required');
  const client = createClient(url, key, { auth: { persistSession: false }, global: { headers: { Authorization: authorization } } });
  const { data: { user }, error } = await client.auth.getUser(authorization.slice(7));
  if (error || !user?.email_confirmed_at) return fail(401, 'Sign in required');
  const access = await client.from('glow_access').select('active').eq('user_id', user.id).single();
  if (access.error || !access.data?.active) return fail(403, 'Access denied');
  const path = resolveAiPath(req);
  const models = [
    { id: 'z-ai/glm-5.3-flash', display_name: 'GLM 5.3 Flash', modality: 'chat', access_tier: 'paid' },
    { id: 'anthropic/claude-haiku-5.5', display_name: 'Claude Haiku 5.5', modality: 'chat', access_tier: 'paid' },
  ];
  if (path === 'models' && req.method === 'GET') {
    return res.status(200).json({ data: models });
  }
  if (path !== 'chat/completions' || req.method !== 'POST') return fail(405, 'Unsupported request');
  const body = req.body;
  if (!body || typeof body.conversation_id !== 'string' || !['home','code','med'].includes(body.scope)) return fail(400, 'Conversation required');
  if (!body || !models.some(model => model.id === body.model) || body.stream !== true || !Array.isArray(body.messages) || body.messages.length > 250 ||
      body.messages.some(m => !m || !['system', 'user', 'assistant'].includes(m.role) || typeof m.content !== 'string') ||
      JSON.stringify(body.messages).length > 200000) return fail(400, 'Invalid conversation');
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceKey) return fail(503, 'Request limits not configured');
  const budgetClient = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const abort = new AbortController();
  const timer = setTimeout(() => abort.abort(), 110000);
  res.on('close', () => abort.abort());
  const leaseToken = randomUUID();
  let leased = false;
  let admitted = false;
  try {
    const lease = await client.rpc('glow_acquire_generation', { p_scope: body.scope, p_conversation: body.conversation_id, p_token: leaseToken });
    if (lease.error) return fail(403, 'Conversation access denied');
    if (!lease.data) return fail(409, 'An answer is already being generated on another device');
    leased = true;
    const rejection = await admitRequest(budgetClient, user.id, leaseToken);
    if (rejection) return fail(rejection.status, rejection.message);
    admitted = true;
    const upstream = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST', signal: abort.signal,
      headers: { Authorization: `Bearer ${providerKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: body.model, messages: body.messages, stream: true,
        max_tokens: Math.max(16, Math.min(Number(body.max_tokens) || 4096, 8192)),
        temperature: Number.isFinite(body.temperature) ? Math.max(0, Math.min(body.temperature, 2)) : 0.7, reasoning: { effort: 'low' } }),
    });
    if (!upstream.ok || !upstream.body) return fail(502, 'Provider unavailable. Try again later.');
    res.statusCode = 200;
    res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
    for await (const chunk of upstream.body) {
      if (res.destroyed) break;
      if (!res.write(chunk)) await waitForDrain(res);
    }
    res.end();
  } catch {
    if (!res.headersSent) fail(502, 'Generation interrupted. Try again.');
    else res.end();
  } finally {
    clearTimeout(timer);
    if (admitted) await budgetClient.rpc('glow_finish_ai_request', { p_request: leaseToken });
    if (leased) await client.rpc('glow_release_generation', { p_scope: body.scope, p_conversation: body.conversation_id, p_token: leaseToken });
  }
}
