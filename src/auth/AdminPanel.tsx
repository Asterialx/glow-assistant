import { useEffect, useRef, useState, type FormEvent } from "react";
import { ArrowLeft, ArrowUpRight, Ban, Check, Search, Shield, UserRound, Users } from "lucide-react";
import { supabase } from "./client";
import { UserUsageDetail, type TokenEntry } from "./UserUsageDetail";

interface Member { user_id: string; email: string; role: string; active: boolean; balance: number; granted: number; used: number }
interface Invitation { email: string; claimed_by: string | null; expires_at: string }

export function AdminPanel() {
  const [members, setMembers] = useState<Member[]>([]);
  const [invites, setInvites] = useState<Invitation[]>([]);
  const [usage, setUsage] = useState<TokenEntry[]>([]);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  const [email, setEmail] = useState("");
  const [credits, setCredits] = useState("0");
  const [target, setTarget] = useState("");
  const [amount, setAmount] = useState("100000");
  const [reason, setReason] = useState("Тестовый лимит");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const creditRequest = useRef<{ fingerprint: string; id: string } | null>(null);

  const refresh = async () => {
    if (!supabase) throw new Error("Supabase не настроен");
    const [people, pending, wallets, requests] = await Promise.all([
      supabase.rpc("glow_admin_members"),
      supabase.from("glow_invites").select("email,claimed_by,expires_at").order("created_at", { ascending: false }),
      supabase.from("glow_token_wallets").select("user_id,granted,used"),
      supabase.from("glow_token_requests").select("id,user_id,model,input_tokens,output_tokens,total_tokens,cost_usd,status,reserved,created_at,finished_at").order("created_at", { ascending: false }).limit(200),
    ]);
    if (people.error || pending.error || wallets.error || requests.error) throw new Error("Не удалось загрузить админку. Проверьте права и настройку базы токенов.");
    const walletByUser = new Map((wallets.data ?? []).map(w => [w.user_id, w]));
    setMembers((people.data ?? []).map((member: Member) => {
      const wallet = walletByUser.get(member.user_id);
      const granted = Number(wallet?.granted ?? 0);
      const used = Number(wallet?.used ?? 0);
      return { ...member, granted, used, balance: Math.max(0, granted - used) };
    }));
    setInvites(pending.data ?? []);
    setUsage((requests.data ?? []) as TokenEntry[]);
  };
  useEffect(() => { void refresh().catch(e => setStatus(e.message)); }, []);
  const perform = async (action: () => Promise<void>) => {
    if (busy) return;
    setBusy(true); setStatus("");
    try { await action(); await refresh(); }
    catch (e) { setStatus(e instanceof Error ? e.message : "Операция не выполнена"); }
    finally { setBusy(false); }
  };
  const resendInvite = (address: string) => void perform(async () => {
    const { data: { session } } = await supabase!.auth.getSession();
    if (!session) throw new Error("Сессия истекла. Войдите снова.");
    const response = await fetch("/api/invite", {
      method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` },
      body: JSON.stringify({ email: address, action: "resend" }),
    });
    const result = await response.json().catch(() => null);
    if (!response.ok) throw new Error(result?.message || "Не удалось отправить письмо повторно.");
    setStatus(result.message);
  });
  const invite = (event: FormEvent) => {
    event.preventDefault();
    void perform(async () => {
      const value = Number(credits);
      if (!Number.isSafeInteger(value) || value < 0 || value > 1000000) throw new Error("Лимит должен быть целым числом от 0 до 1 000 000.");
      const { data: { session } } = await supabase!.auth.getSession();
      if (!session) throw new Error("Сессия истекла. Войдите снова.");
      const response = await fetch("/api/invite", {
        method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({ email: email.trim().toLowerCase(), credits: value }),
      });
      const result = await response.json().catch(() => null);
      if (!response.ok) throw new Error(result?.message || "Сервер приглашений не ответил. Попробуйте ещё раз.");
      setStatus(result?.message || "Приглашение отправлено."); setEmail("");
    });
  };
  const credit = (event: FormEvent) => {
    event.preventDefault();
    void perform(async () => {
      const value = Number(amount);
      if (!target || !Number.isSafeInteger(value) || value < 1 || value > 1000000 || !reason.trim()) throw new Error("Выберите пользователя, сумму и причину начисления.");
      const fingerprint = JSON.stringify([target, value, reason.trim()]);
      if (creditRequest.current?.fingerprint !== fingerprint) creditRequest.current = { fingerprint, id: crypto.randomUUID() };
      const { error } = await supabase!.rpc("glow_admin_token_grant", { p_user: target, p_amount: value, p_reason: reason.trim(), p_request: creditRequest.current.id });
      if (error) throw new Error("Не удалось подтвердить начисление. Повтор с теми же данными безопасен.");
      creditRequest.current = null; setStatus("Токены начислены.");
    });
  };
  const inputClass = "w-full rounded-xl border border-[var(--border)] bg-[var(--bg)] px-3 py-2.5 text-sm outline-none transition focus:border-[var(--accent)]";
  const buttonClass = "inline-flex items-center justify-center gap-2 rounded-xl border border-[var(--border)] px-3 py-2 text-sm transition hover:bg-[var(--bg-hover)] disabled:opacity-50";
  const selected = members.find(member => member.user_id === selectedId);
  const filteredMembers = members.filter(member => member.email.toLowerCase().includes(search.trim().toLowerCase()));
  const initials = (value: string) => value.split("@")[0].split(/[._-]/).filter(Boolean).slice(0, 2).map(part => part[0]?.toUpperCase()).join("") || "U";

  return <section className="-mr-4 text-[var(--fg)]">
    <div className="mx-auto max-w-5xl space-y-6">
      {selected ? <>
        <button type="button" onClick={() => setSelectedId(null)} className={`${buttonClass} -ml-2 border-transparent`}><ArrowLeft size={16} /> Все пользователи</button>
        <UserUsageDetail key={selected.user_id} member={selected} onAccessChange={active => void perform(async () => {
          const { error } = await supabase!.rpc("glow_admin_access", { p_user: selected.user_id, p_active: active });
          if (error) throw new Error("Не удалось изменить доступ.");
          setStatus(active ? "Доступ восстановлен." : "Доступ заблокирован.");
        })} busy={busy} />
      </> : <>
        <header className="flex flex-wrap items-end justify-between gap-3">
          <div><p className="text-xs font-medium uppercase tracking-[0.16em] text-[var(--fg-muted)]">Glow · панель управления</p><h1 className="mt-1 text-2xl font-semibold">Администрирование</h1></div>
          <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-elevated)] px-4 py-2.5 text-sm"><span className="text-[var(--fg-muted)]">Пользователей</span><strong className="ml-3 tabular-nums">{members.length}</strong></div>
        </header>
        <p className="-mt-3 text-sm leading-relaxed text-[var(--fg-muted)]">Лимиты считаются напрямую в токенах входа и ответа. Стоимость API показывается по фактическим данным провайдера.</p>
        {status && <p role="status" className="rounded-xl border border-[var(--border)] bg-[var(--bg-elevated)] p-3 text-sm">{status}</p>}

        <div className="grid gap-4 lg:grid-cols-2">
          <form onSubmit={invite} className="space-y-3 rounded-2xl border border-[var(--border)] bg-[var(--bg-elevated)] p-4">
            <h2 className="flex items-center gap-2 font-medium"><Users size={17} className="text-[var(--accent)]" /> Пригласить пользователя</h2>
            <label className="block space-y-1.5 text-xs text-[var(--fg-muted)]">Email<input type="email" required value={email} onChange={e => setEmail(e.target.value)} className={inputClass} /></label>
            <label className="block space-y-1.5 text-xs text-[var(--fg-muted)]">Начальный лимит в токенах<input type="number" min={0} max={1000000} step={1} required value={credits} onChange={e => setCredits(e.target.value)} className={inputClass} /></label>
            <button disabled={busy} className={buttonClass}>Отправить приглашение <ArrowUpRight size={15} /></button>
          </form>
          <form onSubmit={credit} className="space-y-3 rounded-2xl border border-[var(--border)] bg-[var(--bg-elevated)] p-4">
            <h2 className="flex items-center gap-2 font-medium"><Shield size={17} className="text-[var(--accent)]" /> Начислить токены</h2>
            <label className="block space-y-1.5 text-xs text-[var(--fg-muted)]">Пользователь<select required value={target} onChange={e => setTarget(e.target.value)} className={inputClass}><option value="">Выберите пользователя</option>{members.map(m => <option key={m.user_id} value={m.user_id}>{m.email}</option>)}</select></label>
            <div className="grid grid-cols-2 gap-3">
              <label className="block space-y-1.5 text-xs text-[var(--fg-muted)]">Количество<input type="number" required min={1} max={1000000} step={1} value={amount} onChange={e => setAmount(e.target.value)} className={inputClass} /></label>
              <label className="block space-y-1.5 text-xs text-[var(--fg-muted)]">Причина<input required maxLength={240} value={reason} onChange={e => setReason(e.target.value)} className={inputClass} /></label>
            </div>
            <button disabled={busy} className={buttonClass}>Начислить <Check size={15} /></button>
          </form>
        </div>

        <section className="space-y-3">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div><h2 className="text-lg font-semibold">Пользователи</h2><p className="mt-0.5 text-xs text-[var(--fg-muted)]">Откройте профиль, чтобы посмотреть расходы, модели и активность.</p></div>
            <label className="relative block w-full sm:w-64"><Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[var(--fg-muted)]" /><input aria-label="Поиск пользователей" placeholder="Найти по email" value={search} onChange={e => setSearch(e.target.value)} className={`${inputClass} pl-9`} /></label>
          </div>
          <div className="overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--bg-elevated)]">
            {filteredMembers.length === 0 ? <p className="p-6 text-center text-sm text-[var(--fg-muted)]">{members.length ? "Совпадений не найдено." : "Пользователей пока нет."}</p> : filteredMembers.map((member, index) => {
              const percent = member.granted > 0 ? Math.min(100, member.used / member.granted * 100) : 0;
              return <div key={member.user_id} className={`flex flex-wrap items-center gap-3 p-3.5 sm:p-4 ${index ? "border-t border-[var(--border)]" : ""}`}>
                <div className="grid size-10 shrink-0 place-items-center rounded-full bg-[var(--accent)]/10 text-sm font-semibold text-[var(--accent)]">{initials(member.email)}</div>
                <div className="min-w-0 flex-1"><p className="truncate text-sm font-medium">{member.email}</p><p className="mt-0.5 flex items-center gap-1.5 text-xs text-[var(--fg-muted)]">{member.role === "admin" ? <Shield size={12} /> : <UserRound size={12} />}{member.role === "admin" ? "Администратор" : "Участник"}<span>·</span><span className={member.active ? "text-emerald-500" : "text-rose-400"}>{member.active ? "Активен" : "Доступ закрыт"}</span></p></div>
                <div className="w-36 shrink-0 sm:w-48"><div className="flex justify-between text-[11px]"><span className="text-[var(--fg-muted)]">Лимит</span><span className="tabular-nums">{member.granted ? `${percent.toLocaleString("ru-RU", { maximumFractionDigits: 1 })}%` : "Не назначен"}</span></div><div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-[var(--bg)]"><div className="h-full rounded-full bg-[var(--accent)]" style={{ width: `${percent}%` }} /></div></div>
                <button type="button" onClick={() => { setSelectedId(member.user_id); setStatus(""); }} className={`${buttonClass} ml-auto`} aria-label={`Открыть профиль ${member.email}`}><span className="hidden sm:inline">Открыть</span><ArrowUpRight size={15} /></button>
                {member.role !== "admin" && <button type="button" disabled={busy} onClick={() => void perform(async () => {
                  const { error } = await supabase!.rpc("glow_admin_access", { p_user: member.user_id, p_active: !member.active });
                  if (error) throw new Error("Не удалось изменить доступ.");
                  setStatus(member.active ? "Доступ заблокирован." : "Доступ восстановлен.");
                })} className={`${buttonClass} px-2.5`} aria-label={member.active ? `Заблокировать ${member.email}` : `Разблокировать ${member.email}`} title={member.active ? "Заблокировать" : "Разблокировать"}>{member.active ? <Ban size={15} /> : <Check size={15} />}</button>}
              </div>;
            })}
          </div>
        </section>

        <section className="space-y-3">
          <div><h2 className="text-lg font-semibold">Приглашения</h2><p className="mt-0.5 text-xs text-[var(--fg-muted)]">Повторная отправка сохраняет лимит. Если аккаунт подтверждён, приходит ссылка входа.</p></div>
          <div className="divide-y divide-[var(--border)] overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--bg-elevated)]">
            {invites.length === 0 && <p className="p-4 text-sm text-[var(--fg-muted)]">Приглашений пока нет.</p>}
            {invites.map(i => <div key={i.email} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 text-sm"><span className="break-all">{i.email}</span><span className="text-xs text-[var(--fg-muted)]">{i.claimed_by ? "Аккаунт создан" : new Date(i.expires_at).getTime() > Date.now() ? "Ожидает входа" : "Истекло"}</span><button type="button" disabled={busy} onClick={() => resendInvite(i.email)} className={buttonClass} aria-label={`Отправить снова ${i.email}`}>Отправить снова <ArrowUpRight size={15} /></button></div>)}
          </div>
        </section>
      </>}
    </div>
  </section>;
}
