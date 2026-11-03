import type { ChatMessage } from "../llm/smartapi.ts";

/** Keeps the start and the end of long output: errors and failing tests are usually at the end. */
export function clipText(text: string, max: number): string {
  if (text.length <= max) return text;
  const head = Math.floor(max / 4);
  const tail = max - head;
  return `${text.slice(0, head)}\n… пропущено ${text.length - max} символов …\n${text.slice(text.length - tail)}`;
}

/** Cuts long string arguments of a finished call but keeps the arguments valid JSON. */
function shrinkArguments(raw: string): string {
  if (raw.length <= 600) return raw;
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    for (const key of Object.keys(parsed)) {
      const value = parsed[key];
      if (typeof value === "string" && value.length > 200) parsed[key] = `${value.slice(0, 120)}… [сокращено, ${value.length} симв.]`;
    }
    return JSON.stringify(parsed);
  } catch {
    return raw;
  }
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
  const lastOld = Math.max(...old);
  return messages.map((message, index) => {
    // The arguments of an old code_create/code_edit hold whole files; the file itself is on disk.
    if (index < lastOld && message.role === "assistant" && message.tool_calls?.length) {
      return { ...message, tool_calls: message.tool_calls.map((call) => ({ ...call, function: { ...call.function, arguments: shrinkArguments(call.function.arguments) } })) };
    }
    if (!old.has(index) || typeof message.content !== "string" || message.content.startsWith("[сокращено")) return message;
    const first = message.content.replace(/\s+/g, " ").slice(0, 160);
    return { ...message, content: `[сокращено, результат устарел: ${first}${message.content.length > 160 ? "…" : ""}]` };
  });
}
