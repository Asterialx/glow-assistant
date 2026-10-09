import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";

const isTauri = () =>
  typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

export async function safeInvoke<T>(cmd: string, args?: Record<string, unknown>): Promise<T | null> {
  if (!isTauri()) return null;
  try {
    return await invoke<T>(cmd, args);
  } catch (e) {
    console.warn(`invoke ${cmd} failed`, e);
    return null;
  }
}

export async function redactPii(text: string): Promise<{ text: string; redacted_count: number }> {
  const result = await safeInvoke<{ text: string; redacted_count: number }>("redact_pii", { text });
  if (result) return result;
  // Browser fallback — keep in sync with src-tauri/src/pii.rs
  let out = text;
  let count = 0;
  const rules: Array<[RegExp, string]> = [
    [/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, "[REDACTED_EMAIL]"],
    [
      /\b(?:\+?\d{1,3}[-.\s]?)?(?:\(?\d{2,4}\)?[-.\s]?)?\d{3}[-.\s]?\d{2}[-.\s]?\d{2}\b/gi,
      "[REDACTED_PHONE]",
    ],
    [/\b(?:MRN|ID|Patient\s*#?)\s*[:=]?\s*[A-Z0-9-]{4,}\b/gi, "[REDACTED_MRN]"],
    [/\b\d{3}-\d{2}-\d{4}\b/g, "[REDACTED_SSN]"],
    [/(?:пациент|patient|фио|name)\s*[:=]\s*[^\n,;]{2,60}/gi, "[REDACTED_NAME]"],
  ];
  for (const [re, replacement] of rules) {
    out = out.replace(re, () => {
      count++;
      return replacement;
    });
  }
  return { text: out, redacted_count: count };
}

export type GameModeState = {
  active: boolean;
  detected_process: string | null;
  watchlist: string[];
  forced: boolean;
};

export async function getGameModeStatus(): Promise<GameModeState | null> {
  return safeInvoke<GameModeState>("game_mode_status");
}

export async function forceGameMode(forced: boolean) {
  return safeInvoke<GameModeState>("game_mode_force", { forced });
}

export async function onGameMode(cb: (s: GameModeState) => void) {
  if (!isTauri()) return () => {};
  const un = await listen<GameModeState>("game-mode", (e) => cb(e.payload));
  return () => {
    un();
  };
}

export async function listMcp() {
  const remote = await safeInvoke<
    Array<{
      id: string;
      name: string;
      transport: string;
      command_or_url: string;
      args: string[];
      enabled: boolean;
      category: string;
    }>
  >("mcp_list");

  const base =
    remote ||
    ([
      {
        id: "filesystem",
        name: "Filesystem",
        transport: "stdio",
        command_or_url: "npx",
        args: ["-y", "@modelcontextprotocol/server-filesystem"],
        enabled: false,
        category: "files",
      },
      {
        id: "vscode",
        name: "VS Code / Cursor",
        transport: "stdio",
        command_or_url: "npx",
        args: [],
        enabled: false,
        category: "ide",
      },
      {
        id: "chrome",
        name: "Chrome Agent (Playwright)",
        transport: "stdio",
        command_or_url: "npx",
        args: [],
        enabled: false,
        category: "browser",
      },
      {
        id: "medical-db",
        name: "Medical Drug DB",
        transport: "stdio",
        command_or_url: "medical-mcp",
        args: [],
        enabled: false,
        category: "medical",
      },
      {
        id: "blender",
        name: "Blender",
        transport: "stdio",
        command_or_url: "blender-mcp",
        args: [],
        enabled: false,
        category: "design",
      },
      {
        id: "roblox",
        name: "Roblox Studio",
        transport: "stdio",
        command_or_url: "roblox-studio-mcp",
        args: [],
        enabled: false,
        category: "game-dev",
      },
      {
        id: "unity",
        name: "Unity",
        transport: "stdio",
        command_or_url: "unity-mcp",
        args: [],
        enabled: false,
        category: "game-dev",
      },
    ] as const).map((s) => ({ ...s, args: [...s.args] }));

  // Overlay enable flags from Extensions store (works in browser + Tauri)
  try {
    const { useExtensionsStore } = await import("./extensions/registry");
    const { EXTENSION_CATALOG } = await import("./extensions/catalog");
    const installed = useExtensionsStore.getState().installed;
    const byMcp = new Map<string, boolean>();
    for (const def of EXTENSION_CATALOG) {
      if (!def.mcpId) continue;
      const item = installed.find((i) => i.id === def.id);
      if (item) byMcp.set(def.mcpId, item.enabled);
    }
    return base.map((s) =>
      byMcp.has(s.id) ? { ...s, enabled: byMcp.get(s.id)! } : s,
    );
  } catch {
    return base;
  }
}

export async function setMcpEnabled(id: string, enabled: boolean) {
  return safeInvoke("mcp_set_enabled", { id, enabled });
}

export async function runShell(
  command: string,
  cwd?: string,
): Promise<{ stdout: string; stderr: string; code: number } | null> {
  // Arbitrary shell execution is intentionally unavailable in the desktop app.
  void command;
  void cwd;
  return null;
}

/** Open URL or launch Chrome (Tauri shell; browser fallback). */
export async function openExternal(url: string) {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return false;
  }
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") return false;

  try {
    const { open } = await import("@tauri-apps/plugin-shell");
    await open(parsed.toString());
    return true;
  } catch {
    try {
      window.open(url, "_blank", "noopener,noreferrer");
      return true;
    } catch {
      return false;
    }
  }
}

/** Launch Google Chrome; fall back to default browser. */
export async function openChromeBrowser(url = "https://www.google.com") {
  return openExternal(url);
}

export async function listDirectory(
  path: string,
): Promise<Array<{ name: string; path: string; is_dir: boolean }> | null> {
  // Arbitrary filesystem traversal is intentionally unavailable in the desktop app.
  void path;
  return null;
}

export async function parseBiomarkers(text: string) {
  const remote = await safeInvoke<
    Array<{
      name: string;
      value: number;
      unit: string;
      ref_low: number | null;
      ref_high: number | null;
      out_of_range: boolean;
    }>
  >("parse_biomarker_text", { text });
  if (remote && remote.length) return remote;

  // Browser / fallback parser
  const rows = [];
  for (const line of text.split("\n")) {
    const parts = line
      .split(/[\t,|]/)
      .map((s) => s.trim())
      .filter(Boolean);
    if (parts.length < 2) continue;
    const value = Number(parts[1].replace(",", "."));
    if (Number.isNaN(value)) continue;
    const ref_low = parts[3] != null ? Number(parts[3].replace(",", ".")) : null;
    const ref_high = parts[4] != null ? Number(parts[4].replace(",", ".")) : null;
    const out_of_range =
      (ref_low != null && !Number.isNaN(ref_low) && value < ref_low) ||
      (ref_high != null && !Number.isNaN(ref_high) && value > ref_high);
    rows.push({
      name: parts[0],
      value,
      unit: parts[2] || "",
      ref_low: ref_low != null && !Number.isNaN(ref_low) ? ref_low : null,
      ref_high: ref_high != null && !Number.isNaN(ref_high) ? ref_high : null,
      out_of_range,
    });
  }
  return rows;
}

export async function checkDrugs(items: string[]) {
  const remote = await safeInvoke<
    Array<{ pair: [string, string]; severity: string; note: string }>
  >("check_drug_interactions", { items });
  if (remote) return remote;

  const known: Array<[string, string, string, string]> = [
    ["warfarin", "vitamin k", "high", "Vitamin K antagonizes warfarin anticoagulation."],
    ["warfarin", "aspirin", "high", "Increased bleeding risk."],
    ["metformin", "alcohol", "moderate", "Risk of lactic acidosis with heavy alcohol use."],
    ["omega-3", "warfarin", "moderate", "May potentiate anticoagulant effect."],
    ["iron", "calcium", "moderate", "Calcium may reduce iron absorption."],
  ];
  const normalized = items.map((s) => s.trim().toLowerCase());
  const results: Array<{ pair: [string, string]; severity: string; note: string }> = [];
  for (let i = 0; i < normalized.length; i++) {
    for (let j = i + 1; j < normalized.length; j++) {
      for (const [x, y, sev, note] of known) {
        if (
          (normalized[i].includes(x) && normalized[j].includes(y)) ||
          (normalized[i].includes(y) && normalized[j].includes(x))
        ) {
          results.push({ pair: [items[i], items[j]], severity: sev, note });
        }
      }
    }
  }
  return results;
}

export async function generateProtocol(opts: {
  patientLabel: string;
  goals: string[];
  supplements: string[];
  dietNotes: string;
}) {
  const remote = await safeInvoke<string>("generate_protocol_markdown", {
    patientLabel: opts.patientLabel,
    goals: opts.goals,
    supplements: opts.supplements,
    dietNotes: opts.dietNotes,
  });
  if (remote) return remote;
  return `# Dietary & Supplement Protocol

**Subject label:** ${opts.patientLabel}
**Disclaimer:** Not a medical device.

## Goals
${opts.goals.map((g) => `- ${g}`).join("\n")}

## Dietary notes
${opts.dietNotes}

## Supplement plan
${opts.supplements.map((s) => `- ${s}`).join("\n")}
`;
}

export async function focusAssistHint() {
  return (
    (await safeInvoke<string>("focus_assist_hint")) ||
    "Enable Focus Assist in Windows Settings → System → Focus."
  );
}

export async function whisperStub(audioPath: string) {
  return safeInvoke<string>("whisper_transcribe_stub", { audioPath });
}
