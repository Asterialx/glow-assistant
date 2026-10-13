import type { AppMode, Message } from "../types";
import { MODE_SYSTEM_PROMPTS } from "../types";
import { estimateTokens, uid } from "../utils";
import { getModel } from "../models";
import { DESIGN_MODE_SYSTEM } from "../designMode";
import { isStudyPlanRequest } from "../studyPlan";
import { betaAuthEnabled, supabase } from "../../auth/client";

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

function getBaseUrl(): string {
  if (betaAuthEnabled && !import.meta.env.DEV) return "/api/ai";
  // Dev (browser or tauri:dev on localhost:1420): Vite proxy → no CORS.
  if (import.meta.env.DEV) return "/smartapi";
  return import.meta.env.VITE_SMARTAPI_BASE_URL || "https://co.agentrouter.org/v1";
}

function getApiKeys(): string[] {
  if (betaAuthEnabled && !import.meta.env.DEV) return ["authenticated-server"];
  // In local development, keep the real Xkiro credential in the Vite server.
  // The proxy replaces this placeholder with its server-side Authorization header.
  if (
    import.meta.env.DEV &&
    (import.meta.env.VITE_PROVIDER_PROXY_ENABLED === "true" ||
      import.meta.env.VITE_XKIRO_PROXY_ENABLED === "true")
  ) {
    return ["local-provider-proxy"];
  }
  return [];
}

/** fetch that bypasses CORS inside Tauri WebView via plugin-http */
async function apiFetch(input: string, init?: RequestInit): Promise<Response> {
  if (betaAuthEnabled && !import.meta.env.DEV) {
    const session = await supabase?.auth.getSession();
    const token = session?.data.session?.access_token;
    if (!token) throw new Error("Войдите в Glow, чтобы продолжить.");
    const headers = new Headers(init?.headers);
    headers.set("Authorization", `Bearer ${token}`);
    return fetch(input, { ...init, headers });
  }
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
        "Adaptive Glow UI: answer with plain text by default. For an actually useful compact comparison, use one fenced ```glow-ui JSON block with {\"type\":\"table\",\"title\":\"…\",\"columns\":[\"…\"],\"rows\":[[\"…\"]]}. For numeric data already present in the user context or verified tool results, you may use {\"type\":\"chart\",\"title\":\"…\",\"labels\":[\"…\"],\"values\":[1,2],\"chartType\":\"bar\"}. PROACTIVE CALCULATOR JUDGMENT: consider an inline interactive calculator when the user is making a decision involving several changeable numeric inputs and seeing how the result changes across scenarios would materially help them reach a result (for example savings goals, budgets, discounts, loan comparisons, or planning). Do not create one for a simple one-off arithmetic question, just because numbers are present, or when it would add friction. The user does not need to request a calculator explicitly. If a calculator would genuinely help, include a valid fenced ```glow-ui JSON block with type=calculator in the same answer; text alone is not a calculator, and never claim it was created unless the block is present. If important inputs are missing, either use clearly labeled illustrative initial values or ask only the necessary question. Use the exact values and constraints provided by the user. Rendered calculators appear directly inside the chat message, never in HTML or only in the separate workspace. Example: {\"type\":\"calculator\",\"title\":\"Калькулятор скидки\",\"fields\":[{\"id\":\"price\",\"label\":\"Цена\",\"min\":0,\"max\":100000,\"step\":1,\"initial\":10000,\"control\":\"number\"},{\"id\":\"discount\",\"label\":\"Скидка (%)\",\"min\":0,\"max\":90,\"step\":1,\"initial\":10,\"control\":\"range\"}],\"formula\":\"price*(1-discount/100)\",\"resultLabel\":\"Цена со скидкой\",\"unit\":\"₽\",\"precision\":2,\"note\":\"Начальные значения приведены для примера.\"}. Calculator formulas use declared field IDs, numbers, pi, +, -, *, /, ^, parentheses and the safe functions described below; JavaScript is never accepted. Emit at most one block unless multiple blocks are clearly necessary. Never invent current statistics; if source data is missing, explain the limitation in text. Keep a short explanation outside the block. Use ```html only for a genuinely custom mini-app/site, not ordinary tables, charts, or small calculators.",
        "Artifacts (right Workspace): HTML prototypes and mini-apps must be complete, runnable documents in one ```html fence. Implement every requested interaction (including working JavaScript event handlers); do not return a static mockup when the user asked for a working tool. Keep it self-contained with no external dependencies. Before finishing, ensure the document includes all controls, behavior, and a closing </html> plus closing fence. Never say an artifact is ready unless the complete artifact is included. Jupyter → ```jupyter; large code (≥8 lines) → ```ts/python/etc.",
        "Native inline interactive explanations: when varying inputs helps explain a concept, use one fenced ```glow-ui JSON block with type=diagram, NOT HTML or an iframe mini-site. Glow renders the diagram, fields, sliders and results using the same native components as its inline calculator. Schema: {type:'diagram',title:string,fields:[{id,label,min,max,step,initial,control:'range'|'number'}],points:[{id,label?,x:formulaString,y:formulaString}],lines:[{from:pointId,to:pointId,accent?:boolean}],outputs:[{label,formula,unit?}],precision:0..6,note?:string}. JSON requires double quotes. Points use mathematical coordinates (positive y up); the host fits them with one shared scale, preserving geometry. Limits: 6 fields, 24 points, 32 lines, 6 outputs. Coordinates and outputs may reference only field IDs, numbers, pi, + - * / ^, parentheses and allowed functions sin/cos/tan/sqrt/abs/log/exp (one argument), pow/min/max (two arguments). Trigonometry uses radians; degrees convert as angle*pi/180. No JavaScript, Math.*, eval, styles, arbitrary markup or computed-field references. Example: {\"type\":\"diagram\",\"title\":\"Тангенс\",\"fields\":[{\"id\":\"angle\",\"label\":\"Угол (°)\",\"min\":5,\"max\":85,\"step\":1,\"initial\":30,\"control\":\"range\"}],\"points\":[{\"id\":\"A\",\"label\":\"A\",\"x\":\"0\",\"y\":\"0\"},{\"id\":\"B\",\"label\":\"B\",\"x\":\"cos(angle*pi/180)\",\"y\":\"0\"},{\"id\":\"C\",\"label\":\"C\",\"x\":\"cos(angle*pi/180)\",\"y\":\"sin(angle*pi/180)\"}],\"lines\":[{\"from\":\"A\",\"to\":\"B\"},{\"from\":\"B\",\"to\":\"C\",\"accent\":true},{\"from\":\"A\",\"to\":\"C\"}],\"outputs\":[{\"label\":\"Тангенс угла\",\"formula\":\"tan(angle*pi/180)\"}],\"precision\":3}. Use this generic format across suitable geometry, vector and physics explanations, not only triangles. Do not force a diagram for a one-off calculation or invent an unsupported renderer. Larger standalone websites and actual mini-apps requested by the user still use HTML Workspace artifacts.",
        "Calculator formula contract (supersedes the arithmetic-only restriction above): native calculator formulas now support the same safe mathematical operators, pi and functions as diagrams, including powers ^ and pow(base,exponent) for compound interest. Include a complete valid glow-ui block when you claim an inline calculator or diagram is created; text claiming it exists is not enough. Use number or range controls exactly as declared. All computations are local and deterministic, without further API requests.",
        "Calculator formula contract: native calculator formulas support the same safe mathematical operators, pi and functions as diagrams, including powers ^ and pow(base,exponent) for compound interest. Include a complete valid glow-ui block when you claim an inline calculator or diagram is created; text claiming it exists is not enough. Use number or range controls exactly as declared. All computations are local and deterministic, without further API requests. Do not duplicate calculated totals in prose: the live result in the native block is authoritative. Explain assumptions and the formula briefly instead.",
        "Native inline visual contract: the host owns layout, colors, fonts, controls and SVG rendering for glow-ui blocks. Send data and formulas only, never CSS, HTML or JavaScript for a native calculator or diagram. Keep labels and notes concise; do not add branding or a second header. Glow keeps these blocks minimal and consistent with the active theme.",
        "Workspace HTML mini-app requirements: responsive layout, readable labels and values, accessible controls, no external resources or API calls, correct units and honest handling of invalid inputs. Return complete HTML only for an explicitly requested custom mini-app or site, not for the native inline diagrams or calculators described above.",
        "Study preparation plans: for a preparation plan by subjects/topics/days emit one native inline ```glow-ui JSON block with type=study_plan. This overrides generic checklist guidance for structured study plans. Schema: {type:'study_plan',title:string,days:[{id,title,topics:[{id,title,tasks:[{id,title,description?,minutes?}]}]}],note?:string}. Use double-quoted JSON. Days render as blocks, topics expand to concrete subtasks, tasks and whole days can be checked off; Glow computes one progress bar from completed tasks locally. Do not emit separate progress widgets, duplicate the plan as markdown, or create HTML. Cover every requested topic and day, respect the available daily time; sequence prerequisites, practice and review. Task descriptions briefly specify what to do and how to check completion. minutes is an optional integer 1..240 (an estimate). Limits: 30 days, 6 topics/day, 8 tasks/topic, 120 tasks total. Keep text concise so the complete plan fits the output budget. IDs use ASCII letters/digits/underscore/hyphen, start with a letter or underscore, max32 chars, unique within their parent. For edits keep IDs for unchanged items, give replacement tasks new IDs. Ask only essential missing details; otherwise briefly disclose reasonable schedule assumptions. Example: {\"type\":\"study_plan\",\"title\":\"Подготовка по физике\",\"days\":[{\"id\":\"day1\",\"title\":\"Электричество\",\"topics\":[{\"id\":\"ohm\",\"title\":\"Закон Ома\",\"tasks\":[{\"id\":\"theory\",\"title\":\"Разобрать I = U/R\",\"description\":\"Объяснить смысл величин своими словами.\",\"minutes\":15},{\"id\":\"practice\",\"title\":\"Решить 5 задач\",\"description\":\"Проверить единицы и результаты.\",\"minutes\":25}]}]}]}. Never claim an interactive plan exists without its complete valid block.",
        "For HTML: short «building…» before the fence, short «ready» after; never dump HTML in prose.",
      ].join(" "),
    );
    systemParts.push(
      [
        "Adaptive clarification policy (overrides earlier choice guidance): first use the entire conversation and any previously answered questions. Answer or do the task immediately when enough information is available. Do not start every task or follow-up with a questionnaire. A detail is essential only if its absence prevents a useful result or materially changes the result; optional personalization does not qualify. For a low-impact ambiguity, proceed with a briefly stated reasonable assumption. Never invent a consequential fact to avoid asking.",
        "If exactly one essential detail is missing, ask exactly one question. Use one fenced ```glow-ui JSON block with type=questionnaire; the questions array may contain just one item. Add further questions only when each is independently essential now. The supported maximum of 10 is a limit, never a target. Never pad a questionnaire with generic questions such as 'Any other details?'. Do not ask again about information already supplied, and after answers arrive continue the original task rather than starting another questionnaire unless a new genuine blocker appears.",
        "The UI presents one question at a time, with back navigation, and sends all answers together after completion. Use mode=single with 2–8 options for one answer, mode=multiple for several answers, or mode=text for free text. Choice questions always allow a custom answer. Minimal one-question example: {\"type\":\"questionnaire\",\"title\":\"Одно уточнение\",\"questions\":[{\"id\":\"city\",\"prompt\":\"Из какого города выезжаете?\",\"mode\":\"text\",\"required\":true}]}.",
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
    "Conversation grounding: preserve the user's goal, constraints, and corrections from the provided history. The user's latest explicit correction takes precedence over earlier values and saved memory hints. Treat earlier assistant answers as unverified statements, not evidence that their facts are true. Never invent user details, sources, tool results, or completed actions. If a needed fact is not in the available context, say so; separate assumptions and examples from verified facts.",
    "If the user sends a [Voice note] with a transcript, treat that transcript as their spoken request and reply normally. Never ask them to type it again unless the transcript is missing.",
  );
  if (mode === "med" && !designMode) {
    systemParts.push(
      "Med mode: when presenting lab/biomarker results, ALWAYS emit ```widget with type biomarker_table (rows with name, value, unit, ref_low, ref_high). Do not build HTML dashboards or markdown lab tables for this — they belong inline in chat, not Artifacts.",
    );
  }

  const latestRequest = [...history].reverse().find((message) => message.role === "user")?.content ?? "";
  if (!designMode && isStudyPlanRequest(latestRequest)) {
    systemParts.push("Required format for the current study preparation request: deliver the actual plan as one complete fenced ```glow-ui JSON block with type=study_plan using the schema above. Include every requested day and topic with actionable tasks, not a sample. The application renders clickable topic sections, completion checkboxes and progress automatically. Keep any surrounding prose to at most two short sentences; do not replace the study_plan with markdown headings/lists, a table or a checklist. If information is sufficient, produce the plan immediately. Ask a minimal essential clarification only if a useful plan cannot be produced.");
  }
  const messages: ChatMessage[] = [
    { role: "system", content: systemParts.join("\n\n") },
  ];

  for (const m of history) {
    if (m.role === "system" || m.role === "tool") continue;
    // Transport failures are UI diagnostics, not prior model answers.
    if (m.role === "assistant" && m.status === "error") continue;
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
  opts?: { temperature?: number; maxTokens?: number; conversationId?: string; scope?: string },
): Promise<void> {
  const model = getModel(modelId);
  const url = `${getBaseUrl()}/chat/completions`;
  const apiKeys = getApiKeys();
  if (apiKeys.length === 0) {
    callbacks.onError(
      new Error("Provider API key is not configured. Set it on the local development server."),
    );
    return;
  }

  const temperature = opts?.temperature ?? Number(localStorage.getItem("glow.temperature") || "0.7");
  let maxTokens = opts?.maxTokens ?? Number(localStorage.getItem("glow.maxTokens") || "4096");
  if (!Number.isFinite(maxTokens) || maxTokens < 16) maxTokens = 1024;
  // Match ModelSelector UI max (16384)
  if (maxTokens > 16384) maxTokens = 16384;

  const apiModel = model?.id || modelId;
  const xkiroModel = toXkiroModelId(apiModel);

  try {
    const body = {
      model: xkiroModel,
      ...(betaAuthEnabled && import.meta.env.VITE_CLOUD_DATA_ENABLED === "true" ? {
        conversation_id: opts?.conversationId,
        scope: opts?.scope,
      } : {}),
      messages,
      stream: true,
      max_tokens: maxTokens,
      temperature: Number.isFinite(temperature) ? temperature : 0.7,
      // This model defaults to maximum reasoning on OpenRouter, which can use
      // the whole response budget before producing visible text. Keep the same
      // total limit and use its supported low setting for an economical chat.
      ...(xkiroModel === "z-ai/glm-5.3-flash" ? { reasoning: { effort: "low" } } : {}),
    };
    const approxBytes = new Blob([JSON.stringify(body)]).size;
    if (approxBytes > 1_500_000) {
      console.warn("Chat payload large", approxBytes, "— stripping further");
    }

    let res: Response | undefined;
    for (const [index, key] of apiKeys.entries()) {
      res = await apiFetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${key}`,
        },
        body: JSON.stringify(body),
        signal,
      });
      if ((res.status !== 401 && res.status !== 403) || index === apiKeys.length - 1) break;
    }
    if (!res) throw new Error("No API response");

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
    let providerOutputTokens: number | undefined;

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
            if (Number.isSafeInteger(json.usage.completion_tokens) && json.usage.completion_tokens >= 0) providerOutputTokens = json.usage.completion_tokens;
          }
        } catch {
          // ignore partial JSON
        }
      }
    }

    // Some gateways finish the last SSE record without a trailing newline.
    const lastLine = (buffer + decoder.decode()).trim();
    if (lastLine.startsWith("data:") && lastLine.slice(5).trim() !== "[DONE]") {
      try {
        const json = JSON.parse(lastLine.slice(5).trim());
        const token = json.choices?.[0]?.delta?.content ?? json.choices?.[0]?.text ?? "";
        if (token) { output += token; callbacks.onToken(token); }
        if (json.usage) {
          inputTokens = json.usage.prompt_tokens ?? inputTokens;
          if (Number.isSafeInteger(json.usage.completion_tokens) && json.usage.completion_tokens >= 0) providerOutputTokens = json.usage.completion_tokens;
        }
      } catch {
        // An incomplete trailing event is not a usable response.
      }
    }
    if (!output.trim()) {
      throw new Error("Модель вернула пустой ответ. Повторите запрос вручную; автоматический повтор отключён.");
    }

    const outputTokens = providerOutputTokens ?? estimateTokens(output);
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
          "Network/CORS: cannot reach the AI provider from the WebView. Restart the app after the HTTP plugin update.",
        ),
      );
      return;
    }
    callbacks.onError(err);
  }
}

function toXkiroModelId(modelId: string): string {
  if (modelId.includes("/")) return modelId;
  if (modelId.startsWith("gpt-")) return `openai/${modelId}`;
  if (modelId.startsWith("claude-")) {
    const normalized = modelId.replace(/-(\d+)-(\d+)$/, "-$1.$2");
    return `anthropic/${normalized}`;
  }
  if (modelId.startsWith("deepseek-")) return `deepseek/${modelId}`;
  if (modelId.startsWith("glm-")) return `z-ai/${modelId}`;
  return modelId;
}

export { uid };
import { accountStorage as localStorage } from "../../auth/accountStorage";
