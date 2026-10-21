import { createClient } from '@supabase/supabase-js';
import { randomUUID } from 'node:crypto';
import { admitRequest, waitForDrain } from './admission.js';
import { createUsageCollector, reservationFor } from './tokenUsage.js';
import { webSearchOptions } from './webSearch.js';
import { researchPolicy } from './researchPolicy.js';
import { validMessages } from './messageValidation.js';
import { withPromptCache } from './promptCache.js';

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
  if (body?.web_search !== undefined && typeof body.web_search !== 'boolean') return fail(400, 'Invalid web search option');
  if (body?.workspace_tools !== undefined && typeof body.workspace_tools !== 'boolean') return fail(400, 'Invalid workspace tools option');
  if (!body || typeof body.conversation_id !== 'string' || !['home','code','med'].includes(body.scope)) return fail(400, 'Conversation required');
  if (!body || !models.some(model => model.id === body.model) || body.stream !== true || !validMessages(body.messages)) return fail(400, 'Invalid conversation or attachments');
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceKey) return fail(503, 'Request limits not configured');
  const budgetClient = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const abort = new AbortController();
  const timer = setTimeout(() => abort.abort(), 110000);
  res.on('close', () => abort.abort());
  const leaseToken = randomUUID();
  let leased = false;
  let admitted = false;
  let rejectedByProvider = false;
  let streamingResponse = false;
  const usageCollector = createUsageCollector();
  const maxOutput = Math.max(16, Math.min(Number(body.max_tokens) || 4096, 16384));
  try {
    const lease = await client.rpc('glow_acquire_generation', { p_scope: body.scope, p_conversation: body.conversation_id, p_token: leaseToken });
    if (lease.error) return fail(403, 'Conversation access denied');
    if (!lease.data) return fail(409, 'A previous answer is still finishing. Please try again shortly.');
    leased = true;
    // Search adds retrieved context beyond the submitted conversation.
    const searchContextReserve = body.web_search === true ? 80000 : 0;
    const rejection = await admitRequest(budgetClient, user.id, leaseToken, reservationFor(body.messages,maxOutput) + searchContextReserve,body.model);
    if (rejection) return fail(rejection.status, rejection.message);
    admitted = true;
    const cacheHaiku = body.model === 'anthropic/claude-haiku-5.5';
    const providerMessages = body.web_search === true ? [
      // The client adds this policy for direct development calls; avoid paying
      // for the same long instructions twice on authenticated cloud requests.
      ...(body.messages.some(message => message.role === 'system' && typeof message.content === 'string' && message.content.includes('Current research timestamp:')) ? [] : [{ role:'system', content:researchPolicy() }]),
      ...body.messages,
    ] : body.messages;
    const upstream = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST', signal: abort.signal,
      headers: { Authorization: `Bearer ${providerKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: body.model, messages: cacheHaiku ? withPromptCache(providerMessages) : providerMessages, stream: true,
        ...(cacheHaiku ? { session_id: body.conversation_id, stream_options: { include_usage: true } } : {}),
        ...webSearchOptions(body.web_search),
        ...(body.workspace_tools ? { tools: [
          ...(body.web_search ? webSearchOptions(true).tools : []),
          { type: 'function', function: { name: 'workspace_list_files', description: 'List supported project files and folders in the selected Glow workspace. Call before choosing files to inspect.', parameters: { type: 'object', properties: {}, additionalProperties: false } } },
          { type: 'function', function: { name: 'workspace_read_file', description: 'Read one supported file from the selected workspace. Use a relative_path returned by workspace_list_files.', parameters: { type: 'object', properties: { relative_path: { type: 'string', maxLength: 500 } }, required: ['relative_path'], additionalProperties: false } } },
        ] } : {}),
        max_tokens: maxOutput,
        temperature: Number.isFinite(body.temperature) ? Math.max(0, Math.min(body.temperature, 2)) : 0.7, reasoning: { effort: 'low' } }),
    });
    if (!upstream.ok) { rejectedByProvider = true; return fail(502, 'Provider unavailable. Try again later.'); }
    if (!upstream.body) return fail(502, 'Provider unavailable. Try again later.');
    res.statusCode = 200;
    res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
    streamingResponse = true;
    for await (const chunk of upstream.body) {
      usageCollector.push(chunk);
      if (res.destroyed) break;
      if (!res.write(chunk)) await waitForDrain(res);
    }
  } catch {
    if (!res.headersSent) fail(502, 'Generation interrupted. Try again.');
  } finally {
    clearTimeout(timer);
    try {
      if (admitted) {
      const usage = usageCollector.finish();
      await budgetClient.rpc('glow_settle_token_usage', { p_request:leaseToken, p_input:usage?.input ?? null,
        p_output:usage?.output ?? null, p_total:usage?.total ?? null, p_failed:rejectedByProvider,
        p_cost:usage?.costUsd ?? null, p_cache_read:usage?.cacheReadTokens ?? null,
        p_cache_write:usage?.cacheWriteTokens ?? null });
      }
    } finally {
      try {
        if (leased) await client.rpc('glow_release_generation', { p_scope: body.scope, p_conversation: body.conversation_id, p_token: leaseToken });
      } finally {
        // The client starts the next agent turn as soon as the stream closes.
        // Keep it open until accounting and the conversation lease are released.
        if (streamingResponse && !res.writableEnded) res.end();
      }
    }
  }
}
