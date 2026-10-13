/** Read provider SSE usage only. Never accept token counts from the browser. */
export function createUsageCollector() {
  const decoder = new TextDecoder();
  let buffer = '';
  let usage = null;
  const line = value => {
    if (!value.trim().startsWith('data:')) return;
    try {
      const record = JSON.parse(value.trim().slice(5).trim());
      const u = record.usage;
      if (u && [u.prompt_tokens,u.completion_tokens,u.total_tokens].every(n => Number.isSafeInteger(n) && n >= 0)
          && u.total_tokens === u.prompt_tokens + u.completion_tokens) {
        usage = { input:u.prompt_tokens, output:u.completion_tokens, total:u.total_tokens,
          costUsd: typeof u.cost === 'number' && Number.isFinite(u.cost) && u.cost >= 0 ? u.cost : null };
      }
    } catch { /* DONE and malformed events are not usage. */ }
  };
  return {
    push(chunk) {
      buffer += decoder.decode(chunk,{stream:true});
      const lines=buffer.split('\n'); buffer=lines.pop() || '';
      for(const item of lines) line(item);
    },
    finish() { line(buffer+decoder.decode()); return usage; },
  };
}

/** A conservative reservation, NOT a final token count. */
export function reservationFor(messages, maxOutput) {
  return messages.reduce((total,message)=>total+Buffer.byteLength(message.content,'utf8')+64,256)+maxOutput;
}
