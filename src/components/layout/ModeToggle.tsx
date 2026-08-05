import { Home, Code2, Stethoscope } from "lucide-react";
import { useModeStore } from "../../stores/modeStore";
import type { AppMode } from "../../lib/types";
import { cn } from "../../lib/utils";

const MODES: { id: AppMode; label: string; icon: typeof Home }[] = [
  { id: "home", label: "Home", icon: Home },
  { id: "code", label: "Code", icon: Code2 },
  { id: "med", label: "Med", icon: Stethoscope },
];

export function ModeToggle() {
  const mode = useModeStore((s) => s.mode);
  const setMode = useModeStore((s) => s.setMode);

  return (
    <div
      className="inline-flex rounded-full border border-[var(--color-border)] bg-[var(--color-surface-2)] p-0.5"
      role="tablist"
      aria-label="Workspace mode"
    >
      {MODES.map(({ id, label, icon: Icon }) => {
        const active = mode === id;
        return (
          <button
            key={id}
            role="tab"
            aria-selected={active}
            onClick={() => setMode(id)}
            className={cn(
              "flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[13px] font-medium transition-colors",
              active
                ? "bg-[var(--color-surface-3)] text-[var(--color-fg)]"
                : "text-[var(--color-muted)] hover:text-[var(--color-fg)]",
            )}
          >
            <Icon size={13} strokeWidth={1.75} />
            {label}
          </button>
        );
      })}
    </div>
  );
}
