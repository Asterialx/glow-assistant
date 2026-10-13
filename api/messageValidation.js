export function validMessages(messages) {
  if (!Array.isArray(messages) || messages.length > 250 || JSON.stringify(messages).length > 3500000) return false;
  let textSize = 0, images = 0;
  for (const message of messages) {
    if (!message || !['system','user','assistant'].includes(message.role)) return false;
    if (typeof message.content === 'string') { textSize += message.content.length; continue; }
    if (message.role !== 'user' || !Array.isArray(message.content) || !message.content.length || message.content.length > 9) return false;
    for (const part of message.content) {
      if (part?.type === 'text' && typeof part.text === 'string') textSize += part.text.length;
      else if (part?.type === 'image_url' && typeof part.image_url?.url === 'string' && part.image_url.url.length <= 700000 && /^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(part.image_url.url)) images++;
      else return false;
    }
  }
  return textSize <= 200000 && images <= 12;
}
