export function messagesFitTransport(messages) {
  return new TextEncoder().encode(JSON.stringify(messages)).byteLength <= 3500000;
}

export function validMessages(messages) {
  if (!Array.isArray(messages) || messages.length > 250 || !messagesFitTransport(messages)) return false;
  let images = 0;
  for (const message of messages) {
    if (!message || !['system','user','assistant'].includes(message.role)) return false;
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
