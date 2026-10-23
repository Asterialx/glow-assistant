import type { ChatMessage } from "../llm/smartapi.ts";

/** Keeps the start and the end of long output: errors and failing tests are usually at the end. */
export function clipText(text: string, max: number): string {
  if (text.length <= max) return text;
  const head = Math.floor(max / 4);
  const tail = max - head;
  return `${text.slice(0, head)}\n… пропущено ${text.length - max} символов …\n${text.slice(text.length - tail)}`;
}

/**
 * Every agent turn re-sends the whole conversation, so old tool results are the main cost.
 * Results older than the last `keepRecent` become one short line; the call/result pairing stays
 * intact because the provider rejects a tool call without its answer.
 */
export function compactMessages(messages: ChatMessage[], keepRecent = 10): ChatMessage[] {
  const toolIndexes = messages.flatMap((message, index) => (message.role === "tool" ? [index] : []));
  const old = new Set(toolIndexes.slice(0, Math.max(0, toolIndexes.length - keepRecent)));
  if (!old.size) return messages;
  return messages.map((message, index) => {
    if (!old.has(index) || typeof message.content !== "string" || message.content.startsWith("[сокращено")) return message;
    const first = message.content.replace(/\s+/g, " ").slice(0, 160);
    return { ...message, content: `[сокращено, результат устарел: ${first}${message.content.length > 160 ? "…" : ""}]` };
  });
}
