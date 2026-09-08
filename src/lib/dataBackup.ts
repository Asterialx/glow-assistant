import {
  listArtifacts,
  listConversations,
  listMemory,
  listMessages,
  listProjects,
  listWidgets,
} from "../db";
import type { AppMode, Artifact, Conversation, GlobalMemory, Message, Project, UiWidget } from "./types";

export const BACKUP_VERSION = 1 as const;

export type GlowBackup = {
  version: typeof BACKUP_VERSION;
  exportedAt: number;
  mode: AppMode;
  projects: Project[];
  memory: GlobalMemory[];
  chats: Array<{
    conversation: Conversation;
    messages: Message[];
    artifacts: Artifact[];
    widgets: UiWidget[];
  }>;
  prefs: Record<string, string>;
};

const PREF_PREFIXES = ["glow.", "claude2."];

function collectPrefs(): Record<string, string> {
  const out: Record<string, string> = {};
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (!key) continue;
    if (!PREF_PREFIXES.some((p) => key.startsWith(p))) continue;
    // Never dump API keys into a shareable backup file by default
    if (/apikey|api_key|token|secret/i.test(key)) continue;
    const val = localStorage.getItem(key);
    if (val != null) out[key] = val;
  }
  return out;
}

export async function buildFullBackup(mode: AppMode): Promise<GlowBackup> {
  const [projects, memory, conversations] = await Promise.all([
    listProjects(mode),
    listMemory(),
    listConversations(mode),
  ]);

  const chats: GlowBackup["chats"] = [];
  for (const conversation of conversations) {
    const messages = await listMessages(mode, conversation.id);
    const artifacts = await listArtifacts(mode, conversation.id);
    const widgets: UiWidget[] = [];
    for (const m of messages) {
      widgets.push(...(await listWidgets(mode, m.id)));
    }
    chats.push({ conversation, messages, artifacts, widgets });
  }

  return {
    version: BACKUP_VERSION,
    exportedAt: Date.now(),
    mode,
    projects,
    memory,
    chats,
    prefs: collectPrefs(),
  };
}

export function downloadBackupJson(backup: GlowBackup, filename?: string) {
  const blob = new Blob([JSON.stringify(backup, null, 2)], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download =
    filename ||
    `glow-backup-${backup.mode}-${new Date(backup.exportedAt).toISOString().slice(0, 10)}.json`;
  a.click();
  URL.revokeObjectURL(url);
}
