import { useState } from "react";
import { ChevronDown, ChevronUp, ExternalLink, Globe } from "lucide-react";
import type { SearchSource } from "../../lib/searchSources";
import { publicFaviconUrl } from "../../lib/searchSources";

export function SearchSources({ sources, locale }: { sources: SearchSource[]; locale: string }) {
  const [expanded, setExpanded] = useState(false);
  if (!sources.length) return null;
  const ru = locale === "ru";
  const visible = expanded ? sources : sources.slice(0, 3);
  return (
    <section aria-label={ru ? "Источники из интернета" : "Web sources"} className="mt-4 max-w-full overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--bg-elevated)]">
      <div className="flex items-center gap-2 px-3.5 pb-2 pt-3 text-[12px] font-medium text-[var(--fg-muted)]">
        <Globe size={14} className="text-[var(--accent)]" />
        <span>{ru ? "Поиск по сайтам" : "Searched the web"}</span>
        <span className="text-[var(--fg-faint)]">· {sources.length}</span>
        {sources.length > 3 && <button type="button" onClick={() => setExpanded(value => !value)} aria-expanded={expanded} className="ml-auto inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 hover:bg-[var(--bg-hover)]">{expanded ? (ru ? "Скрыть" : "Show less") : `+${sources.length - 3}`} {expanded ? <ChevronUp size={13} /> : <ChevronDown size={13} />}</button>}
      </div>
      <ul className="flex flex-wrap gap-2 px-3 pb-3">
        {visible.map((source, index) => <SourceChip key={`${source.url}-${index}`} source={source} />)}
      </ul>
    </section>
  );
}

function SourceChip({ source }: { source: SearchSource }) {
  const [failed, setFailed] = useState(false);
  const favicon = publicFaviconUrl(source);
  let host = "";
  try { host = new URL(source.url).hostname.replace(/^www\./i, ""); } catch { /* validated when parsed */ }
  const label = host.split(".")[0] || "Web";
  return (
    <li className="min-w-0 max-w-full">
      <a href={source.url} target="_blank" rel="noopener noreferrer" title={source.title} className="inline-flex max-w-full items-center gap-2 rounded-xl border border-[var(--border)] bg-[var(--bg)] px-2.5 py-1.5 text-[12px] text-[var(--fg)] transition-colors hover:bg-[var(--bg-hover)]">
        <span className="flex size-5 shrink-0 items-center justify-center overflow-hidden rounded-full bg-[var(--bg-hover)] text-[10px] font-semibold uppercase text-[var(--fg-muted)]">{favicon && !failed ? <img src={favicon} alt="" loading="lazy" referrerPolicy="no-referrer" className="size-4" onError={() => setFailed(true)} /> : label.slice(0, 1)}</span>
        <span className="max-w-48 truncate">{label}</span>
        <ExternalLink size={11} className="shrink-0 text-[var(--fg-faint)]" />
      </a>
    </li>
  );
}
