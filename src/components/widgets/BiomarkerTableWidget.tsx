import type { UiWidget } from "../../lib/types";
import { cn } from "../../lib/utils";

export interface BiomarkerRow {
  name: string;
  value: number;
  unit: string;
  ref_low?: number | null;
  ref_high?: number | null;
  reference?: string;
  out_of_range: boolean;
}

export function evaluateBiomarkerRow(raw: Record<string, unknown>): BiomarkerRow | null {
  const name = String(raw.name ?? raw.marker ?? raw.test ?? "").trim();
  if (!name) return null;
  const value = Number(raw.value ?? raw.result ?? raw.val);
  if (!Number.isFinite(value)) return null;
  const unit = String(raw.unit ?? raw.units ?? "").trim();
  const ref_low =
    raw.ref_low != null
      ? Number(raw.ref_low)
      : raw.low != null
        ? Number(raw.low)
        : raw.min != null
          ? Number(raw.min)
          : null;
  const ref_high =
    raw.ref_high != null
      ? Number(raw.ref_high)
      : raw.high != null
        ? Number(raw.high)
        : raw.max != null
          ? Number(raw.max)
          : null;
  const reference =
    raw.reference != null
      ? String(raw.reference)
      : ref_low != null && ref_high != null && Number.isFinite(ref_low) && Number.isFinite(ref_high)
        ? `${ref_low} – ${ref_high}`
        : ref_low != null && Number.isFinite(ref_low)
          ? `≥ ${ref_low}`
          : ref_high != null && Number.isFinite(ref_high)
            ? `≤ ${ref_high}`
            : "—";

  let out_of_range = Boolean(raw.out_of_range ?? raw.flagged ?? raw.abnormal);
  if (raw.out_of_range == null && raw.flagged == null && raw.abnormal == null) {
    if (ref_low != null && Number.isFinite(ref_low) && value < ref_low) out_of_range = true;
    if (ref_high != null && Number.isFinite(ref_high) && value > ref_high) out_of_range = true;
  }

  return {
    name,
    value,
    unit,
    ref_low: ref_low != null && Number.isFinite(ref_low) ? ref_low : null,
    ref_high: ref_high != null && Number.isFinite(ref_high) ? ref_high : null,
    reference,
    out_of_range,
  };
}

function buildPdfHtml(title: string, rows: BiomarkerRow[], note?: string): string {
  const body = rows
    .map((r) => {
      const flag = r.out_of_range ? "OUT" : "ok";
      const color = r.out_of_range ? "color:#b42318;font-weight:600" : "";
      return `<tr style="${color}"><td>${escapeHtml(r.name)}</td><td>${r.value}</td><td>${escapeHtml(r.unit)}</td><td>${escapeHtml(r.reference || "—")}</td><td>${flag}</td></tr>`;
    })
    .join("");
  return `<!DOCTYPE html><html><head><meta charset="utf-8"/><title>${escapeHtml(title)}</title>
<style>
body{font-family:Georgia,serif;max-width:820px;margin:40px auto;line-height:1.45;color:#222}
h1{font-family:system-ui,sans-serif;font-size:1.35rem}
table{width:100%;border-collapse:collapse;margin-top:16px;font-size:14px}
th,td{border:1px solid #ddd;padding:8px 10px;text-align:left}
th{background:#f4f4f4;font-family:system-ui,sans-serif;font-size:12px}
.note{margin-top:20px;font-size:13px;color:#555}
@media print{button{display:none}}
</style></head><body>
<h1>${escapeHtml(title)}</h1>
${note ? `<p class="note">${escapeHtml(note)}</p>` : ""}
<table>
<thead><tr><th>Marker</th><th>Result</th><th>Unit</th><th>Reference</th><th>Flag</th></tr></thead>
<tbody>${body}</tbody>
</table>
<p class="note"><em>Educational only — not a medical device. Not a clinical report.</em></p>
<script>window.onload=()=>window.print()</script>
</body></html>`;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

interface Props {
  widget: UiWidget;
}

export function BiomarkerTableWidget({ widget }: Props) {
  const state = JSON.parse(widget.state_json || "{}") as {
    title?: string;
    note?: string;
    rows?: Array<Record<string, unknown>>;
  };
  const rows = (state.rows || [])
    .map((r) => evaluateBiomarkerRow(r))
    .filter(Boolean) as BiomarkerRow[];
  const title = state.title || "Lab panel";
  const outCount = rows.filter((r) => r.out_of_range).length;

  const generatePdf = () => {
    const html = buildPdfHtml(title, rows, state.note);
    const w = window.open("", "_blank");
    if (w) {
      w.document.write(html);
      w.document.close();
    }
  };

  if (!rows.length) {
    return (
      <div
        className="my-3 rounded-2xl border border-[var(--border)] bg-[var(--bg-input)] px-3.5 py-3 text-[13px] text-[var(--fg-muted)]"
        data-inline-ui="biomarker_table"
      >
        Empty biomarker table
      </div>
    );
  }

  return (
    <div
      className="my-3 overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--bg-input)]"
      data-inline-ui="biomarker_table"
    >
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--border)] px-3.5 py-2.5">
        <div>
          <div className="text-[13px] font-medium text-[var(--fg)]">{title}</div>
          <div className="text-[11px] text-[var(--fg-faint)]">
            {outCount > 0
              ? `${outCount} out of reference`
              : "All values within reference"}
          </div>
        </div>
        <button
          type="button"
          onClick={generatePdf}
          className="rounded-xl bg-[var(--accent)] px-3 py-1.5 text-[12.5px] font-medium text-white hover:opacity-90"
        >
          Сгенерировать PDF-отчет
        </button>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[28rem] text-left text-[13.5px]">
          <thead className="bg-[var(--bg)] text-[11px] uppercase tracking-wide text-[var(--fg-faint)]">
            <tr>
              <th className="px-3 py-2 font-medium">Marker</th>
              <th className="px-3 py-2 font-medium">Result</th>
              <th className="px-3 py-2 font-medium">Unit</th>
              <th className="px-3 py-2 font-medium">Reference</th>
              <th className="px-3 py-2 font-medium">Flag</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr
                key={`${r.name}-${i}`}
                className={cn(
                  "border-t border-[var(--border)]",
                  r.out_of_range && "bg-red-500/10",
                )}
              >
                <td
                  className={cn(
                    "px-3 py-2 font-medium",
                    r.out_of_range ? "text-red-500" : "text-[var(--fg)]",
                  )}
                >
                  {r.name}
                </td>
                <td
                  className={cn(
                    "px-3 py-2 tabular-nums",
                    r.out_of_range ? "font-semibold text-red-500" : "text-[var(--fg)]",
                  )}
                >
                  {r.value}
                </td>
                <td className="px-3 py-2 text-[var(--fg-muted)]">{r.unit || "—"}</td>
                <td className="px-3 py-2 text-[var(--fg-muted)]">{r.reference || "—"}</td>
                <td
                  className={cn(
                    "px-3 py-2 text-[12px] font-medium",
                    r.out_of_range ? "text-red-500" : "text-[var(--fg-faint)]",
                  )}
                >
                  {r.out_of_range ? "OUT" : "ok"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="border-t border-[var(--border)] px-3.5 py-2 text-[11px] text-[var(--fg-faint)]">
        Educational support only — not a medical device.
      </p>
    </div>
  );
}
