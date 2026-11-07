import { useEffect, useId, useMemo, useRef, useState } from "react";
import { AlertTriangle, Wrench } from "lucide-react";
import type { Artifact } from "../../lib/types";
import { artifactFixPrompt, buildHtmlPreviewDocument, htmlSourceKey, isInlineHtmlArtifact, validateHtmlPreviewError, validateHtmlPreviewState } from "../../lib/htmlArtifact";
import { THEMES } from "../../lib/themes";
import { useChatStore } from "../../stores/chatStore";
import { useUiStore } from "../../stores/uiStore";

/** Shared opaque-origin runtime for Inline and Workspace; neither exposes host actions. */
export function HtmlArtifactFrame({ artifact, title, className, dragging = false, inline = false }: {
  artifact: Artifact;
  title: string;
  className: string;
  dragging?: boolean;
  inline?: boolean;
}) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const instanceId = useId();
  const themeId = useUiStore((state) => state.themeId);
  const locale = useUiStore((state) => state.locale);
  const streaming = useChatStore((state) => state.streaming);
  const themed = isInlineHtmlArtifact(artifact);
  const theme = THEMES.find((item) => item.id === themeId) ?? THEMES[0];
  const [height, setHeight] = useState(400);
  const [errors, setErrors] = useState<string[]>([]);
  const [fixRequested, setFixRequested] = useState(false);
  const html = artifact.content_text || "<p>Empty</p>";
  const source = useMemo(() => htmlSourceKey(html), [html]);
  const channel = `${artifact.id}:${source}:${instanceId}`;
  const document = useMemo(() => {
    const saved = useUiStore.getState().artifactViewState[artifact.id]?.htmlPreview;
    const initialTheme = THEMES.find((item) => item.id === useUiStore.getState().themeId) ?? THEMES[0];
    return buildHtmlPreviewDocument(html, channel, saved?.source === source ? saved.state : undefined, themed ? initialTheme : undefined);
  }, [artifact.id, html, channel, source, themed]);

  // A new version of the code starts with a clean slate.
  useEffect(() => {
    setErrors([]);
    setFixRequested(false);
  }, [channel]);

  const syncTheme = () => {
    if (themed) iframeRef.current?.contentWindow?.postMessage({ type: "glow-html-theme", channel, vars: theme.vars, kind: theme.kind }, "*");
  };
  useEffect(syncTheme, [channel, themed, theme]);

  useEffect(() => {
    const receiveState = (event: MessageEvent) => {
      if (event.source !== iframeRef.current?.contentWindow) return;
      if (event.data?.channel !== channel) return;
      if (event.data?.type === "glow-html-error") {
        const message = validateHtmlPreviewError(event.data.message);
        if (message) setErrors((current) => (current.includes(message) || current.length >= 5 ? current : [...current, message]));
        return;
      }
      if (event.data?.type === "glow-html-size") {
        if (inline && typeof event.data.height === "number" && Number.isFinite(event.data.height)) {
          setHeight(Math.max(240, Math.min(640, Math.ceil(event.data.height))));
        }
        return;
      }
      if (event.data?.type !== "glow-html-state") return;
      const state = validateHtmlPreviewState(event.data.state);
      if (state) useUiStore.getState().setArtifactViewState(artifact.id, { htmlPreview: { source, state } });
    };
    window.addEventListener("message", receiveState);
    return () => window.removeEventListener("message", receiveState);
  }, [artifact.id, channel, source, inline]);

  const requestFix = () => {
    const prompt = artifactFixPrompt(artifact.title || title, errors, html, locale === "en" ? "en" : "ru");
    window.dispatchEvent(new CustomEvent("glow:fix-artifact", { detail: { prompt } }));
    setFixRequested(true);
  };

  return (
    <>
      {errors.length > 0 && (
        <div role="alert" className="flex shrink-0 items-start gap-2 border-b border-[var(--border)] bg-[var(--bg-elevated)] px-3 py-2 text-[12px] text-[var(--fg)]">
          <AlertTriangle size={14} className="mt-0.5 shrink-0 text-[#d97706]" />
          <div className="min-w-0 flex-1">
            <div className="font-medium">{locale === "ru" ? "В артефакте ошибка" : "The artifact has an error"}</div>
            <div className="break-words font-mono text-[11px] text-[var(--fg-muted)]">{errors[0]}{errors.length > 1 ? (locale === "ru" ? ` (и ещё ${errors.length - 1})` : ` (+${errors.length - 1} more)`) : ""}</div>
          </div>
          <button type="button" onClick={requestFix} disabled={streaming || fixRequested}
            className="inline-flex shrink-0 items-center gap-1 rounded-lg border border-[var(--border)] px-2 py-1 text-[12px] hover:bg-[var(--bg-hover)] disabled:opacity-50">
            <Wrench size={12} />{fixRequested ? (locale === "ru" ? "Отправлено" : "Sent") : (locale === "ru" ? "Исправить" : "Fix")}
          </button>
        </div>
      )}
      <iframe ref={iframeRef} title={title} sandbox="allow-scripts" referrerPolicy="no-referrer"
        className={className} style={{ ...(inline ? { height } : {}), ...(dragging ? { pointerEvents: "none" } : {}) }} srcDoc={document} onLoad={syncTheme} />
    </>
  );
}
