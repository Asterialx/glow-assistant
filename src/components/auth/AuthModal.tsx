import { useState, type FormEvent } from "react";
import { useAuthStore } from "../../stores/authStore";
import { useUiStore } from "../../stores/uiStore";
import { hasAuthServer } from "../../lib/auth";
import { cn } from "../../lib/utils";

type Mode = "login" | "register";

export function AuthModal({
  open,
  onClose,
  initialMode = "login",
}: {
  open: boolean;
  onClose: () => void;
  initialMode?: Mode;
}) {
  const locale = useUiStore((s) => s.locale);
  const setUserName = useUiStore((s) => s.setUserName);
  const register = useAuthStore((s) => s.register);
  const login = useAuthStore((s) => s.login);
  const busy = useAuthStore((s) => s.busy);
  const error = useAuthStore((s) => s.error);
  const clearError = useAuthStore((s) => s.clearError);

  const [mode, setMode] = useState<Mode>(initialMode);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");

  if (!open) return null;

  const hint = (en: string, ru: string) => (locale === "ru" ? ru : en);
  const onServer = hasAuthServer();

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    clearError();
    const ok =
      mode === "register"
        ? await register({
            email,
            password,
            displayName: name.trim() || email.split("@")[0] || "User",
          })
        : await login({ email, password });
    if (!ok) return;
    const session = useAuthStore.getState().session;
    if (session) setUserName(session.user.displayName);
    onClose();
  };

  const field =
    "w-full rounded-xl border border-[var(--border)] bg-[var(--bg-input)] px-3 py-2.5 text-[14px] outline-none focus:border-[var(--accent)]";

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/45 p-4">
      <div className="w-full max-w-md rounded-2xl border border-[var(--border)] bg-[var(--bg-elevated)] p-5 shadow-xl">
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <h2 className="text-[18px] font-semibold tracking-tight">
              {mode === "login"
                ? hint("Sign in", "Вход")
                : hint("Create account", "Регистрация")}
            </h2>
            <p className="mt-1 text-[12.5px] text-[var(--fg-muted)]">
              {onServer
                ? hint("Using your Glow server.", "Через ваш Glow-сервер.")
                : hint(
                    "Stored on this device until you set a server URL.",
                    "Пока без сервера — аккаунт только на этом устройстве.",
                  )}
            </p>
          </div>
          <button
            type="button"
            className="rounded-lg px-2 py-1 text-[13px] text-[var(--fg-muted)] hover:bg-[var(--bg-hover)]"
            onClick={onClose}
          >
            ✕
          </button>
        </div>

        <div className="mb-4 flex gap-1 rounded-xl bg-[var(--bg-input)] p-1">
          {(["login", "register"] as Mode[]).map((m) => (
            <button
              key={m}
              type="button"
              className={cn(
                "flex-1 rounded-lg py-2 text-[13px] font-medium",
                mode === m
                  ? "bg-[var(--bg-elevated)] text-[var(--fg)] shadow-sm"
                  : "text-[var(--fg-muted)]",
              )}
              onClick={() => {
                setMode(m);
                clearError();
              }}
            >
              {m === "login" ? hint("Sign in", "Вход") : hint("Register", "Регистрация")}
            </button>
          ))}
        </div>

        <form className="space-y-3" onSubmit={onSubmit}>
          {mode === "register" && (
            <label className="block">
              <span className="mb-1 block text-[12px] text-[var(--fg-muted)]">
                {hint("Name", "Имя")}
              </span>
              <input
                className={field}
                value={name}
                onChange={(e) => setName(e.target.value)}
                autoComplete="nickname"
              />
            </label>
          )}
          <label className="block">
            <span className="mb-1 block text-[12px] text-[var(--fg-muted)]">Email</span>
            <input
              type="email"
              required
              className={field}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-[12px] text-[var(--fg-muted)]">
              {hint("Password", "Пароль")}
            </span>
            <input
              type="password"
              required
              minLength={8}
              className={field}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete={mode === "login" ? "current-password" : "new-password"}
            />
          </label>

          {error && (
            <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-2 text-[13px] text-red-300">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={busy}
            className="mt-1 w-full rounded-xl bg-[var(--fg)] py-2.5 text-[14px] font-medium text-[var(--bg)] disabled:opacity-60"
          >
            {busy
              ? "…"
              : mode === "login"
                ? hint("Sign in", "Войти")
                : hint("Create account", "Создать")}
          </button>
        </form>
      </div>
    </div>
  );
}
