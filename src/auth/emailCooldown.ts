const PREFIX = 'glow.emailCooldown.';
function key(email: string): string { return PREFIX + encodeURIComponent(email.trim().toLowerCase()); }
export function emailCooldown(email: string): number {
  try { const value = Number(localStorage.getItem(key(email))); return Number.isFinite(value) && value > Date.now() && value <= Date.now() + 60000 ? value : 0; }
  catch { return 0; }
}
export function beginEmailCooldown(email: string): number {
  const until = Date.now() + 60000;
  try { localStorage.setItem(key(email), String(until)); } catch { /* Server still enforces the interval. */ }
  return until;
}
