export interface ChatAttachment { name: string; text?: string; image?: string }
export function splitAttachments(content: string): { text: string; files: ChatAttachment[] } {
  const match = content.match(/```glow-attachments\r?\n([\s\S]*?)\r?\n```/);
  if (!match) return { text: content, files: [] };
  try {
    const value = JSON.parse(match[1]);
    if (!Array.isArray(value) || value.length > 8) throw new Error("Invalid attachments");
    const files = value.filter(item => item && typeof item.name === "string" && item.name.length <= 255 &&
      ((typeof item.text === "string") || (typeof item.image === "string" && /^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(item.image) && item.image.length <= 700000)));
    return { text: content.replace(match[0], "").trim(), files };
  } catch { return { text: content.replace(match[0], "[Не удалось восстановить вложение]"), files: [] }; }
}
export function attachToMessage(text: string, files: ChatAttachment[]): string {
  return `${text.trim()}\n\n\`\`\`glow-attachments\n${JSON.stringify(files)}\n\`\`\``;
}
export function preserveAttachments(original: string, edited: string): string {
  const { files } = splitAttachments(original);
  return files.length ? attachToMessage(edited, files) : edited;
}
export async function imageForModel(file: File): Promise<string> {
  let blob: Blob = file;
  if (/\.(heic|heif)$/i.test(file.name) || /image\/hei[cf]/i.test(file.type)) {
    const { default: convert } = await import("heic2any");
    const converted = await convert({ blob: file, toType: "image/jpeg", quality: 0.9 });
    blob = Array.isArray(converted) ? converted[0] : converted;
  }
  let image: ImageBitmap;
  try { image = await createImageBitmap(blob); }
  catch { throw new Error(`${file.name}: изображение не удалось прочитать. Попробуйте JPG, PNG, WebP или HEIC.`); }
  try {
    const scale = Math.min(1, 1600 / Math.max(image.width, image.height));
    const canvas = document.createElement("canvas"); canvas.width = Math.max(1, Math.round(image.width * scale)); canvas.height = Math.max(1, Math.round(image.height * scale));
    const context = canvas.getContext("2d"); if (!context) throw new Error("Не удалось прочитать изображение.");
    context.fillStyle = "white"; context.fillRect(0, 0, canvas.width, canvas.height); context.drawImage(image, 0, 0, canvas.width, canvas.height);
    for (const quality of [0.85, 0.7, 0.5]) { const url = canvas.toDataURL("image/jpeg", quality); if (url.length <= 700000) return url; }
    throw new Error("Изображение слишком большое. Попробуйте уменьшить его.");
  } finally { image.close(); }
}
export async function prepareAttachment(file: File, locale = "ru"): Promise<ChatAttachment[]> {
  const media = /^(audio|video)\//.test(file.type) || /\.(mp3|wav|m4a|ogg|flac|aac|mp4|mov|webm)$/i.test(file.name);
  const maxBytes = media ? 50_000_000 : 20_000_000;
  if (file.size > maxBytes) throw new Error(`${file.name}: файл больше ${maxBytes / 1_000_000} МБ.`);
  const name = file.name;
  if (file.type.startsWith("image/") || /\.(jpe?g|png|webp|gif|heic|heif|bmp)$/i.test(name)) return [{ name, image: await imageForModel(file), ...(/\.gif$/i.test(name) ? { text: "GIF: передан один неподвижный кадр; анимация не прочитана." } : {}) }];
  if (file.type.startsWith("audio/") || /\.(mp3|wav|m4a|ogg|flac|aac)$/i.test(name)) {
    const { prepareMedia } = await import("./mediaAttachment"); return prepareMedia(file, false, locale);
  }
  if (file.type.startsWith("video/") || /\.(mp4|mov|webm)$/i.test(name)) {
    const { prepareMedia } = await import("./mediaAttachment"); return prepareMedia(file, true, locale);
  }
  let text: string;
  let pictures: ChatAttachment[] = [];
  if (/\.(docx|xlsx|pptx)$/i.test(name)) {
    const { extractOfficeText, extractOfficeImages } = await import("./officeExtract");
    const bytes = new Uint8Array(await file.arrayBuffer());
    text = extractOfficeText(bytes, name);
    const embedded = extractOfficeImages(bytes);
    for (const item of embedded.images) pictures.push({ name: `${name} · ${item.name}`, image: await imageForModel(new File([new Uint8Array(item.bytes)], item.name, { type: item.mime })) });
    if (embedded.total) {
      const note = `\n[Изображения внутри документа: найдено ${embedded.total}, передано ${pictures.length}${embedded.skipped ? `, пропущено ${embedded.skipped} из-за размера или лимита` : ""}. Это встроенные изображения, не полный внешний вид страниц или слайдов. Остальные изображения и графики не прочитаны.]`;
      text += note;
    }
  } else if (/\.pdf$/i.test(name) || file.type === "application/pdf") {
    const { extractPdfAttachments } = await import("./pdfExtract"); return extractPdfAttachments(file);
  } else if (/\.(odt|ods|odp)$/i.test(name)) {
    const { extractOpenDocument } = await import("./documentExtract"); text = extractOpenDocument(new Uint8Array(await file.arrayBuffer()));
  } else if (/\.rtf$/i.test(name)) {
    const { extractRtf } = await import("./documentExtract"); text = extractRtf(await file.text());
  } else if (/\.ipynb$/i.test(name)) {
    const { parseNotebook, notebookContext } = await import("./notebook"); text = notebookContext(parseNotebook(await file.text()));
  } else if (file.type.startsWith("text/") || /\.(txt|md|csv|tsv|json|xml|yaml|yml|py|ts|tsx|js|jsx|html|css|sql|log|rst|srt)$/i.test(name)) text = await file.text();
  else throw new Error(`${name}: этот формат пока не удаётся прочитать. Для документа используйте PDF, DOCX, XLSX или PPTX, для фото — JPG или PNG.`);
  if (!text.trim()) throw new Error(`${name}: не удалось найти содержимое.`);
  return [{ name, text }, ...pictures];
}
