import type { Artifact } from "./types";

export type FileFormat = "md" | "docx" | "pdf" | "xlsx" | "pptx";
export type FileCell = string | number | boolean | null | { formula: string };
export interface GeneratedFile {
  format: FileFormat; filename: string; title: string; content?: string;
  sheets?: { name: string; rows: FileCell[][] }[];
  slides?: { title: string; body: string; notes?: string }[];
}
const FORMATS = ["md", "docx", "pdf", "xlsx", "pptx"];
export function stripGeneratedFileFences(text: string): string {
  return text.replace(/```glow-file[^\n]*\r?\n[\s\S]*?(?:\r?\n```|$)/g, "").trim();
}
export const GENERATED_FILE_PROMPT = 'File creation: when asked to create a downloadable document, spreadsheet or presentation, return a complete fenced ```glow-file JSON object, not Python code or an invented download URL. Schema: {"format":"md|docx|pdf|xlsx|pptx","filename":"name.ext","title":"Specific title","content":"Markdown text"}. For xlsx replace content with sheets:[{"name":"Sheet","rows":[["Column","Value"],["Item",42],["Total",{"formula":"SUM(B2:B2)"}]]}]. Supported formulas: SUM/AVERAGE/MIN/MAX/COUNT(A1:A10), range references only; strings are not formulas. For pptx replace content with slides:[{"title":"Title","body":"Concise slide text with newline bullets","notes":"Optional notes"}]. Max 5 files, 30 slides (body <=1000 chars), 10 sheets/1000 rows/30 columns, document <=80000 chars. Supply finished content, no placeholders or fabricated data. The app renders and exports actual files automatically. For revisions return the complete replacement glow-file object. Keep prose outside the block brief.';
export function validateGeneratedFile(value: unknown): GeneratedFile {
  const v = value as GeneratedFile;
  if (!v || typeof v !== "object" || !FORMATS.includes(v.format) || typeof v.title !== "string" || !v.title.trim() || v.title.length > 180) throw new Error("Неверный формат создаваемого файла.");
  const basename = (typeof v.filename === "string" ? v.filename : v.title).replace(/[<>:"/\\|?*\u0000-\u001f]/g, "_").replace(/\.(md|docx|pdf|xlsx|pptx)$/i, "").trim().replace(/[. ]+$/, "").slice(0, 100) || "document";
  const file: GeneratedFile = { format: v.format, filename: `${basename}.${v.format}`, title: v.title.trim() };
  if (["md", "docx", "pdf"].includes(v.format)) {
    if (typeof v.content !== "string" || !v.content.trim() || v.content.length > 80000) throw new Error("Документ пустой или слишком большой.");
    file.content = v.content;
  } else if (v.format === "xlsx") {
    if (!Array.isArray(v.sheets) || !v.sheets.length || v.sheets.length > 10) throw new Error("Допустимо от 1 до 10 листов.");
    const names = new Set<string>();
    file.sheets = v.sheets.map(sheet => {
      if (!sheet || typeof sheet.name !== "string" || !Array.isArray(sheet.rows) || !sheet.rows.length || sheet.rows.length > 1000) throw new Error("Неверная структура листа.");
      const name = sheet.name.replace(/[\\/*?:\[\]]/g, "_").replace(/^'+|'+$/g, "").slice(0, 31) || "Sheet";
      if (names.has(name.toLowerCase())) throw new Error("Названия листов должны различаться."); names.add(name.toLowerCase());
      return { name, rows: sheet.rows.map(row => {
        if (!Array.isArray(row) || row.length > 30) throw new Error("В таблице слишком много столбцов.");
        return row.map(cell => {
          if (cell === null || typeof cell === "boolean" || (typeof cell === "number" && Number.isFinite(cell)) || (typeof cell === "string" && cell.length < 10000)) return cell;
          if (cell && typeof cell === "object" && typeof cell.formula === "string" && /^(?:SUM|AVERAGE|MIN|MAX|COUNT)\([A-Z]+\d+:[A-Z]+\d+\)$/i.test(cell.formula)) return { formula: cell.formula.toUpperCase() };
          throw new Error("Неверное значение или неподдерживаемая формула ячейки.");
        });
      }) };
    });
  } else {
    if (!Array.isArray(v.slides) || !v.slides.length || v.slides.length > 30) throw new Error("Допустимо от 1 до 30 слайдов.");
    file.slides = v.slides.map(slide => {
      if (!slide || typeof slide.title !== "string" || slide.title.length > 120 || typeof slide.body !== "string" || slide.body.length > 1000 || (slide.notes !== undefined && (typeof slide.notes !== "string" || slide.notes.length > 3000))) throw new Error("Слайд слишком большой или имеет неверную структуру.");
      return { title: slide.title, body: slide.body, ...(slide.notes ? { notes: slide.notes } : {}) };
    });
  }
  if (JSON.stringify(file).length > 200000) throw new Error("Файл слишком большой.");
  return file;
}
export function extractGeneratedFiles(text: string): GeneratedFile[] {
  const files: GeneratedFile[] = [];
  for (const match of text.matchAll(/```glow-file[^\n]*\r?\n([\s\S]*?)\r?\n```/g)) {
    if (files.length >= 5) throw new Error("Создавайте до пяти файлов за один ответ.");
    files.push(validateGeneratedFile(JSON.parse(match[1])));
  }
  return files;
}
export function generatedFileFromArtifact(artifact: Artifact): GeneratedFile | null {
  try { if (!JSON.parse(artifact.meta_json || "{}").generatedFile) return null; return validateGeneratedFile(JSON.parse(artifact.content_text || "")); } catch { return null; }
}
export function generatedCellValue(rows: FileCell[][], row: number, column: number, seen = new Set<string>()): string | number | boolean | null {
  const cell = rows[row]?.[column] ?? null;
  if (!cell || typeof cell !== "object") return cell;
  const key = `${row}:${column}`;
  if (seen.has(key) || seen.size > 1000) return "#CYCLE!";
  const next = new Set(seen).add(key);
  const match = /^(SUM|AVERAGE|MIN|MAX|COUNT)\(([A-Z]+)(\d+):([A-Z]+)(\d+)\)$/.exec(cell.formula);
  if (!match) return "#FORMULA!";
  const col = (letters: string) => [...letters].reduce((n, c) => n * 26 + c.charCodeAt(0) - 64, 0) - 1;
  const r1 = Number(match[3]) - 1, r2 = Number(match[5]) - 1, c1 = col(match[2]), c2 = col(match[4]);
  if (r1 < 0 || r2 >= rows.length || c1 < 0 || c2 >= 30 || r2 < r1 || c2 < c1 || (r2-r1+1)*(c2-c1+1)>30000) return "#REF!";
  const numbers: number[] = [];
  for (let r = r1; r <= r2; r++) for (let c = c1; c <= c2; c++) { const value = generatedCellValue(rows, r, c, next); if (typeof value === "string" && value.startsWith("#")) return value; if (typeof value === "number") numbers.push(value); }
  if (match[1] === "COUNT") return numbers.length;
  if (!numbers.length) return match[1] === "AVERAGE" ? "#DIV/0!" : 0;
  return match[1] === "MIN" ? Math.min(...numbers) : match[1] === "MAX" ? Math.max(...numbers) : numbers.reduce((a,b)=>a+b,0) / (match[1] === "AVERAGE" ? numbers.length : 1);
}
