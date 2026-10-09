import type { Artifact } from "./types";
import type { ThemeDef } from "./themes";

const canvasThemeCss = `
html, body { margin:0 !important; min-height:0 !important; background:var(--bg-elevated) !important; color:var(--fg) !important; font:14px/1.5 system-ui,sans-serif !important; color-scheme:var(--glow-color-scheme); }
body { padding:12px !important; box-sizing:border-box; }
*, *::before, *::after { box-sizing:border-box; box-shadow:none !important; text-shadow:none !important; background-image:none !important; }
body :where(div,section,article,main,header,footer,aside,figure) { background-color:transparent !important; color:var(--fg) !important; }
body :where(h1,h2,h3,h4) { color:var(--fg) !important; font:600 14px/1.5 system-ui,sans-serif !important; margin:0 0 8px; }
body :where(p,label,span,output,li,td,th) { color:var(--fg) !important; font-family:system-ui,sans-serif !important; }
body :where(small,figcaption) { color:var(--fg-muted) !important; }
body :where(input:not([type=range]):not([type=checkbox]):not([type=radio]),select,textarea,button) { background:var(--bg-input) !important; color:var(--fg) !important; border:1px solid var(--border) !important; border-radius:8px !important; padding:7px 10px; font:inherit !important; }
body button { cursor:pointer; } body button:hover { background:var(--bg-hover) !important; }
body :where(input,select,textarea,button):focus-visible { outline:2px solid var(--accent) !important; outline-offset:2px; }
body input { accent-color:var(--accent) !important; } body input[type=range] { max-width:100%; }
body svg { max-width:100%; background:transparent !important; } body svg text { fill:var(--fg) !important; font-family:system-ui,sans-serif !important; }
`;

type JsonValue = null | boolean | number | string | JsonValue[] | { [key: string]: JsonValue };
export interface HtmlPreviewState {
  forms: Record<string, { value: string; checked?: boolean }>;
  custom: Record<string, JsonValue>;
}

export function htmlSourceKey(html: string): string {
  let hash = 2166136261;
  for (let index = 0; index < html.length; index++) hash = Math.imul(hash ^ html.charCodeAt(index), 16777619);
  return `${html.length}:${hash >>> 0}`;
}

/** Presentation is an explicit document hint; existing HTML stays in Workspace. */
export function htmlPresentation(html: string): "inline" | "workspace" {
  const tags = html.match(/<meta\b[^>]*>/gi) ?? [];
  return tags.some((tag) => /\bname\s*=\s*["']glow-display["']/i.test(tag) && /\bcontent\s*=\s*["']inline["']/i.test(tag))
    ? "inline" : "workspace";
}

export function isInlineHtmlArtifact(artifact: Artifact): boolean {
  if (artifact.kind !== "html") return false;
  try {
    return JSON.parse(artifact.meta_json || "{}").presentation === "inline";
  } catch {
    return false;
  }
}

/** Only small JSON data can cross the sandbox boundary. No commands or host actions. */
export function validateHtmlPreviewState(value: unknown): HtmlPreviewState | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  try {
    if (JSON.stringify(value).length > 16_384) return null;
  } catch {
    return null;
  }
  const state = value as { forms?: unknown; custom?: unknown };
  if (!state.forms || typeof state.forms !== "object" || Array.isArray(state.forms)) return null;
  if (!state.custom || typeof state.custom !== "object" || Array.isArray(state.custom)) return null;
  const forms = Object.entries(state.forms).slice(0, 64).flatMap(([key, item]) => {
    if (key.length > 120 || !item || typeof item !== "object" || Array.isArray(item)) return [];
    const field = item as { value?: unknown; checked?: unknown };
    if (typeof field.value !== "string" || field.value.length > 1000) return [];
    return [[key, { value: field.value, ...(typeof field.checked === "boolean" ? { checked: field.checked } : {}) }] as const];
  });
  if (!isJsonValue(state.custom)) return null;
  return { forms: Object.fromEntries(forms), custom: state.custom as Record<string, JsonValue> };
}

function isJsonValue(value: unknown, depth = 0): boolean {
  if (depth > 6) return false;
  if (value === null || typeof value === "boolean") return true;
  if (typeof value === "string") return value.length <= 4000;
  if (typeof value === "number") return Number.isFinite(value);
  if (Array.isArray(value)) return value.length <= 64 && value.every((item) => isJsonValue(item, depth + 1));
  if (typeof value !== "object") return false;
  return Object.entries(value).length <= 64 && Object.entries(value).every(([key, item]) =>
    !["__proto__", "prototype", "constructor"].includes(key) && isJsonValue(item, depth + 1),
  );
}

/** Runs only inside the opaque-origin iframe; its only host connection is JSON state. */
function previewBridge(channel: string, initial: HtmlPreviewState, themed: boolean) {
  let state = initial;
  if (themed) window.addEventListener("message", (event) => {
    if (event.source !== window.parent || event.data?.channel !== channel || event.data?.type !== "glow-html-theme") return;
    const vars = event.data.vars;
    if (!vars || typeof vars !== "object") return;
    for (const name of ["--bg-elevated", "--bg-input", "--bg-hover", "--border", "--fg", "--fg-muted", "--accent"]) {
      const value = vars[name];
      if (typeof value === "string" && value.length < 100 && !/[<>;{}]/.test(value)) document.documentElement.style.setProperty(name, value, "important");
    }
    document.documentElement.style.setProperty("--glow-color-scheme", event.data.kind === "light" ? "light" : "dark");
  });
  const controls = () => Array.from(document.querySelectorAll<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>(
    "input:not([type=password]):not([type=file]):not([type=hidden]), textarea, select",
  )).slice(0, 64);
  const keyFor = (element: HTMLElement, index: number) => `${element.id || element.getAttribute("name") || "field"}:${index}`;
  const publish = () => {
    state.forms = Object.fromEntries(controls().map((element, index) => [keyFor(element, index), {
      value: element.value.slice(0, 1000),
      ...(element instanceof HTMLInputElement && ["checkbox", "radio"].includes(element.type) ? { checked: element.checked } : {}),
    }]));
    window.parent.postMessage({ type: "glow-html-state", channel, state }, "*");
  };
  Object.defineProperty(window, "Glow", { value: Object.freeze({
    loadState: () => JSON.parse(JSON.stringify(state.custom)),
    saveState: (custom: Record<string, JsonValue>) => { state.custom = custom; publish(); },
  }), writable: false });
  document.addEventListener("input", publish);
  document.addEventListener("change", publish);
  let lastHeight = 0;
  const publishSize = () => {
    if (!document.body) return;
    const bottom = Math.max(0, ...Array.from(document.body.children).map((element) => element.getBoundingClientRect().bottom + window.scrollY));
    const style = window.getComputedStyle(document.body);
    const height = Math.ceil(bottom + (parseFloat(style.paddingBottom) || 0) + (parseFloat(style.marginBottom) || 0));
    if (height !== lastHeight) {
      lastHeight = height;
      window.parent.postMessage({ type: "glow-html-size", channel, height }, "*");
    }
  };
  document.addEventListener("DOMContentLoaded", () => {
    window.setTimeout(() => {
      const saved = state.forms;
      for (const [index, element] of controls().entries()) {
        const field = saved[keyFor(element, index)];
        if (!field) continue;
        element.value = field.value;
        if (element instanceof HTMLInputElement && typeof field.checked === "boolean") element.checked = field.checked;
        element.dispatchEvent(new Event("input", { bubbles: true }));
        element.dispatchEvent(new Event("change", { bubbles: true }));
      }
      window.dispatchEvent(new Event("glow:restore"));
      publishSize();
      new ResizeObserver(publishSize).observe(document.body);
    }, 0);
  });
  window.addEventListener("resize", publishSize);
  window.addEventListener("load", publishSize);
}

export function buildHtmlPreviewDocument(html: string, channel: string, saved?: HtmlPreviewState, theme?: Pick<ThemeDef, "vars" | "kind">): string {
  const state = validateHtmlPreviewState(saved) ?? { forms: {}, custom: {} };
  const escapeJson = (value: unknown) => JSON.stringify(value).replace(/</g, "\\u003c").replace(/\u2028/g, "\\u2028").replace(/\u2029/g, "\\u2029");
  const bootstrap = `<meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data: blob:; font-src data:; media-src data: blob:; connect-src 'none'; base-uri 'none'; form-action 'none'"><script>(${previewBridge.toString()})(${escapeJson(channel)},${escapeJson(state)},${Boolean(theme)});</script>`;
  let document = /<head\b[^>]*>/i.test(html) ? html.replace(/<head\b[^>]*>/i, (head) => `${head}${bootstrap}`)
    : /<html\b[^>]*>/i.test(html) ? html.replace(/<html\b[^>]*>/i, (root) => `${root}<head>${bootstrap}</head>`)
    : `<!doctype html><html><head>${bootstrap}</head><body>${html}</body></html>`;
  if (theme) {
    const vars = Object.entries(theme.vars).filter(([key, value]) => /^--[a-z-]+$/.test(key) && !/[<>;{}]/.test(value)).map(([key,value]) => `${key}:${value} !important;`).join("");
    const style = `<style data-glow-theme>:root{${vars}--glow-color-scheme:${theme.kind};}${canvasThemeCss}</style>`;
    document = /<\/body>/i.test(document) ? document.replace(/<\/body>/i, `${style}</body>`) : `${document}${style}`;
  }
  return document;
}
