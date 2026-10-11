import { supabase } from '../auth/client';

/** One request per interval, only while visible; serialize refreshes. */
export function watchCloudChanges(scope: string, refresh: () => Promise<void | boolean>, report: (message: string) => void) {
  let stopped = false;
  let busy = false;
  let revision: number | null = null;
  const poll = async () => {
    if (stopped || busy || document.hidden || !supabase) return;
    busy = true;
    try {
      const { data,error } = await supabase.from('glow_data_versions').select('revision').eq('scope',scope).maybeSingle();
      if (error) throw error;
      const next = data?.revision ?? 0;
      if (next !== revision) {
        if (await refresh() === false) return;
        if (!stopped) revision = next;
      }
      if (!stopped) report('');
    } catch { if (!stopped) report('Не удалось обновить историю. Проверяем соединение…'); }
    finally { busy = false; }
  };
  const timer = window.setInterval(() => void poll(), 5000);
  const visible = () => { if (!document.hidden) void poll(); };
  document.addEventListener('visibilitychange',visible);
  window.addEventListener('online',visible);
  void poll();
  return () => { stopped=true; clearInterval(timer); document.removeEventListener('visibilitychange',visible); window.removeEventListener('online',visible); };
}
