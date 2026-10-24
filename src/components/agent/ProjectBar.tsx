import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { FolderOpen, GitBranch } from "lucide-react";
import type { Locale } from "../../lib/i18n";
import { isDesktopApp } from "../../lib/workspace";
import { useAgentStore } from "../../stores/agentStore";
import { useWorkspaceStore } from "../../stores/workspaceStore";
import { cn } from "../../lib/utils";

const AUTONOMY: Record<string, [string, string]> = {
  autopilot: ["автопилот", "autopilot"],
  important: ["спрашивает о важном", "asks about important actions"],
  tasks: ["подтверждение задач", "task approval"],
};

/** The project strip of the Code tab: folder, git branch, Auto/Plan switch and what the agent is doing. */
export function ProjectBar({ locale }: { locale: Locale }) {
  const ru = locale === "ru";
  const folder = useWorkspaceStore((state) => state.folderName);
  const enabled = useWorkspaceStore((state) => state.enabled);
  const taskMode = useWorkspaceStore((state) => state.taskMode);
  const setTaskMode = useWorkspaceStore((state) => state.setTaskMode);
  const status = useWorkspaceStore((state) => state.taskStatus);
  const autonomy = useAgentStore((state) => state.autonomy);
  const running = useAgentStore((state) => state.running);
  const [branch, setBranch] = useState("");
  const connected = enabled && !!folder;

  // The branch can change during a run (the agent creates glow/ branches), so look again when a run ends.
  useEffect(() => {
    if (!connected || !isDesktopApp()) { setBranch(""); return; }
    let cancelled = false;
    invoke<string>("git_current_branch").then((name) => { if (!cancelled) setBranch(name); }).catch(() => { if (!cancelled) setBranch(""); });
    return () => { cancelled = true; };
  }, [connected, folder, running]);

  const seg = (value: "work" | "plan", label: string) => (
    <button
      type="button"
      disabled={running}
      aria-pressed={taskMode === value}
      onClick={() => setTaskMode(value)}
      className={cn("rounded-md px-2.5 py-1 transition-colors disabled:opacity-60", taskMode === value ? "bg-[var(--bg-elevated)] text-[var(--fg)] shadow-sm" : "text-[var(--fg-muted)] hover:text-[var(--fg)]")}
    >{label}</button>
  );

  return (
    <div className="shrink-0 border-b border-[var(--border)] bg-[var(--bg)]" role="region" aria-label={ru ? "Проект" : "Project"}>
      <div className="h-[2px] w-full" style={{ background: "linear-gradient(90deg, var(--kind-dev), transparent 70%)" }} />
      <div className="flex min-h-9 flex-wrap items-center gap-x-4 gap-y-1 px-4 py-1 font-mono text-[12px] text-[var(--fg-muted)]">
        <button
          type="button"
          disabled={running}
          onClick={() => window.dispatchEvent(new Event("glow:pick-work-folder"))}
          className="inline-flex min-w-0 items-center gap-1.5 rounded-md px-1.5 py-1 hover:bg-[var(--bg-hover)] disabled:opacity-60"
          title={ru ? "Сменить проект" : "Change project"}
        >
          <FolderOpen size={13} strokeWidth={1.8} style={{ color: "var(--kind-dev)" }} />
          <span className={cn("max-w-[260px] truncate", connected ? "text-[var(--fg)]" : "text-[var(--fg-faint)]")}>{connected ? folder : ru ? "проект не выбран" : "no project"}</span>
        </button>
        {branch && (
          <span className="inline-flex items-center gap-1.5" title={ru ? "Ветка git" : "Git branch"}>
            <GitBranch size={13} strokeWidth={1.8} style={{ color: "var(--kind-dev)" }} />
            <span className={cn("max-w-[220px] truncate", branch.startsWith("glow/") ? "text-[var(--kind-dev)]" : "text-[var(--fg)]")}>{branch}</span>
          </span>
        )}
        <div className="ml-auto flex items-center gap-3">
          {running ? (
            <span className="inline-flex max-w-[320px] items-center gap-1.5 text-[var(--kind-dev)]">
              <span className="glow-caret" aria-hidden />
              <span className="truncate">{status || (ru ? "работает" : "working")}</span>
            </span>
          ) : connected && taskMode === "work" ? (
            <span className="hidden text-[var(--fg-faint)] sm:inline">{AUTONOMY[autonomy]?.[ru ? 0 : 1]}</span>
          ) : null}
          <div className="inline-flex rounded-lg bg-[var(--bg-hover)] p-0.5" role="group" aria-label={ru ? "Режим агента" : "Agent mode"}>
            {seg("work", ru ? "Авто" : "Auto")}
            {seg("plan", ru ? "План" : "Plan")}
          </div>
        </div>
      </div>
    </div>
  );
}
