import {
  Archive,
  Briefcase,
  ChevronRight,
  Paperclip,
  Plus,
  ScrollText,
} from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { useChatStore } from "../../stores/chatStore";
import { useModeStore } from "../../stores/modeStore";
import { useUiStore } from "../../stores/uiStore";
import { createProject, listConversations, setConversationProject } from "../../db";
import { cn } from "../../lib/utils";
import { useIsMobile } from "../../lib/useMediaQuery";
import { enableGlowDesign } from "../../lib/glowExtensions";

type SubKey = "project" | "skills" | null;

const SKILLS = [
  {
    id: "morning",
    label: "morning",
    prompt: "/skill morning\nPlan my morning: top 3 priorities and a short focus block.",
  },
  {
    id: "skill-creator",
    label: "skill-creator",
    prompt: "/skill skill-creator\nHelp me draft a new reusable skill with name, trigger, and steps.",
  },
];

interface Props {
  fileRef: React.RefObject<HTMLInputElement | null>;
  onClose: () => void;
}

export function PlusActionMenu({ fileRef, onClose }: Props) {
  const locale = useUiStore((s) => s.locale);
  const ru = locale === "ru";
  const isMobile = useIsMobile();
  const mode = useModeStore((s) => s.mode);
  const projects = useChatStore((s) => s.projects);
  const setProjects = useChatStore((s) => s.setProjects);
  const setActiveProjectId = useChatStore((s) => s.setActiveProjectId);
  const activeConversationId = useChatStore((s) => s.activeConversationId);
  const setConversations = useChatStore((s) => s.setConversations);
  const setDraft = useChatStore((s) => s.setDraft);
  const draft = useChatStore((s) => s.draft);
  const setSettingsOpen = useUiStore((s) => s.setSettingsOpen);
  const setSettingsTab = useUiStore((s) => s.setSettingsTab);
  const [sub, setSub] = useState<SubKey>(null);
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

  const applySkill = (prompt: string) => {
    setDraft(draft ? `${draft}\n${prompt}` : prompt);
    onClose();
  };

  const toggleSub = (key: SubKey) => setSub((s) => (s === key ? null : key));

  return (
    <div
      ref={rootRef}
      className={cn(
        "absolute bottom-full left-0 z-50 mb-2",
        isMobile ? "flex w-[min(280px,calc(100vw-1.5rem))] flex-col gap-1.5" : "flex items-end gap-1.5",
      )}
    >
      <div className="w-full overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--bg-elevated)] py-1.5 shadow-[0_12px_40px_rgba(0,0,0,0.14)] sm:w-[280px]">
        <MenuRow
          icon={<Paperclip size={16} strokeWidth={1.7} />}
          label={ru ? "Файлы или фото" : "Add files or photos"}
          onClick={openFiles}
        />
        <MenuRow
          icon={<Archive size={16} strokeWidth={1.7} />}
          label={ru ? "Добавить в проект" : "Add to project"}
          trailing={<ChevronRight size={15} className="text-[var(--fg-faint)]" />}
          active={sub === "project"}
          onClick={() => toggleSub("project")}
        />

        <div className="my-1.5 border-t border-[var(--border)]" />

        <MenuRow
          icon={<ScrollText size={16} strokeWidth={1.7} />}
          label="Skills"
          trailing={<ChevronRight size={15} className="text-[var(--fg-faint)]" />}
          active={sub === "skills"}
          onClick={() => toggleSub("skills")}
        />

        {!isMobile && (
          <MenuRow
            icon={<Briefcase size={16} strokeWidth={1.7} />}
            label="Glow Design"
            onClick={() => {
              enableGlowDesign();
              onClose();
            }}
          />
        )}
      </div>

      {sub === "project" && (
        <SubPanel stacked={isMobile}>
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
            label={ru ? "Новый проект" : "Start a new project"}
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
        <SubPanel stacked={isMobile}>
          {SKILLS.map((s) => (
            <MenuRow
              key={s.id}
              icon={<ScrollText size={15} strokeWidth={1.7} />}
              label={s.label}
              onClick={() => applySkill(s.prompt)}
            />
          ))}
          {!isMobile && (
            <>
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
            </>
          )}
        </SubPanel>
      )}
    </div>
  );
}

function SubPanel({ children, stacked }: { children: ReactNode; stacked?: boolean }) {
  return (
    <div
      className={cn(
        "overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--bg-elevated)] py-1.5 shadow-[0_12px_40px_rgba(0,0,0,0.14)]",
        stacked ? "w-full" : "min-w-[220px]",
      )}
    >
      {children}
    </div>
  );
}

function MenuRow({
  icon,
  label,
  trailing,
  onClick,
  active,
  onMouseEnter,
}: {
  icon: ReactNode;
  label: string;
  trailing?: ReactNode;
  onClick: () => void;
  active?: boolean;
  onMouseEnter?: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      onMouseEnter={onMouseEnter}
      className={cn(
        "flex w-full items-center gap-2.5 px-3 py-2.5 text-left text-[13.5px] hover:bg-[var(--bg-hover)]",
        active && "bg-[var(--bg-hover)]",
      )}
    >
      <span className="text-[var(--fg-muted)]">{icon}</span>
      <span className="min-w-0 flex-1 truncate">{label}</span>
      {trailing}
    </button>
  );
}
