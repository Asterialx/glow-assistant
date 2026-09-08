import { useEffect, useState } from "react";
import { X } from "lucide-react";
import { useAuthStore } from "../../stores/authStore";
import { useUiStore } from "../../stores/uiStore";
import { GUEST_MESSAGE_LIMIT } from "../../lib/supabase/trial";
import { fullSync } from "../../lib/supabase/syncClient";
import { cn } from "../../lib/utils";

type Mode = "login" | "register" | "verify";

type Props = {
  open: boolean;
  onClose: () => void;
  reason?: "guest_limit" | "manual";
  initialMode?: Mode;
};

export function AuthModal({ open, onClose, reason = "manual", initialMode = "register" }: Props) {
  const locale = useUiStore((s) => s.locale);
  const status = useAuthStore((s) => s.status);
  const pendingEmail = useAuthStore((s) => s.pendingEmail);
  const error = useAuthStore((s) => s.error);
  const clearError = useAuthStore((s) => s.clearError);
  const signUp = useAuthStore((s) => s.signUp);
  const signIn = useAuthStore((s) => s.signIn);
  const verifyEmail = useAuthStore((s) => s.verifyEmail);
  const resendCode = useAuthStore((s) => s.resendCode);

  const [mode, setMode] = useState<Mode>(initialMode);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [info, setInfo] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    clearError();
    setInfo(null);
    setMode(pendingEmail ? "verify" : initialMode);
    if (pendingEmail) setEmail(pendingEmail);
  }, [open, initialMode, pendingEmail, clearError]);

  if (!open) return null;

  const ru = locale === "ru";
  const title =
    mode === "verify"
      ? ru
        ? "Код из письма"
        : "Enter email code"
      : mode === "login"
        ? ru
          ? "Вход"
          : "Sign in"
        : ru
          ? "Создать аккаунт"
          : "Create account";

  const subtitle =
    reason === "guest_limit"
      ? ru
        ? `Гостевой лимит — ${GUEST_MESSAGE_LIMIT} сообщений. Войди, чтобы продолжить и синхронизировать чаты.`
        : `Guest limit is ${GUEST_MESSAGE_LIMIT} messages. Sign in to continue and sync chats.`
      : ru
        ? "Аккаунт хранит чаты, память и настройки в облаке."
        : "Your account syncs chats, memory, and settings to the cloud.";

  const submit = async () => {
    setBusy(true);
    setInfo(null);
    clearError();
    try {
      if (mode === "register") {
        const res = await signUp(email, password);
        if (res.needsVerification) {
          setMode("verify");
          setInfo(ru ? "Код отправлен на почту." : "Verification code sent to your email.");
        } else {
          await fullSync("home").catch(() => null);
          onClose();
        }
      } else if (mode === "login") {
        await signIn(email, password);
        await fullSync("home").catch(() => null);
        onClose();
      } else {
        await verifyEmail(email, code);
        await fullSync("home").catch(() => null);
        onClose();
      }
    } catch {
      /* error in store */
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/40 p-4">
      <div className="relative w-full max-w-md rounded-2xl border border-[var(--border)] bg-[var(--bg-elevated)] p-5 shadow-xl">
        <button
          type="button"
          className="absolute right-3 top-3 rounded-lg p-1.5 text-[var(--fg-muted)] hover:bg-[var(--bg-hover)]"
          onClick={onClose}
        >
          <X size={16} />
        </button>

        <h2 className="pr-8 text-[18px] font-semibold tracking-tight">{title}</h2>
        <p className="mt-1.5 text-[13px] leading-relaxed text-[var(--fg-muted)]">{subtitle}</p>

        {status === "unavailable" && (
          <p className="mt-3 rounded-xl bg-[var(--bg)] px-3 py-2 text-[12.5px] text-[var(--danger)]">
            {ru
              ? "Supabase не настроен (нет VITE_SUPABASE_URL)."
              : "Supabase is not configured (missing VITE_SUPABASE_URL)."}
          </p>
        )}

        <div className="mt-4 space-y-3">
          {(mode === "login" || mode === "register" || mode === "verify") && (
            <label className="block">
              <span className="mb-1 block text-[12px] text-[var(--fg-faint)]">Email</span>
              <input
                type="email"
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full rounded-xl border border-[var(--border)] bg-[var(--bg)] px-3 py-2 text-[13.5px] outline-none focus:border-[var(--accent)]"
              />
            </label>
          )}

          {(mode === "login" || mode === "register") && (
            <label className="block">
              <span className="mb-1 block text-[12px] text-[var(--fg-faint)]">
                {ru ? "Пароль" : "Password"}
              </span>
              <input
                type="password"
                autoComplete={mode === "login" ? "current-password" : "new-password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full rounded-xl border border-[var(--border)] bg-[var(--bg)] px-3 py-2 text-[13.5px] outline-none focus:border-[var(--accent)]"
              />
            </label>
          )}

          {mode === "verify" && (
            <label className="block">
              <span className="mb-1 block text-[12px] text-[var(--fg-faint)]">
                {ru ? "Код из письма" : "Code from email"}
              </span>
              <input
                inputMode="numeric"
                autoComplete="one-time-code"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                placeholder="123456"
                className="w-full rounded-xl border border-[var(--border)] bg-[var(--bg)] px-3 py-2 font-[family-name:var(--font-mono)] text-[15px] tracking-[0.2em] outline-none focus:border-[var(--accent)]"
              />
            </label>
          )}
        </div>

        {(error || info) && (
          <p
            className={cn(
              "mt-3 text-[12.5px]",
              error ? "text-[var(--danger)]" : "text-[var(--accent)]",
            )}
          >
            {error || info}
          </p>
        )}

        <button
          type="button"
          disabled={busy || status === "unavailable"}
          onClick={() => void submit()}
          className="mt-4 w-full rounded-xl bg-[var(--fg)] px-3 py-2.5 text-[13.5px] font-medium text-[var(--bg)] disabled:opacity-50"
        >
          {busy
            ? ru
              ? "Секунду…"
              : "Working…"
            : mode === "verify"
              ? ru
                ? "Подтвердить"
                : "Verify"
              : mode === "login"
                ? ru
                  ? "Войти"
                  : "Sign in"
                : ru
                  ? "Зарегистрироваться"
                  : "Sign up"}
        </button>

        <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12.5px] text-[var(--fg-muted)]">
          {mode === "verify" ? (
            <button
              type="button"
              className="hover:text-[var(--fg)]"
              onClick={() => void resendCode(email).then(() => setInfo(ru ? "Код отправлен ещё раз." : "Code resent."))}
            >
              {ru ? "Отправить код снова" : "Resend code"}
            </button>
          ) : mode === "login" ? (
            <button type="button" className="hover:text-[var(--fg)]" onClick={() => setMode("register")}>
              {ru ? "Нет аккаунта? Создать" : "Need an account? Sign up"}
            </button>
          ) : (
            <button type="button" className="hover:text-[var(--fg)]" onClick={() => setMode("login")}>
              {ru ? "Уже есть аккаунт? Войти" : "Have an account? Sign in"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
