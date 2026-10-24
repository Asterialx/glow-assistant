import { useState } from "react";
import { AlertTriangle, Check, ChevronRight, CircleDashed, FilePlus, FileText, FolderTree, GitBranch, GitCommit, GitCompare, History, LoaderCircle, Pencil, Search, ShieldX, SquareTerminal, Trash2, Undo2, X, type LucideIcon } from "lucide-react";
import type { Locale } from "../../lib/i18n";
import type { Step, Task } from "../../lib/agent/loop";
import type { AgentTrace } from "../../lib/agent/trace";
import { restoreCheckpoint, type RestoreResult } from "../../lib/agent/tools";
import { stepSubject } from "../../lib/agent/policy";
import { useAgentStore } from "../../stores/agentStore";
import { cn } from "../../lib/utils";

type Props = { locale: Locale; trace?: AgentTrace | null; live?: boolean };

function StepIcon({ status }: { status: Step["status"] }) {
  if (status === "running") return <LoaderCircle size={14} className="animate-spin text-[var(--accent)]" />;
  if (status === "done") return <Check size={14} className="text-emerald-500" />;
  if (status === "denied") return <ShieldX size={14} className="text-amber-500" />;
  return <X size={14} className="text-red-400" />;
}

function Diff({ text }: { text: string }) {
  return (
    <pre className="mt-1 max-h-60 overflow-auto rounded-lg bg-[var(--bg)] p-2 text-[12px] leading-5">
      {text.split("\n").map((line, index) => (
        <div key={index} className={cn("whitespace-pre-wrap break-words", line.startsWith("+") && "bg-emerald-500/10 text-emerald-500", line.startsWith("-") && "bg-red-500/10 text-red-400", line.startsWith("@@") && "text-[var(--fg-faint)]")}>{line || " "}</div>
      ))}
    </pre>
  );
}

const TAGS: Record<string, { label: string; icon: LucideIcon }> = {
  code_list: { label: "List", icon: FolderTree },
  code_read: { label: "Read", icon: FileText },
  doc_read: { label: "Read", icon: FileText },
  code_search: { label: "Search", icon: Search },
  code_edit: { label: "Edit", icon: Pencil },
  code_create: { label: "Create", icon: FilePlus },
  code_delete: { label: "Delete", icon: Trash2 },
  code_run: { label: "Run", icon: SquareTerminal },
  git_status: { label: "Git", icon: GitBranch },
  git_diff: { label: "Git", icon: GitCompare },
  git_log: { label: "Git", icon: History },
  git_branch: { label: "Git", icon: GitBranch },
  git_commit: { label: "Git", icon: GitCommit },
};

const duration = (ms?: number) => (ms === undefined ? "" : ms >= 1000 ? `${(ms / 1000).toFixed(1)}s` : `${ms}ms`);

function StepRow({ step }: { step: Step }) {
  const [open, setOpen] = useState(false);
  const tag = TAGS[step.name] ?? { label: step.name, icon: SquareTerminal };
  const Icon = tag.icon;
  const subject = stepSubject(step.name, step.summary);
  return (
    <li>
      <button type="button" disabled={!step.diff} onClick={() => setOpen((value) => !value)} className="flex w-full items-center gap-2 rounded-md px-1 py-0.5 text-left enabled:hover:bg-[var(--bg-hover)]">
        <StepIcon status={step.status} />
        <span className="inline-flex w-[74px] shrink-0 items-center gap-1 rounded px-1.5 py-0.5 text-[11px]" style={{ color: "var(--kind-dev)", background: "color-mix(in srgb, var(--kind-dev) 12%, transparent)" }}>
          <Icon size={11} strokeWidth={2} />{tag.label}
        </span>
        <span className="min-w-0 flex-1 truncate text-[var(--fg)]" title={step.summary}>{subject}</span>
        {step.detail && <span className={cn("shrink-0 text-[11px]", step.status === "error" ? "text-red-400" : "text-[var(--fg-faint)]")}>{step.detail}</span>}
        {step.ms !== undefined && step.status !== "running" && <span className="shrink-0 text-[11px] text-[var(--fg-faint)]">{duration(step.ms)}</span>}
        {step.diff && <ChevronRight size={13} className={cn("shrink-0 text-[var(--fg-faint)] transition-transform", open && "rotate-90")} />}
      </button>
      {open && step.diff && <Diff text={step.diff} />}
    </li>
  );
}

function TaskRow({ task }: { task: Task }) {
  return (
    <li className="flex items-center gap-2 px-1">
      {task.status === "done" ? <Check size={14} className="text-emerald-500" /> : task.status === "in_progress" ? <LoaderCircle size={14} className="animate-spin text-[var(--accent)]" /> : <CircleDashed size={14} className="text-[var(--fg-faint)]" />}
      <span className={cn("min-w-0 flex-1", task.status === "done" && "text-[var(--fg-muted)] line-through")}>{task.title}</span>
    </li>
  );
}

/** The step list of an agent run: live from the store while it streams, from the saved trace afterwards. */
export function AgentRun({ locale, trace, live }: Props) {
  const ru = locale === "ru";
  const store = useAgentStore();
  // The task list has its own block above, so the "update tasks" calls are not repeated in the step list.
  const steps = (live ? store.steps : trace?.steps ?? []).filter((step) => step.name !== "update_tasks");
  const tasks = live ? store.tasks : trace?.tasks ?? [];
  const [restored, setRestored] = useState<RestoreResult | null>(null);
  const [undoing, setUndoing] = useState(false);
  const [undoError, setUndoError] = useState("");
  if (!steps.length && !tasks.length) return null;
  const changed = trace?.changedFiles.length ?? 0;

  const undo = async () => {
    if (!trace) return;
    setUndoing(true);
    setUndoError("");
    try { setRestored(await restoreCheckpoint(trace.taskId)); }
    catch (error) { setUndoError(typeof error === "string" ? error : error instanceof Error ? error.message : String(error)); }
    finally { setUndoing(false); }
  };

  return (
    <section aria-label={ru ? "Действия агента" : "Agent activity"} className="space-y-2 rounded-xl border border-l-[3px] border-[var(--border)] bg-[var(--bg-elevated)] p-3 font-mono text-[12.5px] text-[var(--fg-muted)]" style={{ borderLeftColor: "var(--kind-dev)" }}>
      <div className="flex items-center gap-2 text-[11px] uppercase tracking-[0.08em] text-[var(--fg-faint)]">
        <span style={{ color: "var(--kind-dev)" }}>●</span>
        <span>glow code</span>
        <span className="ml-auto normal-case tracking-normal">{ru ? `шагов: ${steps.length}` : `${steps.length} steps`}{live && <span className="glow-caret" aria-hidden />}</span>
      </div>
      {tasks.length > 0 && <ul className="space-y-1 border-b border-[var(--border)] pb-2 text-[var(--fg)]">{tasks.map((task) => <TaskRow key={task.id} task={task} />)}</ul>}
      {steps.length > 0 && <ul className="max-h-72 space-y-0.5 overflow-y-auto">{steps.map((step) => <StepRow key={step.id} step={step} />)}</ul>}
      {trace && trace.stopped !== "done" && trace.stopped !== "aborted" && (
        <p className="flex items-center gap-1.5 text-amber-500"><AlertTriangle size={13} />{trace.stopped === "error" ? (ru ? "Задача прервана из-за ошибки" : "The task stopped on an error") : trace.stopped === "budget" ? (ru ? "Остановлено: бюджет токенов" : "Stopped: token budget") : (ru ? "Остановлено: лимит шагов" : "Stopped: step limit")}</p>
      )}
      {trace && changed > 0 && (
        <div className="flex flex-wrap items-center gap-3 border-t border-[var(--border)] pt-2">
          <span>{ru ? `Изменено файлов: ${changed}` : `Files changed: ${changed}`}</span>
          {restored === null
            ? <button type="button" disabled={undoing} onClick={() => void undo()} className="ml-auto inline-flex items-center gap-1.5 rounded-lg bg-[var(--bg-hover)] px-2.5 py-1.5 font-medium text-[var(--fg)] hover:bg-[var(--bg-active)] disabled:opacity-50"><Undo2 size={13} />{ru ? "Откатить задачу" : "Undo task"}</button>
            : <span className="ml-auto text-[var(--fg)]">{restored.restored > 0 ? (ru ? `Откат выполнен: файлов ${restored.restored}` : `Undone: ${restored.restored} files`) : restored.skipped.length ? (ru ? "Ничего не откачено" : "Nothing was undone") : ru ? "Откатывать нечего" : "Nothing to undo"}</span>}
          {restored && restored.commits > 0 && <span className="w-full text-amber-500">{ru ? `В истории git остались коммиты задачи: ${restored.commits}. Откат вернул файлы, а сами коммиты отменяете вы (git reset).` : `The task's ${restored.commits} commit(s) stay in git history; the undo restored files only (use git reset).`}</span>}
          {restored && restored.skipped.length > 0 && <span className="w-full text-amber-500">{ru ? `Пропущено, файлы изменены после задачи: ${restored.skipped.slice(0, 5).join(", ")}${restored.skipped.length > 5 ? ` и ещё ${restored.skipped.length - 5}` : ""}` : `Skipped, edited after the task: ${restored.skipped.slice(0, 5).join(", ")}`}</span>}
          {undoError && <span className="w-full text-red-400">{undoError}</span>}
        </div>
      )}
    </section>
  );
}
