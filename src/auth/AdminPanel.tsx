import { useEffect, useRef, useState, type FormEvent } from "react";
import { supabase } from "./client";

interface Member { user_id: string; email: string; role: string; active: boolean; balance: number }
interface Invitation { email: string; claimed_by: string | null; expires_at: string }

export function AdminPanel() {
  const [members, setMembers] = useState<Member[]>([]);
  const [invites, setInvites] = useState<Invitation[]>([]);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  const [email, setEmail] = useState("");
  const [credits, setCredits] = useState("0");
  const [target, setTarget] = useState("");
  const [amount, setAmount] = useState("100");
  const [reason, setReason] = useState("Тестовый лимит");
  const creditRequest = useRef<{ fingerprint: string; id: string } | null>(null);
  const refresh = async () => {
    if (!supabase) throw new Error("Supabase не настроен");
    const [people, pending] = await Promise.all([
      supabase.rpc("glow_admin_members"),
      supabase.from("glow_invites").select("email,claimed_by,expires_at").order("created_at", { ascending: false }),
    ]);
    if (people.error || pending.error) throw new Error("Не удалось загрузить админку. Проверьте права и настройку базы.");
    setMembers(people.data ?? []); setInvites(pending.data ?? []);
  };
  useEffect(() => { void refresh().catch(e => setStatus(e.message)); }, []);
  const perform = async (action: () => Promise<void>) => {
    if (busy) return;
    setBusy(true); setStatus("");
    try { await action(); await refresh(); }
    catch (e) { setStatus(e instanceof Error ? e.message : "Операция не выполнена"); }
    finally { setBusy(false); }
  };
  const invite = (event: FormEvent) => {
    event.preventDefault();
    void perform(async () => {
      const value = Number(credits);
      if (!Number.isSafeInteger(value) || value < 0 || value > 1000000) throw new Error("Лимит должен быть целым числом от 0 до 1 000 000.");
      const { error } = await supabase!.functions.invoke("glow-invite", { body: { email: email.trim().toLowerCase(), credits: value } });
      if (error) throw new Error("Приглашение не подтверждено. Проверьте журнал приглашений: серверная функция и SMTP должны быть настроены. Повтор не увеличивает лимит.");
      setStatus("Приглашение отправлено."); setEmail("");
    });
  };
  const credit = (event: FormEvent) => {
    event.preventDefault();
    void perform(async () => {
      const value = Number(amount);
      if (!target || !Number.isSafeInteger(value) || value < 1 || value > 1000000 || !reason.trim()) throw new Error("Выберите пользователя, сумму и причину начисления.");
      const fingerprint = JSON.stringify([target, value, reason.trim()]);
      if (creditRequest.current?.fingerprint !== fingerprint) creditRequest.current = { fingerprint, id: crypto.randomUUID() };
      const { error } = await supabase!.rpc("glow_admin_credit", { p_user: target, p_amount: value, p_reason: reason.trim(), p_request: creditRequest.current.id });
      if (error) throw new Error("Не удалось подтвердить начисление. Повтор с теми же данными безопасен.");
      creditRequest.current = null; setStatus("Кредиты начислены.");
    });
  };
  const inputClass = "w-full rounded-lg border border-[var(--border)] bg-[var(--bg)] p-3 text-sm";
  const buttonClass = "rounded-lg border border-[var(--border)] px-3 py-2 text-sm hover:bg-[var(--bg-hover)] disabled:opacity-50";
  return <main className="min-h-screen bg-[var(--bg)] px-4 py-24 text-[var(--fg)]">
    <div className="mx-auto max-w-3xl space-y-6">
      <h1 className="text-2xl font-semibold">Администрирование Glow</h1>
      <p className="text-sm text-[var(--fg-muted)]">Кредиты — внутренний тестовый лимит, не баланс провайдера. Автоматическое списание за AI-запросы пока не подключено.</p>
      {status && <p role="status" className="rounded-lg border border-[var(--border)] p-3 text-sm">{status}</p>}
      <form onSubmit={invite} className="space-y-3 rounded-xl border border-[var(--border)] p-4">
        <h2 className="font-medium">Пригласить пользователя</h2>
        <label className="block text-sm">Email<input type="email" required value={email} onChange={e => setEmail(e.target.value)} className={inputClass} /></label>
        <label className="block text-sm">Начальный лимит<input type="number" min={0} max={1000000} step={1} required value={credits} onChange={e => setCredits(e.target.value)} className={inputClass} /></label>
        <button disabled={busy} className={buttonClass}>Отправить приглашение</button>
      </form>
      <form onSubmit={credit} className="space-y-3 rounded-xl border border-[var(--border)] p-4">
        <h2 className="font-medium">Начислить кредиты</h2>
        <label className="block text-sm">Пользователь<select required value={target} onChange={e => setTarget(e.target.value)} className={inputClass}><option value="">Выберите пользователя</option>{members.map(m => <option key={m.user_id} value={m.user_id}>{m.email}</option>)}</select></label>
        <label className="block text-sm">Количество<input type="number" required min={1} max={1000000} step={1} value={amount} onChange={e => setAmount(e.target.value)} className={inputClass} /></label>
        <label className="block text-sm">Причина<input required maxLength={240} value={reason} onChange={e => setReason(e.target.value)} className={inputClass} /></label>
        <button disabled={busy} className={buttonClass}>Начислить</button>
      </form>
      <section className="space-y-3">
        <h2 className="font-medium">Пользователи</h2>
        <button disabled={busy} onClick={() => void perform(refresh)} className={buttonClass}>Обновить</button>
        {members.map(m => <div key={m.user_id} className="flex flex-wrap items-center gap-3 rounded-xl border border-[var(--border)] p-3">
          <span className="min-w-0 flex-1 break-all">{m.email}</span><span>{m.balance} кредитов · {m.active ? "Активен" : "Заблокирован"}</span>
          <button disabled={busy || m.role === "admin"} className={buttonClass} onClick={() => void perform(async () => {
            const { error } = await supabase!.rpc("glow_admin_access", { p_user: m.user_id, p_active: !m.active });
            if (error) throw new Error("Не удалось изменить доступ.");
            setStatus("Доступ изменён.");
          })}>{m.active ? "Заблокировать" : "Разблокировать"}</button>
        </div>)}
      </section>
      <section className="space-y-2"><h2 className="font-medium">Подготовленные приглашения</h2>{invites.map(i => <p key={i.email} className="break-all text-sm text-[var(--fg-muted)]">{i.email} · {i.claimed_by ? "Аккаунт создан" : new Date(i.expires_at).getTime() > Date.now() ? "Ожидает входа / отправки" : "Истекло"}</p>)}</section>
    </div>
  </main>;
}
