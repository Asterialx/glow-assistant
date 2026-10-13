import { createClient } from '@supabase/supabase-js';

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  const respond = (status, code, message) => res.status(status).json({ code, message });
  if (req.method !== 'POST') return respond(405, 'method', 'Метод не поддерживается.');
  const url = process.env.VITE_SUPABASE_URL;
  const key = process.env.VITE_SUPABASE_PUBLISHABLE_KEY;
  const secret = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key || !secret) return respond(503, 'configuration', 'Отправка приглашений не настроена на сервере Glow.');
  const token = req.headers.authorization?.match(/^Bearer (\S+)$/i)?.[1];
  if (!token) return respond(401, 'authentication', 'Войдите в аккаунт администратора.');
  const host = req.headers.host;
  const origin = req.headers.origin;
  if (typeof host !== 'string' || !/^[a-z0-9.-]+(?::\d+)?$/i.test(host)) return respond(400, 'origin', 'Некорректный адрес приложения.');
  const expectedOrigin = `${host.startsWith('localhost:') || host.startsWith('127.0.0.1:') ? 'http' : 'https'}://${host}`;
  if (origin && origin !== expectedOrigin) return respond(403, 'origin', 'Откройте приглашения на сайте Glow.');
  try {
    const client = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false }, global: { headers: { Authorization: `Bearer ${token}` } } });
    const { data: { user }, error: authError } = await client.auth.getUser(token);
    if (authError || !user?.email_confirmed_at) return respond(401, 'authentication', 'Сессия истекла. Войдите снова.');
    const { data: access, error: accessError } = await client.from('glow_access').select('role,active').eq('user_id', user.id).single();
    if (accessError || access?.role !== 'admin' || access.active !== true) return respond(403, 'administrator', 'Приглашать пользователей может только администратор.');
    if (JSON.stringify(req.body ?? {}).length > 2048) return respond(413, 'size', 'Запрос слишком большой.');
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
    const email = typeof body?.email === 'string' ? body.email.trim().toLowerCase() : '';
    const credits = body?.credits;
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254 || !Number.isSafeInteger(credits) || credits < 0 || credits > 1000000) return respond(400, 'validation', 'Введите корректный email и лимит от 0 до 1 000 000 токенов.');
    const { error: prepareError } = await client.rpc('glow_admin_invite', { p_email: email, p_credits: credits });
    if (prepareError) return respond(409, 'prepare', /Account already exists/i.test(prepareError.message || '') ? 'Пользователь уже зарегистрирован. Измените его лимит в разделе начисления токенов.' : 'Не удалось подготовить приглашение. Проверьте права администратора и настройки базы.');
    const admin = createClient(url, secret, { auth: { persistSession: false, autoRefreshToken: false } });
    const { error: sendError } = await admin.auth.admin.inviteUserByEmail(email, { redirectTo: expectedOrigin });
    if (sendError) {
      const code = sendError.code;
      if (sendError.status === 429 || code === 'over_email_send_rate_limit') return respond(429, 'email_limit', 'Приглашение сохранено, но достигнут лимит отправки писем. Подождите и повторите; лимит токенов не увеличится.');
      if (code === 'email_exists' || code === 'user_already_exists') return respond(409, 'existing', 'Этот email уже зарегистрирован в системе входа. Пользователь может войти или восстановить пароль.');
      return respond(502, 'email_delivery', 'Приглашение сохранено, но почтовый сервис не принял письмо. Проверьте SMTP в Supabase Auth. Повтор не увеличивает лимит токенов.');
    }
    return respond(200, 'sent', 'Приглашение отправлено. Попросите пользователя проверить входящие и спам.');
  } catch { return respond(502, 'unavailable', 'Сервис приглашений временно недоступен. Попробуйте ещё раз.'); }
}
