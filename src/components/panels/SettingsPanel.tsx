import { useEffect, useState } from "react";
import { setApiKey } from "../../lib/llm/smartapi";
import { listMemory } from "../../db";
import type { GlobalMemory } from "../../lib/types";
import { forceGameMode, getGameModeStatus, safeInvoke } from "../../lib/tauri";

export function SettingsPanel() {
  const [key, setKey] = useState(
    localStorage.getItem("claude2.apiKey") ||
      import.meta.env.VITE_SMARTAPI_KEY ||
      "",
  );
  const [base] = useState(
    import.meta.env.VITE_SMARTAPI_BASE_URL || "https://api.smartapi.shop/v1",
  );
  const [memory, setMemory] = useState<GlobalMemory[]>([]);
  const [watch, setWatch] = useState("osu!.exe, ModernWarfare.exe, Warzone.exe");

  useEffect(() => {
    listMemory().then(setMemory);
    getGameModeStatus().then((s) => {
      if (s?.watchlist?.length) setWatch(s.watchlist.join(", "));
    });
  }, []);

  return (
    <div className="flex-1 space-y-6 overflow-y-auto p-6">
      <div>
        <h2 className="font-[family-name:var(--font-display)] text-xl font-semibold">Settings</h2>
        <p className="mt-1 text-sm text-[var(--color-muted)]">
          API keys stay on this device. Prefer env / local settings — do not commit secrets.
        </p>
      </div>

      <section className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-2)] p-4">
        <h3 className="text-sm font-medium">SmartAPI</h3>
        <label className="mt-2 block text-xs text-[var(--color-muted)]">Base URL</label>
        <input
          className="mt-1 w-full rounded border border-[var(--color-border)] bg-black/20 px-2 py-1.5 font-[family-name:var(--font-mono)] text-xs"
          value={base}
          readOnly
        />
        <label className="mt-3 block text-xs text-[var(--color-muted)]">API Key</label>
        <input
          type="password"
          className="mt-1 w-full rounded border border-[var(--color-border)] bg-black/20 px-2 py-1.5 font-[family-name:var(--font-mono)] text-xs"
          value={key}
          onChange={(e) => setKey(e.target.value)}
        />
        <button
          type="button"
          className="mt-2 rounded bg-[var(--accent)] px-3 py-1.5 text-sm text-[#0c0e12]"
          onClick={() => {
            setApiKey(key);
            alert("API key saved locally");
          }}
        >
          Save key
        </button>
      </section>

      <section className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-2)] p-4">
        <h3 className="text-sm font-medium">Game Mode watchlist</h3>
        <input
          className="mt-2 w-full rounded border border-[var(--color-border)] bg-black/20 px-2 py-1.5 text-xs"
          value={watch}
          onChange={(e) => setWatch(e.target.value)}
        />
        <button
          type="button"
          className="mt-2 rounded border border-[var(--color-border)] px-3 py-1.5 text-sm"
          onClick={async () => {
            await safeInvoke("game_mode_set_watchlist", {
              watchlist: watch.split(",").map((s) => s.trim()).filter(Boolean),
            });
          }}
        >
          Apply watchlist
        </button>
        <button
          type="button"
          className="ml-2 rounded border border-[var(--color-border)] px-3 py-1.5 text-sm"
          onClick={() => forceGameMode(false)}
        >
          Clear forced Game Mode
        </button>
      </section>

      <section className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-2)] p-4">
        <h3 className="text-sm font-medium">Global memory</h3>
        <ul className="mt-2 space-y-1 text-sm text-[var(--color-muted)]">
          {memory.length === 0 && <li>No facts stored yet. Assistant lines like “Fact: …” are captured.</li>}
          {memory.map((m) => (
            <li key={m.id}>
              [{m.source_mode}] {m.fact}
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
