import { useEffect, useState, type ReactNode } from "react";
import { X } from "lucide-react";
import { useUiStore } from "../../stores/uiStore";
import { THEMES } from "../../lib/themes";
import { accountStorage as storage } from "../../auth/accountStorage";
import { supabase } from "../../auth/client";
import { useAccount } from "../../auth/AccountContext";
import { AdminPanel } from "../../auth/AdminPanel";
import { cloudDataEnabled, listMemory, deleteMemory } from "../../db";
import { exportSyncPackage, importSyncPackage, getOrCreateAccount, saveAccount } from "../../lib/accountSync";
import type { GlobalMemory } from "../../lib/types";
import { TokenLimitsPanel } from "./TokenLimitsPanel";
import { BillingDashboard } from "../panels/BillingDashboard";
import { SkillsPanel } from "./SkillsPanel";
import { cn } from "../../lib/utils";
import { enableReplyNotifications } from "../../lib/notifications";

const field = "max-w-full rounded-xl border border-[var(--border)] bg-[var(--bg)] px-3 py-2 text-sm";
const button = "rounded-xl border border-[var(--border)] px-3 py-2 text-sm hover:bg-[var(--bg-hover)] disabled:opacity-50";
function Row({ title, description, children }: { title: string; description?: string; children: ReactNode }) {
  return <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--border)] py-4"><div className="min-w-0 basis-full sm:basis-auto sm:flex-1"><p className="text-sm">{title}</p>{description && <p className="mt-1 text-xs text-[var(--fg-muted)]">{description}</p>}</div>{children}</div>;
}
function Toggle({ label, on, change }: { label: string; on: boolean; change: (value: boolean) => void }) {
  return <button role="switch" aria-label={label} aria-checked={on} onClick={() => change(!on)} className={cn("relative h-[22px] w-10 shrink-0 rounded-full", on ? "bg-[var(--accent)]" : "bg-[var(--bg-active)]")}><span className={cn("absolute top-0.5 size-[18px] rounded-full bg-white", on ? "left-5" : "left-0.5")} /></button>;
}

export function SettingsModal() {
  const ui = useUiStore();
  const account = useAccount();
  const text = (en: string, ru: string) => ui.locale === "ru" ? ru : en;
  const [query, setQuery] = useState("");
  const [name, setName] = useState(ui.userName);
  const [instructions, setInstructions] = useState(storage.getItem("glow.instructions") || "");
  const [speed, setSpeed] = useState(storage.getItem("glow.voiceSpeed") || "Normal");
  const [artifacts, setArtifacts] = useState(storage.getItem("glow.capArtifacts") !== "0");
  const [memoryOn, setMemoryOn] = useState(storage.getItem("glow.memoryFromChats") === "1");
  const [facts, setFacts] = useState<GlobalMemory[]>([]);
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);
  const [notifications, setNotifications] = useState(storage.getItem("glow.replyNotifications") === "1" && "Notification" in window && Notification.permission === "granted");
  const tabs = [
    { id: "general", label: text("General", "Основные") }, { id: "account", label: text("Account", "Аккаунт") },
    { id: "privacy", label: text("Data and privacy", "Данные и приватность") }, { id: "billing", label: text("Limits / usage", "Лимиты / расход") },
    { id: "capabilities", label: "Artifacts" }, { id: "memory", label: text("Memory", "Память") }, { id: "skills", label: "Skills" },
    ...(account?.access.role === "admin" ? [{ id: "admin", label: text("Administration", "Администрирование") }] : []),
  ];
  const tab = tabs.some(item => item.id === ui.settingsTab) ? ui.settingsTab : "general";
  useEffect(() => {
    if (!ui.settingsOpen) return;
    setStatus(""); setName(ui.userName);
    if (ui.settingsTab !== tab) ui.setSettingsTab(tab);
    const close = (event: KeyboardEvent) => { if (event.key === "Escape") ui.setSettingsOpen(false); };
    document.addEventListener("keydown", close);
    return () => document.removeEventListener("keydown", close);
  }, [ui.settingsOpen, ui.settingsTab, tab]);
  useEffect(() => {
    if (!ui.settingsOpen || tab !== "memory") return;
    let alive = true;
    listMemory().then(items => { if (alive) setFacts(items); }).catch(() => { if (alive) setStatus(text("Could not load memory.", "Не удалось загрузить память.")); });
    return () => { alive = false; };
  }, [ui.settingsOpen, tab]);
  if (!ui.settingsOpen) return null;
  const saveName = async () => {
    const value = name.trim();
    if (!value || value.length > 60) { setStatus(text("Enter 1–60 characters.", "Введите имя длиной 1–60 символов.")); return; }
    setBusy(true);
    try {
      if (account) {
        if (!supabase) throw new Error("No account service");
        const result = await supabase.from("glow_profiles").update({ display_name: value }).eq("user_id", account.access.user_id).select("user_id").single();
        if (result.error || !result.data) throw new Error("Save failed");
      }
      ui.setUserName(value);
      const localProfile = getOrCreateAccount(value); localProfile.displayName = value; saveAccount(localProfile);
      setStatus(text("Name saved.", "Имя сохранено."));
    } catch { setStatus(text("Could not save name.", "Не удалось сохранить имя.")); }
    finally { setBusy(false); }
  };
  const exportSettings = () => {
    const url = URL.createObjectURL(new Blob([exportSyncPackage()], { type: "application/json" }));
    const a = document.createElement("a"); a.href = url; a.download = "glow-sync.json"; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  return <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/45 p-2 sm:p-5" onMouseDown={e => { if (e.currentTarget === e.target) ui.setSettingsOpen(false); }}>
    <div role="dialog" aria-modal="true" aria-label={text("Settings", "Настройки")} className="flex h-[min(780px,94dvh)] w-[min(980px,98vw)] flex-col overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--bg-elevated)] shadow-2xl sm:flex-row">
      <aside className="shrink-0 border-b border-[var(--border)] bg-[var(--bg-sidebar)] p-3 sm:w-[220px] sm:border-b-0 sm:border-r">
        <input aria-label={text("Search settings", "Поиск настроек")} placeholder={text("Search", "Поиск")} value={query} onChange={e => setQuery(e.target.value)} className={cn(field, "mb-2 w-full")} />
        <nav className="flex gap-1 overflow-x-auto sm:flex-col">{tabs.filter(item => item.label.toLowerCase().includes(query.toLowerCase()) || item.id.includes(query.toLowerCase())).map(item => <button key={item.id} aria-current={tab === item.id ? "page" : undefined} onClick={() => ui.setSettingsTab(item.id)} className={cn("shrink-0 whitespace-nowrap rounded-xl px-3 py-2 text-left text-sm", tab === item.id ? "bg-[var(--bg-active)]" : "text-[var(--fg-muted)] hover:bg-[var(--bg-hover)]")}>{item.label}</button>)}</nav>
      </aside>
      <div className="relative min-h-0 min-w-0 flex-1 overflow-y-auto p-5 pt-12 sm:p-8 sm:pt-12">
        <button aria-label={text("Close settings", "Закрыть настройки")} onClick={() => ui.setSettingsOpen(false)} className="absolute right-3 top-3 rounded-lg p-2 hover:bg-[var(--bg-hover)]"><X size={18} /></button>
        {tab === "general" && <section className="space-y-5"><h2 className="text-lg font-semibold">{text("General", "Основные")}</h2>
          <Row title={text("Name", "Имя")} description={account ? text("Saved to your account.", "Сохраняется в аккаунте.") : text("Stored on this device.", "Хранится на этом устройстве.")}><div className="flex max-w-full gap-2"><input aria-label={text("Name", "Имя")} value={name} maxLength={60} onChange={e => setName(e.target.value)} className={cn(field, "min-w-0 w-36")} /><button disabled={busy || name.trim() === ui.userName} onClick={() => void saveName()} className={button}>{text("Save", "Сохранить")}</button></div></Row>
          <label className="block text-sm">{text("Instructions for Glow", "Инструкции для Glow")}<p className="mt-1 text-xs text-[var(--fg-muted)]">{text("Response preferences, saved on this device.", "Тон, длина и стиль ответа. Сохраняются на этом устройстве.")}</p><textarea value={instructions} onChange={e => { setInstructions(e.target.value); storage.setItem("glow.instructions", e.target.value); }} className={cn(field, "mt-2 h-28 w-full")} /></label>
          <Row title={text("Follow system theme", "Следовать системной теме")}><Toggle label={text("Follow system theme", "Следовать системной теме")} on={ui.appearanceMode === "system"} change={v => ui.setAppearanceMode(v ? "system" : "manual")} /></Row>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">{THEMES.map(theme => <button key={theme.id} aria-pressed={ui.appearanceMode === "manual" && theme.id === ui.themeId} onClick={() => ui.setThemeId(theme.id)} className={cn(button, theme.id === ui.themeId && "border-[var(--accent)]")}>{theme.label}</button>)}</div>
          <Row title={text("Reduce motion", "Уменьшить анимацию")} description={text("Also follows system accessibility preferences.", "Также учитывается системная настройка уменьшения анимации.")}><Toggle label={text("Reduce motion", "Уменьшить анимацию")} on={ui.reducedMotion} change={ui.setReducedMotion} /></Row>
          <Row title={text("Interface and voice language", "Язык интерфейса и чтения")}><select aria-label={text("Language", "Язык")} value={ui.locale} onChange={e => { const value = e.target.value === "en" ? "en" : "ru"; ui.setLocale(value); storage.setItem("glow.voiceLang", value); }} className={field}><option value="ru">Русский</option><option value="en">English</option></select></Row>
          <Row title={text("Read aloud speed", "Скорость чтения")} description={text("Uses voices available in your browser.", "Используются голоса, доступные в браузере.")}><select aria-label={text("Read aloud speed", "Скорость чтения")} value={speed} onChange={e => { setSpeed(e.target.value); storage.setItem("glow.voiceSpeed", e.target.value); }} className={field}><option value="Slow">{text("Slow", "Медленно")}</option><option value="Normal">{text("Normal", "Обычно")}</option><option value="Fast">{text("Fast", "Быстро")}</option></select></Row>
          <Row title={text("Notify when an answer is ready", "Уведомлять о готовом ответе")} description={text("Only when the page is in the background and the reply completed successfully. Requires browser permission. Closing the page stops generation; notifications do not keep it running.", "Только в фоне и после успешно завершённого ответа. Нужно разрешение браузера. Закрытие страницы останавливает генерацию; уведомления её не поддерживают.")}><Toggle label={text("Reply notifications", "Уведомления о готовом ответе")} on={notifications} change={async value => {
            if (!value) { storage.setItem("glow.replyNotifications", "0"); setNotifications(false); return; }
            try { const enabled = await enableReplyNotifications(); setNotifications(enabled); if (!enabled) setStatus(text("Notifications are unavailable or blocked in browser settings.", "Уведомления недоступны или заблокированы в настройках браузера.")); }
            catch { setStatus(text("Could not enable notifications.", "Не удалось включить уведомления.")); }
          }} /></Row>
        </section>}
        {tab === "account" && <section className="space-y-4"><h2 className="text-lg font-semibold">{text("Account", "Аккаунт")}</h2>{account && <><p className="break-all text-sm">{account.access.email}</p><button disabled={account.busy} onClick={() => void account.signOut()} className={button}>{text("Sign out", "Выйти из аккаунта")}</button></>}
          <h3 className="pt-4 font-medium">{text("Transfer local preferences", "Перенос локальных настроек")}</h3><p className="text-sm text-[var(--fg-muted)]">{text("glow-sync.json transfers the local profile, theme, language and instructions. Chats, files and sign-in sessions are not included.", "glow-sync.json переносит локальный профиль, тему, язык и инструкции. Чаты, файлы и сессия входа не включены.")}</p>
          <div className="flex gap-2"><button onClick={exportSettings} className={button}>{text("Export", "Экспорт")}</button><label className={cn(button, "cursor-pointer")}>{text("Import", "Импорт")}<input type="file" accept=".json,application/json" className="hidden" onChange={async e => {
            const input = e.currentTarget; const file = input.files?.[0]; if (!file) return;
            try {
              if (file.size > 200000) throw new Error("Too large");
              const result = importSyncPackage(await file.text()); if (!result.ok) throw new Error(result.error);
              const locale = storage.getItem("glow.locale"); if (locale === "en" || locale === "ru") ui.setLocale(locale);
              const theme = THEMES.find(item => item.id === storage.getItem("glow.theme")); if (theme) ui.setThemeId(theme.id);
              if (!account) ui.setUserName(storage.getItem("glow.userName") || ui.userName);
              else { storage.setItem("glow.userName", ui.userName); const profile = getOrCreateAccount(); profile.displayName = ui.userName; saveAccount(profile); }
              setInstructions(storage.getItem("glow.instructions") || ""); setStatus(text("Preferences imported; signed-in account unchanged.", "Настройки импортированы; аккаунт входа остаётся прежним."));
            } catch { setStatus(text("Could not import this file.", "Не удалось импортировать файл.")); }
            input.value = "";
          }} /></label></div>
        </section>}
        {tab === "privacy" && <section className="space-y-4"><h2 className="text-lg font-semibold">{text("Data and privacy", "Данные и приватность")}</h2><p className="text-sm">{cloudDataEnabled ? text("Saved workspace data is stored in your Supabase account. Local preferences stay on this device.", "Сохранённые данные рабочего пространства хранятся в вашем аккаунте Supabase. Локальные настройки остаются на этом устройстве.") : "__TAURI_INTERNALS__" in window ? text("Workspace data is stored locally in SQLite on this device.", "Данные рабочего пространства хранятся локально в SQLite на этом устройстве.") : text("Workspace data is stored in this browser. Clearing browser data may remove it.", "Данные рабочего пространства хранятся в этом браузере. Очистка данных браузера может их удалить.")}</p><p className="text-sm text-[var(--fg-muted)]">{text("Conversation context is sent to the AI provider to generate answers. Provider API keys stay on the server. Web search may send search queries to the search service.", "Контекст разговора передаётся AI-провайдеру для генерации ответа. API-ключи провайдера остаются на сервере. Web search может передавать поисковые запросы поисковому сервису.")}</p><p className="text-sm text-[var(--fg-muted)]">{text("Med masks supported patterns of personal data before sending text. Full anonymization is not guaranteed.", "Med маскирует поддерживаемые шаблоны персональных данных перед отправкой текста. Полная анонимизация не гарантируется.")}</p></section>}
        {tab === "billing" && (account ? <TokenLimitsPanel /> : <BillingDashboard />)}
        {tab === "admin" && account?.access.role === "admin" && <AdminPanel />}
        {tab === "capabilities" && <section><h2 className="text-lg font-semibold">Artifacts</h2><Row title={text("Automatically open the Artifacts panel", "Автоматически открывать панель Artifacts")} description={text("Inline tools and artifact generation remain available when off.", "При отключении встроенные инструменты и генерация артефактов остаются доступны.")}><Toggle label="Artifacts" on={artifacts} change={v => { setArtifacts(v); storage.setItem("glow.capArtifacts", v ? "1" : "0"); if (!v) ui.setArtifactsOpen(false); }} /></Row></section>}
        {tab === "skills" && <SkillsPanel />}
        {tab === "memory" && <section className="space-y-4"><h2 className="text-lg font-semibold">{text("Memory", "Память")}</h2><Row title={text("Use and save memory", "Использовать и сохранять память")} description={text("Save facts marked by the assistant and use them in future requests. Off stops both reading and writing without deleting facts. This preference applies to this device.", "Сохранять факты, отмеченные ассистентом, и использовать их в следующих запросах. Отключение останавливает чтение и запись без удаления фактов. Настройка действует на этом устройстве.")}><Toggle label={text("Use and save memory", "Использовать и сохранять память")} on={memoryOn} change={v => { setMemoryOn(v); storage.setItem("glow.memoryFromChats", v ? "1" : "0"); }} /></Row>{facts.length === 0 && <p className="text-sm text-[var(--fg-muted)]">{text("No saved facts.", "Сохранённых фактов нет.")}</p>}{facts.map(item => <div key={item.id} className="rounded-xl border border-[var(--border)] p-3"><p className="text-sm">{item.fact}</p><button className="mt-2 text-xs text-[var(--fg-muted)]" onClick={async () => {
          if (!confirm(text("Delete this saved fact?", "Удалить этот сохранённый факт?"))) return;
          try { await deleteMemory(item.id); setFacts(items => items.filter(value => value.id !== item.id)); } catch { setStatus(text("Could not delete fact.", "Не удалось удалить факт.")); }
        }}>{text("Delete", "Удалить")}</button></div>)}</section>}
        {status && <p role="status" className="mt-4 text-sm text-[var(--fg-muted)]">{status}</p>}
      </div>
    </div>
  </div>;
}
