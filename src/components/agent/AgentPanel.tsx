import { Check, CircleDashed, LoaderCircle, X } from "lucide-react";
import type { Locale } from "../../lib/i18n";
import { stepSubject } from "../../lib/agent/policy";
import { useAgentStore } from "../../stores/agentStore";
import { cn } from "../../lib/utils";

/** The right-hand panel of the Code tab: console of the commands the agent ran, and the plan with its tasks. */
export function AgentPanel({ locale, onExecutePlan }: { locale: Locale; onExecutePlan: () => void }) {
  const ru = locale === "ru";
  const tab = useAgentStore((state) => state.panelTab);
  const openPanel = useAgentStore((state) => state.openPanel);
  const closePanel = useAgentStore((state) => state.closePanel);
  const steps = useAgentStore((state) => state.steps);
  const tasks = useAgentStore((state) => state.tasks);
  const plan = useAgentStore((state) => state.plan);
  const running = useAgentStore((state) => state.running);
  const runs = steps.filter((step) => step.name === "code_run");

  const tabButton = (id: "console" | "plan", label: string) => (
    <button
      type="button"
      onClick={() => openPanel(id)}
      className={cn("rounded-lg px-2.5 py-1.5 text-[13px] transition-colors hover:bg-[var(--bg-hover)] hover:text-[var(--fg)]", tab === id ? "bg-[var(--bg-hover)] text-[var(--fg)]" : "text-[var(--fg-muted)]")}
    >{label}</button>
  );

  return (
    <aside className="hidden w-[380px] shrink-0 flex-col border-l border-[var(--border)] md:flex" aria-label={ru ? "Панель агента" : "Agent panel"}>
      <div className="flex items-center gap-1 px-3 py-2">
        {tabButton("console", ru ? "Консоль" : "Console")}
        {tabButton("plan", ru ? "План" : "Plan")}
        <button type="button" onClick={closePanel} aria-label={ru ? "Закрыть панель" : "Close panel"} className="ml-auto rounded-lg p-1.5 text-[var(--fg-muted)] transition-colors hover:bg-[var(--bg-hover)] hover:text-[var(--fg)]"><X size={14} /></button>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-3 pb-4 text-[13px]">
        {tab === "console" ? (
          runs.length === 0 ? (
            <p className="px-1 pt-2 text-[var(--fg-faint)]">{ru ? "Здесь появится вывод команд, которые запускает агент." : "The output of the commands the agent runs shows up here."}</p>
          ) : (
            <ul className="space-y-3">
              {runs.map((step) => (
                <li key={step.id}>
                  <div className="flex items-center gap-2 font-mono text-[12.5px] text-[var(--fg)]">
                    {step.status === "running" ? <LoaderCircle size={13} className="shrink-0 animate-spin text-[var(--accent)]" /> : <span className="shrink-0 text-[var(--fg-faint)]">$</span>}
                    <span className="min-w-0 flex-1 break-words">{stepSubject(step.name, step.summary)}</span>
                  </div>
                  {step.output && <pre className="mt-1 max-h-72 overflow-auto whitespace-pre-wrap break-words rounded-lg bg-[var(--bg-elevated)] p-2 font-mono text-[12px] leading-5 text-[var(--fg-muted)]">{step.output}</pre>}
                  {step.status !== "running" && (
                    <div className={cn("mt-1 text-[11px]", step.status === "done" ? "text-[var(--fg-faint)]" : "text-red-400")}>{step.detail ?? (step.status === "denied" ? (ru ? "отклонено" : "denied") : "")}</div>
                  )}
                </li>
              ))}
            </ul>
          )
        ) : (
          <div className="space-y-3 pt-1">
            {tasks.length > 0 && (
              <ul className="space-y-1.5">
                {tasks.map((task) => (
                  <li key={task.id} className="flex items-start gap-2">
                    {task.status === "done" ? <Check size={14} className="mt-0.5 shrink-0 text-emerald-500" /> : task.status === "in_progress" ? <LoaderCircle size={14} className="mt-0.5 shrink-0 animate-spin text-[var(--accent)]" /> : <CircleDashed size={14} className="mt-0.5 shrink-0 text-[var(--fg-faint)]" />}
                    <span className={cn(task.status === "done" && "text-[var(--fg-muted)] line-through")}>{task.title}</span>
                  </li>
                ))}
              </ul>
            )}
            {plan ? (
              <>
                <div className="whitespace-pre-wrap break-words leading-6 text-[var(--fg)]">{plan}</div>
                <button type="button" disabled={running} onClick={onExecutePlan} className="rounded-lg bg-[var(--bg-hover)] px-3 py-1.5 font-medium text-[var(--fg)] transition-colors hover:bg-[var(--bg-active)] disabled:opacity-50">{ru ? "Выполнить план" : "Execute the plan"}</button>
              </>
            ) : tasks.length === 0 && (
              <p className="px-1 text-[var(--fg-faint)]">{ru ? "Включите режим «План»: агент изучит проект и покажет план здесь." : "Switch to Plan mode: the agent studies the project and shows the plan here."}</p>
            )}
          </div>
        )}
      </div>
    </aside>
  );
}
