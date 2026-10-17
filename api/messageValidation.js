export function messagesFitTransport(messages) {
  return new TextEncoder().encode(JSON.stringify(messages)).byteLength <= 3500000;
}

export function validMessages(messages) {
  if (!Array.isArray(messages) || messages.length > 250 || !messagesFitTransport(messages)) return false;
  let images = 0;
  for (const message of messages) {
    if (!message || !['system','user','assistant','tool'].includes(message.role)) return false;
    if (message.role === 'assistant' && message.tool_calls !== undefined) {
      if (!Array.isArray(message.tool_calls) || !message.tool_calls.length || message.tool_calls.length > 6) return false;
      for (const call of message.tool_calls) {
        if (call?.type !== 'function' || typeof call.id !== 'string' || call.id.length > 160 ||
            typeof call.function?.name !== 'string' || !/^[a-z0-9_]{1,64}$/.test(call.function.name) ||
            typeof call.function?.arguments !== 'string' || call.function.arguments.length > 20000) return false;
      }
    }
    if (message.role === 'tool') {
      if (typeof message.tool_call_id !== 'string' || message.tool_call_id.length > 160 ||
          typeof message.content !== 'string' || message.content.length > 120000) return false;
      continue;
    }
    if (message.content === null && message.role === 'assistant' && Array.isArray(message.tool_calls)) continue;
    if (typeof message.content === 'string') continue;
    if (message.role !== 'user' || !Array.isArray(message.content) || !message.content.length || message.content.length > 9) return false;
    for (const part of message.content) {
      if (part?.type === 'text' && typeof part.text === 'string') continue;
      else if (part?.type === 'image_url' && typeof part.image_url?.url === 'string' && part.image_url.url.length <= 700000 && /^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(part.image_url.url)) images++;
      else return false;
    }
  }
  return images <= 12;
}
