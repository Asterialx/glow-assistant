import { unzipSync, strFromU8 } from "fflate";
import { XMLParser } from "fast-xml-parser";

const xml = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: "@", removeNSPrefix: true, parseTagValue: false, trimValues: false, htmlEntities: true });
const ordered = new XMLParser({ preserveOrder: true, ignoreAttributes: false, removeNSPrefix: true, parseTagValue: false, trimValues: false, htmlEntities: true });
const array = (value: any): any[] => value == null ? [] : Array.isArray(value) ? value : [value];
const scalar = (value: any): string => typeof value === "object" ? String(value?.["#text"] ?? "") : String(value ?? "");
export function extractOfficeImages(bytes: Uint8Array): { images: { name: string; bytes: Uint8Array; mime: string }[]; total: number; skipped: number } {
  let total = 0, size = 0, skipped = 0;
  const files = unzipSync(bytes, { filter: entry => {
    if (!/^(word|xl|ppt)\/media\/.*\.(png|jpe?g|webp)$/i.test(entry.name)) return false;
    total++;
    if (total > 3 || entry.originalSize > 5_000_000 || size + entry.originalSize > 10_000_000) { skipped++; return false; }
    size += entry.originalSize;
    return true;
  } });
  return { total, skipped, images: Object.entries(files).map(([name, bytes]) => ({ name: name.split("/").pop()!, bytes, mime: /\.png$/i.test(name) ? "image/png" : /\.webp$/i.test(name) ? "image/webp" : "image/jpeg" })) };
}
function find(node: any, tag: string): any[] {
  if (!node || typeof node !== "object") return [];
  return Object.entries(node).flatMap(([key, value]) => key === tag ? [value] : key === ":@" ? [] : array(value).flatMap(item => find(item, tag)));
}
function runText(nodes: any): string {
  return array(nodes).map(node => {
    if (!node || typeof node !== "object") return "";
    if (node.t) return array(node.t).map(item => scalar(item["#text"])).join("");
    if (node.tab) return "\t";
    if (node.br || node.cr) return "\n";
    return Object.entries(node).filter(([key]) => key !== ":@").map(([, value]) => runText(value)).join("");
  }).join("");
}

/** Extract readable content, never execute macros, formulas or external relationships. */
export function extractOfficeText(bytes: Uint8Array, filename: string): string {
  if (bytes.byteLength > 20_000_000) throw new Error("Office-файл больше 20 МБ.");
  const kind = filename.toLowerCase().split(".").pop();
  if (!["docx", "xlsx", "pptx"].includes(kind || "")) throw new Error("Поддерживаются DOCX, XLSX и PPTX. Старый бинарный формат нужно пересохранить.");
  let total = 0, entries = 0;
  const maxPartBytes = kind === "docx" ? 20_000_000 : 5_000_000;
  const maxTotalBytes = kind === "docx" ? 30_000_000 : 15_000_000;
  const files = unzipSync(bytes, { filter: info => {
    const wanted = kind === "docx" ? /^word\/(document|header\d+|footer\d+)\.xml$/.test(info.name)
      : kind === "xlsx" ? /^xl\/(workbook\.xml|_rels\/workbook\.xml\.rels|sharedStrings\.xml|worksheets\/sheet\d+\.xml)$/.test(info.name)
      : /^ppt\/slides\/slide\d+\.xml$/.test(info.name);
    if (!wanted) return false;
    total += info.originalSize; entries++;
    if (info.originalSize > maxPartBytes || total > maxTotalBytes || entries > 300) throw new Error("Слишком большой распакованный документ: объём внутренней разметки превышает лимит чтения. Пересохраните документ или отправьте нужные главы.");
    return true;
  } });
  const read = (path: string): string => {
    const data = files[path]; if (!data) return "";
    if (data.length > maxPartBytes) throw new Error("Часть документа слишком большая.");
    const value = strFromU8(data);
    if (/<!DOCTYPE|<!ENTITY/i.test(value)) throw new Error("Неподдерживаемые XML-объявления.");
    return value;
  };
  let output = "";
  if (kind === "docx") {
    if (!files["word/document.xml"]) throw new Error("Нет содержимого DOCX.");
    output = Object.keys(files).sort((a, b) => a === "word/document.xml" ? -1 : b === "word/document.xml" ? 1 : a.localeCompare(b)).map(path => find(ordered.parse(read(path)), "p").map(p => runText(p)).join("\n")).join("\n");
  } else if (kind === "pptx") {
    const slides = Object.keys(files).sort((a, b) => Number(a.match(/slide(\d+)/)?.[1]) - Number(b.match(/slide(\d+)/)?.[1]));
    if (!slides.length) throw new Error("В PPTX нет слайдов.");
    output = slides.map((path, index) => `Слайд ${index + 1}\n${find(ordered.parse(read(path)), "p").map(p => runText(p)).join("\n")}`).join("\n\n");
  } else {
    if (!files["xl/workbook.xml"]) throw new Error("Нет содержимого XLSX.");
    const shared = array(xml.parse(read("xl/sharedStrings.xml"))?.sst?.si).map(item => {
      if (item.t != null) return scalar(item.t);
      return array(item.r).map(run => scalar(run.t)).join("");
    });
    const relationships = new Map(array(xml.parse(read("xl/_rels/workbook.xml.rels"))?.Relationships?.Relationship).map(item => [item["@Id"], item["@Target"]]));
    output = array(xml.parse(read("xl/workbook.xml"))?.workbook?.sheets?.sheet).map(sheet => {
      const target = String(relationships.get(sheet["@id"]) || "");
      const path = target.startsWith("/") ? target.slice(1) : `xl/${target.replace(/^\.\//, "")}`;
      if (!/^xl\/worksheets\/sheet\d+\.xml$/.test(path)) return `Лист ${sheet["@name"]}: неподдерживаемая ссылка`;
      const rows = array(xml.parse(read(path))?.worksheet?.sheetData?.row);
      const headers = new Map(array(rows[0]?.c).map(cell => [String(cell["@r"]).replace(/\d+$/, ""), cell["@t"] === "s" ? shared[Number(scalar(cell.v))] || "" : cell["@t"] === "inlineStr" ? scalar(cell.is?.t) : scalar(cell.v)]));
      return `Лист ${sheet["@name"]}\n` + rows.slice(0, 2000).map(row => array(row.c).map(cell => {
        const value = cell["@t"] === "s" ? shared[Number(scalar(cell.v))] ?? "" : cell["@t"] === "inlineStr" ? scalar(cell.is?.t) : scalar(cell.v);
        const heading = headers.get(String(cell["@r"]).replace(/\d+$/, ""));
        return `${cell["@r"]}: ${value}${heading && row !== rows[0] ? ` [столбец: ${heading}]` : ""}${cell.f != null ? ` [формула: ${scalar(cell.f)}; сохранённое значение, не пересчитано]` : ""}`;
      }).join(" | ")).join("\n") + (rows.length > 2000 ? "\n[Лист ограничен 2000 строками]" : "");
    }).join("\n\n");
  }
  if (!output.trim()) throw new Error("Текст не найден: документ может содержать только изображения.");
  const notice = "\n[Передана только начальная часть документа: текст сокращён до лимита 60 000 символов. Остальная часть не прочитана.]";
  return output.length > 60000 ? output.slice(0, 60000 - notice.length) + notice : output;
}
