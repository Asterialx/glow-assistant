export type AgentMode = "auto" | "plan";
/** autopilot asks only before deleting; important asks about everything risky; tasks also approves each task. */
export type Autonomy = "autopilot" | "important" | "tasks";

export const READ_TOOLS = ["code_list", "code_read", "code_search", "doc_read", "update_tasks"] as const;
export const WRITE_TOOLS = ["code_edit", "code_create", "code_delete", "code_run"] as const;
export const MAX_FILES_PER_TASK = 10;

export type Verdict =
  | { kind: "allow" }
  | { kind: "ask"; reason: string; confirmKind: "command" | "delete" | "many_files" }
  | { kind: "deny"; reason: string };

export type CommandClass = { decision: "allow" | "ask" | "deny"; reason?: string };

export interface PolicyContext {
  mode: AgentMode;
  autonomy: Autonomy;
  /** Files already changed in this run; a new one beyond the limit asks first. */
  changedFiles: ReadonlySet<string>;
  classifyCommand: (command: string) => Promise<CommandClass>;
}

const isRead = (name: string) => (READ_TOOLS as readonly string[]).includes(name);

/** The UI decides whether to ask; the Rust side enforces the hard limits again on every call. */
export async function decideTool(name: string, args: Record<string, unknown>, context: PolicyContext): Promise<Verdict> {
  if (isRead(name)) return { kind: "allow" };
  if (context.mode === "plan") return { kind: "deny", reason: "В режиме Плана менять проект и запускать команды нельзя. Составьте план." };
  if (name === "code_delete") return { kind: "ask", reason: "Удаление файла", confirmKind: "delete" };
  if (name === "code_edit" || name === "code_create") {
    const path = typeof args.path === "string" ? args.path.replace(/\\/g, "/").toLowerCase() : "";
    if (path && !context.changedFiles.has(path) && context.changedFiles.size >= MAX_FILES_PER_TASK && context.autonomy !== "autopilot") {
      return { kind: "ask", reason: `Правка больше ${MAX_FILES_PER_TASK} файлов за одну задачу`, confirmKind: "many_files" };
    }
    return { kind: "allow" };
  }
  if (name === "code_run") {
    const command = typeof args.command === "string" ? args.command : "";
    const verdict = await context.classifyCommand(command);
    if (verdict.decision === "deny") return { kind: "deny", reason: verdict.reason ?? "Команда запрещена" };
    if (verdict.decision === "ask" && context.autonomy !== "autopilot") return { kind: "ask", reason: verdict.reason ?? "Команда вне белого списка", confirmKind: "command" };
    return { kind: "allow" };
  }
  return { kind: "deny", reason: "Неизвестный инструмент." };
}

/** One short line for the step list. */
export function describeCall(name: string, args: Record<string, unknown>): string {
  const text = (value: unknown, fallback = "") => (typeof value === "string" ? value : fallback);
  switch (name) {
    case "code_list": return `Смотрю папку ${text(args.path, "проекта") || "проекта"}`;
    case "code_read": return `Читаю ${text(args.path, "файл")}`;
    case "doc_read": return `Читаю документ ${text(args.path, "")}`.trim();
    case "code_search": return `Ищу «${text(args.pattern).slice(0, 60)}»`;
    case "code_edit": return `Правлю ${text(args.path, "файл")}`;
    case "code_create": return `Создаю ${text(args.path, "файл")}`;
    case "code_delete": return `Удаляю ${text(args.path, "файл")}`;
    case "code_run": return `Запускаю ${text(args.command).slice(0, 80)}`;
    case "update_tasks": return "Обновляю список задач";
    default: return name;
  }
}
