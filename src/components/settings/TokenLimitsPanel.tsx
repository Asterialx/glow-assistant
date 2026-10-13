import { useEffect, useState } from "react";
import { supabase } from "../../auth/client";

type Summary = { granted: number; used: number; reserved: number; remaining: number };
const number = (value: number) => value.toLocaleString("ru-RU");

export function TokenLimitsPanel() {
  const [summary, setSummary] = useState<Summary | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    let alive = true;
    const refresh = async () => {
      const result = await supabase?.rpc("glow_token_summary");
      if (!alive) return;
      if (!result || result.error) { setError("Не удалось загрузить лимит токенов. Проверьте подключение и настройку базы."); return; }
      setSummary(result.data); setError("");
    };
    void refresh();
    const timer = window.setInterval(() => { if (!document.hidden) void refresh(); }, 10000);
    return () => { alive = false; clearInterval(timer); };
  }, []);
  if (error) return <p role="alert" className="text-sm text-[var(--fg-muted)]">{error}</p>;
  if (!summary) return <p role="status">Загружаем лимит…</p>;
  const usedPercent = summary.granted > 0 ? Math.min(100, summary.used / summary.granted * 100) : 0;
  const heldPercent = summary.granted > 0 ? Math.min(100-usedPercent, summary.reserved / summary.granted * 100) : 0;
  return <section className="space-y-5 rounded-2xl border border-[var(--border)] bg-[var(--bg-elevated)] p-5">
    <div className="flex flex-wrap items-baseline justify-between gap-3">
      <h2 className="text-lg font-semibold">Лимит токенов</h2>
      <span className="text-sm text-[var(--fg-muted)]">{usedPercent.toFixed(1)}% использовано</span>
    </div>
    <p className="text-3xl font-semibold tabular-nums">{number(summary.remaining)} <span className="text-sm font-normal text-[var(--fg-muted)]">доступно</span></p>
    <div role="progressbar" aria-label="Использованный лимит токенов" aria-valuemin={0} aria-valuemax={100} aria-valuenow={usedPercent}
      aria-valuetext={`${number(summary.used)} из ${number(summary.granted)} токенов использовано; ${number(summary.reserved)} в резерве`}
      className="flex h-2.5 overflow-hidden rounded-full bg-[var(--bg)]">
      <div className="h-full bg-[var(--accent)] transition-[width] motion-reduce:transition-none" style={{width:`${usedPercent}%`}} />
      <div className="h-full bg-[var(--accent)] opacity-35" style={{width:`${heldPercent}%`}} />
    </div>
    <div className="flex flex-wrap justify-between gap-2 text-sm text-[var(--fg-muted)]"><span>{number(summary.used)} использовано</span><span>{number(summary.granted)} начислено</span></div>
    {summary.reserved > 0 && <p className="text-sm text-[var(--fg-muted)]">{number(summary.reserved)} токенов зарезервировано — ожидаем подтверждения расхода.</p>}
    <p className="text-xs leading-relaxed text-[var(--fg-muted)]">Входные + выходные токены по данным провайдера. История и инструкции тоже входят в запрос. Резерв не является окончательным списанием. Автоматического сброса лимита нет.</p>
  </section>;
}
