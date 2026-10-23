import type { Step, StopReason, Task } from "./loop.ts";

/** What stays in the chat after a run: the step list, the tasks and the id needed to undo the changes. */
export type AgentTrace = { v: 1; taskId: string; stopped: StopReason; steps: Step[]; tasks: Task[]; changedFiles: string[] };

const OPEN = "```glow-agent\n";
const CLOSE = "\n```";
const MAX_STEPS = 80;
const MAX_DIFF = 3000;

export function appendAgentTrace(content: string, trace: AgentTrace): string {
  const steps = trace.steps.slice(0, MAX_STEPS).map((step) => ({ ...step, ...(step.diff ? { diff: step.diff.slice(0, MAX_DIFF) } : {}), ...(step.detail ? { detail: step.detail.slice(0, 300) } : {}) }));
  return `${content.trimEnd()}\n\n${OPEN}${JSON.stringify({ ...trace, steps })}${CLOSE}`;
}

const STATUSES = ["running", "done", "error", "denied"];
const STOPPED = ["done", "max_turns", "budget", "aborted", "error"];
const TASK_STATUSES = ["pending", "in_progress", "done"];
const str = (value: unknown, max: number): string | null => (typeof value === "string" && value.length <= max ? value : null);

function parseTrace(raw: unknown): AgentTrace | null {
  const value = raw as Partial<AgentTrace> | null;
  const taskId = str(value?.taskId, 64);
  if (!value || value.v !== 1 || !taskId || !STOPPED.includes(value.stopped as string) || !Array.isArray(value.steps) || !Array.isArray(value.tasks)) return null;
  const steps: Step[] = [];
  for (const item of value.steps.slice(0, MAX_STEPS)) {
    const step = item as Partial<Step> | null;
    const id = str(step?.id, 160), name = str(step?.name, 64), summary = str(step?.summary, 300);
    if (!step || !id || !name || !summary || !STATUSES.includes(step.status as string)) continue;
    steps.push({ id, name, summary, status: step.status as Step["status"], ...(str(step.detail, 400) ? { detail: step.detail } : {}), ...(str(step.diff, MAX_DIFF + 100) ? { diff: step.diff } : {}), ...(Number.isFinite(step.ms) ? { ms: step.ms } : {}) });
  }
  const tasks: Task[] = [];
  for (const item of value.tasks.slice(0, 12)) {
    const task = item as Partial<Task> | null;
    const id = str(task?.id, 32), title = str(task?.title, 160);
    if (task && id && title && TASK_STATUSES.includes(task.status as string)) tasks.push({ id, title, status: task.status as Task["status"] });
  }
  const changedFiles = Array.isArray(value.changedFiles) ? value.changedFiles.filter((file): file is string => typeof file === "string" && file.length <= 500).slice(0, 200) : [];
  return { v: 1, taskId, stopped: value.stopped as StopReason, steps, tasks, changedFiles };
}

/** Splits the trace block off the end of a stored answer. A damaged block is dropped, never shown raw. */
export function splitAgentTrace(content: string): { text: string; trace: AgentTrace | null } {
  const start = content.lastIndexOf(`\n\n${OPEN}`);
  if (start < 0) return { text: content, trace: null };
  if (!content.endsWith(CLOSE)) return { text: content.slice(0, start), trace: null };
  try {
    return { text: content.slice(0, start), trace: parseTrace(JSON.parse(content.slice(start + 2 + OPEN.length, -CLOSE.length))) };
  } catch {
    return { text: content.slice(0, start), trace: null };
  }
}
