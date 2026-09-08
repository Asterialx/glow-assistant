import { useEffect, useState } from "react";
import { LogIn, LogOut, RefreshCw, Cloud } from "lucide-react";
import { useAuthStore } from "../../stores/authStore";
import { useUiStore } from "../../stores/uiStore";
import { AuthModal } from "../auth/AuthModal";
import { fullSync, getLastSyncAt } from "../../lib/supabase/syncClient";
import { GUEST_MESSAGE_LIMIT, readLocalTrialCount } from "../../lib/supabase/trial";
import { isSupabaseConfigured } from "../../lib/supabase/client";

export function AccountAuthSection() {
  const locale = useUiStore((s) => s.locale);
  const status = useAuthStore((s) => s.status);
  const user = useAuthStore((s) => s.user);
  const signOut = useAuthStore((s) => s.signOut);
  const [authOpen, setAuthOpen] = useState(false);
  const [authMode, setAuthMode] = useState<"login" | "register">("login");
  const [syncStatus, setSyncStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const lastSync = getLastSyncAt();
  const ru = locale === "ru";

  useEffect(() => {
    // re-render tick for last sync label after sync
  }, [syncStatus]);

  const onSync = async () => {
    setBusy(true);
    setSyncStatus(null);
    try {
      const res = await fullSync("home");
      setSyncStatus(
        ru
          ? `Готово: загружено изменений ${res.pulled}.`
          : `Done: pulled ${res.pulled} changes.`,
      );
    } catch (e) {
      setSyncStatus(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  if (!isSupabaseConfigured()) {
    return (
      <div className="rounded-xl border border-[var(--border)] bg-[var(--bg)] p-4 text-[13px] text-[var(--fg-muted)]">
        {ru
          ? "Supabase не настроен. Добавь VITE_SUPABASE_URL и VITE_SUPABASE_ANON_KEY в .env.local."
          : "Supabase is not configured. Add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY to .env.local."}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-[var(--border)] p-4">
        {status === "authenticated" && user ? (
          <>
            <div className="text-[12px] text-[var(--fg-faint)]">{ru ? "Вы вошли как" : "Signed in as"}</div>
            <div className="mt-1 truncate text-[14px] font-medium">
              {[user.user_metadata?.first_name, user.user_metadata?.last_name]
                .filter(Boolean)
                .join(" ")
                .trim() ||
                user.user_metadata?.full_name ||
                user.email}
            </div>
            {user.email &&
            (user.user_metadata?.first_name || user.user_metadata?.full_name) ? (
              <div className="mt-0.5 truncate text-[12px] text-[var(--fg-muted)]">{user.email}</div>
            ) : null}
            <div className="mt-3 flex flex-wrap gap-2">
              <button
                type="button"
                disabled={busy}
                onClick={() => void onSync()}
                className="inline-flex items-center gap-2 rounded-xl border border-[var(--border)] px-3 py-2 text-[13px] hover:bg-[var(--bg-hover)] disabled:opacity-50"
              >
                <RefreshCw size={14} className={busy ? "animate-spin" : ""} />
                {ru ? "Синхронизировать" : "Sync now"}
              </button>
              <button
                type="button"
                onClick={() => void signOut()}
                className="inline-flex items-center gap-2 rounded-xl border border-[var(--border)] px-3 py-2 text-[13px] hover:bg-[var(--bg-hover)]"
              >
                <LogOut size={14} />
                {ru ? "Выйти" : "Sign out"}
              </button>
            </div>
            {lastSync ? (
              <p className="mt-2 text-[11.5px] text-[var(--fg-faint)]">
                {ru ? "Последний sync: " : "Last sync: "}
                {new Date(lastSync).toLocaleString()}
              </p>
            ) : null}
          </>
        ) : (
          <>
            <div className="mb-1 flex items-center gap-2 text-[14px] font-medium">
              <Cloud size={16} className="text-[var(--accent)]" />
              {ru ? "Облачный аккаунт" : "Cloud account"}
            </div>
            <p className="text-[12.5px] leading-relaxed text-[var(--fg-muted)]">
              {ru
                ? `Без входа доступно ${GUEST_MESSAGE_LIMIT} сообщений (сейчас ${readLocalTrialCount()}). После входа чаты, память и настройки синхронизируются между устройствами.`
                : `${GUEST_MESSAGE_LIMIT} free messages without an account (used ${readLocalTrialCount()}). After sign-in, chats, memory, and settings sync across devices.`}
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <button
                type="button"
                className="inline-flex items-center gap-2 rounded-xl bg-[var(--fg)] px-3 py-2 text-[13px] font-medium text-[var(--bg)]"
                onClick={() => {
                  setAuthMode("register");
                  setAuthOpen(true);
                }}
              >
                <LogIn size={14} />
                {ru ? "Создать аккаунт" : "Create account"}
              </button>
              <button
                type="button"
                className="rounded-xl border border-[var(--border)] px-3 py-2 text-[13px] hover:bg-[var(--bg-hover)]"
                onClick={() => {
                  setAuthMode("login");
                  setAuthOpen(true);
                }}
              >
                {ru ? "Войти" : "Sign in"}
              </button>
            </div>
          </>
        )}
        {syncStatus && <p className="mt-2 text-[12.5px] text-[var(--accent)]">{syncStatus}</p>}
      </div>

      <AuthModal
        open={authOpen}
        onClose={() => setAuthOpen(false)}
        initialMode={authMode}
        reason="manual"
      />
    </div>
  );
}
