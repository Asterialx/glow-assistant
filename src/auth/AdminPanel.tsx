import { useEffect, useRef, useState, type FormEvent } from "react";
import { supabase } from "./client";

interface Member { user_id: string; email: string; role: string; active: boolean; balance: number }
interface Invitation { email: string; claimed_by: string | null; expires_at: string }
interface TokenEntry { id: string; user_id: string; model: string; input_tokens: number | null; output_tokens: number | null; total_tokens: number | null; status: string; reserved: number; created_at: string; finished_at: string | null }

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
  const creditRequest = useRef<{ fingerprint: string; id: string } | null>(null);
  const refresh = async () => {
    if (!supabase) throw new Error("Supabase не настроен");
    const [people, pending, wallets, requests] = await Promise.all([
      supabase.rpc("glow_admin_members"),
      supabase.from("glow_invites").select("email,claimed_by,expires_at").order("created_at", { ascending: false }),
      supabase.from("glow_token_wallets").select("user_id,granted,used"),
      supabase.from("glow_token_requests").select("id,user_id,model,input_tokens,output_tokens,total_tokens,status,reserved,created_at,finished_at").order("created_at", { ascending: false }).limit(200),
    ]);
    if (people.error || pending.error || wallets.error || requests.error) throw new Error("Не удалось загрузить админку. Проверьте права и настройку базы токенов.");
    setMembers((people.data ?? []).map((member: Member) => {
      const wallet = wallets.data?.find(w => w.user_id === member.user_id);
      return { ...member, balance: wallet ? wallet.granted-wallet.used : 0 };
    })); setInvites(pending.data ?? []); setUsage(requests.data ?? []);
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
      const { error } = await supabase!.rpc("glow_admin_token_grant", { p_user: target, p_amount: value, p_reason: reason.trim(), p_request: creditRequest.current.id });
      if (error) throw new Error("Не удалось подтвердить начисление. Повтор с теми же данными безопасен.");
      creditRequest.current = null; setStatus("Токены начислены.");
    });
  };
  const inputClass = "w-full rounded-lg border border-[var(--border)] bg-[var(--bg)] p-3 text-sm";
  const buttonClass = "rounded-lg border border-[var(--border)] px-3 py-2 text-sm hover:bg-[var(--bg-hover)] disabled:opacity-50";
  return <section className="bg-[var(--bg)] text-[var(--fg)]">
    <div className="mx-auto max-w-3xl space-y-6">
      <h1 className="text-2xl font-semibold">Администрирование Glow</h1>
      <p className="text-sm text-[var(--fg-muted)]">Лимиты в токенах: вход + выход по подтверждённым данным провайдера. 100 000 начисленных токенов — лимит 100 000 токенов, без коэффициентов стоимости.</p>
      {status && <p role="status" className="rounded-lg border border-[var(--border)] p-3 text-sm">{status}</p>}
      <form onSubmit={invite} className="space-y-3 rounded-xl border border-[var(--border)] p-4">
        <h2 className="font-medium">Пригласить пользователя</h2>
        <label className="block text-sm">Email<input type="email" required value={email} onChange={e => setEmail(e.target.value)} className={inputClass} /></label>
        <label className="block text-sm">Начальный лимит<input type="number" min={0} max={1000000} step={1} required value={credits} onChange={e => setCredits(e.target.value)} className={inputClass} /></label>
        <button disabled={busy} className={buttonClass}>Отправить приглашение</button>
      </form>
      <form onSubmit={credit} className="space-y-3 rounded-xl border border-[var(--border)] p-4">
        <h2 className="font-medium">Начислить токены</h2>
        <label className="block text-sm">Пользователь<select required value={target} onChange={e => setTarget(e.target.value)} className={inputClass}><option value="">Выберите пользователя</option>{members.map(m => <option key={m.user_id} value={m.user_id}>{m.email}</option>)}</select></label>
        <label className="block text-sm">Количество<input type="number" required min={1} max={1000000} step={1} value={amount} onChange={e => setAmount(e.target.value)} className={inputClass} /></label>
        <label className="block text-sm">Причина<input required maxLength={240} value={reason} onChange={e => setReason(e.target.value)} className={inputClass} /></label>
        <button disabled={busy} className={buttonClass}>Начислить</button>
      </form>
      <section className="space-y-3">
        <h2 className="font-medium">Пользователи</h2>
        <button disabled={busy} onClick={() => void perform(refresh)} className={buttonClass}>Обновить</button>
        {members.map(m => <div key={m.user_id} className="flex flex-wrap items-center gap-3 rounded-xl border border-[var(--border)] p-3">
          <span className="min-w-0 flex-1 break-all">{m.email}</span><span>{m.balance.toLocaleString("ru-RU")} токенов · {m.active ? "Активен" : "Заблокирован"}</span>
          <button disabled={busy || m.role === "admin"} className={buttonClass} onClick={() => void perform(async () => {
            const { error } = await supabase!.rpc("glow_admin_access", { p_user: m.user_id, p_active: !m.active });
            if (error) throw new Error("Не удалось изменить доступ.");
            setStatus("Доступ изменён.");
          })}>{m.active ? "Заблокировать" : "Разблокировать"}</button>
        </div>)}
      </section>
      <section className="space-y-3"><h2 className="font-medium">Расход токенов · последние 200 запросов</h2>
        <p className="text-xs text-[var(--fg-muted)]">Дата и время указаны в часовом поясе вашего устройства. Резерв не считается подтверждённым расходом.</p>
        {usage.length === 0 && <p className="text-sm text-[var(--fg-muted)]">Запросов пока нет.</p>}
        {usage.map(entry => <div key={entry.id} className="space-y-1 rounded-xl border border-[var(--border)] p-3 text-sm">
          <p className="break-all">{members.find(member => member.user_id === entry.user_id)?.email ?? entry.user_id}</p>
          <p className="text-[var(--fg-muted)]">{entry.model} · <time dateTime={entry.created_at}>{new Date(entry.created_at).toLocaleString("ru-RU",{timeZoneName:"short"})}</time></p>
          <p>{entry.status === "settled" ? `${entry.input_tokens?.toLocaleString("ru-RU")} вход + ${entry.output_tokens?.toLocaleString("ru-RU")} выход = ${entry.total_tokens?.toLocaleString("ru-RU")} токенов`
            : entry.status === "failed" ? "Запрос не принят провайдером · списания нет" : `${entry.reserved.toLocaleString("ru-RU")} в резерве · usage ожидается`}</p>
          {entry.finished_at && <p className="text-xs text-[var(--fg-muted)]">Завершён: {new Date(entry.finished_at).toLocaleString("ru-RU",{timeZoneName:"short"})}</p>}
        </div>)}
      </section>
      <section className="space-y-2"><h2 className="font-medium">Подготовленные приглашения</h2>{invites.map(i => <p key={i.email} className="break-all text-sm text-[var(--fg-muted)]">{i.email} · {i.claimed_by ? "Аккаунт создан" : new Date(i.expires_at).getTime() > Date.now() ? "Ожидает входа / отправки" : "Истекло"}</p>)}</section>
    </div>
  </section>;
}
