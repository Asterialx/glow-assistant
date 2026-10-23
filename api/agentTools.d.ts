export type CodeToolSetName = "code_plan" | "code_agent";
export type CodeToolSchema = { type: "function"; function: { name: string; description: string; parameters: Record<string, unknown> } };
export const CODE_TOOL_SETS: Readonly<Record<CodeToolSetName, readonly CodeToolSchema[]>>;
export function codeToolsFor(name: unknown): readonly CodeToolSchema[] | null;
