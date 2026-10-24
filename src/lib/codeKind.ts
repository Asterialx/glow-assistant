/**
 * "Work" (documents, coursework) and "Code" (the coding agent) share the storage scope `code`, because the
 * server and the cloud tables only know the scopes home/code/med. Their chats are told apart by the id.
 */
export type CodeKind = "work" | "dev";

export const DEV_ID_PREFIX = "dev_";

export function conversationKind(id: string): CodeKind {
  return id.startsWith(DEV_ID_PREFIX) ? "dev" : "work";
}

/** The prefix a new chat id gets, so the chat lands in the right tab. Work chats keep plain ids. */
export function idPrefixFor(kind: CodeKind): string {
  return kind === "dev" ? DEV_ID_PREFIX : "";
}

export function parseCodeKind(value: unknown): CodeKind {
  return value === "dev" ? "dev" : "work";
}
