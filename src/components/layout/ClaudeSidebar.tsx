import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  Plus,
  Folder,
  SlidersHorizontal,
  ChevronDown,
  ChevronRight,
  Download,
  MessageCircle,
  MoreHorizontal,
  Pin,
  EyeOff,
  Pencil,
  Archive,
  Trash2,
} from "lucide-react";
import { useModeStore } from "../../stores/modeStore";
import { useUiStore } from "../../stores/uiStore";
import { useChatStore } from "../../stores/chatStore";
import { useAuthStore } from "../../stores/authStore";
import { AuthModal } from "../auth/AuthModal";
import { t } from "../../lib/i18n";
import { useIsMobile } from "../../lib/useMediaQuery";
import { cn } from "../../lib/utils";
import type { Conversation } from "../../lib/types";
import {
  createProject,
  deleteConversation,
  renameConversation,
  setConversationPinned,
  setConversationProject,
  setConversationUnread,
} from "../../db";

interface Props {
  onNewChat: () => void;
  onSelectConversation: (id: string) => void;
  onProjectsChanged: () => void;
  onConversationsChanged: () => void;
  /** Called after a nav action that should close a mobile drawer. */
  onNavigate?: () => void;
}

export function ClaudeSidebar({
  onNewChat,
  onSelectConversation,
  onProjectsChanged,
  onConversationsChanged,
  onNavigate,
}: Props) {
  const mode = useModeStore((s) => s.mode);
  const locale = useUiStore((s) => s.locale);
  const userName = useUiStore((s) => s.userName);
  const setSettingsOpen = useUiStore((s) => s.setSettingsOpen);
  const setSettingsTab = useUiStore((s) => s.setSettingsTab);
  const setAppsOpen = useUiStore((s) => s.setAppsOpen);
  const isMobile = useIsMobile();
  const conversations = useChatStore((s) => s.conversations);
  const activeConversationId = useChatStore((s) => s.activeConversationId);
  const setActiveConversationId = useChatStore((s) => s.setActiveConversationId);
  const projects = useChatStore((s) => s.projects);
  const activeProjectId = useChatStore((s) => s.activeProjectId);
  const setActiveProjectId = useChatStore((s) => s.setActiveProjectId);
  const [menuOpen, setMenuOpen] = useState(false);
  const [showProjects, setShowProjects] = useState(false);
  const [q, setQ] = useState("");
  const [ctxId, setCtxId] = useState<string | null>(null);
  const [projectSubOpen, setProjectSubOpen] = useState(false);
  const [authOpen, setAuthOpen] = useState(false);
  const [authMode, setAuthMode] = useState<"login" | "register">("login");
  const ctxRef = useRef<HTMLDivElement>(null);
  const authStatus = useAuthStore((s) => s.status);
  const authUser = useAuthStore((s) => s.user);
  const signOut = useAuthStore((s) => s.signOut);
  const signedIn = authStatus === "authenticated" && Boolean(authUser);
  const displayName =
    (signedIn && (authUser?.email?.split("@")[0] || authUser?.email)) ||
    userName ||
    "Guest";

  const filtered = useMemo(
    () =>
      conversations.filter(
        (c) =>
          (!activeProjectId || c.project_id === activeProjectId) &&
          c.title.toLowerCase().includes(q.toLowerCase()),
      ),
    [conversations, activeProjectId, q],
  );

  const ctxConv = conversations.find((c) => c.id === ctxId) || null;

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (!ctxRef.current?.contains(e.target as Node)) {
        setCtxId(null);
        setProjectSubOpen(false);
      }
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  useEffect(() => {
    if (!ctxId) return;
    const onKey = (e: KeyboardEvent) => {
      if (!ctxConv) return;
      const key = e.key.toLowerCase();
      if (key === "p") {
        e.preventDefault();
        void doPin(ctxConv);
      } else if (key === "u") {
        e.preventDefault();
        void doUnread(ctxConv);
      } else if (key === "r") {
        e.preventDefault();
        void doRename(ctxConv);
      } else if (key === "d") {
        e.preventDefault();
        void doDelete(ctxConv);
      } else if (key === "escape") {
        setCtxId(null);
        setProjectSubOpen(false);
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ctxId, ctxConv, mode, locale]);

  const closeCtx = () => {
    setCtxId(null);
    setProjectSubOpen(false);
  };

  const doPin = async (c: Conversation) => {
    await setConversationPinned(mode, c.id, !Number(c.pinned));
    closeCtx();
    onConversationsChanged();
  };

  const doUnread = async (c: Conversation) => {
    await setConversationUnread(mode, c.id, !Number(c.unread));
    closeCtx();
    onConversationsChanged();
  };

  const doRename = async (c: Conversation) => {
    const next = window.prompt(
      locale === "ru" ? "Переименовать чат" : "Rename chat",
      c.title,
    );
    if (next == null) return;
    await renameConversation(mode, c.id, next);
    closeCtx();
    onConversationsChanged();
  };

  const doDelete = async (c: Conversation) => {
    const ok = window.confirm(
      locale === "ru" ? `Удалить «${c.title}»?` : `Delete “${c.title}”?`,
    );
    if (!ok) return;
    await deleteConversation(mode, c.id);
    if (activeConversationId === c.id) {
      setActiveConversationId(null);
      onNewChat();
    }
    closeCtx();
    onConversationsChanged();
  };

  const doAddToProject = async (c: Conversation, projectId: string | null) => {
    await setConversationProject(mode, c.id, projectId);
    closeCtx();
    onConversationsChanged();
  };

  return (
    <aside className="flex h-full max-h-dvh w-[min(288px,86vw)] shrink-0 flex-col bg-[var(--bg-sidebar)] sm:w-[260px]">
      <div
        className={cn(
          "px-3",
          isMobile ? "pt-[max(0.75rem,env(safe-area-inset-top,0px))]" : "pt-3",
        )}
      >
        <div className="px-1 text-[15px] font-semibold tracking-tight text-[var(--fg)]">
          Glow
        </div>
      </div>

      <div className="mt-3 space-y-0.5 px-2">
        <button
          type="button"
          onClick={onNewChat}
          className="flex w-full items-center gap-2.5 rounded-xl px-3 py-3 text-[13.5px] font-medium text-[var(--fg)] hover:bg-[var(--bg-hover)] sm:py-2"
        >
          <Plus size={16} strokeWidth={1.7} />
          {t(locale, "newChat")}
        </button>
        <button
          type="button"
          onClick={() => setShowProjects((v) => !v)}
          className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-[13.5px] text-[var(--fg)] hover:bg-[var(--bg-hover)]"
        >
          <Folder size={16} strokeWidth={1.7} />
          {t(locale, "projects")}
        </button>
        <button
          type="button"
          onClick={() => {
            setSettingsTab("skills");
            setSettingsOpen(true);
          }}
          className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-[13.5px] text-[var(--fg)] hover:bg-[var(--bg-hover)]"
        >
          <SlidersHorizontal size={16} strokeWidth={1.7} />
          {t(locale, "customize")}
        </button>
      </div>

      {showProjects && (
        <div className="mx-3 mt-2 rounded-xl bg-[var(--bg)] p-2">
          <button
            type="button"
            className={cn(
              "mb-0.5 w-full rounded-lg px-2 py-1.5 text-left text-[12.5px]",
              !activeProjectId ? "bg-[var(--bg-active)]" : "text-[var(--fg-muted)]",
            )}
            onClick={() => setActiveProjectId(null)}
          >
            {t(locale, "allChats")}
          </button>
          {projects.map((p) => (
            <button
              key={p.id}
              type="button"
              className={cn(
                "mb-0.5 w-full truncate rounded-lg px-2 py-1.5 text-left text-[12.5px]",
                activeProjectId === p.id ? "bg-[var(--bg-active)]" : "text-[var(--fg-muted)]",
              )}
              onClick={() => setActiveProjectId(p.id)}
            >
              {p.name}
            </button>
          ))}
          <button
            type="button"
            className="mt-1 px-2 text-[12px] text-[var(--accent)]"
            onClick={async () => {
              const name = window.prompt(t(locale, "projects"));
              if (!name) return;
              await createProject(mode, name, "");
              onProjectsChanged();
            }}
          >
            + {t(locale, "projects")}
          </button>
        </div>
      )}

      <div className="mt-4 flex items-center justify-between px-4">
        <div className="flex items-center gap-1 text-[11px] font-medium tracking-wide text-[var(--fg-faint)]">
          {t(locale, "recents")}
          <ChevronDown size={12} className="opacity-70" />
        </div>
        <button
          type="button"
          className="rounded-md p-1 text-[var(--fg-faint)] hover:bg-[var(--bg-hover)] hover:text-[var(--fg-muted)]"
          title="Filters"
          onClick={() => {
            setSettingsTab("general");
            setSettingsOpen(true);
          }}
        >
          <SlidersHorizontal size={13} />
        </button>
      </div>
      <input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder={t(locale, "searchChats")}
        className="mx-3 mt-2 rounded-lg bg-[var(--bg)] px-2.5 py-1.5 text-[12.5px] text-[var(--fg)] outline-none placeholder:text-[var(--fg-faint)]"
      />
      <div className="relative mt-1 min-h-0 flex-1 overflow-y-auto px-2 pb-2" ref={ctxRef}>
        {filtered.length === 0 && (
          <p className="px-2 py-3 text-[12.5px] text-[var(--fg-faint)]">{t(locale, "noRecents")}</p>
        )}
        {filtered.map((c) => {
          const active = activeConversationId === c.id;
          const menuOpenFor = ctxId === c.id;
          return (
            <div key={c.id} className="relative">
              <div
                className={cn(
                  "group mb-0.5 flex w-full items-center gap-2 rounded-xl px-2 py-1.5 text-left text-[13px]",
                  active || menuOpenFor
                    ? "bg-[var(--bg-active)] text-[var(--fg)]"
                    : "text-[var(--fg-muted)] hover:bg-[var(--bg-hover)] hover:text-[var(--fg)]",
                )}
              >
                <button
                  type="button"
                  className="flex min-w-0 flex-1 items-center gap-2.5"
                  onClick={() => {
                    if (Number(c.unread)) {
                      void setConversationUnread(mode, c.id, false).then(onConversationsChanged);
                    }
                    onSelectConversation(c.id);
                  }}
                >
                  <MessageCircle
                    size={15}
                    strokeWidth={1.6}
                    className={cn(
                      "shrink-0 opacity-50",
                      !!Number(c.pinned) && "text-[var(--accent)] opacity-100",
                    )}
                  />
                  <span
                    className={cn(
                      "min-w-0 flex-1 truncate",
                      !!Number(c.unread) && "font-semibold text-[var(--fg)]",
                    )}
                  >
                    {c.title}
                  </span>
                </button>
                <button
                  type="button"
                  className={cn(
                    "shrink-0 rounded-md p-1 text-[var(--fg-faint)] hover:bg-[var(--bg-hover)] hover:text-[var(--fg)]",
                    menuOpenFor ? "opacity-100" : "opacity-0 group-hover:opacity-100",
                    active && "opacity-100",
                  )}
                  onClick={(e) => {
                    e.stopPropagation();
                    setProjectSubOpen(false);
                    setCtxId((id) => (id === c.id ? null : c.id));
                  }}
                  aria-label="Chat menu"
                >
                  <MoreHorizontal size={15} />
                </button>
              </div>

              {menuOpenFor && (
                <div className="absolute left-2 right-2 z-50 mt-0.5 overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--bg-elevated)] py-1 shadow-2xl">
                  <CtxItem
                    icon={<Pin size={15} />}
                    label={Number(c.pinned) ? (locale === "ru" ? "Открепить" : "Unpin") : "Pin"}
                    shortcut="P"
                    onClick={() => void doPin(c)}
                  />
                  <CtxItem
                    icon={<EyeOff size={15} />}
                    label={
                      Number(c.unread)
                        ? locale === "ru"
                          ? "Отметить прочитанным"
                          : "Mark as read"
                        : locale === "ru"
                          ? "Непрочитанное"
                          : "Mark as unread"
                    }
                    shortcut="U"
                    onClick={() => void doUnread(c)}
                  />
                  <CtxItem
                    icon={<Pencil size={15} />}
                    label={locale === "ru" ? "Переименовать" : "Rename"}
                    shortcut="R"
                    onClick={() => void doRename(c)}
                  />
                  <div className="relative">
                    <CtxItem
                      icon={<Archive size={15} />}
                      label={locale === "ru" ? "Добавить в проект" : "Add to project"}
                      shortcut="›"
                      trailing={<ChevronRight size={14} className="text-[var(--fg-faint)]" />}
                      onClick={() => setProjectSubOpen((v) => !v)}
                    />
                    {projectSubOpen && (
                      <div className="mx-1 mb-1 max-h-40 overflow-y-auto rounded-xl border border-[var(--border)] bg-[var(--bg)] py-1">
                        <button
                          type="button"
                          className="flex w-full px-3 py-1.5 text-left text-[12.5px] hover:bg-[var(--bg-hover)]"
                          onClick={() => void doAddToProject(c, null)}
                        >
                          {locale === "ru" ? "Без проекта" : "No project"}
                        </button>
                        {projects.map((p) => (
                          <button
                            key={p.id}
                            type="button"
                            className={cn(
                              "flex w-full truncate px-3 py-1.5 text-left text-[12.5px] hover:bg-[var(--bg-hover)]",
                              c.project_id === p.id && "text-[var(--accent)]",
                            )}
                            onClick={() => void doAddToProject(c, p.id)}
                          >
                            {p.name}
                          </button>
                        ))}
                        {projects.length === 0 && (
                          <div className="px-3 py-2 text-[12px] text-[var(--fg-faint)]">
                            {locale === "ru" ? "Нет проектов" : "No projects yet"}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                  <div className="my-1 border-t border-[var(--border)]" />
                  <CtxItem
                    icon={<Trash2 size={15} />}
                    label={locale === "ru" ? "Удалить" : "Delete"}
                    shortcut="D"
                    danger
                    onClick={() => void doDelete(c)}
                  />
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div
        className={cn(
          "relative shrink-0 border-t border-[var(--border)] p-2",
          isMobile && "pb-[max(0.5rem,env(safe-area-inset-bottom,0px))]",
        )}
      >
        {menuOpen && (
          <div className="absolute bottom-full left-2 mb-2 w-[min(220px,calc(100%-1rem))] overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--bg-elevated)] shadow-xl">
            {(isMobile
              ? [
                  { key: "settings", tab: "general", label: locale === "ru" ? "Настройки" : "Settings" },
                  { key: "account", tab: "account", label: locale === "ru" ? "Аккаунт" : "Account" },
                  { key: "privacy", tab: "privacy", label: locale === "ru" ? "Приватность" : "Privacy" },
                ]
              : [
                  { key: "settings", tab: "general", label: t(locale, "settings") },
                  { key: "billing", tab: "billing", label: t(locale, "billing") },
                  { key: "agents", tab: "agents", label: "Agents & MCP" },
                ]
            ).map((item) => (
              <button
                key={item.key}
                type="button"
                className="flex w-full px-3.5 py-3 text-left text-[13.5px] hover:bg-[var(--bg-hover)] sm:py-2.5"
                onClick={() => {
                  setSettingsTab(item.tab);
                  setSettingsOpen(true);
                  setMenuOpen(false);
                  onNavigate?.();
                }}
              >
                {item.label}
              </button>
            ))}
            <div className="border-t border-[var(--border)]" />
            {signedIn ? (
              <button
                type="button"
                className="flex w-full px-3.5 py-3 text-left text-[13.5px] hover:bg-[var(--bg-hover)] sm:py-2.5"
                onClick={() => {
                  void signOut();
                  setMenuOpen(false);
                  onNavigate?.();
                }}
              >
                {locale === "ru" ? "Выйти" : "Sign out"}
              </button>
            ) : (
              <>
                <button
                  type="button"
                  className="flex w-full px-3.5 py-3 text-left text-[13.5px] font-medium hover:bg-[var(--bg-hover)] sm:py-2.5"
                  onClick={() => {
                    setAuthMode("register");
                    setAuthOpen(true);
                    setMenuOpen(false);
                    onNavigate?.();
                  }}
                >
                  {locale === "ru" ? "Регистрация" : "Sign up"}
                </button>
                <button
                  type="button"
                  className="flex w-full px-3.5 py-3 text-left text-[13.5px] hover:bg-[var(--bg-hover)] sm:py-2.5"
                  onClick={() => {
                    setAuthMode("login");
                    setAuthOpen(true);
                    setMenuOpen(false);
                    onNavigate?.();
                  }}
                >
                  {locale === "ru" ? "Войти" : "Sign in"}
                </button>
              </>
            )}
            <div className="border-t border-[var(--border)] px-3.5 py-2.5 text-[13px] text-[var(--fg-faint)]">
              Glow · {t(locale, "free")}
            </div>
          </div>
        )}
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => setMenuOpen((v) => !v)}
            className="touch-target flex min-h-[44px] min-w-0 flex-1 items-center gap-2.5 rounded-xl px-2.5 py-2.5 hover:bg-[var(--bg-hover)] sm:min-h-0 sm:py-2"
          >
            <div className="flex h-7 w-7 items-center justify-center rounded-full bg-[var(--accent-soft)] text-[12px] font-semibold text-[var(--accent)]">
              {displayName.slice(0, 1).toUpperCase()}
            </div>
            <div className="min-w-0 flex-1 text-left">
              <div className="truncate text-[13px] font-medium">
                {displayName} ·{" "}
                <span className="text-[var(--fg-muted)]">{t(locale, "free")}</span>
              </div>
            </div>
            <ChevronDown size={14} className="shrink-0 text-[var(--fg-faint)]" />
          </button>
          {!isMobile && (
            <button
              type="button"
              className="group relative shrink-0 rounded-lg p-2 text-[var(--fg-faint)] hover:bg-[var(--bg-hover)]"
              title="Get apps and extensions"
              onClick={() => {
                setMenuOpen(false);
                setAppsOpen(true);
              }}
            >
              <Download size={15} />
              <span className="pointer-events-none absolute bottom-full right-0 mb-2 hidden whitespace-nowrap rounded-full bg-[var(--fg)] px-3 py-1.5 text-[11px] font-medium text-[var(--bg)] shadow-lg group-hover:block">
                Get apps and extensions
              </span>
            </button>
          )}
        </div>
      </div>

      <AuthModal
        open={authOpen}
        onClose={() => setAuthOpen(false)}
        initialMode={authMode}
        reason="manual"
      />
    </aside>
  );
}

function CtxItem({
  icon,
  label,
  shortcut,
  onClick,
  danger,
  trailing,
}: {
  icon: ReactNode;
  label: string;
  shortcut: string;
  onClick: () => void;
  danger?: boolean;
  trailing?: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex w-full items-center gap-2.5 px-3 py-2 text-left text-[13px] hover:bg-[var(--bg-hover)]",
        danger && "text-[#c44a3c]",
      )}
    >
      <span className={cn("opacity-80", danger && "text-[#c44a3c]")}>{icon}</span>
      <span className="min-w-0 flex-1 truncate">{label}</span>
      {trailing}
      <span className="text-[11px] text-[var(--fg-faint)]">{shortcut}</span>
    </button>
  );
}
