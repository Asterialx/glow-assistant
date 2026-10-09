import { PanelRight } from "lucide-react";
import type { Artifact } from "../../lib/types";
import { useUiStore } from "../../stores/uiStore";
import { HtmlArtifactFrame } from "./HtmlArtifactFrame";

export function InlineHtmlArtifact({ artifact, onExpand }: {
  artifact: Artifact;
  onExpand?: (artifactId: string) => void;
}) {
  const locale = useUiStore((state) => state.locale);
  return (
    <section className="my-3 min-w-0 overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--bg-elevated)]">
      <header className="flex items-center gap-2 border-b border-[var(--border)] px-3 py-2.5">
        <span className="min-w-0 flex-1 truncate text-sm font-medium text-[var(--fg)]">{artifact.title}</span>
        {onExpand && <button type="button" onClick={() => onExpand(artifact.id)}
          aria-label={locale === "ru" ? "Развернуть в рабочую область" : "Expand to workspace"}
          className="inline-flex shrink-0 items-center gap-1 rounded-lg px-2 py-1 text-xs text-[var(--fg-muted)] hover:bg-[var(--bg-hover)]">
          <PanelRight size={13} />{locale === "ru" ? "Развернуть" : "Expand"}
        </button>}
      </header>
      <HtmlArtifactFrame artifact={artifact} title={artifact.title || "Interactive explanation"} inline
        className="block w-full border-0" />
    </section>
  );
}
