import { useEffect, useState } from "react";
import { AuthModal } from "../auth/AuthModal";
import { hasAuthServer } from "../../lib/auth";
import { useAuthStore } from "../../stores/authStore";
import { useUiStore } from "../../stores/uiStore";

export function AccountAuthSection() {
  const locale = useUiStore((s) => s.locale);
  const setUserName = useUiStore((s) => s.setUserName);
  const session = useAuthStore((s) => s.session);
  const serverUrl = useAuthStore((s) => s.serverUrl);
  const setServerUrl = useAuthStore((s) => s.setServerUrl);
  const logout = useAuthStore((s) => s.logout);
  const deleteAccount = useAuthStore((s) => s.deleteAccount);
  const hydrate = useAuthStore((s) => s.hydrate);
  const refreshIfNeeded = useAuthStore((s) => s.refreshIfNeeded);

  const [url, setUrl] = useState(serverUrl);
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<"login" | "register">("login");
  const [note, setNote] = useState<string | null>(null);

  const hint = (en: string, ru: string) => (locale === "ru" ? ru : en);

  useEffect(() => {
    hydrate();
    void refreshIfNeeded();
  }, [hydrate, refreshIfNeeded]);

  useEffect(() => setUrl(serverUrl), [serverUrl]);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="mb-1 text-[18px] font-semibold tracking-tight">
          {hint("Account", "Аккаунт")}
        </h2>
        <p className="text-[12.5px] text-[var(--fg-muted)]">
          {hint(
            "Register here. When the server is ready, paste its URL below.",
            "Зарегистрируйся тут. Когда будет сервер — просто вставь URL ниже.",
          )}
        </p>
      </div>

      <div className="rounded-2xl border border-[var(--border)] bg-[var(--bg-input)] p-4">
        {session ? (
          <div className="space-y-3">
            <div>
              <div className="text-[15px] font-medium">{session.user.displayName}</div>
              <div className="text-[13px] text-[var(--fg-muted)]">{session.user.email}</div>
              <div className="mt-2 text-[11px] text-[var(--fg-faint)]">
                {session.backend === "server"
                  ? hint("server", "сервер")
                  : hint("local", "локально")}{" "}
                · {session.user.id.slice(0, 8)}
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                className="rounded-xl border border-[var(--border)] px-3 py-1.5 text-[13px] hover:bg-[var(--bg-hover)]"
                onClick={async () => {
                  await logout();
                  setNote(hint("Signed out.", "Вышли."));
                }}
              >
                {hint("Sign out", "Выйти")}
              </button>
              <button
                type="button"
                className="rounded-xl bg-[var(--fg)] px-3 py-1.5 text-[13px] text-[var(--bg)]"
                onClick={async () => {
                  if (!confirm(hint("Delete account on this device?", "Удалить аккаунт здесь?"))) {
                    return;
                  }
                  await deleteAccount();
                  setUserName("Guest");
                  setNote(hint("Deleted.", "Удалено."));
                }}
              >
                {hint("Delete", "Удалить")}
              </button>
            </div>
          </div>
        ) : (
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className="rounded-xl bg-[var(--fg)] px-3.5 py-2 text-[13px] font-medium text-[var(--bg)]"
              onClick={() => {
                setMode("register");
                setOpen(true);
              }}
            >
              {hint("Register", "Регистрация")}
            </button>
            <button
              type="button"
              className="rounded-xl border border-[var(--border)] px-3.5 py-2 text-[13px] hover:bg-[var(--bg-hover)]"
              onClick={() => {
                setMode("login");
                setOpen(true);
              }}
            >
              {hint("Sign in", "Войти")}
            </button>
          </div>
        )}
      </div>

      <div>
        <div className="mb-1 text-[13px] font-medium">{hint("Auth server", "Сервер авторизации")}</div>
        <p className="mb-2 text-[12px] text-[var(--fg-muted)]">
          {hint(
            "https://api.example.com — endpoints under /v1/auth/…",
            "https://api.example.com — ручки /v1/auth/…",
          )}
        </p>
        <div className="flex flex-col gap-2 sm:flex-row">
          <input
            className="min-w-0 flex-1 rounded-xl border border-[var(--border)] bg-[var(--bg-input)] px-3 py-2 font-[family-name:var(--font-mono)] text-[12.5px] outline-none focus:border-[var(--accent)]"
            placeholder="https://"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
          />
          <button
            type="button"
            className="rounded-xl border border-[var(--border)] px-3 py-2 text-[13px] hover:bg-[var(--bg-hover)]"
            onClick={() => {
              setServerUrl(url);
              setNote(
                url.trim()
                  ? hint("Saved. Next login hits the server.", "Сохранил. Дальше вход через сервер.")
                  : hint("Cleared. Back to local.", "Очистил. Снова локально."),
              );
            }}
          >
            {hint("Save", "Сохранить")}
          </button>
        </div>
        <div className="mt-2 text-[12px] text-[var(--fg-faint)]">
          {hasAuthServer()
            ? hint(`server · ${hostOf(serverUrl)}`, `сервер · ${hostOf(serverUrl)}`)
            : hint("local mode", "локальный режим")}
        </div>
      </div>

      {note && <p className="text-[12.5px] text-[var(--fg-muted)]">{note}</p>}

      <AuthModal open={open} initialMode={mode} onClose={() => setOpen(false)} />
    </div>
  );
}

function hostOf(url: string) {
  try {
    return new URL(url).host;
  } catch {
    return url.slice(0, 24) || "—";
  }
}
