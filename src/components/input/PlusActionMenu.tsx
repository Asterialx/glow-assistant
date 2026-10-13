import {
  Archive,
  Briefcase,
  ChevronRight,
  Globe,
  Paperclip,
  Plus,
  ScrollText,
} from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { useChatStore } from "../../stores/chatStore";
import { useModeStore } from "../../stores/modeStore";
import { useUiStore } from "../../stores/uiStore";
import { createProject } from "../../db";
import { cn } from "../../lib/utils";
import { conversationService } from "../../conversation/conversationService";
import { cloudDataEnabled } from "../../db";
import { BUILTIN_SKILLS } from "../../lib/skills";
import { useSkillsStore } from "../../stores/skillsStore";

type SubKey = "project" | "skills" | null;


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
  const setDraft = useChatStore((s) => s.setDraft);
  const draft = useChatStore((s) => s.draft);
  const setSettingsOpen = useUiStore((s) => s.setSettingsOpen);
  const setSettingsTab = useUiStore((s) => s.setSettingsTab);
  const customSkills = useSkillsStore(s => s.custom);
  const skills = [...BUILTIN_SKILLS, ...customSkills];
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

  return (
    <div ref={rootRef} className="absolute bottom-full left-0 z-50 mb-2 flex items-end gap-1.5">
      <div className="w-[min(280px,44vw)] overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--bg-elevated)] py-1.5 shadow-[0_12px_40px_rgba(0,0,0,0.14)]">
        {<MenuRow
          icon={<Paperclip size={16} strokeWidth={1.7} />}
          label="Add files or photos"
          trailing={<span className="text-[12px] text-[var(--fg-faint)]">Ctrl+U</span>}
          onClick={openFiles}
        />}
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
        <div className="my-1.5 border-t border-[var(--border)]" />

        <MenuRow
          icon={<Globe size={16} strokeWidth={1.7} />}
          label={ru ? "Веб-поиск в каждом запросе" : "Always search the web"}
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
                  await conversationService.setConversationProject(mode, activeConversationId, p.id);
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
                  await conversationService.setConversationProject(mode, activeConversationId, created.id);
                }
                onClose();
              }}
          />
        </SubPanel>
      )}

      {sub === "skills" && (
        <SubPanel>
          {skills.map((s) => (
            <MenuRow
              key={s.id}
              icon={<ScrollText size={15} strokeWidth={1.7} />}
              label={s.name}
              onClick={() => { setDraft(`/skill ${s.id}\n${draft.replace(/^\/skill[^\n]*\n?/, "")}`); onClose(); }}
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
            label={ru ? "Импортировать SKILL.md" : "Import SKILL.md"}
            onClick={() => {
              setSettingsTab("skills");
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
    <div className="max-h-[60vh] w-[min(220px,44vw)] overflow-y-auto rounded-2xl border border-[var(--border)] bg-[var(--bg-elevated)] py-1.5 shadow-[0_12px_40px_rgba(0,0,0,0.14)]">
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
