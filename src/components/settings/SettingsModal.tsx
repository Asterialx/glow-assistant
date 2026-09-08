import { useEffect, useMemo, useState, type ReactNode } from "react";
import {
  X,
  Search,
  Settings as Gear,
  User,
  Shield,
  CreditCard,
  Briefcase,
  Moon,
  Monitor,
  Sparkles,
  Wrench,
  FileText,
  History,
  Sun,
  ChevronLeft,
  Bot,
  BookOpen,
  Download,
  Trash2,
} from "lucide-react";
import { useUiStore } from "../../stores/uiStore";
import { useModeStore } from "../../stores/modeStore";
import { THEMES, type ThemeId } from "../../lib/themes";
import { t, type Locale } from "../../lib/i18n";
import { setApiKey, setMcsixApiKey } from "../../lib/llm/smartapi";
import { AccountAuthSection } from "./AccountAuthSection";
import { AgentsPanel } from "../panels/AgentsPanel";
import { StudyPanel } from "../panels/StudyPanel";
import { getOrCreateAccount, saveAccount } from "../../lib/accountSync";
import { useAuthStore } from "../../stores/authStore";
import { listMcp } from "../../lib/tauri";
import { cn } from "../../lib/utils";
import { useIsMobile } from "../../lib/useMediaQuery";
import { BillingDashboard } from "../panels/BillingDashboard";
import { ExtensionsPanel } from "./ExtensionsPanel";
import { clearMemory, deleteMemory, listMemory } from "../../db";
import type { GlobalMemory } from "../../lib/types";
import { buildFullBackup, downloadBackupJson } from "../../lib/dataBackup";

type TabId =
  | "general"
  | "account"
  | "privacy"
  | "billing"
  | "capabilities"
  | "desktop-general"
  | "extensions"
  | "developer"
  | "skills"
  | "memory"
  | "agents"
  | "study";

type NavItem = { id: TabId; label: string; icon: typeof Gear };
type NavGroup = { title: string; items: NavItem[] };

function Toggle({
  on,
  onChange,
}: {
  on: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      onClick={() => onChange(!on)}
      className={cn(
        "relative h-[22px] w-[40px] shrink-0 rounded-full transition-colors",
        on ? "bg-[#5b8def]" : "bg-[var(--bg-active)]",
      )}
    >
      <span
        className={cn(
          "absolute top-[2px] h-[18px] w-[18px] rounded-full bg-white shadow transition-transform",
          on ? "left-[20px]" : "left-[2px]",
        )}
      />
    </button>
  );
}

function SettingRow({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-3 border-b border-[var(--border)] py-4 last:border-0 sm:flex-row sm:items-start sm:justify-between sm:gap-6">
      <div className="min-w-0 flex-1 sm:pr-4">
        <div className="text-[14px] text-[var(--fg)]">{title}</div>
        {description && (
          <p className="mt-1 text-[12.5px] leading-relaxed text-[var(--fg-muted)]">{description}</p>
        )}
      </div>
      <div className="w-full shrink-0 sm:w-auto sm:pt-0.5 [&_input]:w-full sm:[&_input]:w-56 [&_select]:w-full sm:[&_select]:w-auto">
        {children}
      </div>
    </div>
  );
}

function Segmented({
  value,
  options,
  onChange,
}: {
  value: string;
  options: { id: string; label?: string; icon?: ReactNode }[];
  onChange: (id: string) => void;
}) {
  return (
    <div className="inline-flex rounded-full border border-[var(--border)] bg-[var(--bg)] p-0.5">
      {options.map((o) => (
        <button
          key={o.id}
          type="button"
          onClick={() => onChange(o.id)}
          className={cn(
            "rounded-full px-2.5 py-1.5 text-[12px]",
            value === o.id
              ? "bg-[var(--bg-elevated)] text-[var(--fg)] shadow-sm"
              : "text-[var(--fg-muted)]",
          )}
          title={o.label || o.id}
        >
          {o.icon || o.label}
        </button>
      ))}
    </div>
  );
}

function EmptyArt({
  title,
  subtitle,
  action,
}: {
  title: string;
  subtitle?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-16 text-center">
      <div className="mb-4 flex h-20 w-20 items-center justify-center rounded-2xl border border-[var(--border)] bg-[var(--bg)] text-[28px] text-[var(--fg-faint)]">
        ✦
      </div>
      <p className="max-w-sm text-[14px] text-[var(--fg)]">{title}</p>
      {subtitle && <p className="mt-2 max-w-sm text-[13px] text-[var(--fg-muted)]">{subtitle}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

function loadFlag(key: string, fallback = false) {
  const v = localStorage.getItem(key);
  if (v == null) return fallback;
  return v === "1";
}
function saveFlag(key: string, v: boolean) {
  localStorage.setItem(key, v ? "1" : "0");
}

export function SettingsModal() {
  const open = useUiStore((s) => s.settingsOpen);
  const setOpen = useUiStore((s) => s.setSettingsOpen);
  const tab = useUiStore((s) => s.settingsTab) as TabId;
  const setTab = useUiStore((s) => s.setSettingsTab);
  const locale = useUiStore((s) => s.locale);
  const isMobile = useIsMobile();
  const [mobileShowContent, setMobileShowContent] = useState(false);
  const setLocale = useUiStore((s) => s.setLocale);
  const themeId = useUiStore((s) => s.themeId);
  const setThemeId = useUiStore((s) => s.setThemeId);
  const userName = useUiStore((s) => s.userName);
  const setUserName = useUiStore((s) => s.setUserName);

  /** RU: only explainers — keep titles / product terms in English. */
  const hint = (en: string, ruText: string) => (locale === "ru" ? ruText : en);

  const [q, setQ] = useState("");
  const [preferredName, setPreferredName] = useState(userName);
  const [work, setWork] = useState("Other");
  const [instructions, setInstructions] = useState(
    localStorage.getItem("glow.instructions") || "",
  );
  const [chatFont, setChatFont] = useState(localStorage.getItem("glow.chatFont") || "serif");
  const [motion, setMotion] = useState(localStorage.getItem("glow.motion") || "system");
  const [voiceLang, setVoiceLang] = useState(
    localStorage.getItem("glow.voiceLang") ||
      (localStorage.getItem("glow.locale") === "en" ? "en" : "ru"),
  );
  const [voiceStyle, setVoiceStyle] = useState(localStorage.getItem("glow.voiceStyle") || "Glassy");
  const [voiceSpeed, setVoiceSpeed] = useState(localStorage.getItem("glow.voiceSpeed") || "Normal");
  const [notifyDone, setNotifyDone] = useState(() => loadFlag("glow.notifyDone", false));
  const [apiKey, setApiKeyState] = useState(
    localStorage.getItem("claude2.apiKey") || import.meta.env.VITE_SMARTAPI_KEY || "",
  );
  const [mcsixApiKey, setMcsixApiKeyState] = useState(
    localStorage.getItem("glow.mcsixApiKey") ||
      localStorage.getItem("claude2.mcsixApiKey") ||
      import.meta.env.VITE_MCSIX_API_KEY ||
      "",
  );

  // Capabilities
  const [toolMode, setToolMode] = useState(
    localStorage.getItem("glow.toolMode") || "Disable tools",
  );
  const [switchModels, setSwitchModels] = useState(() => loadFlag("glow.switchModels", true));
  const [artifactsOn, setArtifactsOn] = useState(() => loadFlag("glow.capArtifacts", true));
  const [aiArtifacts, setAiArtifacts] = useState(() => loadFlag("glow.aiArtifacts"));
  const [inlineViz, setInlineViz] = useState(() => loadFlag("glow.inlineViz", true));
  const [codeExec, setCodeExec] = useState(() => loadFlag("glow.codeExec", true));
  const [networkEgress, setNetworkEgress] = useState(() => loadFlag("glow.networkEgress"));

  // Memory / desktop
  const [memoryOn, setMemoryOn] = useState(() => loadFlag("glow.memoryFromChats"));
  const [memoryFacts, setMemoryFacts] = useState<GlobalMemory[]>([]);
  const [backupBusy, setBackupBusy] = useState(false);
  const [runStartup, setRunStartup] = useState(() => loadFlag("glow.runStartup"));
  const [sysTray, setSysTray] = useState(() => loadFlag("glow.sysTray", true));
  const [keepAwake, setKeepAwake] = useState(() => loadFlag("glow.keepAwake"));
  const [shortcut] = useState("Control+Alt+Space");
  const [mcpServers, setMcpServers] = useState<
    Array<{ id: string; name: string; enabled: boolean; category: string }>
  >([]);
  const mode = useModeStore((s) => s.mode);

  const kind = THEMES.find((th) => th.id === themeId)?.kind || "dark";
  const appearanceMode =
    themeId === "claude-light" || themeId === "paper" || themeId === "sand"
      ? "light"
      : themeId === "claude-dark" || themeId === "graphite" || themeId === "midnight"
        ? "dark"
        : "system";

  const nav: NavGroup[] = useMemo(() => {
    const core: NavGroup = {
      title: "Settings",
      items: [
        { id: "general", label: "General", icon: Gear },
        { id: "account", label: "Account", icon: User },
        { id: "privacy", label: "Privacy", icon: Shield },
        { id: "billing", label: "Billing", icon: CreditCard },
        { id: "memory", label: "Memory", icon: History },
      ],
    };

    if (isMobile) {
      return [
        core,
        {
          title: "Tools",
          items: [{ id: "study", label: "Study & Focus", icon: BookOpen }],
        },
      ];
    }

    return [
      {
        title: "Settings",
        items: [
          ...core.items.slice(0, 4),
          { id: "capabilities", label: "Capabilities", icon: Briefcase },
          { id: "memory", label: "Memory", icon: History },
        ],
      },
      {
        title: "Desktop app",
        items: [
          { id: "desktop-general", label: "General", icon: Monitor },
          { id: "extensions", label: "Extensions", icon: Sparkles },
          { id: "agents", label: "Agents & MCP", icon: Bot },
          { id: "developer", label: "Developer", icon: Wrench },
          { id: "study", label: "Study & Focus", icon: BookOpen },
        ],
      },
      {
        title: "Customize",
        items: [{ id: "skills", label: "Skills", icon: FileText }],
      },
    ];
  }, [isMobile]);

  useEffect(() => {
    if (!open) {
      setMobileShowContent(false);
      return;
    }
    const acc = getOrCreateAccount(userName);
    setPreferredName(acc.preferredName || userName);
    setWork(acc.work || "Other");
    listMcp().then((list) => setMcpServers(list));
    if (tab === "memory") listMemory().then(setMemoryFacts);
  }, [open, userName, tab]);

  // Leave desktop-only / removed tabs
  useEffect(() => {
    if (!open) return;
    const removed = new Set([
      "reflect",
      "focus",
      "glow-code",
      "connectors",
      "plugins",
      "med",
    ]);
    if (removed.has(tab)) setTab("general");
    if (!isMobile) return;
    const allowed = new Set([
      "general",
      "account",
      "privacy",
      "billing",
      "memory",
      "study",
    ]);
    if (!allowed.has(tab)) setTab("general");
  }, [isMobile, open, tab, setTab]);

  if (!open) return null;

  const filteredNav = nav
    .map((g) => ({
      ...g,
      items: g.items.filter(
        (i) =>
          !q ||
          i.label.toLowerCase().includes(q.toLowerCase()) ||
          i.id.includes(q.toLowerCase()),
      ),
    }))
    .filter((g) => g.items.length);

  const persistProfile = (name: string, preferred: string, w: string) => {
    const acc = getOrCreateAccount(name);
    acc.displayName = name;
    acc.preferredName = preferred;
    acc.work = w;
    saveAccount(acc);
    setUserName(name);
  };

  const skills = [
    { name: "morning", updated: "7/24/26", author: "Glow" },
    { name: "skill-creator", updated: "7/24/26", author: "Glow" },
    { name: "design-reflect", updated: "8/2/26", author: "Glow" },
  ];

  const exportBackup = async () => {
    if (backupBusy) return;
    setBackupBusy(true);
    try {
      const backup = await buildFullBackup(mode);
      downloadBackupJson(backup);
    } catch (e) {
      console.warn("Backup failed", e);
      window.alert(locale === "ru" ? "Не удалось создать backup" : "Could not create backup");
    } finally {
      setBackupBusy(false);
    }
  };

  const refreshMemory = async () => setMemoryFacts(await listMemory());

  const showNav = !isMobile || !mobileShowContent;
  const showContent = !isMobile || mobileShowContent;
  const selectTab = (id: TabId) => {
    setTab(id);
    if (isMobile) setMobileShowContent(true);
  };

  return (
    <div
      className={cn(
        "fixed inset-0 z-[100] flex bg-black/45 backdrop-blur-[1px]",
        isMobile ? "items-stretch justify-stretch p-0" : "items-center justify-center p-5",
      )}
    >
      <div
        className={cn(
          "flex overflow-hidden border border-[var(--border)] bg-[var(--bg-elevated)] shadow-2xl",
          isMobile
            ? "h-full w-full rounded-none border-0"
            : "h-[min(780px,92vh)] w-[min(980px,96vw)] rounded-2xl",
        )}
      >
        {showNav && (
          <aside
            className={cn(
              "flex shrink-0 flex-col bg-[var(--bg-sidebar)]",
              isMobile
                ? "w-full border-0 px-3 pb-[max(0.75rem,env(safe-area-inset-bottom,0px))] pt-[max(0.75rem,env(safe-area-inset-top,0px))]"
                : "w-[248px] border-r border-[var(--border)] p-3",
            )}
          >
            <div className="mb-3 flex items-center gap-2">
              {isMobile && (
                <button
                  type="button"
                  className="touch-target flex h-11 w-11 items-center justify-center rounded-xl text-[var(--fg-muted)] hover:bg-[var(--bg-hover)]"
                  onClick={() => setOpen(false)}
                  aria-label="Close"
                >
                  <X size={20} />
                </button>
              )}
              <div className="relative min-w-0 flex-1">
                <Search
                  size={14}
                  className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-[var(--fg-faint)]"
                />
                <input
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  placeholder="Search"
                  className="w-full rounded-xl bg-[var(--bg)] py-2.5 pl-8 pr-2 text-[13px] outline-none placeholder:text-[var(--fg-faint)]"
                />
              </div>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto">
              {filteredNav.map((group) => (
                <div key={group.title} className="mb-3">
                  <p className="mb-1 px-2 text-[11px] font-medium text-[var(--fg-faint)]">
                    {group.title}
                  </p>
                  {group.items.map((item) => {
                    const Icon = item.icon;
                    const active = tab === item.id;
                    return (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => selectTab(item.id)}
                        className={cn(
                          "mb-0.5 flex w-full items-center gap-2.5 rounded-xl px-2.5 py-3 text-left text-[13.5px] sm:py-2",
                          active
                            ? "bg-[var(--bg-active)] font-medium text-[var(--fg)]"
                            : "text-[var(--fg-muted)] hover:bg-[var(--bg-hover)] hover:text-[var(--fg)]",
                        )}
                      >
                        <Icon size={isMobile ? 18 : 15} strokeWidth={1.7} />
                        {item.label}
                      </button>
                    );
                  })}
                </div>
              ))}
            </div>
          </aside>
        )}

        {showContent && (
        <div className="relative flex min-w-0 flex-1 flex-col bg-[var(--bg-elevated)]">
          {isMobile ? (
            <div className="flex shrink-0 items-center gap-1 border-b border-[var(--border)] px-2 pb-2 pt-[max(0.5rem,env(safe-area-inset-top,0px))]">
              <button
                type="button"
                className="touch-target flex min-h-[44px] items-center gap-1 rounded-xl px-2 py-2 text-[var(--fg)] hover:bg-[var(--bg-hover)]"
                onClick={() => setMobileShowContent(false)}
              >
                <ChevronLeft size={20} />
                <span className="text-[14px] font-medium">Settings</span>
              </button>
              <button
                type="button"
                className="touch-target ml-auto flex h-11 w-11 items-center justify-center rounded-xl text-[var(--fg-muted)] hover:bg-[var(--bg-hover)]"
                onClick={() => setOpen(false)}
                aria-label="Close"
              >
                <X size={20} />
              </button>
            </div>
          ) : (
            <button
              type="button"
              className="absolute right-3 top-3 z-10 rounded-lg p-1.5 text-[var(--fg-muted)] hover:bg-[var(--bg-hover)]"
              onClick={() => setOpen(false)}
            >
              <X size={16} />
            </button>
          )}

          <div
            className={cn(
              "min-h-0 flex-1 overflow-y-auto",
              isMobile ? "px-4 py-5" : "px-10 py-8 pr-14",
            )}
          >
            {/* GENERAL */}
            {tab === "general" && (
              <div className="space-y-10">
                <section>
                  <div className="mb-5 flex items-start justify-between">
                    <h2 className="text-[18px] font-semibold tracking-tight">Profile</h2>
                    <div className="flex h-11 w-11 items-center justify-center rounded-full bg-[var(--bg-hover)] text-[15px] font-semibold text-[var(--fg-muted)]">
                      {(userName || "G").slice(0, 1).toUpperCase()}
                    </div>
                  </div>
                  <SettingRow title="Full name">
                    <input
                      value={userName}
                      onChange={(e) => {
                        setUserName(e.target.value);
                        persistProfile(e.target.value, preferredName, work);
                      }}
                      className="w-56 rounded-xl border border-[var(--border)] bg-[var(--bg)] px-3 py-2 text-[13.5px] outline-none"
                    />
                  </SettingRow>
                  <SettingRow title="What should Glow call you?">
                    <input
                      value={preferredName}
                      onChange={(e) => {
                        setPreferredName(e.target.value);
                        persistProfile(userName, e.target.value, work);
                      }}
                      className="w-56 rounded-xl border border-[var(--border)] bg-[var(--bg)] px-3 py-2 text-[13.5px] outline-none"
                    />
                  </SettingRow>
                  <SettingRow title="What best describes your work?">
                    <select
                      value={work}
                      onChange={(e) => {
                        setWork(e.target.value);
                        persistProfile(userName, preferredName, e.target.value);
                      }}
                      className="w-56 rounded-xl border border-[var(--border)] bg-[var(--bg)] px-3 py-2 text-[13.5px] outline-none"
                    >
                      <option>Student</option>
                      <option>Engineer</option>
                      <option>Doctor</option>
                      <option>Other</option>
                    </select>
                  </SettingRow>
                  <div className="border-b border-[var(--border)] py-4">
                    <div className="text-[14px]">Instructions for Glow</div>
                    <p className="mt-1 text-[12.5px] text-[var(--fg-muted)]">
                      {hint(
                        "How would you like Glow to respond? Think of it like customizing Glow's personality.",
                        "Как Glow должен отвечать — тон, длина, стиль. Как «характер» ассистента.",
                      )}
                    </p>
                    <textarea
                      value={instructions}
                      onChange={(e) => {
                        setInstructions(e.target.value);
                        localStorage.setItem("glow.instructions", e.target.value);
                      }}
                      placeholder={hint(
                        "e.g. keep explanations brief and to the point",
                        "например: кратко и по делу…",
                      )}
                      className="mt-3 h-28 w-full rounded-xl border border-[var(--border)] bg-[var(--bg)] p-3 text-[13.5px] outline-none placeholder:text-[var(--fg-faint)]"
                    />
                  </div>
                </section>

                <section>
                  <h2 className="mb-2 text-[18px] font-semibold tracking-tight">Preferences</h2>
                  <SettingRow
                    title="Appearance"
                    description={hint("Light / dark look of the app.", "Светлая или тёмная тема интерфейса.")}
                  >
                    <Segmented
                      value={appearanceMode}
                      onChange={(id) => {
                        if (id === "system") {
                          setThemeId(
                            window.matchMedia("(prefers-color-scheme: dark)").matches
                              ? "claude-dark"
                              : "claude-light",
                          );
                        } else if (id === "light") setThemeId("claude-light");
                        else setThemeId("claude-dark");
                      }}
                      options={[
                        { id: "system", icon: <Monitor size={14} />, label: "System" },
                        { id: "light", icon: <Sun size={14} />, label: "Light" },
                        { id: "dark", icon: <Moon size={14} />, label: "Dark" },
                      ]}
                    />
                  </SettingRow>
                  <div className="border-b border-[var(--border)] py-3">
                    <div className="mb-2 text-[13px] text-[var(--fg-muted)]">
                      {hint("Theme variants", "Варианты оформления")}
                    </div>
                    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                      {THEMES.map((th) => (
                        <button
                          key={th.id}
                          type="button"
                          onClick={() => setThemeId(th.id as ThemeId)}
                          className={cn(
                            "rounded-xl border px-3 py-2 text-left text-[12.5px]",
                            themeId === th.id
                              ? "border-[var(--accent)] bg-[var(--accent-soft)]"
                              : "border-[var(--border)] hover:bg-[var(--bg-hover)]",
                          )}
                        >
                          <div className="font-medium">{th.label}</div>
                          <div className="capitalize text-[var(--fg-faint)]">{th.kind}</div>
                        </button>
                      ))}
                    </div>
                  </div>
                  <SettingRow
                    title="Chat font"
                    description={hint("Font used in the chat transcript.", "Шрифт текста в чате.")}
                  >
                    <select
                      value={chatFont}
                      onChange={(e) => {
                        setChatFont(e.target.value);
                        localStorage.setItem("glow.chatFont", e.target.value);
                      }}
                      className="rounded-xl border border-[var(--border)] bg-[var(--bg)] px-3 py-2 text-[13px]"
                    >
                      <option value="serif">Glow Serif</option>
                      <option value="sans">Glow Sans</option>
                      <option value="mono">Mono</option>
                    </select>
                  </SettingRow>
                  <SettingRow
                    title="Motion"
                    description={hint(
                      "Reduce animation in streaming responses and other interface elements.",
                      "Меньше анимации при стриминге ответов и в интерфейсе.",
                    )}
                  >
                    <Segmented
                      value={motion}
                      onChange={(id) => {
                        setMotion(id);
                        localStorage.setItem("glow.motion", id);
                      }}
                      options={[
                        { id: "system", label: "System" },
                        { id: "reduced", label: "Reduced" },
                      ]}
                    />
                  </SettingRow>
                </section>

                <section>
                  <h2 className="mb-2 text-[18px] font-semibold tracking-tight">Voice</h2>
                  <SettingRow
                    title="Language"
                    description={hint("UI + voice language.", "Язык интерфейса и голоса.")}
                  >
                    <select
                      value={voiceLang}
                      onChange={(e) => {
                        setVoiceLang(e.target.value);
                        localStorage.setItem("glow.voiceLang", e.target.value);
                        if (e.target.value === "ru" || e.target.value === "en") {
                          setLocale(e.target.value as Locale);
                        }
                      }}
                      className="rounded-xl border border-[var(--border)] bg-[var(--bg)] px-3 py-2 text-[13px]"
                    >
                      <option value="en">English</option>
                      <option value="ru">Русский</option>
                    </select>
                  </SettingRow>
                  <SettingRow title="Style">
                    <select
                      value={voiceStyle}
                      onChange={(e) => {
                        setVoiceStyle(e.target.value);
                        localStorage.setItem("glow.voiceStyle", e.target.value);
                      }}
                      className="rounded-xl border border-[var(--border)] bg-[var(--bg)] px-3 py-2 text-[13px]"
                    >
                      <option>Glassy</option>
                      <option>Warm</option>
                      <option>Calm</option>
                    </select>
                  </SettingRow>
                  <SettingRow title="Speed">
                    <select
                      value={voiceSpeed}
                      onChange={(e) => {
                        setVoiceSpeed(e.target.value);
                        localStorage.setItem("glow.voiceSpeed", e.target.value);
                      }}
                      className="rounded-xl border border-[var(--border)] bg-[var(--bg)] px-3 py-2 text-[13px]"
                    >
                      <option>Slow</option>
                      <option>Normal</option>
                      <option>Fast</option>
                    </select>
                  </SettingRow>
                </section>

                <section>
                  <h2 className="mb-2 text-[18px] font-semibold tracking-tight">Notifications</h2>
                  <SettingRow
                    title="Response completions"
                    description={hint(
                      "Get notified when Glow has finished a response. Useful for long-running tasks.",
                      "Уведомление, когда длинный ответ готов.",
                    )}
                  >
                    <Toggle
                      on={notifyDone}
                      onChange={(v) => {
                        setNotifyDone(v);
                        saveFlag("glow.notifyDone", v);
                      }}
                    />
                  </SettingRow>
                </section>

                <section>
                  <h2 className="mb-2 text-[18px] font-semibold tracking-tight">API</h2>
                  <SettingRow
                    title="Base URL"
                    description={hint("SmartAPI endpoint (read-only).", "Адрес SmartAPI (только чтение).")}
                  >
                    <input
                      readOnly
                      value={import.meta.env.VITE_SMARTAPI_BASE_URL || "https://api.smartapi.shop/v1"}
                      className="w-64 rounded-xl border border-[var(--border)] bg-[var(--bg)] px-3 py-2 font-[family-name:var(--font-mono)] text-[11.5px]"
                    />
                  </SettingRow>
                  <SettingRow
                    title="API key"
                    description={hint("Your SmartAPI key for chat.", "Ключ SmartAPI для чата.")}
                  >
                    <div className="flex gap-2">
                      <input
                        type="password"
                        value={apiKey}
                        onChange={(e) => setApiKeyState(e.target.value)}
                        className="w-48 rounded-xl border border-[var(--border)] bg-[var(--bg)] px-3 py-2 font-[family-name:var(--font-mono)] text-[12px]"
                      />
                      <button
                        type="button"
                        className="rounded-xl bg-[var(--fg)] px-3 py-2 text-[12.5px] text-[var(--bg)]"
                        onClick={() => setApiKey(apiKey)}
                      >
                        Save
                      </button>
                    </div>
                  </SettingRow>
                  <SettingRow
                    title="McSix Base URL"
                    description={hint("Gemini models endpoint.", "Эндпоинт моделей Gemini.")}
                  >
                    <input
                      readOnly
                      value={import.meta.env.VITE_MCSIX_BASE_URL || "https://api.mcsix.space/v1"}
                      className="w-64 rounded-xl border border-[var(--border)] bg-[var(--bg)] px-3 py-2 font-[family-name:var(--font-mono)] text-[11.5px]"
                    />
                  </SettingRow>
                  <SettingRow
                    title="McSix API key"
                    description={hint(
                      "Key for Gemini models (mcsix).",
                      "Ключ для моделей Gemini (mcsix).",
                    )}
                  >
                    <div className="flex gap-2">
                      <input
                        type="password"
                        value={mcsixApiKey}
                        onChange={(e) => setMcsixApiKeyState(e.target.value)}
                        className="w-48 rounded-xl border border-[var(--border)] bg-[var(--bg)] px-3 py-2 font-[family-name:var(--font-mono)] text-[12px]"
                      />
                      <button
                        type="button"
                        className="rounded-xl bg-[var(--fg)] px-3 py-2 text-[12.5px] text-[var(--bg)]"
                        onClick={() => setMcsixApiKey(mcsixApiKey)}
                      >
                        Save
                      </button>
                    </div>
                  </SettingRow>
                </section>
              </div>
            )}

            {/* ACCOUNT */}
            {tab === "account" && (
              <div className="space-y-10">
                <div>
                  <h2 className="mb-5 text-[18px] font-semibold tracking-tight">Account</h2>
                  <AccountAuthSection />
                </div>

                <div>
                  <SettingRow title={hint("Sign out", "Выйти")}>
                    <button
                      type="button"
                      className="rounded-xl border border-[var(--border)] px-3 py-1.5 text-[13px] hover:bg-[var(--bg-hover)]"
                      onClick={() => {
                        void useAuthStore.getState().signOut();
                      }}
                    >
                      {hint("Sign out", "Выйти")}
                    </button>
                  </SettingRow>
                  <SettingRow title={hint("Clear local profile cache", "Очистить локальный кэш профиля")}>
                    <button
                      type="button"
                      className="rounded-xl bg-[var(--fg)] px-3 py-1.5 text-[13px] text-[var(--bg)]"
                      onClick={() => {
                        if (
                          !confirm(
                            locale === "ru"
                              ? "Очистить локальные данные профиля на этом устройстве? Чаты не удалятся."
                              : "Clear local profile cache on this device? Chats stay.",
                          )
                        )
                          return;
                        ["glow.account", "glow.devices", "glow.sync", "glow.instructions"].forEach((k) =>
                          localStorage.removeItem(k),
                        );
                      }}
                    >
                      {hint("Clear cache", "Очистить")}
                    </button>
                  </SettingRow>
                </div>
              </div>
            )}

            {/* PRIVACY */}
            {tab === "privacy" && (
              <div>
                <h2 className="mb-4 text-[18px] font-semibold">Privacy</h2>
                <SettingRow
                  title="Local-first data"
                  description={hint(
                    "Chats stay in SQLite on this device.",
                    "Чаты хранятся локально в SQLite на этом устройстве.",
                  )}
                >
                  <span className="text-[12px] text-[var(--fg-faint)]">On</span>
                </SettingRow>
                <SettingRow
                  title={hint("Export chats & memory", "Экспорт чатов и Memory")}
                  description={hint(
                    "Download a JSON backup of conversations, projects, artifacts, widgets, memory, and non-secret prefs. API keys are excluded.",
                    "Скачать JSON: чаты, проекты, артефакты, виджеты, Memory и настройки (без API-ключей).",
                  )}
                >
                  <button
                    type="button"
                    disabled={backupBusy}
                    onClick={() => void exportBackup()}
                    className="inline-flex items-center gap-1.5 rounded-xl border border-[var(--border)] px-3 py-2 text-[12.5px] hover:bg-[var(--bg-hover)] disabled:opacity-50"
                  >
                    <Download size={14} />
                    {backupBusy
                      ? hint("Exporting…", "Экспорт…")
                      : hint("Download backup", "Скачать backup")}
                  </button>
                </SettingRow>
                <SettingRow
                  title="Telemetry"
                  description={hint(
                    "Glow does not send usage analytics by default.",
                    "По умолчанию Glow не отправляет аналитику использования.",
                  )}
                >
                  <Toggle on={false} onChange={() => {}} />
                </SettingRow>
              </div>
            )}

            {tab === "billing" && (
              <div>
                <h2 className="mb-4 text-[18px] font-semibold">Billing</h2>
                <BillingDashboard />
              </div>
            )}

            {/* CAPABILITIES */}
            {tab === "capabilities" && (
              <div className="space-y-8">
                <h2 className="text-[18px] font-semibold">Capabilities</h2>
                <section>
                  <h3 className="mb-1 text-[14px] font-semibold">General</h3>
                  <SettingRow
                    title="Tool access mode"
                    description={hint(
                      "Reserved for future connector tools. Currently tools are not wired — leave Disable tools.",
                      "Зарезервировано под connectors. Пока tools не подключены — оставь Disable tools.",
                    )}
                  >
                    <select
                      value={toolMode}
                      onChange={(e) => {
                        setToolMode(e.target.value);
                        localStorage.setItem("glow.toolMode", e.target.value);
                      }}
                      className="max-w-[200px] rounded-xl border border-[var(--border)] bg-[var(--bg)] px-3 py-2 text-[12.5px]"
                    >
                      <option>Disable tools</option>
                      <option>Load tools when needed</option>
                      <option>Always load tools</option>
                    </select>
                  </SettingRow>
                  <SettingRow
                    title="Switch models when a message is flagged"
                    description={hint(
                      "When safety measures flag a message, automatically switch to a different model to keep chatting.",
                      "Если safety отфильтровал сообщение — автоматически сменить model и продолжить чат.",
                    )}
                  >
                    <Toggle
                      on={switchModels}
                      onChange={(v) => {
                        setSwitchModels(v);
                        saveFlag("glow.switchModels", v);
                      }}
                    />
                  </SettingRow>
                </section>
                <section>
                  <h3 className="mb-1 text-[14px] font-semibold">Visuals</h3>
                  <SettingRow
                    title="Artifacts"
                    description={hint(
                      "Generate code, documents, and designs in a dedicated window alongside your conversation. Opens only when needed.",
                      "Код, документы и макеты — в отдельной панели рядом с чатом. Открывается по необходимости.",
                    )}
                  >
                    <Toggle
                      on={artifactsOn}
                      onChange={(v) => {
                        setArtifactsOn(v);
                        saveFlag("glow.capArtifacts", v);
                        useUiStore.setState({ artifactsOpen: false });
                      }}
                    />
                  </SettingRow>
                  <SettingRow
                    title="AI-powered artifacts"
                    description={hint(
                      "Build apps and interactive documents that use Glow inside the artifact.",
                      "Интерактивные приложения и документы внутри Artifacts с доступом к Glow.",
                    )}
                  >
                    <Toggle
                      on={aiArtifacts}
                      onChange={(v) => {
                        setAiArtifacts(v);
                        saveFlag("glow.aiArtifacts", v);
                      }}
                    />
                  </SettingRow>
                  <SettingRow
                    title="Inline visualizations"
                    description={hint(
                      "Allow Glow to generate interactive visualizations, charts, and diagrams directly in the conversation.",
                      "Графики и диаграммы прямо в чате, без отдельной панели.",
                    )}
                  >
                    <Toggle
                      on={inlineViz}
                      onChange={(v) => {
                        setInlineViz(v);
                        saveFlag("glow.inlineViz", v);
                      }}
                    />
                  </SettingRow>
                </section>
                <section>
                  <h3 className="mb-1 text-[14px] font-semibold">Code execution and file creation</h3>
                  <SettingRow
                    title="Code execution and file creation"
                    description={hint(
                      "Glow can execute code and create and edit docs, spreadsheets, presentations, PDFs, and data reports. Required for skills.",
                      "Запуск кода и создание docs / PDF / таблиц. Нужно для Skills.",
                    )}
                  >
                    <Toggle
                      on={codeExec}
                      onChange={(v) => {
                        setCodeExec(v);
                        saveFlag("glow.codeExec", v);
                      }}
                    />
                  </SettingRow>
                  <div className="mt-2 rounded-xl border border-[var(--border)] bg-[var(--bg)] p-4">
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <div className="text-[14px]">Allow network egress</div>
                        <p className="mt-1 text-[12.5px] text-[var(--fg-muted)]">
                          {hint(
                            "Allow Glow to access common package managers to install packages and libraries for data analysis, visualizations, and file processing.",
                            "Доступ к package managers (npm, pip и т.п.) для установки библиотек.",
                          )}
                        </p>
                        <div className="mt-2 flex gap-3 text-[12.5px] text-[#5b8def]">
                          <button type="button" className="hover:underline">
                            View package manager domains
                          </button>
                          <button type="button" className="hover:underline">
                            security risks
                          </button>
                        </div>
                      </div>
                      <Toggle
                        on={networkEgress}
                        onChange={(v) => {
                          setNetworkEgress(v);
                          saveFlag("glow.networkEgress", v);
                        }}
                      />
                    </div>
                  </div>
                  <p className="mt-4 text-[13px] text-[var(--fg-muted)]">
                    {hint("Skills have moved to", "Skills переехали в")}{" "}
                    <button
                      type="button"
                      className="text-[#5b8def] hover:underline"
                      onClick={() => setTab("skills")}
                    >
                      Customize
                    </button>
                    .
                  </p>
                </section>
              </div>
            )}

            {/* DESKTOP GENERAL */}
            {tab === "desktop-general" && (
              <div>
                <h2 className="mb-6 text-[18px] font-semibold">General desktop settings</h2>
                <SettingRow
                  title="Run on startup"
                  description={hint(
                    "Automatically start Glow when you log in to your computer",
                    "Запускать Glow вместе с Windows.",
                  )}
                >
                  <Toggle
                    on={runStartup}
                    onChange={(v) => {
                      setRunStartup(v);
                      saveFlag("glow.runStartup", v);
                    }}
                  />
                </SettingRow>
                <SettingRow
                  title="Quick Entry keyboard shortcut"
                  description={hint(
                    "Quickly open Glow from anywhere",
                    "Горячая клавиша, чтобы быстро открыть Glow.",
                  )}
                >
                  <span className="inline-flex items-center gap-2 rounded-full border border-[var(--border)] px-3 py-1.5 text-[12.5px]">
                    {shortcut}
                    <X size={12} className="opacity-50" />
                  </span>
                </SettingRow>
                <SettingRow
                  title="System tray"
                  description={hint(
                    "Keep Glow running in the system tray",
                    "Держать Glow в трее (рядом с часами).",
                  )}
                >
                  <Toggle
                    on={sysTray}
                    onChange={(v) => {
                      setSysTray(v);
                      saveFlag("glow.sysTray", v);
                    }}
                  />
                </SettingRow>
                <SettingRow
                  title="Keep computer awake"
                  description={hint(
                    "Prevent your computer from idle-sleeping while Glow is open so scheduled tasks can run. Your display can still turn off.",
                    "Не усыплять ПК, пока Glow открыт (экран всё равно может гаснуть). Нужно для фоновых задач.",
                  )}
                >
                  <Toggle
                    on={keepAwake}
                    onChange={(v) => {
                      setKeepAwake(v);
                      saveFlag("glow.keepAwake", v);
                    }}
                  />
                </SettingRow>
              </div>
            )}

            {/* EXTENSIONS */}
            {tab === "extensions" && (
              <ExtensionsPanel onOpenAgents={() => setTab("agents")} />
            )}

            {/* DEVELOPER / MCP */}
            {tab === "developer" && (
              <div>
                <h2 className="text-[18px] font-semibold">Developer</h2>
                <p className="mt-1 text-[13px] text-[var(--fg-muted)]">
                  {hint(
                    "Low-level MCP registry. Prefer Agents & MCP for FS, terminal and Game Mode.",
                    "Низкоуровневый реестр MCP. Удобнее через Agents & MCP (FS, terminal, Game Mode).",
                  )}
                </p>
                {mcpServers.length === 0 ? (
                  <EmptyArt
                    title={hint("No servers added", "Серверы MCP пока не добавлены")}
                    action={
                      <button
                        type="button"
                        className="rounded-xl bg-[var(--fg)] px-3 py-2 text-[13px] text-[var(--bg)]"
                        onClick={() => setTab("agents")}
                      >
                        Open Agents & MCP
                      </button>
                    }
                  />
                ) : (
                  <div className="mt-6 space-y-2">
                    {mcpServers.map((s) => (
                      <div
                        key={s.id}
                        className="flex items-center justify-between rounded-xl border border-[var(--border)] px-3 py-2.5"
                      >
                        <div>
                          <div className="text-[13.5px]">{s.name}</div>
                          <div className="text-[11.5px] text-[var(--fg-faint)]">{s.category}</div>
                        </div>
                        <span className="text-[12px] text-[var(--fg-muted)]">
                          {s.enabled ? "On" : "Off"}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {tab === "agents" && (
              <div className="-mx-4 max-h-[min(70vh,720px)] overflow-y-auto px-2">
                <AgentsPanel />
              </div>
            )}

            {tab === "study" && (
              <div className="-mx-4 max-h-[min(70vh,720px)] overflow-y-auto px-2">
                <StudyPanel />
              </div>
            )}

            {/* SKILLS */}
            {tab === "skills" && (
              <div>
                <div className="mb-5 flex items-center justify-between">
                  <h2 className="text-[18px] font-semibold">Skills</h2>
                </div>
                <p className="mb-4 text-[13px] text-[var(--fg-muted)]">
                  {hint(
                    "Built-in prompts you can insert from the + menu. Browse marketplace is not available yet.",
                    "Встроенные промпты из меню +. Маркетплейс Skills пока недоступен.",
                  )}
                </p>
                <div className="overflow-hidden rounded-xl border border-[var(--border)]">
                  <div className="grid grid-cols-3 border-b border-[var(--border)] bg-[var(--bg)] px-3 py-2 text-[12px] text-[var(--fg-faint)]">
                    <span>Skill</span>
                    <span>Last updated</span>
                    <span>Author</span>
                  </div>
                  {skills.map((s) => (
                    <div
                      key={s.name}
                      className="grid grid-cols-3 border-b border-[var(--border)] px-3 py-3 text-[13.5px] last:border-0"
                    >
                      <span>{s.name}</span>
                      <span className="text-[var(--fg-muted)]">{s.updated}</span>
                      <span className="text-[var(--fg-muted)]">{s.author}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* MEMORY */}
            {tab === "memory" && (
              <div>
                <h2 className="mb-6 text-[18px] font-semibold">Memory</h2>
                <SettingRow
                  title="Generate memory from chats"
                  description={hint(
                    "When on, lines like Fact: … / Remember: … in assistant replies are saved.",
                    "Если включено, строки Fact: … / Remember: … из ответов сохраняются в Memory.",
                  )}
                >
                  <Toggle
                    on={memoryOn}
                    onChange={(v) => {
                      setMemoryOn(v);
                      saveFlag("glow.memoryFromChats", v);
                    }}
                  />
                </SettingRow>
                <div className="mt-6 flex items-center justify-between">
                  <h3 className="text-[14px] font-semibold">
                    {hint("Saved facts", "Сохранённые факты")}
                  </h3>
                  {memoryFacts.length > 0 && (
                    <button
                      type="button"
                      className="text-[12.5px] text-[var(--fg-muted)] hover:text-[var(--fg)]"
                      onClick={async () => {
                        if (!window.confirm(locale === "ru" ? "Очистить всю Memory?" : "Clear all memory?")) return;
                        await clearMemory();
                        await refreshMemory();
                      }}
                    >
                      {hint("Clear all", "Очистить всё")}
                    </button>
                  )}
                </div>
                {memoryFacts.length === 0 ? (
                  <p className="mt-3 text-[13px] text-[var(--fg-muted)]">
                    {hint(
                      "No facts yet. Enable the toggle above and ask the model to note facts with Fact: …",
                      "Пока пусто. Включи тоггл выше и попроси модель писать Fact: …",
                    )}
                  </p>
                ) : (
                  <ul className="mt-3 space-y-2">
                    {memoryFacts.map((m) => (
                      <li
                        key={m.id}
                        className="flex items-start gap-2 rounded-xl border border-[var(--border)] px-3 py-2.5"
                      >
                        <div className="min-w-0 flex-1">
                          <div className="text-[13.5px] text-[var(--fg)]">{m.fact}</div>
                          <div className="mt-0.5 text-[11px] text-[var(--fg-faint)]">{m.source_mode}</div>
                        </div>
                        <button
                          type="button"
                          className="shrink-0 rounded-lg p-1.5 text-[var(--fg-faint)] hover:bg-[var(--bg-hover)] hover:text-[var(--fg)]"
                          title={hint("Delete", "Удалить")}
                          onClick={async () => {
                            await deleteMemory(m.id);
                            await refreshMemory();
                          }}
                        >
                          <Trash2 size={14} />
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
          </div>

          {/* footer theme quick switch like Claude */}
          <div
            className={cn(
              "flex items-center justify-end border-t border-[var(--border)] px-4 py-2.5",
              isMobile && "pb-[max(0.5rem,env(safe-area-inset-bottom,0px))]",
            )}
          >
            <Segmented
              value={kind === "light" ? "light" : "dark"}
              onChange={(id) => setThemeId(id === "light" ? "claude-light" : "claude-dark")}
              options={[
                { id: "system", icon: <Monitor size={13} /> },
                { id: "light", icon: <Sun size={13} /> },
                { id: "dark", icon: <Moon size={13} /> },
              ]}
            />
          </div>
        </div>
        )}
      </div>
    </div>
  );
}
