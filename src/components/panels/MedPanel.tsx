import { useState } from "react";
import {
  checkDrugs,
  generateProtocol,
  parseBiomarkers,
  redactPii,
} from "../../lib/tauri";
import { saveDomainRecord } from "../../db";
import { useModeStore } from "../../stores/modeStore";
import { useChatStore } from "../../stores/chatStore";
import { nowMs, uid } from "../../lib/utils";
import type { Artifact } from "../../lib/types";
import { extractPdfText } from "../../lib/pdfExtract";
import { prefetchSpeechModel, transcribeAudioBlob } from "../../lib/speech/transcribeAudio";
import {
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

export function MedPanel() {
  const mode = useModeStore((s) => s.mode);
  const [raw, setRaw] = useState(
    "Glucose\t6.2\tmmol/L\t3.9\t5.5\nLDL\t3.8\tmmol/L\t0\t3.0\nHDL\t1.1\tmmol/L\t1.0\t99",
  );
  const [rows, setRows] = useState<
    Array<{ name: string; value: number; unit: string; out_of_range: boolean }>
  >([]);
  const [drugs, setDrugs] = useState("warfarin, vitamin K, omega-3");
  const [interactions, setInteractions] = useState<
    Array<{ pair: [string, string]; severity: string; note: string }>
  >([]);
  const [protocol, setProtocol] = useState("");
  const [piiIn, setPiiIn] = useState("Patient: Jane Doe email jane@clinic.org phone +1 555-0100");
  const [piiOut, setPiiOut] = useState("");
  const [voiceBusy, setVoiceBusy] = useState(false);
  const setArtifacts = useChatStore((s) => s.setArtifacts);
  const artifacts = useChatStore((s) => s.artifacts);
  const setActiveArtifactId = useChatStore((s) => s.setActiveArtifactId);
  const activeConversationId = useChatStore((s) => s.activeConversationId);
  const setPanel = useChatStore((s) => s.setPanel);

  if (mode !== "med") {
    return (
      <div className="flex flex-1 items-center justify-center p-8 text-sm text-[var(--color-muted)]">
        Switch to Med mode to access the privacy-isolated medical module.
      </div>
    );
  }

  const history = rows.map((r, i) => ({ name: r.name, value: r.value, i }));

  const downloadProtocolPdf = () => {
    const html = `<!DOCTYPE html><html><head><meta charset="utf-8"/><title>Patient protocol</title>
      <style>body{font-family:Georgia,serif;max-width:720px;margin:40px auto;line-height:1.5;color:#222}
      h1{font-family:system-ui,sans-serif} pre{white-space:pre-wrap;background:#f6f6f6;padding:16px;border-radius:12px}
      @media print{button{display:none}}</style></head><body>
      <h1>Patient handout</h1><pre>${protocol.replace(/</g, "&lt;")}</pre>
      <p><em>Educational only — not a medical device.</em></p>
      <script>window.onload=()=>window.print()</script></body></html>`;
    const w = window.open("", "_blank");
    if (w) {
      w.document.write(html);
      w.document.close();
    }
  };

  return (
    <div className="flex-1 space-y-6 overflow-y-auto p-4 sm:p-6">
      <div>
        <h2 className="font-[family-name:var(--font-display)] text-xl font-semibold">Med Module</h2>
        <p className="mt-1 text-sm text-[var(--color-danger)]">
          Not a medical device. Educational / decision-support only. Data stays in glow_med.db.
        </p>
      </div>

      <section className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-2)] p-4">
        <h3 className="text-sm font-medium">PII redaction + local voice</h3>
        <textarea
          className="mt-2 h-20 w-full rounded border border-[var(--color-border)] bg-black/20 p-2 text-sm"
          value={piiIn}
          onChange={(e) => setPiiIn(e.target.value)}
        />
        <div className="mt-2 flex flex-wrap gap-2">
          <button
            type="button"
            className="rounded bg-[var(--accent)] px-3 py-1.5 text-sm text-[#0c0e12]"
            onClick={async () => {
              const r = await redactPii(piiIn);
              setPiiOut(`${r.text} (redacted: ${r.redacted_count})`);
            }}
          >
            Redact
          </button>
          <button
            type="button"
            className="rounded border border-[var(--color-border)] px-3 py-1.5 text-sm"
            disabled={voiceBusy}
            onClick={async () => {
              setVoiceBusy(true);
              try {
                prefetchSpeechModel();
                const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
                const mr = new MediaRecorder(stream);
                const chunks: Blob[] = [];
                mr.ondataavailable = (e) => chunks.push(e.data);
                mr.start();
                setPiiOut("Recording 4s…");
                await new Promise((r) => setTimeout(r, 4000));
                const blob: Blob = await new Promise((resolve) => {
                  mr.onstop = () => resolve(new Blob(chunks, { type: mr.mimeType || "audio/webm" }));
                  mr.stop();
                  stream.getTracks().forEach((t) => t.stop());
                });
                const text = await transcribeAudioBlob(blob, "ru");
                const red = await redactPii(text);
                setPiiIn(red.text);
                setPiiOut(`Voice → text (redacted ${red.redacted_count}): ${red.text}`);
              } catch (e) {
                setPiiOut(e instanceof Error ? e.message : String(e));
              } finally {
                setVoiceBusy(false);
              }
            }}
          >
            {voiceBusy ? "…" : "Record 4s + transcribe"}
          </button>
        </div>
        {piiOut && <pre className="mt-2 whitespace-pre-wrap text-xs text-[var(--color-muted)]">{piiOut}</pre>}
      </section>

      <section className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-2)] p-4">
        <h3 className="text-sm font-medium">Biomarker analyzer</h3>
        <p className="text-xs text-[var(--color-muted)]">
          Paste TSV (name, value, unit, ref_low, ref_high) or upload a lab PDF
        </p>
        <input
          type="file"
          accept="application/pdf,.pdf"
          className="mt-2 block text-xs"
          onChange={async (e) => {
            const f = e.target.files?.[0];
            if (!f) return;
            try {
              const text = await extractPdfText(f);
              setRaw(text);
              setPiiOut(`PDF loaded: ${f.name} (${text.length} chars). Edit TSV if needed, then Parse.`);
            } catch (err) {
              setPiiOut(err instanceof Error ? err.message : String(err));
            }
          }}
        />
        <textarea
          className="mt-2 h-28 w-full rounded border border-[var(--color-border)] bg-black/20 p-2 font-[family-name:var(--font-mono)] text-xs"
          value={raw}
          onChange={(e) => setRaw(e.target.value)}
        />
        <button
          type="button"
          className="mt-2 rounded bg-[var(--accent)] px-3 py-1.5 text-sm text-[#0c0e12]"
          onClick={async () => {
            const parsed = await parseBiomarkers(raw);
            setRows(parsed);
            await saveDomainRecord("med", "biomarker", { rows: parsed, at: nowMs() });
          }}
        >
          Parse panel
        </button>
        {rows.length > 0 && (
          <>
            <div className="table-scroll mt-3">
            <table className="w-full min-w-[28rem] text-left text-sm">
              <thead className="text-xs text-[var(--color-muted)]">
                <tr>
                  <th className="py-1">Marker</th>
                  <th>Value</th>
                  <th>Unit</th>
                  <th>Flag</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.name} className={r.out_of_range ? "text-[var(--color-danger)]" : ""}>
                    <td className="py-1">{r.name}</td>
                    <td>{r.value}</td>
                    <td>{r.unit}</td>
                    <td>{r.out_of_range ? "OUT" : "ok"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            </div>
            <div className="mt-4 h-40">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={history}>
                  <XAxis dataKey="name" stroke="#8b93a7" fontSize={10} />
                  <YAxis stroke="#8b93a7" fontSize={10} />
                  <Tooltip contentStyle={{ background: "#1a1d26", border: "1px solid #2e3340" }} />
                  <Line type="monotone" dataKey="value" stroke="var(--accent)" strokeWidth={2} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </>
        )}
      </section>

      <section className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-2)] p-4">
        <h3 className="text-sm font-medium">Drug / supplement interactions</h3>
        <input
          className="mt-2 w-full rounded border border-[var(--color-border)] bg-black/20 px-2 py-1.5 text-sm"
          value={drugs}
          onChange={(e) => setDrugs(e.target.value)}
        />
        <button
          type="button"
          className="mt-2 rounded border border-[var(--color-border)] px-3 py-1.5 text-sm"
          onClick={async () => {
            const items = drugs.split(",").map((s) => s.trim()).filter(Boolean);
            setInteractions(await checkDrugs(items));
          }}
        >
          Check
        </button>
        <ul className="mt-2 space-y-1 text-sm">
          {interactions.map((i, idx) => (
            <li key={idx} className="text-[var(--color-muted)]">
              <span className="text-[var(--color-warn)]">{i.severity}</span>: {i.pair[0]} + {i.pair[1]} —{" "}
              {i.note}
            </li>
          ))}
          {interactions.length === 0 && (
            <li className="text-xs text-[var(--color-muted)]">No known pairs in local heuristic DB.</li>
          )}
        </ul>
      </section>

      <section className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-2)] p-4">
        <h3 className="text-sm font-medium">Protocol generator + DICOM</h3>
        <div className="mt-2 flex flex-wrap gap-2">
          <button
            type="button"
            className="rounded bg-[var(--accent)] px-3 py-1.5 text-sm text-[#0c0e12]"
            onClick={async () => {
              const md = await generateProtocol({
                patientLabel: "Subject A (de-identified)",
                goals: ["Improve lipid profile", "Support glycemic control"],
                supplements: ["Omega-3 1g with meals", "Vitamin D per labs"],
                dietNotes: "Mediterranean pattern; limit ultra-processed carbs.",
              });
              setProtocol(md);
            }}
          >
            Generate protocol
          </button>
          {protocol && (
            <button
              type="button"
              className="rounded border border-[var(--color-border)] px-3 py-1.5 text-sm"
              onClick={downloadProtocolPdf}
            >
              Print / Save PDF
            </button>
          )}
          <button
            type="button"
            className="rounded border border-[var(--color-border)] px-3 py-1.5 text-sm"
            onClick={() => {
              const art: Artifact = {
                id: uid(),
                conversation_id: activeConversationId || "local",
                message_id: null,
                kind: "dcm",
                title: "CT series",
                content_path: null,
                content_text: "local:demo.dcm:0",
                meta_json: JSON.stringify({ modality: "CT" }),
                created_at: nowMs(),
              };
              setArtifacts([art, ...artifacts]);
              setActiveArtifactId(art.id);
              setPanel("chat");
            }}
          >
            Open DICOM artifact
          </button>
        </div>
        {protocol && (
          <pre className="mt-3 max-h-64 overflow-auto whitespace-pre-wrap rounded bg-black/30 p-3 text-xs">
            {protocol}
          </pre>
        )}
      </section>
    </div>
  );
}
