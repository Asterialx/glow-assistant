export type SearchSource = { title: string; url: string };
const OPEN = "```glow-search-sources\n";
const CLOSE = "\n```";

export function appendSearchSources(content: string, sources: SearchSource[]): string {
  if (!sources.length) return content;
  return `${content.trimEnd()}\n\n${OPEN}${JSON.stringify(sources)}${CLOSE}`;
}

export function splitSearchSources(content: string): { text: string; sources: SearchSource[] } {
  const start = content.lastIndexOf(`\n\n${OPEN}`);
  if (start < 0) return { text: content, sources: [] };
  if (!content.endsWith(CLOSE)) return { text: content.slice(0, start), sources: [] };
  try {
    const values: unknown = JSON.parse(content.slice(start + 2 + OPEN.length, -CLOSE.length));
    if (!Array.isArray(values)) return { text: content, sources: [] };
    const sources = values.slice(0, 12).flatMap((item): SearchSource[] => {
      if (!item || typeof item.title !== "string" || typeof item.url !== "string") return [];
      try {
        const url = new URL(item.url);
        if (!(["http:", "https:"].includes(url.protocol)) || url.username || url.password || url.hostname.length > 253) return [];
        return [{ title: item.title.replace(/[\u0000-\u001f]/g, " ").trim().slice(0, 180) || url.hostname, url: url.href.slice(0, 1200) }];
      } catch { return []; }
    });
    return { text: content.slice(0, start), sources };
  } catch { return { text: content, sources: [] }; }
}

export function publicFaviconUrl(source: SearchSource): string | null {
  try {
    const url = new URL(source.url);
    const host = url.hostname.toLowerCase();
    if (!host.includes(".") || !/^[a-z0-9.-]+$/.test(host) || host === "localhost" || host.endsWith(".local") || /^\d/.test(host)) return null;
    return `https://www.google.com/s2/favicons?domain=${encodeURIComponent(host)}&sz=32`;
  } catch { return null; }
}
