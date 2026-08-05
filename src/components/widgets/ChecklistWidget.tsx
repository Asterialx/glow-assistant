import type { UiWidget } from "../../lib/types";
import { nowMs, cn } from "../../lib/utils";

interface ChecklistItem {
  text: string;
  done: boolean;
}

interface Props {
  widget: UiWidget;
  onChange?: (widget: UiWidget) => void;
}

export function ChecklistWidget({ widget, onChange }: Props) {
  const state = JSON.parse(widget.state_json || "{}") as { items?: ChecklistItem[] };
  const items = state.items || [];
  const doneCount = items.filter((i) => i.done).length;

  const toggle = (index: number) => {
    const next = items.map((it, idx) => (idx === index ? { ...it, done: !it.done } : it));
    onChange?.({
      ...widget,
      state_json: JSON.stringify({ ...state, items: next }),
      updated_at: nowMs(),
    });
  };

  return (
    <div
      className="my-3 rounded-2xl border border-[var(--border)] bg-[var(--bg-input)] px-3.5 py-3"
      data-inline-ui="checklist"
    >
      <div className="mb-2 flex items-baseline justify-between gap-2">
        <span className="text-[12px] font-medium uppercase tracking-wide text-[var(--fg-faint)]">
          Checklist
        </span>
        <span className="text-[11px] text-[var(--fg-faint)]">
          {doneCount}/{items.length}
        </span>
      </div>
      <ul className="space-y-1.5">
        {items.map((item, i) => (
          <li key={`${i}-${item.text}`}>
            <label className="flex cursor-pointer items-start gap-2.5 rounded-xl px-1 py-1 hover:bg-[var(--bg-hover)]">
              <input
                type="checkbox"
                className="mt-1 h-4 w-4 accent-[var(--accent)]"
                checked={item.done}
                onChange={() => toggle(i)}
              />
              <span
                className={cn(
                  "text-[15px] leading-snug text-[var(--fg)]",
                  item.done && "text-[var(--fg-muted)] line-through",
                )}
              >
                {item.text}
              </span>
            </label>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function ProgressWidget({ widget }: { widget: UiWidget }) {
  const state = JSON.parse(widget.state_json || "{}") as {
    label?: string;
    value?: number;
    current?: number;
    total?: number;
  };
  const total = state.total != null ? Number(state.total) : null;
  const current = state.current != null ? Number(state.current) : null;
  const value =
    total && total > 0 && current != null
      ? Math.round((current / total) * 100)
      : Math.min(100, Math.max(0, Number(state.value ?? 0)));
  const label = String(state.label ?? "Progress");
  const counter =
    total != null && current != null ? `${current}/${total}` : `${value}%`;

  return (
    <div
      className="my-3 rounded-2xl border border-[var(--border)] bg-[var(--bg-input)] px-3.5 py-3"
      data-inline-ui="progress"
    >
      <div className="mb-2 flex justify-between text-[12px] text-[var(--fg-muted)]">
        <span>{label}</span>
        <span className="font-medium tabular-nums text-[var(--fg)]">{counter}</span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-[var(--bg)]">
        <div
          className="h-full rounded-full bg-[var(--accent)] transition-[width] duration-300"
          style={{ width: `${value}%` }}
        />
      </div>
    </div>
  );
}

export function FlashcardWidget({ widget, onChange }: Props) {
  const state = JSON.parse(widget.state_json || "{}") as {
    front?: string;
    back?: string;
    flipped?: boolean;
    studied?: boolean;
  };
  const flipped = Boolean(state.flipped);

  return (
    <button
      type="button"
      data-inline-ui="flashcard"
      className="my-3 w-full rounded-2xl border border-[var(--border)] bg-[var(--bg-input)] px-4 py-4 text-left transition-colors hover:bg-[var(--bg-hover)]"
      onClick={() => {
        const nextFlipped = !flipped;
        onChange?.({
          ...widget,
          state_json: JSON.stringify({
            ...state,
            flipped: nextFlipped,
            // first reveal of the back counts as studied
            studied: Boolean(state.studied) || nextFlipped,
          }),
          updated_at: nowMs(),
        });
      }}
    >
      <div className="flex items-center justify-between gap-2 text-[10px] font-medium uppercase tracking-wide text-[var(--fg-faint)]">
        <span>Flashcard · {flipped ? "Перевод" : "EN"}</span>
        {state.studied ? <span className="text-[var(--accent)]">✓</span> : null}
      </div>
      <div className="mt-1.5 whitespace-pre-wrap text-[15px] leading-snug text-[var(--fg)]">
        {flipped ? state.back : state.front}
      </div>
    </button>
  );
}

interface DeckCard {
  front: string;
  back: string;
  flipped?: boolean;
  studied?: boolean;
}

/** One deck = cards + live study progress (0/N). */
export function FlashcardDeckWidget({ widget, onChange }: Props) {
  const state = JSON.parse(widget.state_json || "{}") as {
    label?: string;
    cards?: DeckCard[];
  };
  const cards = state.cards || [];
  const studied = cards.filter((c) => c.studied).length;
  const total = cards.length;
  const pct = total ? Math.round((studied / total) * 100) : 0;
  const label = state.label || "Flashcards";

  const flip = (index: number) => {
    const next = cards.map((c, i) => {
      if (i !== index) return c;
      const nextFlipped = !c.flipped;
      return {
        ...c,
        flipped: nextFlipped,
        studied: Boolean(c.studied) || nextFlipped,
      };
    });
    onChange?.({
      ...widget,
      state_json: JSON.stringify({ ...state, cards: next }),
      updated_at: nowMs(),
    });
  };

  return (
    <div
      className="my-3 space-y-2 rounded-2xl border border-[var(--border)] bg-[var(--bg-input)] p-3.5"
      data-inline-ui="flashcards"
    >
      <div className="rounded-xl bg-[var(--bg)] px-3 py-2.5">
        <div className="mb-2 flex justify-between text-[12px] text-[var(--fg-muted)]">
          <span>{label}</span>
          <span className="font-medium tabular-nums text-[var(--fg)]">
            {studied}/{total}
          </span>
        </div>
        <div className="h-2 overflow-hidden rounded-full bg-[var(--bg-input)]">
          <div
            className="h-full rounded-full bg-[var(--accent)] transition-[width] duration-300"
            style={{ width: `${pct}%` }}
          />
        </div>
      </div>

      {cards.map((card, i) => (
        <button
          key={`${i}-${card.front}`}
          type="button"
          onClick={() => flip(i)}
          className="w-full rounded-xl border border-[var(--border)] bg-[var(--bg-elevated)] px-4 py-3.5 text-left transition-colors hover:bg-[var(--bg-hover)]"
        >
          <div className="flex items-center justify-between gap-2 text-[10px] font-medium uppercase tracking-wide text-[var(--fg-faint)]">
            <span>
              {i + 1}/{total} · {card.flipped ? "RU + пример" : "EN"}
            </span>
            {card.studied ? <span className="text-[var(--accent)]">✓</span> : null}
          </div>
          <div className="mt-1.5 whitespace-pre-wrap text-[15px] leading-snug text-[var(--fg)]">
            {card.flipped ? card.back : card.front}
          </div>
        </button>
      ))}
    </div>
  );
}
