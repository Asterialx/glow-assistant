import { MODEL_CATALOG } from "../../lib/models";
import { useChatStore } from "../../stores/chatStore";
import { cn } from "../../lib/utils";
import { useIsMobile } from "../../lib/useMediaQuery";
import { useEffect, useRef, useState, type CSSProperties } from "react";
import { Check, ChevronDown, RotateCcw } from "lucide-react";

const DEFAULT_TEMPERATURE = 0.7;
const DEFAULT_MAX_TOKENS = 4096;

export function ModelSelector() {
  const selectedModelId = useChatStore((s) => s.selectedModelId);
  const setSelectedModelId = useChatStore((s) => s.setSelectedModelId);
  const temperature = useChatStore((s) => s.temperature);
  const setTemperature = useChatStore((s) => s.setTemperature);
  const maxTokens = useChatStore((s) => s.maxTokens);
  const setMaxTokens = useChatStore((s) => s.setMaxTokens);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const isMobile = useIsMobile();
  const selected = MODEL_CATALOG.find((m) => m.id === selectedModelId) || MODEL_CATALOG[0];
  const list = [...MODEL_CATALOG].sort((a, b) => a.sortOrder - b.sortOrder);

  const dirty =
    Math.abs(temperature - DEFAULT_TEMPERATURE) > 0.001 || maxTokens !== DEFAULT_MAX_TOKENS;

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  const resetSampling = () => {
    setTemperature(DEFAULT_TEMPERATURE);
    setMaxTokens(DEFAULT_MAX_TOKENS);
  };

  const pick = (id: string) => {
    setSelectedModelId(id);
    setOpen(false);
  };

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex h-9 max-w-[8.5rem] items-center gap-0.5 rounded-full bg-[var(--bg-hover)] pl-2.5 pr-2 text-[12.5px] hover:bg-[var(--bg-active)] sm:max-w-[14rem]"
      >
        <span className="truncate font-semibold text-[var(--fg)]">{selected.displayName}</span>
        <ChevronDown size={13} className="shrink-0 opacity-60" />
      </button>

      {open && isMobile && (
        <button
          type="button"
          className="fixed inset-0 z-[70] bg-black/40"
          aria-label="Close"
          onClick={() => setOpen(false)}
        />
      )}

      {open && (
        <div
          className={cn(
            "z-[80] overflow-y-auto rounded-2xl border border-[var(--border)] bg-[var(--bg-elevated)] py-1 shadow-2xl",
            isMobile
              ? "fixed inset-x-3 bottom-20 max-h-[min(70vh,520px)]"
              : "absolute bottom-full right-0 mb-2 max-h-[min(480px,55vh)] w-[340px]",
          )}
        >
          {list.map((m) => {
            const active = m.id === selectedModelId;
            return (
              <button
                key={m.id}
                type="button"
                onClick={() => pick(m.id)}
                className={cn(
                  "flex w-full items-start gap-2 px-3.5 py-3 text-left hover:bg-[var(--bg-hover)] sm:py-2.5",
                  active && "bg-[var(--bg)]",
                )}
              >
                <div className="min-w-0 flex-1">
                  <div className="text-[13.5px] font-semibold text-[var(--fg)]">
                    {m.displayName}
                  </div>
                  <div className="mt-0.5 text-[12px] text-[var(--fg-muted)]">{m.useCase}</div>
                </div>
                {active && (
                  <Check size={16} className="mt-0.5 shrink-0 text-[var(--accent)]" />
                )}
              </button>
            );
          })}

          <div className="mt-1 space-y-3 border-t border-[var(--border)] px-3.5 py-3">
            <ThemedRange
              label="Temperature"
              valueLabel={temperature.toFixed(2)}
              min={0}
              max={2}
              step={0.05}
              value={temperature}
              onChange={setTemperature}
            />
            <ThemedRange
              label="Max tokens"
              valueLabel={String(maxTokens)}
              min={256}
              max={16384}
              step={256}
              value={maxTokens}
              onChange={setMaxTokens}
            />
            <button
              type="button"
              onClick={resetSampling}
              disabled={!dirty}
              className={cn(
                "flex w-full items-center justify-center gap-1.5 rounded-xl border border-[var(--border)] px-3 py-2.5 text-[12.5px] font-medium transition-colors",
                dirty
                  ? "text-[var(--fg)] hover:bg-[var(--bg-hover)]"
                  : "cursor-default text-[var(--fg-faint)] opacity-60",
              )}
            >
              <RotateCcw size={13} strokeWidth={2} />
              Reset to defaults
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function ThemedRange({
  label,
  valueLabel,
  min,
  max,
  step,
  value,
  onChange,
}: {
  label: string;
  valueLabel: string;
  min: number;
  max: number;
  step: number;
  value: number;
  onChange: (n: number) => void;
}) {
  const pct = ((value - min) / (max - min)) * 100;
  return (
    <label className="block text-[12px]">
      <span className="mb-1.5 flex justify-between text-[var(--fg-muted)]">
        {label} <span className="tabular-nums text-[var(--fg)]">{valueLabel}</span>
      </span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="glow-range w-full"
        style={
          {
            "--range-pct": `${pct}%`,
          } as CSSProperties
        }
      />
    </label>
  );
}
