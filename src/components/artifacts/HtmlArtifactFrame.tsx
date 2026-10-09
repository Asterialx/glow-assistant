import { useEffect, useId, useMemo, useRef, useState } from "react";
import type { Artifact } from "../../lib/types";
import { buildHtmlPreviewDocument, htmlSourceKey, isInlineHtmlArtifact, validateHtmlPreviewState } from "../../lib/htmlArtifact";
import { THEMES } from "../../lib/themes";
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
  const themed = isInlineHtmlArtifact(artifact);
  const theme = THEMES.find((item) => item.id === themeId) ?? THEMES[0];
  const [height, setHeight] = useState(400);
  const html = artifact.content_text || "<p>Empty</p>";
  const source = useMemo(() => htmlSourceKey(html), [html]);
  const channel = `${artifact.id}:${source}:${instanceId}`;
  const document = useMemo(() => {
    const saved = useUiStore.getState().artifactViewState[artifact.id]?.htmlPreview;
    const initialTheme = THEMES.find((item) => item.id === useUiStore.getState().themeId) ?? THEMES[0];
    return buildHtmlPreviewDocument(html, channel, saved?.source === source ? saved.state : undefined, themed ? initialTheme : undefined);
  }, [artifact.id, html, channel, source, themed]);

  const syncTheme = () => {
    if (themed) iframeRef.current?.contentWindow?.postMessage({ type: "glow-html-theme", channel, vars: theme.vars, kind: theme.kind }, "*");
  };
  useEffect(syncTheme, [channel, themed, theme]);

  useEffect(() => {
    const receiveState = (event: MessageEvent) => {
      if (event.source !== iframeRef.current?.contentWindow) return;
      if (event.data?.channel !== channel) return;
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

  return <iframe ref={iframeRef} title={title} sandbox="allow-scripts" referrerPolicy="no-referrer"
    className={className} style={{ ...(inline ? { height } : {}), ...(dragging ? { pointerEvents: "none" } : {}) }} srcDoc={document} onLoad={syncTheme} />;
}
