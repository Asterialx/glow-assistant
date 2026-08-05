import { useEffect, useState } from "react";
import { forceGameMode, listDirectory, listMcp, runShell, setMcpEnabled } from "../../lib/tauri";
import { useModeStore } from "../../stores/modeStore";

export function AgentsPanel() {
  const [servers, setServers] = useState<
    Array<{ id: string; name: string; enabled: boolean; category: string; command_or_url: string }>
  >([]);
  const [cmd, setCmd] = useState("echo Glow Dev Mode");
  const [out, setOut] = useState("");
  const [dirPath, setDirPath] = useState("C:\\");
  const [entries, setEntries] = useState<Array<{ name: string; path: string; is_dir: boolean }>>([]);
  const gameModeActive = useModeStore((s) => s.gameModeActive);
  const setGameModeActive = useModeStore((s) => s.setGameModeActive);

  const refresh = async () => {
    const list = await listMcp();
    setServers(list);
  };

  useEffect(() => {
    refresh();
  }, []);

  return (
    <div className="flex-1 space-y-6 overflow-y-auto p-6">
      <div>
        <h2 className="font-[family-name:var(--font-display)] text-xl font-semibold">Agents & MCP</h2>
        <p className="mt-1 text-sm text-[var(--color-muted)]">
          Connectors for IDE, Blender, Roblox, Unity, Chrome, and medical DB. Heavy agents pause in Game Mode.
        </p>
      </div>

      <div className="flex items-center gap-3 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-2)] p-3">
        <div className="flex-1">
          <div className="text-sm font-medium">Game Mode</div>
          <div className="text-xs text-[var(--color-muted)]">
            {gameModeActive
              ? "Active — memory indexing & local LLMs suspended"
              : "Idle — watching osu! / Warzone process list"}
          </div>
        </div>
        <button
          type="button"
          className="rounded-md border border-[var(--color-border)] px-3 py-1.5 text-sm"
          onClick={async () => {
            const next = !gameModeActive;
            await forceGameMode(next);
            setGameModeActive(next);
          }}
        >
          {gameModeActive ? "Exit" : "Force on"}
        </button>
      </div>

      <div className="space-y-2">
        <h3 className="text-sm font-medium">MCP connectors</h3>
        {servers.map((s) => (
          <div
            key={s.id}
            className="flex items-center justify-between rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-2)] px-3 py-2"
          >
            <div>
              <div className="text-sm">{s.name}</div>
              <div className="text-[11px] text-[var(--color-muted)]">
                {s.category} · {s.command_or_url}
              </div>
            </div>
            <button
              type="button"
              className="rounded px-2 py-1 text-xs"
              style={{ background: s.enabled ? "var(--accent)" : "transparent", color: s.enabled ? "#0c0e12" : undefined, border: "1px solid var(--color-border)" }}
              onClick={async () => {
                await setMcpEnabled(s.id, !s.enabled);
                refresh();
              }}
            >
              {s.enabled ? "On" : "Off"}
            </button>
          </div>
        ))}
        {servers.length === 0 && (
          <p className="text-xs text-[var(--color-muted)]">
            MCP list available when running under Tauri. Browser preview shows empty connectors.
          </p>
        )}
      </div>

      <div>
        <h3 className="mb-2 text-sm font-medium">Developer Mode terminal</h3>
        <div className="flex gap-2">
          <input
            className="flex-1 rounded border border-[var(--color-border)] bg-black/30 px-2 py-1.5 font-[family-name:var(--font-mono)] text-xs"
            value={cmd}
            onChange={(e) => setCmd(e.target.value)}
          />
          <button
            type="button"
            className="rounded bg-[var(--accent)] px-3 text-sm text-[#0c0e12]"
            onClick={async () => {
              const r = await runShell(cmd);
              setOut(r ? `${r.stdout}${r.stderr}\n[exit ${r.code}]` : "[browser] Shell requires Tauri");
            }}
          >
            Run
          </button>
        </div>
        <pre className="mt-2 max-h-40 overflow-auto rounded bg-black/40 p-2 text-xs">{out}</pre>
      </div>

      <div>
        <h3 className="mb-2 text-sm font-medium">Desktop Agent — browse FS</h3>
        <div className="flex gap-2">
          <input
            className="flex-1 rounded border border-[var(--color-border)] bg-black/30 px-2 py-1.5 font-[family-name:var(--font-mono)] text-xs"
            value={dirPath}
            onChange={(e) => setDirPath(e.target.value)}
          />
          <button
            type="button"
            className="rounded border border-[var(--color-border)] px-3 text-sm"
            onClick={async () => {
              const list = (await listDirectory(dirPath)) || [];
              setEntries(list.slice(0, 50));
            }}
          >
            List
          </button>
        </div>
        <ul className="mt-2 max-h-40 overflow-auto text-xs text-[var(--color-muted)]">
          {entries.map((e) => (
            <li key={e.path}>
              {e.is_dir ? "📁" : "📄"} {e.name}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
