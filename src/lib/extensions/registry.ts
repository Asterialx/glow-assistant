import { create } from "zustand";
import { EXTENSION_CATALOG, type ExtensionId } from "./catalog";
import { setMcpEnabled } from "../tauri";
import { useModeStore } from "../../stores/modeStore";

export interface InstalledExtension {
  id: ExtensionId;
  enabled: boolean;
  installedAt: number;
  config: Record<string, string>;
}

interface ExtensionsState {
  installed: InstalledExtension[];
  install: (id: ExtensionId) => Promise<void>;
  uninstall: (id: ExtensionId) => Promise<void>;
  setEnabled: (id: ExtensionId, enabled: boolean) => Promise<void>;
  setConfig: (id: ExtensionId, key: string, value: string) => void;
  isInstalled: (id: ExtensionId) => boolean;
  isEnabled: (id: ExtensionId) => boolean;
  getConfig: (id: ExtensionId, key: string, fallback?: string) => string;
  enabledAcceptAttr: () => string | undefined;
  capabilityHints: () => string;
}

const KEY = "glow.extensions.installed";

function loadInstalled(): InstalledExtension[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const list = JSON.parse(raw) as InstalledExtension[];
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

function save(list: InstalledExtension[]) {
  localStorage.setItem(KEY, JSON.stringify(list));
}

async function activate(id: ExtensionId, enabled: boolean) {
  const def = EXTENSION_CATALOG.find((e) => e.id === id);
  if (!def) return;

  if (def.mcpId) {
    await setMcpEnabled(def.mcpId, enabled);
  }

  if (id === "chrome") {
    useModeStore.getState().setChromeAgentActive(enabled);
  }
}

export const useExtensionsStore = create<ExtensionsState>((set, get) => ({
  installed: loadInstalled(),

  install: async (id) => {
    const def = EXTENSION_CATALOG.find((e) => e.id === id);
    if (!def) return;
    const { installed } = get();
    if (installed.some((x) => x.id === id)) {
      await get().setEnabled(id, true);
      return;
    }
    const config: Record<string, string> = {};
    for (const c of def.configKeys || []) {
      config[c.key] = "";
    }
    const next: InstalledExtension[] = [
      ...installed,
      { id, enabled: true, installedAt: Date.now(), config },
    ];
    save(next);
    set({ installed: next });
    await activate(id, true);
  },

  uninstall: async (id) => {
    await activate(id, false);
    const next = get().installed.filter((x) => x.id !== id);
    save(next);
    set({ installed: next });
  },

  setEnabled: async (id, enabled) => {
    const next = get().installed.map((x) => (x.id === id ? { ...x, enabled } : x));
    save(next);
    set({ installed: next });
    await activate(id, enabled);
  },

  setConfig: (id, key, value) => {
    const next = get().installed.map((x) =>
      x.id === id ? { ...x, config: { ...x.config, [key]: value } } : x,
    );
    save(next);
    set({ installed: next });
  },

  isInstalled: (id) => get().installed.some((x) => x.id === id),

  isEnabled: (id) => get().installed.some((x) => x.id === id && x.enabled),

  getConfig: (id, key, fallback = "") => {
    const item = get().installed.find((x) => x.id === id);
    return item?.config[key] || fallback;
  },

  enabledAcceptAttr: () => {
    const parts = EXTENSION_CATALOG.filter((d) => get().isEnabled(d.id) && d.accept).map(
      (d) => d.accept!,
    );
    if (!parts.length) return undefined;
    return parts.join(",");
  },

  capabilityHints: () => {
    const lines = EXTENSION_CATALOG.filter((d) => get().isEnabled(d.id)).flatMap(
      (d) => d.capabilities,
    );
    if (!lines.length) return "";
    return ["Enabled Glow desktop extensions:", ...lines.map((l) => `- ${l}`)].join("\n");
  },
}));

/** Sync MCP enable flags on app boot for already-installed extensions. */
export async function hydrateExtensionMcp() {
  const { installed } = useExtensionsStore.getState();
  for (const item of installed) {
    if (!item.enabled) continue;
    await activate(item.id, true);
  }
}
