/** Detect / strip Artifacts fences so chat never dumps raw markup. */

import { hasIncompleteWidgetFence, stripInlineUiFromText } from "./widgetParse";
import { CODE_ARTIFACT_FENCE } from "./artifactCode";
import { stripGenUiFences } from "./genUi";
import { stripGeneratedFileFences, extractGeneratedFiles, claimsMissingFile } from "./generatedFile";

const HTML_FENCE_OPEN = /```\s*html\b/i;

export interface HtmlArtifactMatch {
  body: string;
  complete: boolean;
}

/** Accept both the instructed HTML fence and a complete HTML document emitted without a fence. */
export function extractHtmlArtifact(text: string): HtmlArtifactMatch | null {
  const fenced = /```\s*html\b[^\r\n]*(?:\r?\n)([\s\S]*?)(```|$)/i.exec(text);
  if (fenced) {
    const body = fenced[1].trim();
    const hasDocumentShell = /<!doctype\s+html\b|<html\b/i.test(body);
    return {
      body,
      complete: fenced[2] === "```" && (!hasDocumentShell || /<\/html\s*>/i.test(body)),
    };
  }

  const documentStart = /<!doctype\s+html\b|<html\b/i.exec(text);
  if (!documentStart) return null;

  const body = text.slice(documentStart.index).trim();
  return { body, complete: /<\/html\s*>/i.test(body) };
}

export function hasHtmlArtifactFence(text: string): boolean {
  return HTML_FENCE_OPEN.test(text) || extractHtmlArtifact(text) !== null;
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
    .replace(/```\s*html\b[^\r\n]*(?:\r?\n)[\s\S]*?(?:```|$)/gi, "")
    .replace(/<!doctype\s+html\b|<html\b[\s\S]*$/i, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** Strip large code/jupyter fences that live in Artifacts (keep short inline snippets). */
export function stripPanelCodeFences(text: string): string {
  return text
    .replace(/```(?:jupyter|python-cell)\b[^\n]*\n[\s\S]*?```/gi, "")
    .replace(CODE_ARTIFACT_FENCE, (full, _lang, body: string) => {
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
  /** True when generation ended with an incomplete HTML artifact. */
  incompleteHtml: boolean;
  buildingFile: boolean;
  invalidFile: boolean;
}

export function getAssistantDisplay(text: string, isStreaming: boolean): AssistantDisplay {
  const hasFile = /```glow-file\b/.test(text);
  let invalidFile = false;
  if (hasFile && !isStreaming) { try { invalidFile = !extractGeneratedFiles(text).length; } catch { invalidFile = true; } }
  else if (!hasFile && !isStreaming) invalidFile = claimsMissingFile(text);
  text = stripGeneratedFileFences(text);
  const htmlArtifact = extractHtmlArtifact(text);
  const hasFence = htmlArtifact !== null;
  const buildingWidget = isStreaming && hasIncompleteWidgetFence(text);
  const htmlBodies = htmlArtifact ? [htmlArtifact.body] : [];
  const onlyLabHtml =
    hasFence && htmlBodies.length > 0 && htmlBodies.every((b) => isLabLikeHtml(b));

  let working = text;
  let buildingHtml = false;

  if (hasFence) {
    const openIdx = working.search(HTML_FENCE_OPEN);
    const rawDocIdx = working.search(/<!doctype\s+html\b|<html\b/i);
    const artifactIdx = openIdx >= 0 ? openIdx : rawDocIdx;
    buildingHtml = isStreaming && !htmlArtifact?.complete && !onlyLabHtml;
    if (artifactIdx >= 0) working = working.slice(0, artifactIdx).trim();
    if (!isStreaming) working = stripHtmlArtifactFences(working);
  }

  if (buildingWidget) {
    const openIdx = working.search(/```(?:json:widget|widget|glow-widget)\b/i);
    if (openIdx >= 0) working = working.slice(0, openIdx).trim();
  } else {
    working = stripInlineUiFromText(working);
  }

  working = stripGenUiFences(stripPanelCodeFences(working), isStreaming);

  return {
    content: working,
    buildingFile: hasFile && isStreaming,
    invalidFile,
    buildingHtml,
    buildingWidget,
    incompleteHtml: !isStreaming && hasFence && !htmlArtifact?.complete && !onlyLabHtml,
    // Lab HTML is not a right-panel Artifact
    hasHtmlArtifact: hasFence && !onlyLabHtml,
  };
}

export function htmlArtifactTitle(html: string): string {
  const m = html.match(/<title[^>]*>([^<]*)<\/title>/i);
  const t = m?.[1]?.trim();
  return t || "HTML preview";
}
