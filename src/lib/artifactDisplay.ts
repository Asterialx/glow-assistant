/** Detect / strip Artifacts fences so chat never dumps raw markup. */

import { hasIncompleteWidgetFence, stripInlineUiFromText } from "./widgetParse";

const HTML_FENCE_OPEN = /```html\b/i;

export function hasHtmlArtifactFence(text: string): boolean {
  return HTML_FENCE_OPEN.test(text);
}

export function isLabLikeHtml(html: string): boolean {
  return (
    /<table[\s>]/i.test(html) &&
    /(biomarker|lab\s*panel|reference|ref[_ ]?(low|high)|mmol|mg\/d[lL]|HDL|LDL|Glucose)/i.test(
      html,
    )
  );
}

/** Remove completed ```html … ``` blocks. Leaves surrounding prose. */
export function stripHtmlArtifactFences(text: string): string {
  return text
    .replace(/```html\b[^\n]*\n?[\s\S]*?```/gi, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** Strip large code/jupyter fences that live in Artifacts (keep short inline snippets). */
export function stripPanelCodeFences(text: string): string {
  return text
    .replace(/```(?:jupyter|python-cell)\b[^\n]*\n[\s\S]*?```/gi, "")
    .replace(/```(tsx?|jsx?|python|rs|ts|js)\b[^\n]*\n([\s\S]*?)```/gi, (full, _lang, body: string) => {
      const lines = body.split("\n").filter((l) => l.trim()).length;
      return lines >= 8 ? "" : full;
    })
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export interface AssistantDisplay {
  /** Markdown shown in the bubble (no raw HTML / widget JSON / panel code). */
  content: string;
  /** True while an unfinished ```html fence is streaming in. */
  buildingHtml: boolean;
  /** True while an unfinished ```widget fence is streaming in. */
  buildingWidget: boolean;
  /** True when a complete or in-progress HTML artifact fence was present. */
  hasHtmlArtifact: boolean;
}

export function getAssistantDisplay(text: string, isStreaming: boolean): AssistantDisplay {
  const hasFence = hasHtmlArtifactFence(text);
  const buildingWidget = isStreaming && hasIncompleteWidgetFence(text);
  const htmlBodies = [...text.matchAll(/```html\b[^\n]*\n([\s\S]*?)```/gi)].map((m) => m[1] ?? "");
  const onlyLabHtml =
    hasFence && htmlBodies.length > 0 && htmlBodies.every((b) => isLabLikeHtml(b));

  let working = text;
  let buildingHtml = false;

  if (hasFence) {
    const openIdx = working.search(HTML_FENCE_OPEN);
    const afterOpen = working.slice(openIdx);
    const closed = /```html\b[^\n]*\n?[\s\S]*?```/i.test(afterOpen);
    buildingHtml = isStreaming && !closed && !onlyLabHtml;
    if (isStreaming && !closed) {
      working = working.slice(0, openIdx).trim();
    } else {
      working = stripHtmlArtifactFences(working);
    }
  }

  if (buildingWidget) {
    const openIdx = working.search(/```(?:json:widget|widget|glow-widget)\b/i);
    if (openIdx >= 0) working = working.slice(0, openIdx).trim();
  } else {
    working = stripInlineUiFromText(working);
  }

  working = stripPanelCodeFences(working);

  return {
    content: working,
    buildingHtml,
    buildingWidget,
    // Lab HTML is not a right-panel Artifact
    hasHtmlArtifact: hasFence && !onlyLabHtml,
  };
}

export function htmlArtifactTitle(html: string): string {
  const m = html.match(/<title[^>]*>([^<]*)<\/title>/i);
  const t = m?.[1]?.trim();
  return t || "HTML preview";
}
