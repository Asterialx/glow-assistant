import type { ChatAttachment } from "./attachments";
import { imageForModel } from "./attachments";

/** Extract text and scanned pages together, preserving each page's context. */
export async function extractPdfAttachments(file: File): Promise<ChatAttachment[]> {
  const pdfjs = await import("pdfjs-dist");
  pdfjs.GlobalWorkerOptions.workerSrc = new URL("pdfjs-dist/build/pdf.worker.min.mjs", import.meta.url).toString();
  const loading = pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) });
  const doc = await loading.promise;
  const parts: string[] = [], pictures: ChatAttachment[] = [];
  let visualPages = 0;
  try {
    if (doc.numPages > 40) throw new Error(`${file.name}: в PDF больше 40 страниц. Прикрепите нужную часть.`);
    for (let i = 1; i <= doc.numPages; i++) {
      const page = await doc.getPage(i);
      const content = await page.getTextContent();
      const text = content.items.map(item => "str" in item ? String(item.str) : "").join(" ").trim();
      parts.push(`Страница ${i}:\n${text || "[Страница передана как изображение]"}`);
      const operators = await page.getOperatorList();
      const hasImages = operators.fnArray.some(op => [pdfjs.OPS.paintImageXObject, pdfjs.OPS.paintInlineImageXObject, pdfjs.OPS.paintImageMaskXObject].includes(op));
      const hasDiagram = operators.fnArray.filter(op => op === pdfjs.OPS.constructPath).length >= 5;
      const needsPreview = !text || hasImages || hasDiagram || i === 1;
      if (needsPreview) visualPages++;
      if (!text && pictures.length >= 4) throw new Error(`${file.name}: больше 4 страниц-сканов. Прикрепите нужную часть.`);
      if (needsPreview && pictures.length < 4) {
        const base = page.getViewport({ scale: 1 }), viewport = page.getViewport({ scale: Math.min(2, 1600 / Math.max(base.width, base.height)) });
        const canvas = document.createElement("canvas"); canvas.width = Math.ceil(viewport.width); canvas.height = Math.ceil(viewport.height);
        const ctx = canvas.getContext("2d"); if (!ctx) throw new Error("Не удалось прочитать страницу PDF.");
        await page.render({ canvas, canvasContext: ctx, viewport }).promise;
        const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob(value => value ? resolve(value) : reject(new Error("Не удалось прочитать страницу.")), "image/jpeg", 0.85));
        pictures.push({ name: `${file.name} · страница ${i}`, image: await imageForModel(new File([blob], "page.jpg", { type: "image/jpeg" })) });
      }
      page.cleanup();
    }
    const extracted = parts.join("\n\n") + `\n[Текст прочитан со всех страниц. Визуально передано ${pictures.length} из ${visualPages} страниц, выбранных для просмотра; на остальных страницах изображения и расположение элементов не анализировались. Не утверждай, что видел отсутствующие страницы.]`;
    return [{ name: file.name, text: extracted }, ...pictures];
  } finally { await loading.destroy(); }
}

/** Extract plain text from a PDF File via pdf.js */
export async function extractPdfText(file: File): Promise<string> {
  const pdfjs = await import("pdfjs-dist");
  // Vite-friendly worker
  pdfjs.GlobalWorkerOptions.workerSrc = new URL(
    "pdfjs-dist/build/pdf.worker.min.mjs",
    import.meta.url,
  ).toString();

  const data = new Uint8Array(await file.arrayBuffer());
  const loading = pdfjs.getDocument({ data });
  const doc = await loading.promise;
  try {
  if (doc.numPages > 40) throw new Error(`${file.name}: в PDF больше 40 страниц. Прикрепите нужную часть документа.`);
  const parts: string[] = [];
  const maxPages = Math.min(doc.numPages, 40);
  for (let i = 1; i <= maxPages; i++) {
    const page = await doc.getPage(i);
    const content = await page.getTextContent();
    const line = content.items
      .map((it) => ("str" in it ? String(it.str) : ""))
      .join(" ");
    parts.push(line);
  }
  return parts.join("\n").trim();
  } finally { await loading.destroy(); }
}

export async function fileToBase64(file: File): Promise<string> {
  const buf = await file.arrayBuffer();
  const bytes = new Uint8Array(buf);
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}
