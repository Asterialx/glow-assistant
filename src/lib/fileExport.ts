import type { GeneratedFile } from "./generatedFile";
import { generatedCellValue, validateGeneratedFile } from "./generatedFile";

export function documentMarkdown(file: GeneratedFile): string {
  return /^#\s/m.test(file.content || "") ? file.content! : `# ${file.title}\n\n${file.content || ""}`;
}
export function presentationSlides(file: GeneratedFile): NonNullable<GeneratedFile["slides"]> {
  return (file.slides || []).flatMap(slide => {
    const chunks: string[] = []; let body = "";
    for (const line of slide.body.split("\n")) {
      const fragments = line.match(/.{1,240}(?:\s|$)|\S{1,240}/g) || [""];
      for (const fragment of fragments) {
        if (body && (body.length + fragment.length > 550 || body.split("\n").length >= 7)) { chunks.push(body); body = ""; }
        body += `${body ? "\n" : ""}${fragment.trim()}`;
      }
    }
    chunks.push(body);
    return chunks.map((body, index) => ({ title: `${slide.title}${index ? ` (${index + 1})` : ""}`, body, notes: slide.notes }));
  });
}
export async function exportGeneratedFile(input: GeneratedFile): Promise<Blob> {
  const file = validateGeneratedFile(input);
  if (file.format === "md") return new Blob([documentMarkdown(file)], { type: "text/markdown;charset=utf-8" });
  if (file.format === "xlsx") {
    const module = await import("exceljs"); const Excel = module.default || module;
    const workbook = new Excel.Workbook(); workbook.creator = "Glow"; workbook.calcProperties.fullCalcOnLoad = true;
    for (const data of file.sheets!) {
      const sheet = workbook.addWorksheet(data.name, { views: [{ state: "frozen", ySplit: 1 }] });
      data.rows.forEach((row, r) => row.forEach((value, c) => {
        const cell = sheet.getCell(r + 1, c + 1);
        if (value && typeof value === "object") { const result = generatedCellValue(data.rows, r, c); cell.value = { formula: value.formula, result: typeof result === "number" ? result : { error: "#REF!" } }; }
        else cell.value = value;
        cell.font = { name: "Arial", size: 11, ...(r === 0 ? { bold: true, color: { argb: "FFFFFFFF" } } : {}) };
        cell.alignment = { vertical: "middle", wrapText: true };
        if (r === 0 || r % 2 === 0) cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: r === 0 ? "FF243447" : "FFF1F5F9" } };
        if (typeof value === "number" && !Number.isInteger(value)) cell.numFmt = "#,##0.00";
      }));
      sheet.getRow(1).height = 28;
      const columns = Math.max(...data.rows.map(row => row.length));
      for (let c = 0; c < columns; c++) sheet.getColumn(c + 1).width = Math.min(42, Math.max(14, ...data.rows.slice(0, 100).map(row => String(row[c] && typeof row[c] === "object" ? generatedCellValue(data.rows, data.rows.indexOf(row), c) : row[c] ?? "").length + 3)));
      if (columns && data.rows.length) sheet.autoFilter = { from: { row: 1, column: 1 }, to: { row: data.rows.length, column: columns } };
    }
    return new Blob([new Uint8Array(await workbook.xlsx.writeBuffer())], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  }
  if (file.format === "pptx") {
    const { default: PptxGenJS } = await import("pptxgenjs");
    const deck = new PptxGenJS(); deck.layout = "LAYOUT_WIDE"; deck.author = "Glow"; deck.subject = file.title; deck.title = file.title;
    deck.theme = { headFontFace: "Arial", bodyFontFace: "Arial" };
    const slides = presentationSlides(file);
    slides.forEach((data, index) => {
      const slide = deck.addSlide(); slide.background = { color: "F8FAFC" };
      slide.addShape(deck.ShapeType.rect, { x: 0, y: 0, w: 0.16, h: 7.5, fill: { color: "C36A4A" }, line: { color: "C36A4A" } });
      slide.addText(data.title, { x: 0.65, y: 0.55, w: 12, h: 1.2, fontSize: 30, bold: true, color: "243447", margin: 0, breakLine: false });
      slide.addText(data.body.replace(/\*\*/g, ""), { x: 0.7, y: 1.95, w: 11.9, h: 4.75, fontSize: 19, color: "334155", margin: 0, valign: "top", breakLine: false, paraSpaceAfter: 14 });
      slide.addText(`${index + 1} / ${slides.length}`, { x: 11.9, y: 7, w: 0.8, h: 0.2, fontSize: 10, color: "64748B", align: "right", margin: 0 });
      if (data.notes) slide.addNotes(data.notes);
    });
    return new Blob([await deck.write({ outputType: "arraybuffer" }) as ArrayBuffer], { type: "application/vnd.openxmlformats-officedocument.presentationml.presentation" });
  }
  const { marked } = await import("marked");
  const tokens = marked.lexer(documentMarkdown(file));
  const plain = (value: string) => value.replace(/\*\*([^*]+)\*\*/g, "$1").replace(/`([^`]+)`/g, "$1").replace(/\[([^\]]+)\]\(([^)]+)\)/g, "$1 ($2)");
  if (file.format === "pdf") {
    const [module, fonts] = await Promise.all([import("pdfmake/build/pdfmake"), import("pdfmake/build/vfs_fonts")]);
    const pdf = (module.default || module) as unknown as { addVirtualFileSystem(vfs: unknown): void; createPdf(doc: unknown): { getBlob(): Promise<Blob> } };
    pdf.addVirtualFileSystem(fonts.default || fonts);
    const inline = (text: string): any[] => marked.lexer(text).flatMap((token: any) => {
      const nodes = token.tokens || [{ text }];
      return nodes.map((node: any) => ({ text: node.text || node.raw || "", ...(node.type === "strong" ? { bold: true } : {}), ...(node.type === "link" && /^https?:\/\//.test(node.href) ? { link: node.href, color: "9E5038", decoration: "underline" } : {}) }));
    });
    const content: any[] = tokens.flatMap((token: any): any[] => {
      if (token.type === "space") return [];
      if (token.type === "heading") return [{ text: plain(token.text), style: token.depth === 1 ? "title" : "heading", margin: [0, token.depth === 1 ? 0 : 14, 0, 8], headlineLevel: token.depth }];
      if (token.type === "list") return [{ [token.ordered ? "ol" : "ul"]: token.items.map((item: any) => ({ text: inline(item.text), margin: [0, 0, 0, 5] })), margin: [0, 0, 0, 10] }];
      if (token.type === "table") return [{ table: { headerRows: 1, widths: token.header.map(() => "*"), body: [token.header.map((cell: any) => ({ text: plain(cell.text), bold: true, fillColor: "EEF2F6" })), ...token.rows.map((row: any[]) => row.map(cell => plain(cell.text)))] }, margin: [0, 5, 0, 12] }];
      return [{ text: token.type === "code" ? token.text : inline(token.text || token.raw || ""), fontSize: token.type === "code" ? 9 : 11, margin: [0, 0, 0, 10] }];
    });
    return pdf.createPdf({ content, pageSize: "A4", pageMargins: [44, 44, 44, 44], defaultStyle: { font: "Roboto", fontSize: 11, lineHeight: 1.3, color: "243447" }, styles: { title: { fontSize: 24, bold: true }, heading: { fontSize: 16, bold: true } }, footer: (page: number, pages: number) => ({ text: `${page} / ${pages}`, alignment: "right", margin: [0, 0, 44, 0], color: "64748B", fontSize: 9 }) }).getBlob();
  }
  const d = await import("docx");
  const runs = (text: string) => {
    const inlineTokens = marked.lexer(text).flatMap((token: any) => token.tokens || [{ text }]);
    return inlineTokens.map((token: any) => new d.TextRun({ text: token.type === "link" ? `${token.text} (${token.href})` : token.text || token.raw || "", bold: token.type === "strong", italics: token.type === "em", ...(token.type === "codespan" ? { font: "Consolas" } : {}) }));
  };
  const children: (InstanceType<typeof d.Paragraph> | InstanceType<typeof d.Table>)[] = [];
  for (const token of tokens as any[]) {
    if (token.type === "space") continue;
    if (token.type === "heading") children.push(new d.Paragraph({ text: plain(token.text), heading: token.depth === 1 ? d.HeadingLevel.TITLE : token.depth === 2 ? d.HeadingLevel.HEADING_1 : d.HeadingLevel.HEADING_2, spacing: { before: 220, after: 140 } }));
    else if (token.type === "list") token.items.forEach((item: any, index: number) => children.push(new d.Paragraph({ children: runs(`${token.ordered ? `${index + 1}. ` : ""}${item.text}`), ...(!token.ordered ? { bullet: { level: 0 } } : {}), spacing: { after: 100 } })));
    else if (token.type === "table") children.push(new d.Table({ width: { size: 100, type: d.WidthType.PERCENTAGE }, rows: [token.header, ...token.rows].map((row: any[], index: number) => new d.TableRow({ children: row.map(cell => new d.TableCell({ children: [new d.Paragraph({ children: [new d.TextRun({ text: plain(cell.text), bold: index === 0 })] })], ...(index === 0 ? { shading: { fill: "EEF2F6" } } : {}) })) })) }));
    else children.push(new d.Paragraph({ children: token.type === "code" ? [new d.TextRun({ text: token.text, font: "Consolas", size: 20 })] : runs(token.text || token.raw || ""), spacing: { after: 180, line: 300 } }));
  }
  return d.Packer.toBlob(new d.Document({ creator: "Glow", title: file.title, styles: { default: { document: { run: { font: "Arial", size: 22, color: "243447" } } } }, sections: [{ properties: { page: { margin: { top: 850, bottom: 850, left: 850, right: 850 } } }, children }] }));
}
/** In the desktop app a blob link click does nothing in WebView2, so the file is saved through a native dialog. */
export async function downloadBlob(blob: Blob, filename: string): Promise<void> {
  if (typeof window !== "undefined" && "__TAURI_INTERNALS__" in window) {
    const [{ save }, { invoke }] = await Promise.all([import("@tauri-apps/plugin-dialog"), import("@tauri-apps/api/core")]);
    const path = await save({ defaultPath: filename });
    if (!path) return;
    const bytes = new Uint8Array(await blob.arrayBuffer());
    let binary = "";
    for (let offset = 0; offset < bytes.length; offset += 0x8000) binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
    await invoke("export_save_file", { path, bytesBase64: btoa(binary) });
    return;
  }
  const url = URL.createObjectURL(blob), a = document.createElement("a"); a.href = url; a.download = filename; a.click(); setTimeout(() => URL.revokeObjectURL(url), 30000);
}
