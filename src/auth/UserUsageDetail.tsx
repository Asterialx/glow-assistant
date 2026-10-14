import { useEffect, useMemo, useState } from "react";
import { Activity, Ban, CalendarClock, Check, Clock3, RefreshCw, Sparkles, Users } from "lucide-react";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { supabase } from "./client";

export interface TokenEntry {
  id: string;
  user_id: string;
  model: string;
  input_tokens: number | null;
  output_tokens: number | null;
  total_tokens: number | null;
  cost_usd: number | null;
  cache_read_tokens: number | null;
  cache_write_tokens: number | null;
  status: string;
  reserved: number;
  created_at: string;
  finished_at: string | null;
}
interface Member { user_id: string; email: string; role: string; active: boolean; granted: number; used: number }
interface Props { member: Member; onAccessChange: (active: boolean) => void; busy: boolean }

const COLORS = ["#e77755", "#f3b64c", "#63b9a5", "#78a9fa", "#b897e8", "#e68ca8", "#77c6d0", "#c5a478"];
const usd = (value: number) => `$${value.toFixed(value < 0.01 ? 6 : value < 1 ? 4 : 2)}`;
const number = (value: number) => value.toLocaleString("ru-RU");
const dateKey = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;

function ChartPanel({ title, value, unit, data, models, metric }: {
  title: string; value: string; unit: string; data: Array<Record<string, string | number>>; models: string[]; metric: "cost" | "requests" | "tokens";
}) {
  const formatter = metric === "cost" ? (n: number) => usd(n) : (n: number) => number(n);
  return <section className="flex h-full min-w-0 flex-col rounded-2xl border border-[var(--border)] bg-[var(--bg-elevated)] p-4 sm:p-5">
    <div className="flex items-start justify-between gap-2"><div><p className="text-xs text-[var(--fg-muted)]">{title}</p><p className="mt-1 text-2xl font-semibold tabular-nums">{value}</p></div><span className="mt-1 rounded-lg border border-[var(--border)] px-2 py-1 text-[10px] text-[var(--fg-muted)]">{unit}</span></div>
    <div className="mt-4 h-36 min-w-0 sm:h-40">
      {data.length ? <ResponsiveContainer width="100%" height="100%"><BarChart data={data} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
        <CartesianGrid vertical={false} stroke="var(--border)" strokeDasharray="3 4" />
        <XAxis dataKey="label" axisLine={false} tickLine={false} tick={{ fill: "var(--fg-muted)", fontSize: 10 }} />
        <YAxis axisLine={false} tickLine={false} tick={{ fill: "var(--fg-muted)", fontSize: 9 }} tickFormatter={n => metric === "cost" ? usd(Number(n)) : Number(n) >= 1000 ? `${(Number(n) / 1000).toFixed(0)}k` : String(n)} width={54} />
        <Tooltip cursor={{ fill: "var(--bg-hover)", opacity: 0.45 }} contentStyle={{ background: "var(--bg-elevated)", border: "1px solid var(--border)", borderRadius: 12, color: "var(--fg)", fontSize: 12 }} formatter={n => [formatter(Number(n)), title]} labelStyle={{ color: "var(--fg-muted)" }} />
        {models.map((model, index) => <Bar key={model} dataKey={model} stackId="usage" fill={COLORS[index % COLORS.length]} radius={index === models.length - 1 ? [3, 3, 0, 0] : 0} maxBarSize={28} />)}
      </BarChart></ResponsiveContainer> : <div className="grid h-full place-items-center text-xs text-[var(--fg-muted)]">Пока нет данных за неделю</div>}
    </div>
    {models.length > 0 && <div className="mt-auto min-h-[72px] space-y-2 pt-3">
      {models.slice(0, 3).map((model, index) => <div key={model} className="flex items-center gap-2 text-[11px]" title={model}><span className="size-2 shrink-0 rounded-full" style={{ background: COLORS[index % COLORS.length] }} /><span className="min-w-0 flex-1 truncate">{model.split("/").at(-1)}</span><span className="shrink-0 tabular-nums text-[var(--fg-muted)]">{formatter(data.reduce((sum, day) => sum + Number(day[model] ?? 0), 0))}</span></div>)}
      {models.length > 3 && <p className="pl-4 text-[10px] text-[var(--fg-muted)]">и ещё {models.length - 3} моделей · см. таблицу ниже</p>}
    </div>}
  </section>;
}

export function UserUsageDetail({ member, onAccessChange, busy }: Props) {
  const [entries, setEntries] = useState<TokenEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [truncated, setTruncated] = useState(false);
  const [held, setHeld] = useState(0);
  const [range, setRange] = useState<"week" | "month">("week");

  const load = async () => {
    if (!supabase) { setError("Supabase не настроен."); setLoading(false); return; }
    setLoading(true); setError("");
    const since = new Date(); since.setDate(since.getDate() - 30);
    const [result, reserves] = await Promise.all([supabase.from("glow_token_requests")
      .select("id,user_id,model,input_tokens,output_tokens,total_tokens,cost_usd,cache_read_tokens,cache_write_tokens,status,reserved,created_at,finished_at")
      .eq("user_id", member.user_id).gte("created_at", since.toISOString()).order("created_at", { ascending: false }).limit(1001),
      supabase.from("glow_token_requests").select("reserved").eq("user_id", member.user_id).in("status", ["reserved", "pending"])]);
    if (result.error || reserves.error) { setError("Не удалось загрузить активность пользователя."); setEntries([]); }
    else {
      setEntries((result.data ?? []).slice(0, 1000) as TokenEntry[]);
      setTruncated((result.data?.length ?? 0) > 1000);
      setHeld((reserves.data ?? []).reduce((sum, row) => sum + Number(row.reserved), 0));
    }
    setLoading(false);
  };
  useEffect(() => { void load(); }, [member.user_id]);

  const dashboard = useMemo(() => {
    const now = new Date();
    const start = new Date(now); start.setDate(start.getDate() - (range === "week" ? 6 : 29)); start.setHours(0, 0, 0, 0);
    const selected = entries.filter(entry => new Date(entry.created_at) >= start);
    const settled = selected.filter(entry => entry.status === "settled");
    const cost = settled.reduce((sum, entry) => sum + (entry.cost_usd == null ? 0 : Number(entry.cost_usd)), 0);
    const tokens = settled.reduce((sum, entry) => sum + Number(entry.total_tokens ?? 0), 0);
    const knownCostRows = settled.filter(entry => entry.cost_usd != null).length;
    const grouped = new Map<string, { requests: number; tokens: number; dollars: number; unknown: number }>();
    for (const entry of selected) {
      const row = grouped.get(entry.model) ?? { requests: 0, tokens: 0, dollars: 0, unknown: 0 };
      row.requests += 1;
      if (entry.status === "settled") {
        row.tokens += Number(entry.total_tokens ?? 0);
        if (entry.cost_usd == null) row.unknown += 1;
        else row.dollars += Number(entry.cost_usd);
      }
      grouped.set(entry.model, row);
    }
    const models = [...grouped.entries()].sort((a, b) => b[1].tokens - a[1].tokens || b[1].requests - a[1].requests).map(([model]) => model);
    const costModels = [...grouped.entries()].filter(([model]) => settled.some(entry => entry.model === model && entry.cost_usd != null)).map(([model]) => model);
    const days = Array.from({ length: range === "week" ? 7 : 30 }, (_, index) => {
      const day = new Date(start); day.setDate(start.getDate() + index);
      return { key: dateKey(day), label: day.toLocaleDateString("ru-RU", { day: "numeric", month: "short" }).replace(" г.", "") };
    });
    const charts = Object.fromEntries(["cost", "requests", "tokens"].map(metric => [metric, days.map(day => {
      const row: Record<string, string | number> = { label: day.label };
      models.forEach(model => { row[model] = 0; });
      selected.filter(entry => dateKey(new Date(entry.created_at)) === day.key).forEach(entry => {
        const val = metric === "cost" ? (entry.status === "settled" ? Number(entry.cost_usd ?? 0) : 0)
          : metric === "requests" ? 1 : (entry.status === "settled" ? Number(entry.total_tokens ?? 0) : 0);
        row[entry.model] = Number(row[entry.model] ?? 0) + val;
      });
      return row;
    })]));
    return { selected, settled, cost, tokens, knownCostRows, models, costModels, grouped, charts };
  }, [entries, range]);

  const available = Math.max(0, member.granted - member.used - held);
  const spentPercent = member.granted > 0 ? Math.min(100, member.used / member.granted * 100) : 0;
  const heldPercent = member.granted > 0 ? Math.min(100 - spentPercent, held / member.granted * 100) : 0;
  const titleDate = range === "week" ? "За последние 7 дней" : "За последние 30 дней";
  const money = (value: number) => `$${value.toFixed(6)}`;

  return <div className="space-y-5">
    <header className="flex flex-wrap items-start justify-between gap-3 rounded-2xl border border-[var(--border)] bg-[var(--bg-elevated)] p-4 sm:p-5">
      <div className="flex min-w-0 items-center gap-3"><div className="grid size-11 shrink-0 place-items-center rounded-full bg-[var(--accent)]/10 text-[var(--accent)]"><Users size={20} /></div><div className="min-w-0"><h1 className="truncate text-lg font-semibold">{member.email}</h1><p className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs text-[var(--fg-muted)]"><span>{member.role === "admin" ? "Администратор" : "Участник"}</span><span>·</span><span className={member.active ? "text-emerald-500" : "text-rose-400"}>{member.active ? "Аккаунт активен" : "Доступ закрыт"}</span></p></div></div>
      {member.role !== "admin" && <button type="button" disabled={busy} onClick={() => onAccessChange(!member.active)} className="inline-flex items-center gap-2 rounded-xl border border-[var(--border)] px-3 py-2 text-xs transition hover:bg-[var(--bg-hover)] disabled:opacity-50">{member.active ? <><Ban size={14} /> Заблокировать</> : <><Check size={14} /> Восстановить доступ</>}</button>}
    </header>

    <section className="rounded-2xl border border-[var(--border)] bg-[var(--bg-elevated)] p-4 sm:p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-2"><div><h2 className="font-medium">Лимит токенов</h2><p className="mt-0.5 text-xs text-[var(--fg-muted)]">Использовано и зарезервировано</p></div><span className="text-xs text-[var(--fg-muted)]">{number(member.used)} из {number(member.granted)} токенов</span></div>
      <div className="mt-4 flex h-2.5 overflow-hidden rounded-full bg-[var(--bg)]"><div className="bg-[var(--accent)] transition-[width]" style={{ width: `${spentPercent}%` }} /><div className="bg-[var(--accent)] opacity-40" style={{ width: `${heldPercent}%` }} /></div>
      <div className="mt-3 grid grid-cols-2 gap-3 text-xs sm:grid-cols-4"><div><p className="text-[var(--fg-muted)]">Начислено</p><p className="mt-1 font-medium tabular-nums">{number(member.granted)}</p></div><div><p className="text-[var(--fg-muted)]">Потрачено</p><p className="mt-1 font-medium tabular-nums">{number(member.used)} <span className="text-[var(--fg-muted)]">({spentPercent.toLocaleString("ru-RU", { maximumFractionDigits: 1 })}%)</span></p></div><div><p className="text-[var(--fg-muted)]">В резерве</p><p className="mt-1 font-medium tabular-nums">{number(held)}</p></div><div><p className="text-[var(--fg-muted)]">Остаток</p><p className="mt-1 font-medium tabular-nums">{number(available)}</p></div></div>
    </section>

    <div className="flex flex-wrap items-center justify-between gap-2"><div><h2 className="text-lg font-semibold">Использование</h2><p className="mt-0.5 text-xs text-[var(--fg-muted)]">Расходы провайдера, запросы и токены по дням</p></div><div className="flex items-center gap-2"><div className="flex rounded-xl border border-[var(--border)] bg-[var(--bg-elevated)] p-1" aria-label="Период"><button type="button" onClick={() => setRange("week")} aria-pressed={range === "week"} className={`rounded-lg px-3 py-1.5 text-xs ${range === "week" ? "bg-[var(--bg-hover)] text-[var(--fg)]" : "text-[var(--fg-muted)]"}`}>7 дней</button><button type="button" onClick={() => setRange("month")} aria-pressed={range === "month"} className={`rounded-lg px-3 py-1.5 text-xs ${range === "month" ? "bg-[var(--bg-hover)] text-[var(--fg)]" : "text-[var(--fg-muted)]"}`}>30 дней</button></div><button type="button" onClick={() => void load()} disabled={loading} aria-label="Обновить активность" className="grid size-9 place-items-center rounded-xl border border-[var(--border)] hover:bg-[var(--bg-hover)] disabled:opacity-50"><RefreshCw size={15} className={loading ? "animate-spin" : ""} /></button></div></div>

    {error && <p role="alert" className="rounded-xl border border-[var(--border)] p-3 text-sm">{error}</p>}
    {loading && <p role="status" className="rounded-xl border border-[var(--border)] p-4 text-sm text-[var(--fg-muted)]">Загружаем статистику…</p>}
    {truncated && <p className="rounded-xl border border-[var(--border)] p-3 text-xs text-[var(--fg-muted)]">Показаны последние 1 000 запросов за 30 дней; для этого пользователя объём больше лимита загрузки.</p>}
    {!loading && !error && <>
      <div className="grid gap-3 md:grid-cols-3">
        <ChartPanel title="Расход API" value={dashboard.knownCostRows ? usd(dashboard.cost) : "—"} unit="USD" data={dashboard.charts.cost} models={dashboard.costModels} metric="cost" />
        <ChartPanel title="Запросы" value={number(dashboard.selected.length)} unit="запросов" data={dashboard.charts.requests} models={dashboard.models} metric="requests" />
        <ChartPanel title="Токены" value={number(dashboard.tokens)} unit="токенов" data={dashboard.charts.tokens} models={dashboard.models} metric="tokens" />
      </div>
      <p className="-mt-2 text-[11px] leading-relaxed text-[var(--fg-muted)]">{titleDate}. Стоимость — сумма подтверждённых данных API; запросы без стоимости отмечены отдельно. Токены — только подтверждённые вход и ответ.</p>

      <section className="overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--bg-elevated)]">
        <div className="flex items-center gap-2 border-b border-[var(--border)] px-4 py-3"><Sparkles size={16} className="text-[var(--accent)]" /><h3 className="text-sm font-medium">Разбивка по моделям</h3></div>
        {dashboard.models.length === 0 ? <p className="p-5 text-sm text-[var(--fg-muted)]">Активности за выбранный период пока нет.</p> : <div className="overflow-x-auto"><table className="w-full min-w-[510px] text-left text-xs"><thead className="text-[var(--fg-muted)]"><tr><th className="px-4 py-3 font-medium">Модель</th><th className="px-3 py-3 text-right font-medium">Запросы</th><th className="px-3 py-3 text-right font-medium">Токены</th><th className="px-4 py-3 text-right font-medium">Расход API</th></tr></thead><tbody>{dashboard.models.map((model, index) => { const row = dashboard.grouped.get(model)!; return <tr key={model} className="border-t border-[var(--border)]"><td className="max-w-56 truncate px-4 py-3"><span className="mr-2 inline-block size-2 rounded-full" style={{ background: COLORS[index % COLORS.length] }} />{model}</td><td className="px-3 py-3 text-right tabular-nums">{number(row.requests)}</td><td className="px-3 py-3 text-right tabular-nums">{number(row.tokens)}</td><td className="px-4 py-3 text-right tabular-nums"><span>{row.dollars ? money(row.dollars) : row.unknown ? "Нет данных" : "$0.000000"}</span>{row.unknown > 0 && row.dollars > 0 && <span className="ml-1.5 text-[10px] text-[var(--fg-muted)]">+{row.unknown} без цены</span>}</td></tr>; })}</tbody></table></div>}
      </section>

      <section className="space-y-2">
        <div className="flex items-center gap-2"><Activity size={16} className="text-[var(--accent)]" /><h3 className="text-sm font-medium">Последние запросы</h3></div>
        <div className="overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--bg-elevated)]">
          {dashboard.selected.length === 0 ? <p className="p-5 text-sm text-[var(--fg-muted)]">За выбранный период запросов нет.</p> : dashboard.selected.slice(0, 30).map((entry, index) => <div key={entry.id} className={`grid grid-cols-[1fr_auto] gap-x-3 gap-y-1 p-3.5 sm:grid-cols-[minmax(0,1fr)_auto_auto_auto] sm:items-center sm:gap-4 ${index ? "border-t border-[var(--border)]" : ""}`}>
            <div className="min-w-0"><p className="truncate text-xs font-medium">{entry.model}</p><p className="mt-1 flex items-center gap-1 text-[10px] text-[var(--fg-muted)]"><CalendarClock size={11} /><time dateTime={entry.created_at}>{new Date(entry.created_at).toLocaleString("ru-RU", { dateStyle: "medium", timeStyle: "short" })}</time></p></div>
            <div className="text-right text-[11px] tabular-nums"><p>{entry.status === "settled" ? `${number(Number(entry.total_tokens ?? 0))} ток.` : entry.status === "failed" ? "Ошибка" : `${number(Number(entry.reserved))} резерв`}</p><p className="mt-1 text-[10px] text-[var(--fg-muted)]">{entry.status === "settled" ? "вход + ответ" : entry.status === "failed" ? "без списания" : "ожидает usage"}</p>{(entry.cache_read_tokens != null || entry.cache_write_tokens != null) && <p className="mt-1 text-[10px] text-[var(--fg-muted)]">Кэш: −{number(Number(entry.cache_read_tokens ?? 0))} / +{number(Number(entry.cache_write_tokens ?? 0))}</p>}</div>
            <p className="col-start-2 row-start-2 text-right text-[11px] tabular-nums sm:col-auto sm:row-auto">{entry.status === "settled" ? entry.cost_usd == null ? "Цена неизвестна" : money(Number(entry.cost_usd)) : "—"}</p>
            <p className="col-start-1 row-start-2 flex items-center gap-1 text-[10px] text-[var(--fg-muted)] sm:col-auto sm:row-auto sm:justify-end"><Clock3 size={11} />{entry.finished_at ? new Date(entry.finished_at).toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" }) : "В процессе"}</p>
          </div>)}
        </div>
        {dashboard.selected.length > 30 && <p className="text-right text-[11px] text-[var(--fg-muted)]">Показаны последние 30 из {dashboard.selected.length} запросов</p>}
      </section>
    </>}
  </div>;
}
