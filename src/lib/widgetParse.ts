import type { UiWidget } from "./types";
import { nowMs, uid } from "./utils";

export type WidgetPayload =
  | { type: "checklist"; items: Array<{ text: string; done: boolean }> }
  | { type: "progress"; label: string; value: number; current?: number; total?: number }
  | { type: "flashcard"; front: string; back: string; flipped?: boolean; studied?: boolean }
  | {
      type: "flashcards";
      label?: string;
      cards: Array<{ front: string; back: string; flipped?: boolean; studied?: boolean }>;
    }
  | {
      type: "biomarker_table";
      title?: string;
      note?: string;
      rows: Array<Record<string, unknown>>;
    };

const WIDGET_FENCE_RE =
  /```(?:json:widget|widget|glow-widget)\b[^\n]*\n([\s\S]*?)```/gi;

function asChecklistItems(raw: unknown): Array<{ text: string; done: boolean }> | null {
  if (!Array.isArray(raw) || raw.length === 0) return null;
  const items = raw.map((it) => {
    if (typeof it === "string") return { text: it, done: false };
    if (it && typeof it === "object") {
      const o = it as Record<string, unknown>;
      const text = String(o.text ?? o.label ?? o.title ?? "").trim();
      if (!text) return null;
      return { text, done: Boolean(o.done ?? o.checked ?? false) };
    }
    return null;
  });
  const cleaned = items.filter(Boolean) as Array<{ text: string; done: boolean }>;
  return cleaned.length ? cleaned : null;
}

function asDeckCards(
  raw: unknown,
): Array<{ front: string; back: string; flipped?: boolean; studied?: boolean }> | null {
  if (!Array.isArray(raw) || raw.length === 0) return null;
  const cards = raw
    .map((c) => {
      if (!c || typeof c !== "object") return null;
      const o = c as Record<string, unknown>;
      const front = String(o.front ?? o.q ?? o.word ?? "").trim();
      const back = String(o.back ?? o.a ?? o.translation ?? "").trim();
      if (!front || !back) return null;
      return {
        front,
        back,
        flipped: Boolean(o.flipped),
        studied: Boolean(o.studied),
      };
    })
    .filter(Boolean) as Array<{
    front: string;
    back: string;
    flipped?: boolean;
    studied?: boolean;
  }>;
  return cards.length ? cards : null;
}

function normalizePayload(raw: unknown): WidgetPayload | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const type = String(o.type ?? o.widget_type ?? "").toLowerCase();

  if (type === "checklist" || type === "todo" || type === "todos") {
    const items = asChecklistItems(o.items ?? o.todos);
    if (!items) return null;
    return { type: "checklist", items };
  }
  if (type === "progress" || type === "progress_bar") {
    const total = o.total != null ? Number(o.total) : undefined;
    const current = o.current != null ? Number(o.current) : undefined;
    const value =
      total && total > 0 && current != null
        ? Math.round((current / total) * 100)
        : Math.min(100, Math.max(0, Number(o.value ?? o.percent ?? 0)));
    const label = String(o.label ?? o.title ?? "Progress").trim() || "Progress";
    return { type: "progress", label, value, current, total };
  }
  if (type === "flashcards" || type === "deck" || type === "srs_deck") {
    const cards = asDeckCards(o.cards ?? o.items);
    if (!cards) return null;
    return {
      type: "flashcards",
      label: String(o.label ?? o.title ?? "Flashcards").trim() || "Flashcards",
      cards,
    };
  }
  if (type === "flashcard" || type === "card" || type === "srs") {
    const front = String(o.front ?? o.q ?? o.question ?? "").trim();
    const back = String(o.back ?? o.a ?? o.answer ?? "").trim();
    if (!front || !back) return null;
    return {
      type: "flashcard",
      front,
      back,
      flipped: Boolean(o.flipped),
      studied: Boolean(o.studied),
    };
  }
  if (
    type === "biomarker_table" ||
    type === "biomarkers" ||
    type === "lab_table" ||
    type === "labs"
  ) {
    const rows = o.rows ?? o.markers ?? o.labs;
    if (!Array.isArray(rows) || rows.length === 0) return null;
    return {
      type: "biomarker_table",
      title: String(o.title ?? o.label ?? "Lab panel").trim() || "Lab panel",
      note: o.note != null ? String(o.note) : undefined,
      rows: rows.filter((r) => r && typeof r === "object") as Array<Record<string, unknown>>,
    };
  }
  return null;
}

function parseWidgetJson(body: string): WidgetPayload[] {
  const trimmed = body.trim();
  if (!trimmed) return [];
  try {
    const data = JSON.parse(trimmed) as unknown;
    if (Array.isArray(data)) {
      return data.map(normalizePayload).filter(Boolean) as WidgetPayload[];
    }
    const one = normalizePayload(data);
    return one ? [one] : [];
  } catch {
    return [];
  }
}

/** Explicit ```widget / ```json:widget fences. */
export function extractWidgetFences(text: string): WidgetPayload[] {
  const out: WidgetPayload[] = [];
  for (const m of text.matchAll(WIDGET_FENCE_RE)) {
    out.push(...parseWidgetJson(m[1] ?? ""));
  }
  return out;
}

/** Legacy markdown: - [ ], Progress:, Q:/A: — still accepted. */
export function extractLegacyWidgets(text: string): WidgetPayload[] {
  const withoutFences = text.replace(WIDGET_FENCE_RE, "");
  const out: WidgetPayload[] = [];

  if (/^- \[[ x]\]/im.test(withoutFences)) {
    const items = withoutFences
      .split("\n")
      .filter((l) => /^- \[[ x]\]/i.test(l.trim()))
      .map((l) => ({
        text: l.replace(/^- \[[ x]\]\s*/i, "").trim(),
        done: /^- \[x\]/i.test(l.trim()),
      }))
      .filter((it) => it.text);
    if (items.length) out.push({ type: "checklist", items });
  }

  const progressMatch = withoutFences.match(/Progress:\s*(.+?)\s+(\d{1,3})\s*%/i);
  if (progressMatch) {
    out.push({
      type: "progress",
      label: progressMatch[1]!.trim(),
      value: Math.min(100, Number(progressMatch[2])),
    });
  }

  for (const m of withoutFences.matchAll(/Q:\s*(.+)\nA:\s*(.+)/gi)) {
    out.push({
      type: "flashcard",
      front: m[1]!.trim(),
      back: m[2]!.trim(),
      flipped: false,
    });
  }

  return out.slice(0, 8);
}

export function extractAllWidgetPayloads(text: string): WidgetPayload[] {
  const fences = extractWidgetFences(text);
  if (fences.length) return fences;
  return extractLegacyWidgets(text);
}

export function payloadsToWidgets(messageId: string, payloads: WidgetPayload[]): UiWidget[] {
  const widgets = payloads.map((p) => {
    if (p.type === "checklist") {
      return {
        id: uid(),
        message_id: messageId,
        widget_type: "checklist" as const,
        state_json: JSON.stringify({ items: p.items }),
        updated_at: nowMs(),
      };
    }
    if (p.type === "progress") {
      const cardCount = payloads.filter((x) => x.type === "flashcard").length;
      const total = p.total ?? (cardCount > 0 ? cardCount : undefined);
      const current = p.current ?? 0;
      const value =
        total && total > 0 ? Math.round((current / total) * 100) : p.value;
      return {
        id: uid(),
        message_id: messageId,
        widget_type: "progress" as const,
        state_json: JSON.stringify({
          label: p.label,
          value,
          current,
          total,
        }),
        updated_at: nowMs(),
      };
    }
    if (p.type === "flashcards") {
      return {
        id: uid(),
        message_id: messageId,
        widget_type: "flashcards" as const,
        state_json: JSON.stringify({
          label: p.label || "Flashcards",
          cards: p.cards,
        }),
        updated_at: nowMs(),
      };
    }
    if (p.type === "biomarker_table") {
      return {
        id: uid(),
        message_id: messageId,
        widget_type: "biomarker_table" as const,
        state_json: JSON.stringify({
          title: p.title || "Lab panel",
          note: p.note,
          rows: p.rows,
        }),
        updated_at: nowMs(),
      };
    }
    if (p.type === "flashcard") {
      return {
        id: uid(),
        message_id: messageId,
        widget_type: "flashcard" as const,
        state_json: JSON.stringify({
          front: p.front,
          back: p.back,
          flipped: p.flipped ?? false,
          studied: p.studied ?? false,
        }),
        updated_at: nowMs(),
      };
    }
    return null;
  }).filter(Boolean) as UiWidget[];
  return widgets;
}

/** After a flashcard flip, bump sibling progress widget (current/total). */
export function syncStudyProgress(widgets: UiWidget[]): UiWidget[] {
  const cards = widgets.filter((w) => w.widget_type === "flashcard");
  const progress = widgets.find((w) => w.widget_type === "progress");
  if (!progress || cards.length === 0) return widgets;

  const studied = cards.filter((c) => {
    try {
      return Boolean(JSON.parse(c.state_json || "{}").studied);
    } catch {
      return false;
    }
  }).length;
  const total = cards.length;
  const prev = JSON.parse(progress.state_json || "{}") as Record<string, unknown>;
  const nextState = {
    ...prev,
    current: studied,
    total,
    value: Math.round((studied / total) * 100),
    label: String(prev.label ?? "Изучено"),
  };
  if (
    Number(prev.current) === studied &&
    Number(prev.total) === total &&
    Number(prev.value) === nextState.value
  ) {
    return widgets;
  }
  return widgets.map((w) =>
    w.id === progress.id
      ? { ...w, state_json: JSON.stringify(nextState), updated_at: nowMs() }
      : w,
  );
}

/** Remove widget sources from chat markdown (fences + legacy patterns). */
export function stripInlineUiFromText(text: string): string {
  let out = text.replace(WIDGET_FENCE_RE, "");

  const lines = out.split("\n");
  const filtered: string[] = [];
  let skippingQa = false;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    const t = line.trim();
    if (/^- \[[ x]\]/i.test(t)) continue;
    if (/^Progress:\s*.+\s+\d{1,3}\s*%/i.test(t)) continue;
    if (/^Q:\s*/i.test(t)) {
      skippingQa = true;
      continue;
    }
    if (skippingQa && /^A:\s*/i.test(t)) {
      skippingQa = false;
      continue;
    }
    skippingQa = false;
    filtered.push(line);
  }

  return filtered.join("\n").replace(/\n{3,}/g, "\n\n").trim();
}

export function hasIncompleteWidgetFence(text: string): boolean {
  const opens = [...text.matchAll(/```(?:json:widget|widget|glow-widget)\b/gi)];
  if (!opens.length) return false;
  const closes = (text.match(/```/g) || []).length;
  return closes % 2 === 1;
}

/** Code blocks large enough for the Artifacts panel (not tiny snippets / widgets). */
export function extractCodeArtifact(text: string): { lang: string; body: string } | null {
  const withoutWidgets = text.replace(WIDGET_FENCE_RE, "");
  const re = /```(tsx?|jsx?|python|rs|ts|js)\b[^\n]*\n([\s\S]*?)```/i;
  const m = withoutWidgets.match(re);
  if (!m) return null;
  const body = (m[2] ?? "").trimEnd();
  const lines = body.split("\n").filter((l) => l.trim()).length;
  if (lines < 8) return null;
  return { lang: (m[1] || "code").toLowerCase(), body };
}
