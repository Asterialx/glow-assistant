import { unzipSync, strFromU8 } from "fflate";
import { XMLParser } from "fast-xml-parser";

/** Read ODF content without scripts, external references or embedded objects. */
export function extractOpenDocument(bytes: Uint8Array): string {
  if (bytes.length > 10_000_000) throw new Error("Документ больше 10 МБ.");
  const files = unzipSync(bytes, { filter: item => {
    if (item.name !== "content.xml") return false;
    if (item.originalSize > 5_000_000) throw new Error("Слишком большой распакованный документ.");
    return true;
  } });
  if (!files["content.xml"]) throw new Error("В документе нет содержимого.");
  const xml = strFromU8(files["content.xml"]);
  if (/<!DOCTYPE|<!ENTITY/i.test(xml)) throw new Error("Неподдерживаемые XML-объявления.");
  const nodes = new XMLParser({ preserveOrder: true, ignoreAttributes: false, removeNSPrefix: true, trimValues: false, parseTagValue: false }).parse(xml);
  let visited = 0;
  function read(value: any, depth = 0): string {
    if (++visited > 100000 || depth > 100) throw new Error("Слишком сложный документ.");
    if (Array.isArray(value)) return value.map(item => read(item, depth + 1)).join("");
    if (!value || typeof value !== "object") return "";
    return Object.entries(value).map(([tag, child]) => {
      if (tag === "#text") return String(child);
      if (tag === ":@" || ["script", "scripts", "object", "binary-data"].includes(tag)) return "";
      if (tag === "s") return " ";
      if (tag === "tab") return "\t";
      if (tag === "line-break") return "\n";
      const text = read(child, depth + 1);
      return text + (["p", "h", "table-row", "page"].includes(tag) ? "\n" : tag === "table-cell" ? "\t" : "");
    }).join("");
  }
  return read(nodes).trim();
}

/** RTF text reader: groups, Unicode fallback and escaped characters; no execution. */
export function extractRtf(input: string): string {
  if (!/^\s*\{\\rtf/i.test(input)) throw new Error("Повреждённый RTF-документ.");
  let hidden = false, uc = 1, skip = 0, output = "";
  const stack: { hidden: boolean; uc: number }[] = [];
  const tokens = input.match(/\\'[0-9a-f]{2}|\\[a-z]+-?\d* ?|\\[^a-z]|[{}]|[^\\{}]+/gi) || [];
  const codepage = input.match(/\\ansicpg(\d+)/)?.[1];
  const decoder = new TextDecoder(codepage === "1251" ? "windows-1251" : "windows-1252");
  for (const token of tokens) {
    if (token === "{") { stack.push({ hidden, uc }); if (stack.length > 100) throw new Error("Слишком сложный RTF."); }
    else if (token === "}") { const state = stack.pop(); if (state) ({ hidden, uc } = state); }
    else if (token === "\\*" || /^\\(?:fonttbl|colortbl|stylesheet|info|pict|object|fldinst|header|footer)\b/i.test(token)) hidden = true;
    else if (hidden) continue;
    else if (/^\\uc/.test(token)) uc = Math.min(10, Math.max(0, Number(token.match(/-?\d+/)?.[0] || 1)));
    else if (/^\\u-?\d/.test(token)) { output += String.fromCharCode(Number(token.match(/-?\d+/)![0]) & 65535); skip = uc; }
    else if (/^\\'/.test(token)) { if (skip) skip--; else output += decoder.decode(new Uint8Array([parseInt(token.slice(2), 16)])); }
    else if (/^\\(?:par|line)\b/.test(token)) output += "\n";
    else if (/^\\tab\b/.test(token)) output += "\t";
    else if (/^\\[\\{}]$/.test(token)) { if (skip) skip--; else output += token.slice(1); }
    else if (!token.startsWith("\\")) { output += token.slice(skip).replace(/[\r\n]/g, ""); skip = Math.max(0, skip - token.length); }
  }
  return output.trim();
}
