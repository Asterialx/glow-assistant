import { useEffect, useState, type ReactNode, type FormEvent } from "react";
import { betaAuthEnabled, loadAccount, supabase, type Access, type Profile } from "./client";
import { validateProfile } from "./profile";
import { AdminPanel } from "./AdminPanel";
import { accountStorage, setStorageOwner } from "./accountStorage";

export function AuthGate({ children }: { children: ReactNode }) {
  const [account, setAccount] = useState<{ access: Access; profile: Profile } | null>(null);
  const [loading, setLoading] = useState(betaAuthEnabled);
  const [error, setError] = useState("");
  const [email, setEmail] = useState("");
  const [token, setToken] = useState("");
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [name, setName] = useState("");
  const [age, setAge] = useState("");
  const [admin, setAdmin] = useState(false);
  const [notice, setNotice] = useState("");
  const [resendAt, setResendAt] = useState(0);
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    if (!sent) return;
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [sent]);

  useEffect(() => {
    if (!betaAuthEnabled || !supabase) { setLoading(false); return; }
    let alive = true;
    let revision = 0;
    const refresh = async () => {
      const request = ++revision;
      try {
        const { data: { session }, error } = await supabase!.auth.getSession();
        if (error) throw error;
        const next = session ? await loadAccount() : null;
        if (next && alive && request === revision) {
          setStorageOwner(next.access.user_id);
          accountStorage.setItem("glow.userName", next.profile.display_name);
        }
        if (alive && request === revision) { setAccount(next); setError(""); }
      } catch (e) {
        if (alive && request === revision) { setAccount(null); setError(e instanceof Error ? e.message : "Ошибка входа"); }
      } finally { if (alive && request === revision) setLoading(false); }
    };
    void refresh();
    // Do not await Supabase calls inside onAuthStateChange; defer outside its lock.
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === "TOKEN_REFRESHED") return;
      if (event === "SIGNED_OUT") { window.location.reload(); return; }
      setAccount(null);
      setLoading(true);
      setTimeout(() => { if (alive) void refresh(); }, 0);
    });
    return () => { alive = false; subscription.unsubscribe(); };
  }, []);

  if (!betaAuthEnabled) return children;
  const sendCode = async () => {
    if (!supabase) return;
    const { error } = await supabase.auth.signInWithOtp({ email: email.trim().toLowerCase(), options: { shouldCreateUser: false } });
    if (error) throw new Error("Не удалось отправить код. Проверьте приглашение и попробуйте позже.");
    setSent(true); setToken(""); setNow(Date.now()); setResendAt(Date.now() + 60000);
    setNotice("Письмо отправлено. Если его нет во входящих, проверьте папку «Спам».");
  };
  const resend = async () => {
    if (busy || Date.now() < resendAt) return;
    setBusy(true); setError("");
    try { await sendCode(); }
    catch (e) { setError(e instanceof Error ? e.message : "Не удалось отправить код."); }
    finally { setBusy(false); }
  };
  const signOut = async () => {
    setBusy(true); setError("");
    const result = await supabase?.auth.signOut({ scope: "local" });
    if (result?.error) { setError("Не удалось выйти. Попробуйте ещё раз."); setBusy(false); return; }
    // Remount stores and in-memory chat data rather than showing the previous session.
    window.location.reload();
  };
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!supabase || busy) return;
    setBusy(true); setError(""); setNotice("");
    try {
      if (account) {
        const values = validateProfile(name, age);
        const { error } = await supabase.from("glow_profiles").update(values).eq("user_id", account.access.user_id).select("user_id").single();
        if (error) throw error;
        accountStorage.setItem("glow.userName", values.display_name);
        setAccount(await loadAccount());
      } else if (!sent) {
        await sendCode();
      } else {
        const { error } = await supabase.auth.verifyOtp({ email: email.trim().toLowerCase(), token: token.trim(), type: "email" });
        if (error) throw new Error("Код неверен или истёк. Проверьте его или запросите новый.");
      }
    } catch (e) { setError(e instanceof Error ? e.message : "Не удалось выполнить действие."); }
    finally { setBusy(false); }
  };

  if (loading) return <div className="grid min-h-screen place-items-center bg-[var(--bg)] text-[var(--fg-muted)]" role="status">Проверяем доступ…</div>;
  if (account?.profile.onboarding_completed) return <div className="flex h-full min-h-0 flex-col">
    <div className="z-[100] m-2 flex shrink-0 self-end gap-1 rounded-xl border border-[var(--border)] bg-[var(--bg-elevated)] p-1 text-xs md:fixed md:right-4 md:top-12 md:m-0 md:gap-2">
      {account.access.role === "admin" && <button className="rounded-lg px-3 py-2 hover:bg-[var(--bg-hover)]" onClick={() => setAdmin(!admin)}>{admin ? "В чат" : "Администрирование"}</button>}
      <button className="rounded-lg px-3 py-2 hover:bg-[var(--bg-hover)]" disabled={busy} onClick={() => void signOut()}>Выйти</button>
    </div>
    {error && <p role="alert" className="fixed right-4 top-24 z-[101] bg-[var(--bg-elevated)] p-3">{error}</p>}
    <div className="min-h-0 flex-1">{admin ? <AdminPanel /> : children}</div>
  </div>;
  return <main className="grid min-h-screen place-items-center bg-[var(--bg)] px-4 text-[var(--fg)]">
    <form onSubmit={submit} className="w-full max-w-sm space-y-4 rounded-2xl border border-[var(--border)] bg-[var(--bg-elevated)] p-6">
      <div className="flex items-center justify-center gap-3 pb-3"><img src="/glow-mark.png" alt="" className="h-8 w-8 object-contain" /><span className="text-2xl font-semibold">Glow</span></div>
      <h1 className="text-xl font-semibold">{account ? "Давайте познакомимся" : sent ? "Проверьте почту" : "Добро пожаловать"}</h1>
      <p className="text-sm text-[var(--fg-muted)]">{account ? "Как к вам обращаться? Возраст можно не указывать." : sent ? `Введите код из письма, отправленного на ${email.trim()}.` : "Вход по приглашению. Укажите вашу почту — пароль не нужен."}</p>
      {account ? <>
        <label className="block text-sm">Как к вам обращаться?<input autoComplete="given-name" required maxLength={60} value={name} onChange={e => setName(e.target.value)} className="mt-1 w-full rounded-lg border border-[var(--border)] bg-[var(--bg)] p-3" /></label>
        <label className="block text-sm">Возраст — необязательно<input type="number" min={1} max={120} step={1} value={age} onChange={e => setAge(e.target.value)} className="mt-1 w-full rounded-lg border border-[var(--border)] bg-[var(--bg)] p-3" /></label>
      </> : <>
        {!sent && <label className="block text-sm">Ваша почта<input autoFocus type="email" autoComplete="email" required maxLength={254} value={email} onChange={e => setEmail(e.target.value)} className="mt-1 w-full rounded-lg border border-[var(--border)] bg-[var(--bg)] p-3" /></label>}
        {sent && <label className="block text-sm">Код из письма<input autoFocus autoComplete="one-time-code" inputMode="numeric" pattern="[0-9]{6,10}" minLength={6} maxLength={10} required value={token} onChange={e => setToken(e.target.value.replace(/\D/g, ""))} className="mt-1 w-full rounded-lg border border-[var(--border)] bg-[var(--bg)] p-3 text-center text-xl tracking-[0.3em]" /></label>}
      </>}
      {notice && <p role="status" className="text-sm text-[var(--fg-muted)]">{notice}</p>}
      {error && <p role="alert" className="text-sm text-red-400">{error}</p>}
      {!supabase && <p role="alert">Подключение Supabase не настроено.</p>}
      <button disabled={busy || !supabase} className="w-full rounded-xl bg-[var(--accent)] p-3 text-white disabled:opacity-50">{busy ? "Подождите…" : account ? "Открыть Glow" : sent ? "Войти" : "Продолжить"}</button>
      {sent && !account && <div className="flex justify-between gap-3 text-sm text-[var(--fg-muted)]">
        <button type="button" disabled={busy} onClick={() => { setSent(false); setToken(""); setNotice(""); setError(""); }}>Другая почта</button>
        <button type="button" disabled={busy || now < resendAt} onClick={() => void resend()} className="disabled:opacity-50">{now < resendAt ? `Повторить через ${Math.ceil((resendAt - now) / 1000)} с` : "Отправить ещё раз"}</button>
      </div>}
      {account && <button type="button" disabled={busy} onClick={() => void signOut()} className="text-sm text-[var(--fg-muted)]">Выйти</button>}
    </form>
  </main>;
}
