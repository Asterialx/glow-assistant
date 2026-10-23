import { useEffect, useRef } from "react";
import { ShieldQuestion } from "lucide-react";
import type { Locale } from "../../lib/i18n";
import { useAgentStore } from "../../stores/agentStore";

/** Asks before an action the policy marked as important. Closing it counts as "no". */
export function AgentConfirmDialog({ locale }: { locale: Locale }) {
  const ru = locale === "ru";
  const pending = useAgentStore((state) => state.pending);
  const answer = useAgentStore((state) => state.answer);
  const deny = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!pending) return;
    deny.current?.focus();
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") answer("deny"); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [pending, answer]);

  if (!pending) return null;
  const { request } = pending;
  const scope = request.kind === "task" ? (ru ? "Разрешить" : "Allow") : (ru ? "Разрешить на всю задачу" : "Allow for this task");
  return (
    <div className="fixed inset-0 z-[150] flex items-center justify-center bg-black/55 p-4" role="presentation">
      <section role="alertdialog" aria-modal="true" aria-labelledby="glow-agent-confirm-title" className="w-full max-w-md overflow-hidden rounded-[26px] border border-[var(--border)] bg-[var(--bg-elevated)] shadow-2xl">
        <div className="flex items-center gap-3 border-b border-[var(--border)] px-6 py-5">
          <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-[var(--accent-soft)] text-[var(--accent)]"><ShieldQuestion size={20} /></span>
          <div className="min-w-0">
            <h2 id="glow-agent-confirm-title" className="text-lg font-medium">{ru ? "Нужно ваше разрешение" : "Your permission is needed"}</h2>
            <p className="text-[12px] text-[var(--fg-muted)]">{request.reason}</p>
          </div>
        </div>
        <div className="space-y-4 px-6 py-5">
          <p className="break-words rounded-xl bg-[var(--bg)] px-3 py-2.5 font-mono text-[13px] leading-5 text-[var(--fg)]">{request.title}</p>
          <div className="flex flex-col gap-2">
            <button type="button" onClick={() => answer("once")} className="w-full rounded-xl bg-[var(--accent)] px-4 py-3 text-sm font-medium text-white hover:opacity-90">{ru ? "Разрешить один раз" : "Allow once"}</button>
            {request.kind !== "delete" && <button type="button" onClick={() => answer("task")} className="w-full rounded-xl bg-[var(--bg-hover)] px-4 py-2.5 text-sm text-[var(--fg)] hover:bg-[var(--bg-active)]">{scope}</button>}
            <button ref={deny} type="button" onClick={() => answer("deny")} className="w-full rounded-xl px-4 py-2 text-sm text-[var(--fg-muted)] hover:bg-[var(--bg-hover)]">{ru ? "Отклонить" : "Decline"}</button>
          </div>
        </div>
      </section>
    </div>
  );
}
