import { useEffect, useState } from "react";
import { listDomainRecords, saveDomainRecord } from "../../db";
import { useModeStore } from "../../stores/modeStore";
import { focusAssistHint } from "../../lib/tauri";
import { useChatStore } from "../../stores/chatStore";
import { nowMs, uid } from "../../lib/utils";
import type { Artifact } from "../../lib/types";

export function StudyPanel() {
  const mode = useModeStore((s) => s.mode);
  const [front, setFront] = useState("Big-O of binary search");
  const [back, setBack] = useState("O(log n)");
  const [cards, setCards] = useState<Array<{ id: string; payload_json: string }>>([]);
  const [seconds, setSeconds] = useState(25 * 60);
  const [running, setRunning] = useState(false);
  const [hint, setHint] = useState("");
  const setArtifacts = useChatStore((s) => s.setArtifacts);
  const artifacts = useChatStore((s) => s.artifacts);
  const activeConversationId = useChatStore((s) => s.activeConversationId);
  const setActiveArtifactId = useChatStore((s) => s.setActiveArtifactId);
  const setPanel = useChatStore((s) => s.setPanel);

  const refresh = () => listDomainRecords(mode, "srs_card").then(setCards);
  useEffect(() => {
    refresh();
  }, [mode]);

  useEffect(() => {
    if (!running) return;
    const t = setInterval(() => setSeconds((s) => (s > 0 ? s - 1 : 0)), 1000);
    return () => clearInterval(t);
  }, [running]);

  const mm = String(Math.floor(seconds / 60)).padStart(2, "0");
  const ss = String(seconds % 60).padStart(2, "0");

  return (
    <div className="flex-1 space-y-6 overflow-y-auto p-6">
      <div>
        <h2 className="font-[family-name:var(--font-display)] text-xl font-semibold">
          Design, Study & Focus
        </h2>
        <p className="mt-1 text-sm text-[var(--color-muted)]">
          Spaced repetition, Jupyter artifacts, Design & Reflect prototypes, Pomodoro.
        </p>
      </div>

      <section className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-2)] p-4">
        <h3 className="text-sm font-medium">Spaced repetition</h3>
        <div className="mt-2 grid gap-2 sm:grid-cols-2">
          <input
            className="rounded border border-[var(--color-border)] bg-black/20 px-2 py-1.5 text-sm"
            value={front}
            onChange={(e) => setFront(e.target.value)}
            placeholder="Front"
          />
          <input
            className="rounded border border-[var(--color-border)] bg-black/20 px-2 py-1.5 text-sm"
            value={back}
            onChange={(e) => setBack(e.target.value)}
            placeholder="Back"
          />
        </div>
        <button
          type="button"
          className="mt-2 rounded bg-[var(--accent)] px-3 py-1.5 text-sm text-[#0c0e12]"
          onClick={async () => {
            await saveDomainRecord(mode, "srs_card", {
              front,
              back,
              interval: 1,
              ease: 2.5,
              due: nowMs() + 86400000,
            });
            refresh();
          }}
        >
          Add card
        </button>
        <ul className="mt-3 space-y-1 text-sm text-[var(--color-muted)]">
          {cards.slice(0, 8).map((c) => {
            const p = JSON.parse(c.payload_json) as { front: string; back: string };
            return (
              <li key={c.id}>
                {p.front} → {p.back}
              </li>
            );
          })}
        </ul>
      </section>

      <section className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-2)] p-4">
        <h3 className="text-sm font-medium">Claude Design & Reflect</h3>
        <p className="mt-1 text-xs text-[var(--color-muted)]">
          Generates a clickable HTML prototype into the Artifacts panel.
        </p>
        <button
          type="button"
          className="mt-2 rounded border border-[var(--color-border)] px-3 py-1.5 text-sm"
          onClick={() => {
            const html = `<!doctype html><html><body style="font-family:system-ui;background:#0f1419;color:#e8eaf0;padding:2rem">
              <h1>Prototype</h1>
              <p>Self-reflection: clarify primary user job, reduce chrome, one CTA.</p>
              <button onclick="alert('CTA')">Primary action</button>
            </body></html>`;
            const art: Artifact = {
              id: uid(),
              conversation_id: activeConversationId || "local",
              message_id: null,
              kind: "html",
              title: "Design prototype",
              content_path: null,
              content_text: html,
              meta_json: "{}",
              created_at: nowMs(),
            };
            setArtifacts([art, ...artifacts]);
            setActiveArtifactId(art.id);
            setPanel("chat");
          }}
        >
          Generate prototype
        </button>
        <button
          type="button"
          className="ml-2 rounded border border-[var(--color-border)] px-3 py-1.5 text-sm"
          onClick={() => {
            const art: Artifact = {
              id: uid(),
              conversation_id: activeConversationId || "local",
              message_id: null,
              kind: "jupyter",
              title: "Notebook",
              content_path: null,
              content_text: "import math\nprint(math.pi)",
              meta_json: "{}",
              created_at: nowMs(),
            };
            setArtifacts([art, ...artifacts]);
            setActiveArtifactId(art.id);
            setPanel("chat");
          }}
        >
          Open Jupyter cell
        </button>
      </section>

      <section className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-2)] p-4">
        <h3 className="text-sm font-medium">Pomodoro</h3>
        <div className="mt-2 font-[family-name:var(--font-mono)] text-3xl">
          {mm}:{ss}
        </div>
        <div className="mt-2 flex gap-2">
          <button
            type="button"
            className="rounded bg-[var(--accent)] px-3 py-1.5 text-sm text-[#0c0e12]"
            onClick={() => setRunning((r) => !r)}
          >
            {running ? "Pause" : "Start"}
          </button>
          <button
            type="button"
            className="rounded border border-[var(--color-border)] px-3 py-1.5 text-sm"
            onClick={() => {
              setRunning(false);
              setSeconds(25 * 60);
            }}
          >
            Reset
          </button>
          <button
            type="button"
            className="rounded border border-[var(--color-border)] px-3 py-1.5 text-sm"
            onClick={async () => setHint(await focusAssistHint())}
          >
            OS Focus hint
          </button>
        </div>
        {hint && <p className="mt-2 text-xs text-[var(--color-muted)]">{hint}</p>}
      </section>
    </div>
  );
}
