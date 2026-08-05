import { useEffect, useMemo, useState, type ReactNode } from "react";
import {
  X,
  Search,
  Settings as Gear,
  User,
  Shield,
  CreditCard,
  Briefcase,
  Lightbulb,
  Moon,
  Code2,
  Monitor,
  Sparkles,
  Wrench,
  FileText,
  LayoutGrid,
  Puzzle,
  History,
  Sun,
  ExternalLink,
  ChevronDown,
  ChevronLeft,
  Bot,
  BookOpen,
} from "lucide-react";
import { useUiStore } from "../../stores/uiStore";
import { THEMES, type ThemeId } from "../../lib/themes";
import { t, type Locale } from "../../lib/i18n";
import { setApiKey } from "../../lib/llm/smartapi";
import { DevicesSection } from "./DevicesSection";
import { AgentsPanel } from "../panels/AgentsPanel";
import { StudyPanel } from "../panels/StudyPanel";
import { MedPanel } from "../panels/MedPanel";
import {
  getOrCreateAccount,
  getDeviceName,
  listDevices,
  saveAccount,
} from "../../lib/accountSync";
import { listMcp } from "../../lib/tauri";
import { cn } from "../../lib/utils";
import { useIsMobile } from "../../lib/useMediaQuery";
import { BillingDashboard } from "../panels/BillingDashboard";
import { ExtensionsPanel } from "./ExtensionsPanel";

type TabId =
  | "general"
  | "account"
  | "privacy"
  | "billing"
  | "capabilities"
  | "reflect"
  | "focus"
  | "glow-code"
  | "desktop-general"
  | "extensions"
  | "developer"
  | "skills"
  | "connectors"
  | "plugins"
  | "memory"
  | "agents"
  | "study"
  | "med"
  | "med-tools";

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

  // Capabilities
  const [toolMode, setToolMode] = useState(
    localStorage.getItem("glow.toolMode") || "Load tools when needed",
  );
  const [connectorSearch, setConnectorSearch] = useState(() => loadFlag("glow.connectorSearch"));
  const [switchModels, setSwitchModels] = useState(() => loadFlag("glow.switchModels", true));
  const [artifactsOn, setArtifactsOn] = useState(() => loadFlag("glow.capArtifacts", true));
  const [aiArtifacts, setAiArtifacts] = useState(() => loadFlag("glow.aiArtifacts"));
  const [inlineViz, setInlineViz] = useState(() => loadFlag("glow.inlineViz", true));
  const [codeExec, setCodeExec] = useState(() => loadFlag("glow.codeExec", true));
  const [networkEgress, setNetworkEgress] = useState(() => loadFlag("glow.networkEgress"));

  // Memory / desktop
  const [memoryOn, setMemoryOn] = useState(() => loadFlag("glow.memoryFromChats"));
  const [runStartup, setRunStartup] = useState(() => loadFlag("glow.runStartup"));
  const [sysTray, setSysTray] = useState(() => loadFlag("glow.sysTray", true));
  const [keepAwake, setKeepAwake] = useState(() => loadFlag("glow.keepAwake"));
  const [shortcut] = useState("Control+Alt+Space");
  const [quietDays, setQuietDays] = useState<boolean[]>(() => {
    try {
      return JSON.parse(localStorage.getItem("glow.quietDays") || "[false,false,false,false,false,false,false]");
    } catch {
      return [false, false, false, false, false, false, false];
    }
  });
  const [mcpServers, setMcpServers] = useState<
    Array<{ id: string; name: string; enabled: boolean; category: string }>
  >([]);
  const [connectorFilter, setConnectorFilter] = useState<"all" | "connected" | "not">("all");
  const [connectedIds, setConnectedIds] = useState<string[]>(() => {
    try {
      return JSON.parse(localStorage.getItem("glow.connectors") || "[]");
    } catch {
      return [];
    }
  });

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
          items: [
            { id: "study", label: "Study & Focus", icon: BookOpen },
            { id: "med-tools", label: "Med tools", icon: Shield },
          ],
        },
      ];
    }

    return [
      {
        title: "Settings",
        items: [
          ...core.items.slice(0, 4),
          { id: "capabilities", label: "Capabilities", icon: Briefcase },
          { id: "reflect", label: "Reflect", icon: Lightbulb },
          { id: "focus", label: "Time and focus", icon: Moon },
          { id: "glow-code", label: "Glow Code", icon: Code2 },
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
          { id: "med-tools", label: "Med tools", icon: Shield },
        ],
      },
      {
        title: "Customize",
        items: [
          { id: "skills", label: "Skills", icon: FileText },
          { id: "connectors", label: "Connectors", icon: LayoutGrid },
          { id: "plugins", label: "Plugins", icon: Puzzle },
        ],
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
  }, [open, userName]);

  // Leave desktop-only tabs if we land on a phone shell
  useEffect(() => {
    if (!isMobile || !open) return;
    const allowed = new Set([
      "general",
      "account",
      "privacy",
      "billing",
      "memory",
      "study",
      "med-tools",
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

  const popularConnectors = [
    { id: "gmail", name: "Gmail" },
    { id: "gdrive", name: "Google Drive" },
    { id: "slack", name: "Slack" },
    { id: "github", name: "GitHub Integration", type: "Web" },
  ];

  const skills = [
    { name: "morning", updated: "7/24/26", author: "Glow" },
    { name: "skill-creator", updated: "7/24/26", author: "Glow" },
    { name: "design-reflect", updated: "8/2/26", author: "Glow" },
  ];

  const devices = listDevices();
  const thisDevice = devices.find((d) => d.isThis);

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
                </section>
              </div>
            )}

            {/* ACCOUNT */}
            {tab === "account" && (
              <div className="space-y-10">
                <div>
                  <h2 className="mb-5 text-[18px] font-semibold tracking-tight">Account</h2>
                  <SettingRow title="Log out of all devices">
                    <button
                      type="button"
                      className="rounded-xl border border-[var(--border)] px-3 py-1.5 text-[13px] hover:bg-[var(--bg-hover)]"
                      onClick={() => {
                        localStorage.removeItem("glow.devices");
                        alert(locale === "ru" ? "Сессии сброшены локально." : "Sessions cleared locally.");
                      }}
                    >
                      Log out
                    </button>
                  </SettingRow>
                  <SettingRow title="Delete your account">
                    <button
                      type="button"
                      className="rounded-xl bg-[var(--fg)] px-3 py-1.5 text-[13px] text-[var(--bg)]"
                      onClick={() => {
                        if (
                          !confirm(
                            locale === "ru"
                              ? "Удалить локальный аккаунт Glow на этом устройстве?"
                              : "Delete local Glow account on this device?",
                          )
                        )
                          return;
                        [
                          "glow.account",
                          "glow.devices",
                          "glow.sync",
                          "glow.userName",
                          "glow.instructions",
                        ].forEach((k) => localStorage.removeItem(k));
                        setUserName("Sergey");
                      }}
                    >
                      Delete account
                    </button>
                  </SettingRow>
                  <SettingRow title="Organization ID">
                    <span className="rounded-full bg-[var(--bg)] px-3 py-1 font-[family-name:var(--font-mono)] text-[12px] text-[var(--fg-muted)]">
                      {getOrCreateAccount().accountId.slice(0, 8)}
                    </span>
                  </SettingRow>
                </div>

                <section>
                  <h3 className="text-[15px] font-semibold">Trusted devices</h3>
                  <p className="mt-1 text-[12.5px] text-[var(--fg-muted)]">
                    {hint(
                      "Devices that can control your local machine through remote sessions.",
                      "Устройства, которым можно доверить удалённый доступ к этому ПК.",
                    )}
                  </p>
                  <div className="mt-3 overflow-hidden rounded-xl border border-[var(--border)]">
                    <div className="grid grid-cols-2 border-b border-[var(--border)] bg-[var(--bg)] px-3 py-2 text-[12px] text-[var(--fg-faint)]">
                      <span>Device</span>
                      <span>Added</span>
                    </div>
                    {devices.filter((d) => !d.isThis).length === 0 ? (
                      <div className="px-3 py-6 text-[13px] text-[var(--fg-faint)]">
                        {hint("No trusted devices.", "Пока нет доверенных устройств.")}
                      </div>
                    ) : (
                      devices
                        .filter((d) => !d.isThis)
                        .map((d) => (
                          <div
                            key={d.id}
                            className="grid grid-cols-2 border-b border-[var(--border)] px-3 py-2.5 text-[13px] last:border-0"
                          >
                            <span>{d.name}</span>
                            <span className="text-[var(--fg-muted)]">
                              {new Date(d.linkedAt).toLocaleDateString()}
                            </span>
                          </div>
                        ))
                    )}
                  </div>
                </section>

                <section>
                  <h3 className="text-[15px] font-semibold">Active sessions</h3>
                  <div className="mt-3 overflow-hidden rounded-xl border border-[var(--border)]">
                    <div className="grid grid-cols-4 gap-2 border-b border-[var(--border)] bg-[var(--bg)] px-3 py-2 text-[12px] text-[var(--fg-faint)]">
                      <span>Device</span>
                      <span>Location</span>
                      <span>Created</span>
                      <span>Updated</span>
                    </div>
                    <div className="grid grid-cols-4 gap-2 px-3 py-3 text-[13px]">
                      <span className="flex items-center gap-2">
                        {(thisDevice?.name || getDeviceName()).slice(0, 12)}
                        <span className="rounded-full bg-[#dbeafe] px-2 py-0.5 text-[10px] font-medium text-[#1d4ed8]">
                          Current
                        </span>
                      </span>
                      <span className="text-[var(--fg-muted)]">Local</span>
                      <span className="text-[var(--fg-muted)]">
                        {new Date(thisDevice?.linkedAt || Date.now()).toLocaleString()}
                      </span>
                      <span className="text-[var(--fg-muted)]">
                        {new Date(thisDevice?.lastSeenAt || Date.now()).toLocaleString()}
                      </span>
                    </div>
                  </div>
                </section>

                <DevicesSection />
              </div>
            )}

            {/* PRIVACY */}
            {tab === "privacy" && (
              <div>
                <h2 className="mb-4 text-[18px] font-semibold">Privacy</h2>
                <SettingRow
                  title="Local-first data"
                  description={hint(
                    "Chats stay in mode-isolated SQLite on this device. Med mode redacts PII before cloud calls.",
                    "Чаты хранятся локально в SQLite (отдельно по режимам). В Med перед облаком маскируются персональные данные.",
                  )}
                >
                  <span className="text-[12px] text-[var(--fg-faint)]">On</span>
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
                <p className="mt-4 text-[13px] text-[var(--fg-muted)]">{t(locale, "medDisclaimer")}</p>
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
                      "Controls how connector tools are loaded in new conversations.",
                      "Когда подключать tools / connectors в новых чатах.",
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
                      <option>Load tools when needed</option>
                      <option>Always load tools</option>
                      <option>Disable tools</option>
                    </select>
                  </SettingRow>
                  <SettingRow
                    title="Connector search"
                    description={hint(
                      "Let Glow search the connector directory and surface ones relevant to your conversation.",
                      "Glow может подсказывать релевантные connectors по ходу разговора.",
                    )}
                  >
                    <Toggle
                      on={connectorSearch}
                      onChange={(v) => {
                        setConnectorSearch(v);
                        saveFlag("glow.connectorSearch", v);
                      }}
                    />
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

            {/* REFLECT */}
            {tab === "reflect" && (
              <div>
                <h2 className="text-[18px] font-semibold">Reflect</h2>
                <p className="mt-1 text-[13px] text-[var(--fg-muted)]">
                  {hint(
                    "Based on your conversations in Glow chat.",
                    "На основе ваших разговоров в чате Glow.",
                  )}
                </p>
                <EmptyArt
                  title={hint(
                    "For this reflection to work, you'll need to enable memory in memory settings.",
                    "Чтобы Reflect работал, включите Memory в настройках Memory.",
                  )}
                  action={
                    <button
                      type="button"
                      className="text-[13.5px] text-[#5b8def] hover:underline"
                      onClick={() => setTab("memory")}
                    >
                      memory settings
                    </button>
                  }
                />
              </div>
            )}

            {/* TIME AND FOCUS */}
            {tab === "focus" && (
              <div>
                <h2 className="mb-6 text-[18px] font-semibold">Time and focus</h2>
                <SettingRow
                  title="Break reminders"
                  description={hint(
                    "Get a nudge to take a break from Glow. You can snooze or adjust anytime.",
                    "Напоминание сделать перерыв. Можно отложить или поменять.",
                  )}
                >
                  <div className="flex gap-2">
                    <select className="rounded-xl border border-[var(--border)] bg-[var(--bg)] px-2 py-1.5 text-[12.5px]">
                      <option>—</option>
                      <option>25 min</option>
                      <option>50 min</option>
                    </select>
                    <select className="rounded-xl border border-[var(--border)] bg-[var(--bg)] px-2 py-1.5 text-[12.5px]">
                      <option>—</option>
                      <option>5 min break</option>
                      <option>10 min break</option>
                    </select>
                  </div>
                </SettingRow>
                <div className="py-4">
                  <div className="text-[14px]">Quiet hours</div>
                  <p className="mt-1 text-[12.5px] text-[var(--fg-muted)]">
                    {hint(
                      "Set time limits for Glow. You can dismiss or adjust anytime.",
                      "Ограничение времени работы с Glow. Можно отключить в любой момент.",
                    )}
                  </p>
                  <div className="mt-3 flex gap-2">
                    {["S", "M", "T", "W", "T", "F", "S"].map((d, i) => (
                      <button
                        key={`${d}-${i}`}
                        type="button"
                        onClick={() => {
                          const next = [...quietDays];
                          next[i] = !next[i];
                          setQuietDays(next);
                          localStorage.setItem("glow.quietDays", JSON.stringify(next));
                        }}
                        className={cn(
                          "flex h-9 w-9 items-center justify-center rounded-full text-[12px]",
                          quietDays[i]
                            ? "bg-[var(--fg)] text-[var(--bg)]"
                            : "bg-[var(--bg)] text-[var(--fg-muted)]",
                        )}
                      >
                        {d}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {tab === "glow-code" && (
              <div>
                <h2 className="mb-2 text-[18px] font-semibold">Glow Code</h2>
                <p className="mb-6 text-[13px] text-[var(--fg-muted)]">
                  {hint(
                    "Coding workspace preferences for the Code mode.",
                    "Настройки рабочего пространства для режима Code.",
                  )}
                </p>
                <SettingRow
                  title="Default mode on launch"
                  description={hint("Open Glow in Code mode.", "Открывать Glow сразу в режиме Code.")}
                >
                  <Toggle
                    on={localStorage.getItem("glow.defaultCode") === "1"}
                    onChange={(v) => saveFlag("glow.defaultCode", v)}
                  />
                </SettingRow>
                <SettingRow
                  title="Inline diffs"
                  description={hint(
                    "Show proposed edits as diffs in chat.",
                    "Показывать правки кода как diff прямо в чате.",
                  )}
                >
                  <Toggle on={true} onChange={() => {}} />
                </SettingRow>
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

            {tab === "med-tools" && (
              <div className="-mx-4 max-h-[min(70vh,720px)] overflow-y-auto px-2">
                <MedPanel />
              </div>
            )}

            {/* SKILLS */}
            {tab === "skills" && (
              <div>
                <div className="mb-5 flex items-center justify-between">
                  <h2 className="text-[18px] font-semibold">Skills</h2>
                  <div className="flex items-center gap-2">
                    <button type="button" className="rounded-lg p-1.5 hover:bg-[var(--bg-hover)]">
                      <Search size={15} />
                    </button>
                    <button
                      type="button"
                      className="rounded-xl border border-[var(--border)] px-3 py-1.5 text-[13px]"
                    >
                      Browse
                    </button>
                    <button
                      type="button"
                      className="inline-flex items-center gap-1 rounded-xl border border-[var(--border)] px-3 py-1.5 text-[13px]"
                    >
                      Add <ChevronDown size={13} />
                    </button>
                  </div>
                </div>
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

            {/* CONNECTORS */}
            {tab === "connectors" && (
              <div>
                <div className="mb-4 flex items-center justify-between">
                  <h2 className="text-[18px] font-semibold">Connectors</h2>
                  <div className="flex items-center gap-2">
                    <button type="button" className="rounded-lg p-1.5 hover:bg-[var(--bg-hover)]">
                      <Search size={15} />
                    </button>
                    <button
                      type="button"
                      className="inline-flex items-center gap-1 rounded-full border border-[var(--border)] px-3 py-1.5 text-[13px]"
                    >
                      Add <ChevronDown size={13} />
                    </button>
                  </div>
                </div>
                <div className="mb-4 inline-flex rounded-xl bg-[var(--bg)] p-0.5">
                  {(
                    [
                      ["all", "All"],
                      ["connected", "Connected"],
                      ["not", "Not connected"],
                    ] as const
                  ).map(([id, label]) => (
                    <button
                      key={id}
                      type="button"
                      onClick={() => setConnectorFilter(id)}
                      className={cn(
                        "rounded-lg px-3 py-1.5 text-[12.5px]",
                        connectorFilter === id
                          ? "bg-[var(--bg-elevated)] font-medium shadow-sm"
                          : "text-[var(--fg-muted)]",
                      )}
                    >
                      {label}
                    </button>
                  ))}
                </div>
                <p className="mb-2 text-[11px] font-medium tracking-wide text-[var(--fg-faint)]">
                  POPULAR
                </p>
                <div className="mb-6 space-y-2">
                  {popularConnectors.slice(0, 3).map((c) => {
                    const on = connectedIds.includes(c.id);
                    if (connectorFilter === "connected" && !on) return null;
                    if (connectorFilter === "not" && on) return null;
                    return (
                      <div
                        key={c.id}
                        className="flex items-center justify-between rounded-xl border border-[var(--border)] px-3 py-3"
                      >
                        <span className="text-[13.5px] font-medium">{c.name}</span>
                        <button
                          type="button"
                          className="rounded-xl border border-[var(--border)] px-3 py-1 text-[12.5px]"
                          onClick={() => {
                            const next = on
                              ? connectedIds.filter((x) => x !== c.id)
                              : [...connectedIds, c.id];
                            setConnectedIds(next);
                            localStorage.setItem("glow.connectors", JSON.stringify(next));
                          }}
                        >
                          {on ? "Connected" : "Connect"}
                        </button>
                      </div>
                    );
                  })}
                </div>
                <div className="overflow-hidden rounded-xl border border-[var(--border)]">
                  <div className="grid grid-cols-3 border-b border-[var(--border)] bg-[var(--bg)] px-3 py-2 text-[12px] text-[var(--fg-faint)]">
                    <span>Connector</span>
                    <span>Type</span>
                    <span>Status</span>
                  </div>
                  {popularConnectors.slice(3).map((c) => {
                    const on = connectedIds.includes(c.id);
                    return (
                      <div
                        key={c.id}
                        className="grid grid-cols-3 items-center px-3 py-3 text-[13.5px]"
                      >
                        <span>{c.name}</span>
                        <span className="text-[var(--fg-muted)]">{c.type || "Web"}</span>
                        <button
                          type="button"
                          className="w-fit rounded-xl border border-[var(--border)] px-3 py-1 text-[12.5px]"
                          onClick={() => {
                            const next = on
                              ? connectedIds.filter((x) => x !== c.id)
                              : [...connectedIds, c.id];
                            setConnectedIds(next);
                            localStorage.setItem("glow.connectors", JSON.stringify(next));
                          }}
                        >
                          {on ? "Connected" : "Connect"}
                        </button>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* PLUGINS */}
            {tab === "plugins" && (
              <div>
                <div className="mb-2 flex items-center justify-between">
                  <h2 className="text-[18px] font-semibold">Plugins</h2>
                  <div className="flex items-center gap-2">
                    <button type="button" className="rounded-lg p-1.5 hover:bg-[var(--bg-hover)]">
                      <Search size={15} />
                    </button>
                    <button
                      type="button"
                      className="rounded-xl border border-[var(--border)] px-3 py-1.5 text-[13px]"
                    >
                      Browse
                    </button>
                    <button
                      type="button"
                      className="inline-flex items-center gap-1 rounded-xl border border-[var(--border)] px-3 py-1.5 text-[13px]"
                    >
                      Add <ChevronDown size={13} />
                    </button>
                  </div>
                </div>
                <EmptyArt
                  title={hint(
                    "Give Glow role-level expertise with plugins",
                    "Plugins дают Glow экспертизу под роль (как набор Skills + connectors).",
                  )}
                  action={
                    <button
                      type="button"
                      className="rounded-xl border border-[var(--border)] px-3 py-2 text-[13px]"
                    >
                      Browse plugins
                    </button>
                  }
                />
              </div>
            )}

            {/* MEMORY */}
            {tab === "memory" && (
              <div>
                <h2 className="mb-6 text-[18px] font-semibold">Memory</h2>
                <SettingRow
                  title="Generate memory from chats"
                  description={hint(
                    "Allow Glow to generate memory from your chats.",
                    "Glow может запоминать важное из чатов (Memory).",
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
