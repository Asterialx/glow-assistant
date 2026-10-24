import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { GitBranch } from "lucide-react";
import type { Locale } from "../../lib/i18n";
import { isDesktopApp } from "../../lib/workspace";
import { useAgentStore } from "../../stores/agentStore";
import { useWorkspaceStore } from "../../stores/workspaceStore";
import { cn } from "../../lib/utils";

/** The project strip of the Code tab: folder, git branch and what the agent is doing. The mode is picked in the composer. */
export function ProjectBar({ locale }: { locale: Locale }) {
  const ru = locale === "ru";
  const folder = useWorkspaceStore((state) => state.folderName);
  const enabled = useWorkspaceStore((state) => state.enabled);
  const status = useWorkspaceStore((state) => state.taskStatus);
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

  return (
    <div className="shrink-0 px-4 md:px-8" role="region" aria-label={ru ? "Проект" : "Project"}>
      {/* Same column as the messages and the composer, so everything starts on one line. */}
      <div className="mx-auto flex min-h-10 w-full max-w-[720px] flex-wrap items-center gap-x-2 gap-y-1 text-[13px] text-[var(--fg-muted)]">
        {branch && (
          <span className="inline-flex items-center gap-1.5 px-2" title={ru ? "Ветка git" : "Git branch"}>
            <GitBranch size={13} strokeWidth={1.8} />
            <span className={cn("max-w-[220px] truncate", branch.startsWith("glow/") ? "text-[var(--kind-dev)]" : "text-[var(--fg)]")}>{branch}</span>
          </span>
        )}
        {running && (
          <span className="ml-auto inline-flex max-w-[320px] items-center gap-1.5 text-[var(--kind-dev)]">
            <span className="glow-caret" aria-hidden />
            <span className="truncate">{status || (ru ? "работает" : "working")}</span>
          </span>
        )}
      </div>
    </div>
  );
}
