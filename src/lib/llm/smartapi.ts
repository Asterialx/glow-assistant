import type { AppMode, Message } from "../types";
import { MODE_SYSTEM_PROMPTS } from "../types";
import { estimateTokens, uid } from "../utils";
import { getModel } from "../models";
import { DESIGN_MODE_SYSTEM } from "../designMode";

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface StreamCallbacks {
  onToken: (token: string) => void;
  onDone: (usage: { inputTokens: number; outputTokens: number; costUnits: number }) => void;
  onError: (error: Error) => void;
}

function isTauri(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

function getBaseUrl(modelId?: string): string {
  const model = modelId ? getModel(modelId) : null;
  if (model?.provider === "mcsix") {
    if (import.meta.env.DEV) return "/mcsix";
    return import.meta.env.VITE_MCSIX_BASE_URL || "https://api.mcsix.space/v1";
  }
  // Dev (browser or tauri:dev on localhost:1420): Vite proxy → no CORS
  if (import.meta.env.DEV) return "/smartapi";
  return import.meta.env.VITE_SMARTAPI_BASE_URL || "https://api.smartapi.shop/v1";
}

function getApiKey(modelId?: string): string {
  const model = modelId ? getModel(modelId) : null;
  if (model?.provider === "mcsix") {
    const stored =
      localStorage.getItem("glow.mcsixApiKey") || localStorage.getItem("claude2.mcsixApiKey");
    return stored || import.meta.env.VITE_MCSIX_API_KEY || "";
  }
  const stored = localStorage.getItem("claude2.apiKey") || localStorage.getItem("glow.apiKey");
  return stored || import.meta.env.VITE_SMARTAPI_KEY || "";
}

export function setApiKey(key: string) {
  localStorage.setItem("glow.apiKey", key);
  localStorage.setItem("claude2.apiKey", key);
}

export function setMcsixApiKey(key: string) {
  localStorage.setItem("glow.mcsixApiKey", key);
  localStorage.setItem("claude2.mcsixApiKey", key);
}

/** fetch that bypasses CORS inside Tauri WebView via plugin-http */
async function apiFetch(input: string, init?: RequestInit): Promise<Response> {
  // Dev uses Vite proxy on same origin — browser fetch is fine (and required).
  if (import.meta.env.DEV || !isTauri()) {
    return fetch(input, init);
  }
  try {
    const { fetch: tauriFetch } = await import("@tauri-apps/plugin-http");
    return await tauriFetch(input, {
      method:
        (init?.method as "GET" | "POST" | "PUT" | "DELETE" | "PATCH" | "HEAD" | "OPTIONS") ||
        "GET",
      headers: init?.headers as Record<string, string> | undefined,
      body: init?.body as string | undefined,
      signal: init?.signal ?? undefined,
    });
  } catch (e) {
    console.warn("tauri http fetch failed, falling back", e);
    return fetch(input, init);
  }
}

export function buildChatPayload(
  mode: AppMode,
  history: Message[],
  projectPrompt?: string,
  memoryFacts?: string[],
  redactMed = false,
  modelId?: string,
  designMode = false,
  webSearch = false,
): ChatMessage[] {
  const model = modelId ? getModel(modelId) : null;
  const identity = model
    ? [
        `You are ${model.displayName} (model id: ${model.id}).`,
        `Your strengths: ${model.useCase}.`,
        "When the user asks who you are / tell me about yourself / представься / расскажи о себе — answer as THIS model: name, what you are good at, and how you work. Do not invent a different product persona.",
        "You are accessed through a desktop app called Glow. Only mention Glow if the user asks about the app/UI; otherwise your identity is the model above.",
        "Never claim to be a generic “family home assistant” or describe Glow’s product marketing instead of yourself.",
      ].join(" ")
    : "You are a helpful AI assistant. When asked who you are, name the model you are running as.";

  const systemParts = [identity, MODE_SYSTEM_PROMPTS[mode]];
  if (projectPrompt) systemParts.push(`Project instructions:\n${projectPrompt}`);
  if (memoryFacts?.length) {
    systemParts.push(`Known user facts:\n${memoryFacts.map((f) => `- ${f}`).join("\n")}`);
  }
  if (mode === "med") {
    systemParts.push(
      "Medical disclaimer: This is not a medical device and does not replace clinical judgment.",
    );
  }
  if (designMode) {
    // Designer persona overrides chatty assistant habits for this turn
    systemParts.push(DESIGN_MODE_SYSTEM);
  } else {
    systemParts.push(
      [
        "Artifacts (right panel ONLY): HTML prototypes → one ```html fence; Jupyter → ```jupyter; large code (≥8 lines) → ```ts/python/etc.",
        "Do NOT put checklists, progress bars, flashcards, OR lab/biomarker tables in Artifacts or as HTML/Markdown tables.",
        "For HTML: short «building…» before the fence, short «ready» after; never dump HTML in prose.",
      ].join(" "),
    );
    systemParts.push(
      [
        "Inline UI Widgets (INSIDE the chat message, NEVER the Artifacts panel): use a fenced JSON block:",
        "```widget",
        '{"type":"checklist","items":[{"text":"Task","done":false}]}',
        "```",
        'Also: {"type":"progress","label":"Изучено","current":0,"total":5}, {"type":"flashcard","front":"word","back":"перевод\\nEx: ..."},',
        'or a deck {"type":"flashcards","label":"IELTS","cards":[{"front":"…","back":"…"}]} with built-in 0/N progress.',
        'Lab panels MUST use {"type":"biomarker_table","title":"CBC","rows":[{"name":"Glucose","value":6.2,"unit":"mmol/L","ref_low":3.9,"ref_high":5.5}]} — the app renders an inline table with out-of-range highlighting and a PDF button. Never use ```html for lab results.',
        "You may put multiple widgets in one JSON array inside the fence.",
        "Do not repeat the same checklist as markdown task lists when using ```widget — the app renders a React checklist inline.",
        "Legacy fallbacks (- [ ], Progress: Label 40%, Q:/A:) still work but prefer ```widget.",
      ].join("\n"),
    );
  }
  if (webSearch) {
    systemParts.push(
      "Web search is ENABLED for this chat. When facts may be outdated, say what you would search for and give the best current answer you can; prefer clear sources/URLs when known. Do not pretend you browsed live unless tools are available.",
    );
  }
  systemParts.push(
    "If the user sends a [Voice note] with a transcript, treat that transcript as their spoken request and reply normally. Never ask them to type it again unless the transcript is missing.",
  );
  if (mode === "med" && !designMode) {
    systemParts.push(
      "Med mode: when presenting lab/biomarker results, ALWAYS emit ```widget with type biomarker_table (rows with name, value, unit, ref_low, ref_high). Do not build HTML dashboards or markdown lab tables for this — they belong inline in chat, not Artifacts.",
    );
  }

  const messages: ChatMessage[] = [
    { role: "system", content: systemParts.join("\n\n") },
  ];

  for (const m of history) {
    if (m.role === "system" || m.role === "tool") continue;
    let content = sanitizeContentForApi(m.content, m.role);
    if (redactMed && mode === "med" && m.role === "user") {
      content = content;
    }
    if (!content) continue;
    messages.push({
      role: m.role as "user" | "assistant",
      content,
    });
  }
  return messages;
}

/** Never send glow-audio base64 (or other huge binaries) to the chat gateway. */
export function sanitizeContentForApi(content: string, role: string): string {
  let text = content ?? "";

  if (role === "user") {
    const sttFence = text.match(/```glow-stt\r?\n([\s\S]*?)```/)?.[1]?.trim();
    const sttHtml = text.match(/<!--glow-stt:([\s\S]*?)-->/)?.[1]?.trim();
    const sttLine = text.match(/\[Voice transcript\]:\s*([^\n]+)/i)?.[1]?.trim();
    const stt = sttFence || sttHtml || sttLine;
    const hasAudio =
      /```glow-audio[\s\S]*?```/.test(text) ||
      /\[Voice note/i.test(text) ||
      /data:audio\//i.test(text) ||
      /\[Attached:.*voice-/i.test(text);

    if (hasAudio || stt) {
      return stt
        ? `[Voice note]\n${stt}`
        : "[Voice note — transcript missing. Ask the user to type the request.]";
    }
  }

  text = text
    .replace(/```glow-audio[\s\S]*?```/g, "[audio omitted]")
    .replace(/```glow-stt\r?\n([\s\S]*?)```/g, "$1")
    .replace(/<!--glow-stt:([\s\S]*?)-->/g, "$1")
    .replace(/data:audio\/[a-z0-9.+-]+;base64,[A-Za-z0-9+/=\s]+/gi, "[audio omitted]")
    .replace(/[A-Za-z0-9+/]{4000,}={0,2}/g, "[binary omitted]");

  if (text.length > 100_000) {
    text = `${text.slice(0, 100_000)}\n\n[truncated]`;
  }
  return text.trim();
}

export async function streamChatCompletion(
  modelId: string,
  messages: ChatMessage[],
  callbacks: StreamCallbacks,
  signal?: AbortSignal,
  opts?: { temperature?: number; maxTokens?: number },
): Promise<void> {
  const model = getModel(modelId);
  const url = `${getBaseUrl(modelId)}/chat/completions`;
  const key = getApiKey(modelId);
  if (!key) {
    callbacks.onError(
      new Error(
        model?.provider === "mcsix"
          ? "McSix API key missing. Set VITE_MCSIX_API_KEY or paste the key in Settings."
          : "API key missing. Set VITE_SMARTAPI_KEY or paste a key in Settings.",
      ),
    );
    return;
  }

  const temperature = opts?.temperature ?? Number(localStorage.getItem("glow.temperature") || "0.7");
  let maxTokens = opts?.maxTokens ?? Number(localStorage.getItem("glow.maxTokens") || "4096");
  if (!Number.isFinite(maxTokens) || maxTokens < 16) maxTokens = 1024;
  // Match ModelSelector UI max (16384)
  if (maxTokens > 16384) maxTokens = 16384;

  const apiModel = model?.id || modelId;

  try {
    const body = {
      model: apiModel,
      messages,
      stream: true,
      temperature: Number.isFinite(temperature) ? temperature : 0.7,
      max_tokens: maxTokens,
    };
    const approxBytes = new Blob([JSON.stringify(body)]).size;
    if (approxBytes > 1_500_000) {
      console.warn("Chat payload large", approxBytes, "— stripping further");
    }

    const res = await apiFetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${key}`,
      },
      body: JSON.stringify(body),
      signal,
    });

    if (!res.ok) {
      const text = (await res.text().catch(() => "")).trim();
      throw new Error(
        text
          ? `API ${res.status}: ${text.slice(0, 400)}`
          : `API ${res.status}: пустой ответ шлюза (часто из‑за слишком большого запроса или сбоя модели). Попробуйте новый чат или другую модель.`,
      );
    }

    const reader = res.body?.getReader();
    if (!reader) throw new Error("No response body");

    const decoder = new TextDecoder();
    let buffer = "";
    let output = "";
    let inputTokens = estimateTokens(messages.map((m) => m.content).join("\n"));

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() || "";

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed.startsWith("data:")) continue;
        const data = trimmed.slice(5).trim();
        if (data === "[DONE]") continue;
        try {
          const json = JSON.parse(data);
          const token =
            json.choices?.[0]?.delta?.content ??
            json.choices?.[0]?.text ??
            "";
          if (token) {
            output += token;
            callbacks.onToken(token);
          }
          if (json.usage) {
            inputTokens = json.usage.prompt_tokens ?? inputTokens;
          }
        } catch {
          // ignore partial JSON
        }
      }
    }

    const outputTokens = estimateTokens(output);
    const mult = model?.costMultiplier ?? 1;
    callbacks.onDone({
      inputTokens,
      outputTokens,
      costUnits: ((inputTokens + outputTokens) / 1000) * mult,
    });
  } catch (e) {
    const err = e instanceof Error ? e : new Error(String(e));
    if (/failed to fetch/i.test(err.message)) {
      callbacks.onError(
        new Error(
          "Network/CORS: cannot reach SmartAPI from the WebView. Restart the app after the HTTP plugin update.",
        ),
      );
      return;
    }
    callbacks.onError(err);
  }
}

export { uid };
