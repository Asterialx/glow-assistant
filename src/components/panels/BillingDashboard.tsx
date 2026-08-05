import { useEffect, useMemo, useState } from "react";
import { listTokenUsage } from "../../db";
import type { TokenUsage } from "../../lib/types";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

export function BillingDashboard() {
  const [rows, setRows] = useState<TokenUsage[]>([]);

  useEffect(() => {
    listTokenUsage(300).then(setRows);
  }, []);

  const totals = useMemo(() => {
    const input = rows.reduce((s, r) => s + r.input_tokens, 0);
    const output = rows.reduce((s, r) => s + r.output_tokens, 0);
    const cost = rows.reduce((s, r) => s + r.cost_units, 0);
    return { input, output, cost };
  }, [rows]);

  const byDay = useMemo(() => {
    const map = new Map<string, number>();
    for (const r of rows) {
      const d = new Date(r.created_at).toISOString().slice(0, 10);
      map.set(d, (map.get(d) || 0) + r.cost_units);
    }
    return Array.from(map.entries())
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([day, cost]) => ({ day: day.slice(5), cost: Number(cost.toFixed(3)) }));
  }, [rows]);

  return (
    <div className="flex-1 overflow-y-auto p-6">
      <h2 className="font-[family-name:var(--font-display)] text-xl font-semibold">Billing</h2>
      <p className="mt-1 text-sm text-[var(--color-muted)]">
        Local token ledger — costs use catalog multipliers (relative units).
      </p>
      <div className="mt-6 grid grid-cols-3 gap-3">
        {[
          { label: "Input tokens", value: totals.input.toLocaleString() },
          { label: "Output tokens", value: totals.output.toLocaleString() },
          { label: "Cost units", value: totals.cost.toFixed(2) },
        ].map((c) => (
          <div key={c.label} className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-2)] p-4">
            <div className="text-xs text-[var(--color-muted)]">{c.label}</div>
            <div className="mt-1 text-2xl font-semibold">{c.value}</div>
          </div>
        ))}
      </div>
      <div className="mt-6 h-64 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-2)] p-3">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={byDay}>
            <CartesianGrid strokeDasharray="3 3" stroke="#2e3340" />
            <XAxis dataKey="day" stroke="#8b93a7" fontSize={11} />
            <YAxis stroke="#8b93a7" fontSize={11} />
            <Tooltip
              contentStyle={{ background: "#1a1d26", border: "1px solid #2e3340" }}
            />
            <Bar dataKey="cost" fill="var(--accent)" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
      <div className="mt-6 overflow-hidden rounded-lg border border-[var(--color-border)]">
        <table className="w-full text-left text-sm">
          <thead className="bg-[var(--color-surface-3)] text-xs text-[var(--color-muted)]">
            <tr>
              <th className="px-3 py-2">When</th>
              <th className="px-3 py-2">Mode</th>
              <th className="px-3 py-2">Model</th>
              <th className="px-3 py-2">In</th>
              <th className="px-3 py-2">Out</th>
              <th className="px-3 py-2">Cost</th>
            </tr>
          </thead>
          <tbody>
            {rows.slice(0, 40).map((r) => (
              <tr key={r.id} className="border-t border-[var(--color-border)]">
                <td className="px-3 py-1.5 text-xs">{new Date(r.created_at).toLocaleString()}</td>
                <td className="px-3 py-1.5">{r.mode}</td>
                <td className="px-3 py-1.5">{r.model_id}</td>
                <td className="px-3 py-1.5">{r.input_tokens}</td>
                <td className="px-3 py-1.5">{r.output_tokens}</td>
                <td className="px-3 py-1.5">{r.cost_units.toFixed(3)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
