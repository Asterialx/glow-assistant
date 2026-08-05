import {
  Archive,
  BookOpen,
  Briefcase,
  ChevronRight,
  Globe,
  Grid2X2,
  MoreHorizontal,
  Paperclip,
  Plug,
  Plus,
  ScrollText,
} from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { useChatStore } from "../../stores/chatStore";
import { useModeStore } from "../../stores/modeStore";
import { useUiStore } from "../../stores/uiStore";
import { createProject, listConversations, setConversationProject } from "../../db";
import { cn } from "../../lib/utils";
import { enableChromeAgent, enableGlowDesign } from "../../lib/glowExtensions";

type SubKey = "project" | "skills" | "connector" | null;

const SKILLS = [
  { id: "morning", label: "morning", prompt: "/skill morning\nPlan my morning: top 3 priorities and a short focus block." },
  {
    id: "skill-creator",
    label: "skill-creator",
    prompt: "/skill skill-creator\nHelp me draft a new reusable skill with name, trigger, and steps.",
  },
  {
    id: "design-reflect",
    label: "design-reflect",
    prompt: "/skill design-reflect\nReflect on this UI and propose a clickable HTML prototype.",
  },
];

interface Props {
  fileRef: React.RefObject<HTMLInputElement | null>;
  onClose: () => void;
}

export function PlusActionMenu({ fileRef, onClose }: Props) {
  const locale = useUiStore((s) => s.locale);
  const ru = locale === "ru";
  const mode = useModeStore((s) => s.mode);
  const webSearch = useModeStore((s) => s.webSearch);
  const setWebSearch = useModeStore((s) => s.setWebSearch);
  const projects = useChatStore((s) => s.projects);
  const setProjects = useChatStore((s) => s.setProjects);
  const setActiveProjectId = useChatStore((s) => s.setActiveProjectId);
  const activeConversationId = useChatStore((s) => s.activeConversationId);
  const setConversations = useChatStore((s) => s.setConversations);
  const setDraft = useChatStore((s) => s.setDraft);
  const draft = useChatStore((s) => s.draft);
  const setAppsOpen = useUiStore((s) => s.setAppsOpen);
  const setSettingsOpen = useUiStore((s) => s.setSettingsOpen);
  const setSettingsTab = useUiStore((s) => s.setSettingsTab);
  const [sub, setSub] = useState<SubKey>(null);
  const [busy, setBusy] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) onClose();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [onClose]);

  const openFiles = () => {
    fileRef.current?.click();
    onClose();
  };

  const applySkill = (prompt: string, alsoDesign = false) => {
    if (alsoDesign) enableGlowDesign();
    setDraft(draft ? `${draft}\n${prompt}` : prompt);
    onClose();
  };

  return (
    <div ref={rootRef} className="absolute bottom-full left-0 z-50 mb-2 flex items-end gap-1.5">
      <div className="w-[280px] overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--bg-elevated)] py-1.5 shadow-[0_12px_40px_rgba(0,0,0,0.14)]">
        <MenuRow
          icon={<Paperclip size={16} strokeWidth={1.7} />}
          label="Add files or photos"
          trailing={<span className="text-[12px] text-[var(--fg-faint)]">Ctrl+U</span>}
          onClick={openFiles}
        />
        <MenuRow
          icon={<Archive size={16} strokeWidth={1.7} />}
          label="Add to project"
          trailing={<ChevronRight size={15} className="text-[var(--fg-faint)]" />}
          active={sub === "project"}
          onMouseEnter={() => setSub("project")}
          onClick={() => setSub("project")}
        />

        <div className="my-1.5 border-t border-[var(--border)]" />

        <MenuRow
          icon={<ScrollText size={16} strokeWidth={1.7} />}
          label="Skills"
          trailing={<ChevronRight size={15} className="text-[var(--fg-faint)]" />}
          active={sub === "skills"}
          onMouseEnter={() => setSub("skills")}
          onClick={() => setSub("skills")}
        />
        <MenuRow
          icon={<Grid2X2 size={16} strokeWidth={1.7} />}
          label="Add connector"
          trailing={<ChevronRight size={15} className="text-[var(--fg-faint)]" />}
          active={sub === "connector"}
          onMouseEnter={() => setSub("connector")}
          onClick={() => setSub("connector")}
        />
        <MenuRow
          icon={<Plug size={16} strokeWidth={1.7} />}
          label="Add plugins…"
          onMouseEnter={() => setSub(null)}
          onClick={() => {
            setAppsOpen(true);
            onClose();
          }}
        />

        <div className="my-1.5 border-t border-[var(--border)]" />

        <MenuRow
          icon={<Globe size={16} strokeWidth={1.7} />}
          label="Web search"
          trailing={
            webSearch ? (
              <span className="text-[11px] font-medium text-[var(--accent)]">ON</span>
            ) : undefined
          }
          onMouseEnter={() => setSub(null)}
          onClick={() => {
            setWebSearch(!webSearch);
            onClose();
          }}
        />
      </div>

      {sub === "project" && (
        <SubPanel>
          {projects.length === 0 && (
            <p className="px-3 py-2 text-[12px] text-[var(--fg-faint)]">
              {ru ? "Пока нет проектов" : "No projects yet"}
            </p>
          )}
          {projects.map((p) => (
            <MenuRow
              key={p.id}
              icon={<Archive size={15} strokeWidth={1.7} />}
              label={p.name}
              onClick={async () => {
                setActiveProjectId(p.id);
                if (activeConversationId) {
                  await setConversationProject(mode, activeConversationId, p.id);
                  setConversations(await listConversations(mode));
                }
                onClose();
              }}
            />
          ))}
          <div className="my-1 border-t border-[var(--border)]" />
          <MenuRow
            icon={<Plus size={15} strokeWidth={1.7} />}
            label="Start a new project"
            onClick={async () => {
                const name = window.prompt(ru ? "Название проекта" : "Project name");
                if (!name?.trim()) return;
                const created = await createProject(mode, name.trim(), "");
                setProjects([created, ...projects]);
                setActiveProjectId(created.id);
                if (activeConversationId) {
                  await setConversationProject(mode, activeConversationId, created.id);
                  setConversations(await listConversations(mode));
                }
                onClose();
              }}
          />
        </SubPanel>
      )}

      {sub === "skills" && (
        <SubPanel>
          {SKILLS.map((s) => (
            <MenuRow
              key={s.id}
              icon={<ScrollText size={15} strokeWidth={1.7} />}
              label={s.label}
              onClick={() => applySkill(s.prompt, s.id === "design-reflect")}
            />
          ))}
          <div className="my-1 border-t border-[var(--border)]" />
          <MenuRow
            icon={<Briefcase size={15} strokeWidth={1.7} />}
            label="Manage skills"
            onClick={() => {
              setSettingsTab("skills");
              setSettingsOpen(true);
              onClose();
            }}
          />
          <MenuRow
            icon={<Plus size={15} strokeWidth={1.7} />}
            label="Browse skills"
            onClick={() => {
              setSettingsTab("skills");
              setSettingsOpen(true);
              onClose();
            }}
          />
        </SubPanel>
      )}

      {sub === "connector" && (
        <SubPanel>
          <MenuRow
            icon={<Globe size={15} strokeWidth={1.7} />}
            label="Chrome agent"
            onClick={async () => {
              if (busy) return;
              setBusy(true);
              try {
                await enableChromeAgent();
              } finally {
                setBusy(false);
                onClose();
              }
            }}
          />
          <MenuRow
            icon={<ScrollText size={15} strokeWidth={1.7} />}
            label="Glow Design"
            onClick={() => {
              enableGlowDesign();
              onClose();
            }}
          />
          <div className="my-1 border-t border-[var(--border)]" />
          <MenuRow
            icon={<BookOpen size={15} strokeWidth={1.7} />}
            label="Browse connectors"
            onClick={() => {
              setAppsOpen(true);
              onClose();
            }}
          />
          <MenuRow
            icon={<MoreHorizontal size={15} strokeWidth={1.7} />}
            label="Add custom connector"
            onClick={() => {
              setSettingsTab("connectors");
              setSettingsOpen(true);
              onClose();
            }}
          />
        </SubPanel>
      )}
    </div>
  );
}

function SubPanel({ children }: { children: ReactNode }) {
  return (
    <div className="min-w-[220px] overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--bg-elevated)] py-1.5 shadow-[0_12px_40px_rgba(0,0,0,0.14)]">
      {children}
    </div>
  );
}

function MenuRow({
  icon,
  label,
  trailing,
  onClick,
  onMouseEnter,
  active,
}: {
  icon: ReactNode;
  label: string;
  trailing?: ReactNode;
  onClick?: () => void;
  onMouseEnter?: () => void;
  active?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      onMouseEnter={onMouseEnter}
      className={cn(
        "flex w-full items-center gap-2.5 px-3 py-2 text-left text-[13.5px] text-[var(--fg)]",
        active ? "bg-[var(--bg-hover)]" : "hover:bg-[var(--bg-hover)]",
      )}
    >
      <span className="flex h-5 w-5 shrink-0 items-center justify-center text-[var(--fg)]">
        {icon}
      </span>
      <span className="min-w-0 flex-1 truncate">{label}</span>
      {trailing}
    </button>
  );
}
