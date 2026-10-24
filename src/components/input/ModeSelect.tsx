import { useEffect, useRef, useState } from "react";
import { Check, ChevronDown } from "lucide-react";
import { useModeStore } from "../../stores/modeStore";
import { useUiStore } from "../../stores/uiStore";
import { useWorkspaceStore } from "../../stores/workspaceStore";
import { useAgentStore } from "../../stores/agentStore";
import type { Autonomy } from "../../lib/agent/policy";
import { cn } from "../../lib/utils";

type ModeId = Autonomy | "work" | "plan";
type Item = { id: ModeId; title: [string, string]; hint: [string, string] };

/** [ru, en] pairs. Code offers the three autonomy levels plus Plan; Work only Work and Plan. */
const DEV_MODES: Item[] = [
  { id: "important", title: ["Авто", "Auto"], hint: ["Glow ведёт задачу сам, о важном спросит", "Glow runs the task and asks about important actions"] },
  { id: "tasks", title: ["Вручную", "Manual"], hint: ["Каждую задачу вы подтверждаете перед стартом", "You approve each task before it starts"] },
  { id: "autopilot", title: ["Автопилот", "Autopilot"], hint: ["Делает всё сам, спросит только перед удалением", "Does everything itself, asks only before deleting"] },
  { id: "plan", title: ["План", "Plan"], hint: ["Только чтение и план, без изменений", "Read-only: investigates and plans, changes nothing"] },
];
const WORK_MODES: Item[] = [
  { id: "work", title: ["Работа", "Work"], hint: ["Выполняет задачу и сохраняет файлы в папку", "Does the task and saves files to the folder"] },
  { id: "plan", title: ["План", "Plan"], hint: ["Только планирование, без создания файлов", "Planning only, no files are created"] },
];

/** The mode picker next to the microphone: a plain text button that opens the list of modes (keys 1–4 pick one). */
export function ModeSelect() {
  const locale = useUiStore((state) => state.locale);
  const codeKind = useModeStore((state) => state.codeKind);
  const taskMode = useWorkspaceStore((state) => state.taskMode);
  const setTaskMode = useWorkspaceStore((state) => state.setTaskMode);
  const autonomy = useAgentStore((state) => state.autonomy);
  const setAutonomy = useAgentStore((state) => state.setAutonomy);
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const ru = locale === "ru";
  const items = codeKind === "dev" ? DEV_MODES : WORK_MODES;
  const current: ModeId = taskMode === "plan" ? "plan" : codeKind === "dev" ? autonomy : "work";
  const selected = items.find((item) => item.id === current) ?? items[0]!;

  const choose = (id: ModeId) => {
    if (id === "plan") setTaskMode("plan");
    else {
      setTaskMode("work");
      if (codeKind === "dev") setAutonomy(id as Autonomy);
    }
    setOpen(false);
  };

  useEffect(() => {
    if (!open) return;
    const onPointer = (event: MouseEvent) => { if (!root.current?.contains(event.target as Node)) setOpen(false); };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") { setOpen(false); return; }
      const item = items[Number(event.key) - 1];
      if (item && !event.ctrlKey && !event.metaKey && !event.altKey) { event.preventDefault(); choose(item.id); }
    };
    document.addEventListener("mousedown", onPointer);
    window.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("mousedown", onPointer); window.removeEventListener("keydown", onKey); };
  });

  return (
    <div className="relative" ref={root}>
      <button
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        title={ru ? "Режим" : "Mode"}
        onClick={() => setOpen((value) => !value)}
        className={cn("flex items-center gap-1 rounded-lg px-2 py-1.5 text-[13px] transition-colors hover:bg-[var(--bg-hover)] hover:text-[var(--fg)]", open ? "bg-[var(--bg-hover)] text-[var(--fg)]" : "text-[var(--fg-muted)]")}
      >
        {selected.title[ru ? 0 : 1]}
        <ChevronDown size={12} strokeWidth={1.8} className="opacity-70" />
      </button>
      {open && (
        <div role="listbox" aria-label={ru ? "Режим" : "Mode"} className="absolute bottom-full right-0 z-50 mb-2 w-[300px] rounded-2xl border border-[var(--border)] bg-[var(--bg-elevated)] p-1.5 shadow-2xl">
          <div className="px-3 pb-1 pt-2 text-[12px] text-[var(--fg-faint)]">{ru ? "Режим" : "Mode"}</div>
          {items.map((item, index) => (
            <button
              key={item.id}
              type="button"
              role="option"
              aria-selected={item.id === current}
              onClick={() => choose(item.id)}
              className="flex w-full items-start gap-3 rounded-xl px-3 py-2 text-left transition-colors hover:bg-[var(--bg-hover)]"
            >
              <span className="min-w-0 flex-1">
                <span className="block text-[14px] text-[var(--fg)]">{item.title[ru ? 0 : 1]}</span>
                <span className="mt-0.5 block text-[12px] leading-snug text-[var(--fg-muted)]">{item.hint[ru ? 0 : 1]}</span>
              </span>
              <span className="flex shrink-0 items-center gap-2 pt-0.5">
                {item.id === current && <Check size={15} strokeWidth={2} className="text-[var(--accent)]" />}
                <span className="w-3 text-right text-[12px] text-[var(--fg-faint)]">{index + 1}</span>
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
