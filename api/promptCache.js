const CACHE_MARKER = { type: 'ephemeral' };

/** Add short-lived Anthropic cache breakpoints without changing user-supplied content. */
export function withPromptCache(messages) {
  if (!Array.isArray(messages) || messages.length === 0) return messages;
  const targets = new Set([0]);
  for (let index = messages.length - 1; index > 0; index--) {
    if (messages[index]?.role === 'assistant') {
      targets.add(index);
      break;
    }
  }

  return messages.map((message, index) => {
    if (!targets.has(index)) return message;
    const parts = typeof message.content === 'string'
      ? [{ type: 'text', text: message.content }]
      : message.content;
    if (!Array.isArray(parts) || parts.length === 0) return message;
    let textIndex = -1;
    for (let partIndex = parts.length - 1; partIndex >= 0; partIndex--) {
      if (parts[partIndex]?.type === 'text') { textIndex = partIndex; break; }
    }
    if (textIndex < 0) return message;
    const content = parts.map((part, partIndex) => partIndex === textIndex
      ? { ...part, cache_control: CACHE_MARKER }
      : part);
    return { ...message, content };
  });
}
