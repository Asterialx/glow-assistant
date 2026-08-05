import { useState } from "react";
import type { Conversation, Project } from "../../lib/types";
import { createProject } from "../../db";
import { useModeStore } from "../../stores/modeStore";
import { Plus, MessageSquare } from "lucide-react";
import { cn } from "../../lib/utils";

interface Props {
  conversations: Conversation[];
  projects: Project[];
  activeConversationId: string | null;
  activeProjectId: string | null;
  onSelectConversation: (id: string) => void;
  onNewChat: () => void;
  onSelectProject: (id: string | null) => void;
  onProjectsChanged: () => void;
}

export function ProjectsSidebar({
  conversations,
  projects,
  activeConversationId,
  activeProjectId,
  onSelectConversation,
  onNewChat,
  onSelectProject,
  onProjectsChanged,
}: Props) {
  const mode = useModeStore((s) => s.mode);
  const [q, setQ] = useState("");

  const filtered = conversations.filter((c) =>
    c.title.toLowerCase().includes(q.toLowerCase()),
  );

  return (
    <aside className="flex w-[240px] shrink-0 flex-col border-r border-[var(--color-border)] bg-[var(--color-surface-2)]">
      <div className="p-3">
        <button
          type="button"
          onClick={onNewChat}
          className="flex w-full items-center justify-center gap-1.5 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] py-2 text-[13px] font-medium text-[var(--color-fg)] transition hover:bg-[var(--color-surface-3)]"
        >
          <Plus size={14} strokeWidth={1.75} /> New chat
        </button>
      </div>
      <div className="px-3 pb-3">
        <div className="mb-1.5 px-1 text-[11px] font-medium tracking-wide text-[var(--color-muted)]">
          Projects
        </div>
        <button
          type="button"
          className={cn(
            "mb-0.5 w-full rounded-lg px-2.5 py-1.5 text-left text-[13px]",
            !activeProjectId
              ? "bg-[var(--color-surface-3)] text-[var(--color-fg)]"
              : "text-[var(--color-muted)] hover:bg-[var(--color-surface)]",
          )}
          onClick={() => onSelectProject(null)}
        >
          All chats
        </button>
        {projects.map((p) => (
          <button
            key={p.id}
            type="button"
            className={cn(
              "mb-0.5 w-full truncate rounded-lg px-2.5 py-1.5 text-left text-[13px]",
              activeProjectId === p.id
                ? "bg-[var(--color-surface-3)] text-[var(--color-fg)]"
                : "text-[var(--color-muted)] hover:bg-[var(--color-surface)]",
            )}
            onClick={() => onSelectProject(p.id)}
          >
            {p.name}
          </button>
        ))}
        <button
          type="button"
          className="mt-1 px-2.5 text-[12px] text-[var(--accent)]"
          onClick={async () => {
            const name = window.prompt("Project name");
            if (!name) return;
            const prompt = window.prompt("System prompt (optional)") || "";
            await createProject(mode, name, prompt);
            onProjectsChanged();
          }}
        >
          + New project
        </button>
      </div>
      <input
        className="mx-3 mb-2 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-1.5 text-[13px] outline-none placeholder:text-[var(--color-muted)] focus:border-[#d2c9bc]"
        placeholder="Search"
        value={q}
        onChange={(e) => setQ(e.target.value)}
      />
      <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-3">
        {filtered
          .filter((c) => !activeProjectId || c.project_id === activeProjectId)
          .map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={() => onSelectConversation(c.id)}
              className={cn(
                "mb-0.5 flex w-full items-center gap-2 rounded-xl px-2.5 py-2 text-left text-[13px]",
                activeConversationId === c.id
                  ? "bg-[var(--color-surface-3)] text-[var(--color-fg)]"
                  : "text-[var(--color-muted)] hover:bg-[var(--color-surface)]",
              )}
            >
              <MessageSquare size={13} strokeWidth={1.75} />
              <span className="truncate">{c.title}</span>
            </button>
          ))}
      </div>
    </aside>
  );
}
