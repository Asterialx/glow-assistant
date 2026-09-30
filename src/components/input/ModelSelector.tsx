import { useEffect, useRef, useState } from "react";
import { Check, ChevronDown } from "lucide-react";
import { MODEL_CATALOG } from "../../lib/models";
import { cn } from "../../lib/utils";
import { useChatStore } from "../../stores/chatStore";

export function ModelSelector() {
  const selectedModelId = useChatStore((state) => state.selectedModelId);
  const setSelectedModelId = useChatStore((state) => state.setSelectedModelId);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const selected = MODEL_CATALOG.find((model) => model.id === selectedModelId) ?? MODEL_CATALOG[0];
  const models = [...MODEL_CATALOG].sort((a, b) => a.sortOrder - b.sortOrder);

  useEffect(() => {
    const onDocumentClick = (event: MouseEvent) => {
      if (!ref.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDocumentClick);
    return () => document.removeEventListener("mousedown", onDocumentClick);
  }, []);

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((isOpen) => !isOpen)}
        aria-label={`Выбрать модель. Сейчас: ${selected.displayName}`}
        aria-haspopup="listbox"
        aria-expanded={open}
        className="flex max-w-[190px] items-center gap-1 rounded-full px-2.5 py-1 text-[12.5px] text-[var(--fg-muted)] transition-colors hover:bg-[var(--bg-hover)] hover:text-[var(--fg)]"
      >
        <span className="truncate font-medium">{selected.displayName}</span>
        <ChevronDown size={13} className="shrink-0 opacity-60" />
      </button>

      {open && (
        <div
          role="listbox"
          aria-label="Доступные модели"
          className="absolute bottom-full left-0 z-50 mb-2 max-h-[min(60vh,480px)] w-[min(280px,calc(100vw-48px))] overflow-y-auto overscroll-contain rounded-2xl border border-[var(--border)] bg-[var(--bg-elevated)] p-1 shadow-2xl"
        >
          {models.map((model) => {
            const active = model.id === selectedModelId;
            return (
              <button
                key={model.id}
                type="button"
                role="option"
                aria-selected={active}
                onClick={() => {
                  setSelectedModelId(model.id);
                  setOpen(false);
                }}
                className={cn(
                  "flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-colors hover:bg-[var(--bg-hover)]",
                  active && "bg-[var(--bg-hover)]",
                )}
              >
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[13px] font-medium text-[var(--fg)]">
                    {model.displayName}
                  </span>
                  <span className="mt-0.5 block truncate text-[11px] text-[var(--fg-faint)]">
                    {model.id}
                  </span>
                </span>
                {active && <Check size={15} className="shrink-0 text-[var(--accent)]" />}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
