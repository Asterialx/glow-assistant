import type { ChatMessage } from "../llm/smartapi.ts";
import { clipText, compactMessages } from "./context.ts";
import { decideTool, describeCall, READ_TOOLS, WRITE_TOOLS, type AgentMode, type Autonomy, type CommandClass } from "./policy.ts";

export type AgentCall = { id: string; name: string; arguments: string };
export type Usage = { inputTokens: number; outputTokens: number; costUnits: number };
export type TaskStatus = "pending" | "in_progress" | "done";
export type Task = { id: string; title: string; status: TaskStatus };
export type StepStatus = "running" | "done" | "error" | "denied";
export type Step = { id: string; name: string; summary: string; status: StepStatus; detail?: string; diff?: string; ms?: number };
export type ConfirmRequest = { id: string; kind: "command" | "delete" | "many_files" | "git" | "task"; title: string; reason: string };
export type ConfirmAnswer = "once" | "task" | "deny";

export interface AgentDeps {
  /** Streams one model turn; text goes to onToken, requested tools come back as calls. */
  turn(messages: ChatMessage[], toolSet: "code_agent" | "code_plan", onToken: (token: string) => void): Promise<{ calls: AgentCall[]; usage?: Usage }>;
  exec(name: string, args: Record<string, unknown>, approved: boolean): Promise<unknown>;
  classifyCommand(command: string): Promise<CommandClass>;
  gitBranch?(): Promise<string>;
  confirm(request: ConfirmRequest): Promise<ConfirmAnswer>;
  /** Messages a tool wants added after its result, for example pictures read from a document. */
  drainExtraMessages?(): ChatMessage[];
  onToken(token: string): void;
  onStep?(step: Step): void;
  onTasks?(tasks: Task[]): void;
}

export interface AgentOptions {
  mode: AgentMode;
  autonomy: Autonomy;
  maxTurns?: number;
  /** Input plus output tokens for the whole task; the run stops after the turn that crosses it. */
  budgetTokens?: number;
  signal?: AbortSignal;
}

export type StopReason = "done" | "max_turns" | "budget" | "aborted" | "error";
/** `error` is set when the model call failed mid-task; the steps and changed files are still returned so the work can be undone. */
export interface AgentResult { stopped: StopReason; usage: Usage; steps: Step[]; tasks: Task[]; changedFiles: string[]; error?: string }

const RESULT_LIMIT = 12_000;
const MAX_CALLS_PER_TURN = 6;
const REPEAT_LIMIT = 3;
const KNOWN = new Set<string>([...READ_TOOLS, ...WRITE_TOOLS]);

const failure = (error: unknown): string => (typeof error === "string" ? error : error instanceof Error ? error.message : String(error));

function parseTasks(value: unknown): Task[] | string {
  if (!Array.isArray(value) || value.length > 12) return "tasks должен быть списком до 12 задач.";
  const tasks: Task[] = [];
  for (const item of value) {
    const task = item as Partial<Task> | null;
    if (!task || typeof task.id !== "string" || typeof task.title !== "string" || !["pending", "in_progress", "done"].includes(task.status as string)) return "Каждая задача: id, title и status (pending, in_progress или done).";
    tasks.push({ id: task.id.slice(0, 32), title: task.title.slice(0, 160), status: task.status as TaskStatus });
  }
  if (new Set(tasks.map((task) => task.id)).size !== tasks.length) return "id задач должны быть уникальны.";
  if (tasks.filter((task) => task.status === "in_progress").length > 1) return "Одновременно может быть только одна задача in_progress.";
  return tasks;
}

/** The agent loop: ask the model, run the tools it requests under the policy, feed results back. */
export async function runAgent(history: ChatMessage[], deps: AgentDeps, options: AgentOptions): Promise<AgentResult> {
  const messages: ChatMessage[] = [...history];
  const maxTurns = options.maxTurns ?? 40;
  const budget = options.budgetTokens ?? 400_000;
  const usage: Usage = { inputTokens: 0, outputTokens: 0, costUnits: 0 };
  const steps: Step[] = [];
  const changed = new Set<string>();
  const trusted = new Set<string>();
  const repeats = new Map<string, number>();
  let tasks: Task[] = [];
  let spoke = false;
  let stepNumber = 0;
  const toolSet = options.mode === "plan" ? "code_plan" : "code_agent";
  const result = (stopped: StopReason, error?: string): AgentResult => ({ stopped, usage, steps, tasks, changedFiles: [...changed], ...(error ? { error } : {}) });

  const record = (step: Step) => {
    const index = steps.findIndex((item) => item.id === step.id);
    if (index >= 0) steps[index] = step; else steps.push(step);
    deps.onStep?.(step);
  };

  /** Asks unless the user already allowed this exact action for the whole task. */
  const approve = async (key: string, request: Omit<ConfirmRequest, "id">): Promise<boolean> => {
    if (trusted.has(key)) return true;
    const answer = await deps.confirm({ ...request, id: `c${++stepNumber}` });
    if (answer === "task") trusted.add(key);
    return answer !== "deny";
  };

  for (let turn = 0; turn < maxTurns; turn++) {
    if (options.signal?.aborted) return result("aborted");
    if (spoke) deps.onToken("\n\n");
    let produced = false;
    let reply: Awaited<ReturnType<AgentDeps["turn"]>>;
    try {
      reply = await deps.turn(compactMessages(messages), toolSet, (token) => { produced = true; deps.onToken(token); });
    } catch (error) {
      return result("error", failure(error));
    }
    const { calls, usage: turnUsage } = reply;
    if (produced) spoke = true;
    if (turnUsage) {
      usage.inputTokens += turnUsage.inputTokens;
      usage.outputTokens += turnUsage.outputTokens;
      usage.costUnits += turnUsage.costUnits;
    }
    if (!calls.length) return result("done");
    if (options.signal?.aborted) return result("aborted");
    if (calls.length > MAX_CALLS_PER_TURN || new Set(calls.map((call) => call.id)).size !== calls.length) throw new Error("Модель запросила слишком много действий за один ход.");
    messages.push({ role: "assistant", content: null, tool_calls: calls.map((call) => ({ id: call.id, type: "function", function: { name: call.name, arguments: call.arguments } })) });

    for (const call of calls) {
      const answer = async (content: unknown) => { messages.push({ role: "tool", tool_call_id: call.id, name: call.name, content: clipText(typeof content === "string" ? content : JSON.stringify(content), RESULT_LIMIT) }); };
      let args: Record<string, unknown>;
      try {
        const parsed = JSON.parse(call.arguments || "{}");
        if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("not an object");
        args = parsed as Record<string, unknown>;
      } catch {
        await answer({ error: "Аргументы инструмента не являются корректным JSON-объектом." });
        continue;
      }
      if (!KNOWN.has(call.name)) {
        await answer({ error: `Инструмента «${call.name}» нет. Доступны: ${[...(options.mode === "plan" ? READ_TOOLS : [...READ_TOOLS, ...WRITE_TOOLS])].join(", ")}.` });
        continue;
      }
      const signature = `${call.name}:${call.arguments}`;
      const seen = (repeats.get(signature) ?? 0) + 1;
      repeats.set(signature, seen);
      if (seen >= REPEAT_LIMIT) {
        await answer({ error: "Вы повторяете одно и то же действие. Измените подход или завершите задачу и объясните, что мешает." });
        continue;
      }

      const step: Step = { id: call.id, name: call.name, summary: describeCall(call.name, args), status: "running" };
      const started = Date.now();
      if (call.name === "update_tasks") {
        const next = parseTasks(args.tasks);
        if (typeof next === "string") { await answer({ error: next }); continue; }
        if (options.mode === "auto" && options.autonomy === "tasks") {
          const before = new Map(tasks.map((task) => [task.id, task.status]));
          let rejected = false;
          for (const task of next) {
            if (task.status === "in_progress" && before.get(task.id) !== "in_progress" && !await approve(`task:${task.id}`, { kind: "task", title: task.title, reason: "Начать задачу" })) {
              task.status = "pending";
              rejected = true;
              await answer({ error: `Пользователь не разрешил начать задачу «${task.title}». Предложите другой порядок или спросите, что изменить.`, tasks: next });
              tasks = next;
              deps.onTasks?.(tasks);
              record({ ...step, status: "denied", detail: "Пользователь отклонил задачу", ms: Date.now() - started });
              break;
            }
          }
          if (rejected) continue;
        }
        tasks = next;
        deps.onTasks?.(tasks);
        record({ ...step, status: "done", ms: Date.now() - started });
        await answer({ ok: true, tasks });
        continue;
      }

      record(step);
      const verdict = await decideTool(call.name, args, { mode: options.mode, autonomy: options.autonomy, changedFiles: changed, classifyCommand: deps.classifyCommand, gitBranch: deps.gitBranch });
      let approved = false;
      if (verdict.kind === "deny") {
        record({ ...step, status: "denied", detail: verdict.reason, ms: Date.now() - started });
        await answer({ error: verdict.reason });
        continue;
      }
      if (verdict.kind === "ask") {
        const subject = call.name === "code_run" ? String(args.command) : verdict.confirmKind === "many_files" ? "files" : verdict.confirmKind === "git" ? `${call.name}:${call.name === "git_branch" ? String(args.name) : ""}` : String(args.path);
        const key = `${verdict.confirmKind}:${subject}`;
        if (!await approve(key, { kind: verdict.confirmKind, title: step.summary, reason: verdict.reason })) {
          record({ ...step, status: "denied", detail: "Пользователь отклонил действие", ms: Date.now() - started });
          await answer({ error: "Пользователь отклонил это действие. Не повторяйте его: выберите другой путь или спросите пользователя." });
          continue;
        }
        approved = true;
      }
      try {
        const output = await deps.exec(call.name, args, approved);
        const diff = call.name === "code_edit" && output && typeof (output as { diff?: unknown }).diff === "string" ? String((output as { diff: string }).diff) : undefined;
        if ((call.name === "code_edit" || call.name === "code_create" || call.name === "code_delete") && typeof args.path === "string") changed.add(args.path.replace(/\\/g, "/").toLowerCase());
        const exitCode = call.name === "code_run" ? (output as { exit_code?: number | null } | null)?.exit_code : undefined;
        record({ ...step, status: call.name === "code_run" && exitCode !== 0 ? "error" : "done", ...(diff ? { diff } : {}), ...(exitCode !== undefined ? { detail: exitCode === null ? "прервана" : `код ${exitCode}` } : {}), ms: Date.now() - started });
        await answer(output);
      } catch (error) {
        record({ ...step, status: "error", detail: failure(error), ms: Date.now() - started });
        await answer({ error: failure(error) });
      }
    }
    messages.push(...(deps.drainExtraMessages?.() ?? []));
    if (usage.inputTokens + usage.outputTokens > budget) return result("budget");
  }
  return result("max_turns");
}
