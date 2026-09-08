import { useEffect, useRef, useState, type KeyboardEvent, type ClipboardEvent } from "react";
import { Eye, EyeOff, Mail, X } from "lucide-react";
import { useAuthStore } from "../../stores/authStore";
import { useUiStore } from "../../stores/uiStore";
import { AUTH_EMAIL_OTP_ENABLED } from "../../lib/authFlags";
import { GUEST_MESSAGE_LIMIT } from "../../lib/supabase/trial";
import { syncAndHydrateWorkspace } from "../../lib/supabase/syncClient";
import { cn } from "../../lib/utils";

type Mode = "login" | "register" | "verify" | "profile";

type Props = {
  open: boolean;
  onClose: () => void;
  reason?: "guest_limit" | "manual";
  initialMode?: "login" | "register" | "verify";
};

const OTP_LEN = 6;

function PasswordField({
  label,
  value,
  onChange,
  autoComplete,
  show,
  onToggleShow,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  autoComplete: string;
  show: boolean;
  onToggleShow: () => void;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-[12px] text-[var(--fg-faint)]">{label}</span>
      <div className="relative">
        <input
          type={show ? "text" : "password"}
          autoComplete={autoComplete}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="w-full rounded-xl border border-[var(--border)] bg-[var(--bg)] py-2 pl-3 pr-10 text-[16px] outline-none focus:border-[var(--accent)] sm:text-[13.5px]"
        />
        <button
          type="button"
          tabIndex={-1}
          className="absolute right-2 top-1/2 -translate-y-1/2 rounded-lg p-1.5 text-[var(--fg-faint)] hover:bg-[var(--bg-hover)] hover:text-[var(--fg-muted)]"
          onClick={onToggleShow}
          aria-label={show ? "Hide password" : "Show password"}
        >
          {show ? <EyeOff size={16} /> : <Eye size={16} />}
        </button>
      </div>
    </label>
  );
}

function OtpBoxes({
  value,
  onChange,
  disabled,
}: {
  value: string;
  onChange: (next: string) => void;
  disabled?: boolean;
}) {
  const refs = useRef<Array<HTMLInputElement | null>>([]);
  const digits = Array.from({ length: OTP_LEN }, (_, i) => value[i] || "");

  const focusAt = (i: number) => {
    const el = refs.current[Math.max(0, Math.min(OTP_LEN - 1, i))];
    el?.focus();
    el?.select();
  };

  const setDigit = (index: number, raw: string) => {
    const only = raw.replace(/\D/g, "");
    if (!only) {
      const next = digits.map((d, i) => (i === index ? "" : d)).join("");
      onChange(next);
      return;
    }
    // Paste / multi-digit into one box
    if (only.length > 1) {
      const merged = (value.slice(0, index) + only).replace(/\D/g, "").slice(0, OTP_LEN);
      onChange(merged);
      focusAt(Math.min(OTP_LEN - 1, merged.length));
      return;
    }
    const nextDigits = [...digits];
    nextDigits[index] = only;
    const next = nextDigits.join("").slice(0, OTP_LEN);
    onChange(next);
    if (index < OTP_LEN - 1) focusAt(index + 1);
  };

  const onKeyDown = (index: number, e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Backspace") {
      e.preventDefault();
      if (digits[index]) {
        setDigit(index, "");
      } else if (index > 0) {
        focusAt(index - 1);
        setDigit(index - 1, "");
      }
      return;
    }
    if (e.key === "ArrowLeft" && index > 0) {
      e.preventDefault();
      focusAt(index - 1);
    }
    if (e.key === "ArrowRight" && index < OTP_LEN - 1) {
      e.preventDefault();
      focusAt(index + 1);
    }
  };

  const onPaste = (e: ClipboardEvent<HTMLInputElement>) => {
    e.preventDefault();
    const text = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, OTP_LEN);
    if (!text) return;
    onChange(text);
    focusAt(Math.min(OTP_LEN - 1, text.length));
  };

  return (
    <div className="flex justify-center gap-2 sm:gap-2.5">
      {digits.map((d, i) => (
        <input
          key={i}
          ref={(el) => {
            refs.current[i] = el;
          }}
          type="text"
          inputMode="numeric"
          autoComplete={i === 0 ? "one-time-code" : "off"}
          maxLength={1}
          disabled={disabled}
          value={d}
          onChange={(e) => setDigit(i, e.target.value)}
          onKeyDown={(e) => onKeyDown(i, e)}
          onPaste={onPaste}
          onFocus={(e) => e.target.select()}
          className={cn(
            "h-12 w-10 rounded-xl border bg-[var(--bg)] text-center font-[family-name:var(--font-mono)] text-[20px] font-semibold tracking-wide outline-none transition sm:h-14 sm:w-11 sm:text-[22px]",
            d
              ? "border-[var(--accent)] text-[var(--fg)]"
              : "border-[var(--border)] text-[var(--fg)]",
            "focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent)]/25",
            disabled && "opacity-50",
          )}
          aria-label={`Digit ${i + 1}`}
        />
      ))}
    </div>
  );
}

export function AuthModal({ open, onClose, reason = "manual", initialMode = "register" }: Props) {
  const locale = useUiStore((s) => s.locale);
  const setUserName = useUiStore((s) => s.setUserName);
  const status = useAuthStore((s) => s.status);
  const pendingEmail = useAuthStore((s) => s.pendingEmail);
  const error = useAuthStore((s) => s.error);
  const clearError = useAuthStore((s) => s.clearError);
  const signUp = useAuthStore((s) => s.signUp);
  const signIn = useAuthStore((s) => s.signIn);
  const verifyEmail = useAuthStore((s) => s.verifyEmail);
  const resendCode = useAuthStore((s) => s.resendCode);
  const completeProfile = useAuthStore((s) => s.completeProfile);

  const [mode, setMode] = useState<Mode>(initialMode);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [password2, setPassword2] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showPassword2, setShowPassword2] = useState(false);
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [age, setAge] = useState("");
  const [localError, setLocalError] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [info, setInfo] = useState<string | null>(null);
  const [resendIn, setResendIn] = useState(0);
  const autoSubmitRef = useRef<string | null>(null);

  const startResendCooldown = (seconds = 60) => {
    setResendIn(seconds);
  };

  const goToProfile = () => {
    setFirstName("");
    setLastName("");
    setAge("");
    setInfo(null);
    setLocalError(null);
    setMode("profile");
  };

  useEffect(() => {
    if (!open) return;
    clearError();
    setInfo(null);
    setLocalError(null);
    setPassword2("");
    setCode("");
    setFirstName("");
    setLastName("");
    setAge("");
    setShowPassword(false);
    setShowPassword2(false);
    autoSubmitRef.current = null;
    setResendIn(0);
    setMode(pendingEmail && AUTH_EMAIL_OTP_ENABLED ? "verify" : initialMode);
    if (pendingEmail && AUTH_EMAIL_OTP_ENABLED) {
      setEmail(pendingEmail);
      startResendCooldown(60);
    }
  }, [open, initialMode, pendingEmail, clearError]);

  useEffect(() => {
    if (resendIn <= 0) return;
    const id = window.setTimeout(() => setResendIn((s) => s - 1), 1000);
    return () => window.clearTimeout(id);
  }, [resendIn]);

  const ru = locale === "ru";

  const finishAuth = async () => {
    await syncAndHydrateWorkspace("home").catch(() => null);
    onClose();
  };

  const runVerify = async (token: string) => {
    setBusy(true);
    setInfo(null);
    setLocalError(null);
    clearError();
    try {
      await verifyEmail(email, token);
      goToProfile();
    } catch {
      /* store error */
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    if (!open || mode !== "verify") return;
    if (code.length !== OTP_LEN) return;
    if (busy) return;
    if (autoSubmitRef.current === code) return;
    autoSubmitRef.current = code;
    void runVerify(code);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [code, mode, open]);

  if (!open) return null;

  const title =
    mode === "profile"
      ? ru
        ? "О себе"
        : "About you"
      : mode === "verify"
        ? ru
          ? "Проверка почты"
          : "Verify email"
        : mode === "login"
          ? ru
            ? "Вход"
            : "Sign in"
          : ru
            ? "Создать аккаунт"
            : "Create account";

  const subtitle =
    mode === "profile"
      ? ru
        ? "Имя и возраст помогут персонализировать Glow."
        : "Name and age help personalize Glow."
      : mode === "verify"
        ? ru
          ? `Мы отправили 6-значный код на ${email}. Ссылку в письме не открывай — введи только код.`
          : `We sent a 6-digit code to ${email}. Don’t open the link — enter the code only.`
        : reason === "guest_limit"
          ? ru
            ? `Гостевой лимит — ${GUEST_MESSAGE_LIMIT} сообщений. Войди, чтобы продолжить и синхронизировать чаты.`
            : `Guest limit is ${GUEST_MESSAGE_LIMIT} messages. Sign in to continue and sync chats.`
          : ru
            ? "Аккаунт хранит чаты, память и настройки в облаке."
            : "Your account syncs chats, memory, and settings to the cloud.";

  const submit = async () => {
    setBusy(true);
    setInfo(null);
    setLocalError(null);
    clearError();
    try {
      if (mode === "register") {
        if (password.length < 6) {
          setLocalError(ru ? "Пароль минимум 6 символов." : "Password must be at least 6 characters.");
          return;
        }
        if (password !== password2) {
          setLocalError(ru ? "Пароли не совпадают." : "Passwords do not match.");
          return;
        }
        const res = await signUp(email, password);
        if (res.needsVerification) {
          if (!AUTH_EMAIL_OTP_ENABLED) {
            setLocalError(
              ru
                ? "Почту подтверждать сейчас не нужно. В Supabase выключи Confirm email (Authentication → Providers → Email), затем зарегистрируйся снова."
                : "Email codes are temporarily off. In Supabase turn Confirm email OFF (Authentication → Providers → Email), then sign up again.",
            );
            return;
          }
          setCode("");
          autoSubmitRef.current = null;
          setMode("verify");
          startResendCooldown(60);
          setInfo(ru ? "Код отправлен на почту." : "Verification code sent to your email.");
        } else {
          goToProfile();
        }
      } else if (mode === "login") {
        await signIn(email, password);
        await finishAuth();
      } else if (mode === "profile") {
        const first = firstName.trim();
        const last = lastName.trim();
        const ageNum = Number(age);
        if (!first || !last) {
          setLocalError(ru ? "Укажи имя и фамилию." : "Enter first and last name.");
          return;
        }
        if (!Number.isFinite(ageNum) || ageNum < 13 || ageNum > 120) {
          setLocalError(ru ? "Возраст: от 13 до 120." : "Age must be between 13 and 120.");
          return;
        }
        await completeProfile({ firstName: first, lastName: last, age: Math.round(ageNum) });
        setUserName(`${first} ${last}`.trim());
        await finishAuth();
      } else {
        if (code.length !== OTP_LEN) {
          setLocalError(ru ? "Введи все 6 цифр кода." : "Enter all 6 digits.");
          return;
        }
        await runVerify(code);
        return;
      }
    } catch {
      /* error in store */
    } finally {
      setBusy(false);
    }
  };

  const shownError = localError || error;
  const hideFooterSwitch = mode === "verify" || mode === "profile";

  return (
    <div className="fixed inset-0 z-[80] flex items-end justify-center overflow-y-auto bg-black/40 p-0 backdrop-blur-[2px] sm:items-center sm:p-4">
      <div
        className={cn(
          "relative w-full overflow-y-auto rounded-t-2xl border border-[var(--border)] bg-[var(--bg-elevated)] shadow-xl sm:rounded-2xl",
          mode === "verify" || mode === "profile" ? "max-w-[420px] p-6" : "max-w-md p-5",
          "max-h-[min(92dvh,920px)] pb-[max(1rem,env(safe-area-inset-bottom))]",
        )}
      >
        <button
          type="button"
          className="absolute right-3 top-3 rounded-lg p-1.5 text-[var(--fg-muted)] hover:bg-[var(--bg-hover)]"
          onClick={onClose}
        >
          <X size={16} />
        </button>

        {mode === "verify" ? (
          <div className="mb-5 flex flex-col items-center text-center">
            <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-[var(--accent-soft)] text-[var(--accent)]">
              <Mail size={22} />
            </div>
            <h2 className="text-[18px] font-semibold tracking-tight">{title}</h2>
            <p className="mt-2 max-w-[34ch] text-[13px] leading-relaxed text-[var(--fg-muted)]">
              {subtitle}
            </p>
          </div>
        ) : (
          <>
            <h2 className="pr-8 text-[18px] font-semibold tracking-tight">{title}</h2>
            <p className="mt-1.5 text-[13px] leading-relaxed text-[var(--fg-muted)]">{subtitle}</p>
          </>
        )}

        {status === "unavailable" && (
          <p className="mt-3 rounded-xl bg-[var(--bg)] px-3 py-2 text-[12.5px] text-[var(--danger)]">
            {ru
              ? "Supabase не настроен (нет VITE_SUPABASE_URL)."
              : "Supabase is not configured (missing VITE_SUPABASE_URL)."}
          </p>
        )}

        <div className={cn("space-y-3", mode === "verify" ? "mt-1" : "mt-4")}>
          {(mode === "login" || mode === "register") && (
            <label className="block">
              <span className="mb-1 block text-[12px] text-[var(--fg-faint)]">Email</span>
              <input
                type="email"
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full rounded-xl border border-[var(--border)] bg-[var(--bg)] px-3 py-2 text-[16px] outline-none focus:border-[var(--accent)] sm:text-[13.5px]"
              />
            </label>
          )}

          {(mode === "login" || mode === "register") && (
            <PasswordField
              label={ru ? "Пароль" : "Password"}
              value={password}
              onChange={setPassword}
              autoComplete={mode === "login" ? "current-password" : "new-password"}
              show={showPassword}
              onToggleShow={() => setShowPassword((v) => !v)}
            />
          )}

          {mode === "register" && (
            <PasswordField
              label={ru ? "Повторите пароль" : "Repeat password"}
              value={password2}
              onChange={setPassword2}
              autoComplete="new-password"
              show={showPassword2}
              onToggleShow={() => setShowPassword2((v) => !v)}
            />
          )}

          {mode === "profile" && (
            <>
              <div className="grid grid-cols-2 gap-3">
                <label className="block">
                  <span className="mb-1 block text-[12px] text-[var(--fg-faint)]">
                    {ru ? "Имя" : "First name"}
                  </span>
                  <input
                    type="text"
                    autoComplete="given-name"
                    value={firstName}
                    onChange={(e) => setFirstName(e.target.value)}
                    className="w-full rounded-xl border border-[var(--border)] bg-[var(--bg)] px-3 py-2 text-[16px] outline-none focus:border-[var(--accent)] sm:text-[13.5px]"
                  />
                </label>
                <label className="block">
                  <span className="mb-1 block text-[12px] text-[var(--fg-faint)]">
                    {ru ? "Фамилия" : "Last name"}
                  </span>
                  <input
                    type="text"
                    autoComplete="family-name"
                    value={lastName}
                    onChange={(e) => setLastName(e.target.value)}
                    className="w-full rounded-xl border border-[var(--border)] bg-[var(--bg)] px-3 py-2 text-[16px] outline-none focus:border-[var(--accent)] sm:text-[13.5px]"
                  />
                </label>
              </div>
              <label className="block">
                <span className="mb-1 block text-[12px] text-[var(--fg-faint)]">
                  {ru ? "Возраст" : "Age"}
                </span>
                <input
                  type="number"
                  inputMode="numeric"
                  min={13}
                  max={120}
                  value={age}
                  onChange={(e) => setAge(e.target.value)}
                  className="w-full rounded-xl border border-[var(--border)] bg-[var(--bg)] px-3 py-2 text-[16px] outline-none focus:border-[var(--accent)] sm:text-[13.5px]"
                />
              </label>
            </>
          )}

          {mode === "verify" && (
            <div className="space-y-3">
              <OtpBoxes
                value={code}
                disabled={busy}
                onChange={(next) => {
                  setLocalError(null);
                  clearError();
                  setCode(next);
                }}
              />
              <p className="text-center text-[11.5px] text-[var(--fg-faint)]">
                {ru ? "Можно вставить код из буфера целиком" : "You can paste the whole code"}
              </p>
            </div>
          )}
        </div>

        {(shownError || info) && (
          <p
            className={cn(
              "mt-3 text-[12.5px]",
              mode === "verify" && "text-center",
              shownError ? "text-[var(--danger)]" : "text-[var(--accent)]",
            )}
          >
            {shownError || info}
          </p>
        )}

        <button
          type="button"
          disabled={busy || status === "unavailable" || (mode === "verify" && code.length !== OTP_LEN)}
          onClick={() => void submit()}
          className="mt-4 w-full rounded-xl bg-[var(--fg)] px-3 py-2.5 text-[13.5px] font-medium text-[var(--bg)] disabled:opacity-50"
        >
          {busy
            ? ru
              ? "Секунду…"
              : "Working…"
            : mode === "profile"
              ? ru
                ? "Готово"
                : "Continue"
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

        <div
          className={cn(
            "mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12.5px] text-[var(--fg-muted)]",
            hideFooterSwitch && "justify-center",
          )}
        >
          {mode === "verify" ? (
            <button
              type="button"
              disabled={busy || resendIn > 0}
              className="disabled:cursor-not-allowed disabled:opacity-50 hover:enabled:text-[var(--fg)]"
              onClick={() => {
                if (resendIn > 0 || busy) return;
                setBusy(true);
                setInfo(null);
                setLocalError(null);
                clearError();
                void resendCode(email)
                  .then(() => {
                    setCode("");
                    autoSubmitRef.current = null;
                    startResendCooldown(60);
                    setInfo(ru ? "Код отправлен ещё раз." : "Code resent.");
                  })
                  .catch(() => {
                    /* store error */
                  })
                  .finally(() => setBusy(false));
              }}
            >
              {resendIn > 0
                ? ru
                  ? `Отправить снова через ${resendIn} с`
                  : `Resend in ${resendIn}s`
                : ru
                  ? "Отправить код снова"
                  : "Resend code"}
            </button>
          ) : mode === "profile" ? (
            <button
              type="button"
              className="hover:text-[var(--fg)]"
              disabled={busy}
              onClick={() => void finishAuth()}
            >
              {ru ? "Пропустить" : "Skip for now"}
            </button>
          ) : mode === "login" ? (
            <button
              type="button"
              className="hover:text-[var(--fg)]"
              onClick={() => {
                setMode("register");
                setLocalError(null);
              }}
            >
              {ru ? "Нет аккаунта? Создать" : "Need an account? Sign up"}
            </button>
          ) : (
            <button
              type="button"
              className="hover:text-[var(--fg)]"
              onClick={() => {
                setMode("login");
                setLocalError(null);
              }}
            >
              {ru ? "Уже есть аккаунт? Войти" : "Have an account? Sign in"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
