import type { AppMode } from "../types";
import {
  listArtifacts,
  listConversations,
  listMemory,
  listMessages,
  listProjects,
  listWidgets,
  saveArtifact,
  insertMessage,
  updateMessageContent,
  deleteMemory,
  upsertWidget,
  getModeDb,
  initMetaDb,
} from "../../db";
import { getSupabase, isSupabaseConfigured } from "./client";
import { useAuthStore } from "../../stores/authStore";
import { nowMs } from "../utils";

const CURSOR_KEY = "glow.sync.cursors";
const LAST_SYNC_KEY = "glow.sync.lastAt";

type Cursors = Record<string, number>;

const TABLES = [
  "sync_projects",
  "sync_conversations",
  "sync_messages",
  "sync_artifacts",
  "sync_widgets",
  "sync_memory",
  "sync_prefs",
] as const;

type SyncTable = (typeof TABLES)[number];

function readCursors(): Cursors {
  try {
    return JSON.parse(localStorage.getItem(CURSOR_KEY) || "{}") as Cursors;
  } catch {
    return {};
  }
}

function writeCursors(c: Cursors) {
  localStorage.setItem(CURSOR_KEY, JSON.stringify(c));
}

function collectPrefs(): Array<{ key: string; value: string; updated_at: number }> {
  const out: Array<{ key: string; value: string; updated_at: number }> = [];
  const t = nowMs();
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (!key) continue;
    if (!(key.startsWith("glow.") || key.startsWith("claude2."))) continue;
    if (/apikey|api_key|token|secret|supabase\.auth/i.test(key)) continue;
    const value = localStorage.getItem(key);
    if (value != null) out.push({ key, value, updated_at: t });
  }
  return out;
}

async function upsertRows(table: SyncTable, rows: Record<string, unknown>[]) {
  if (!rows.length) return;
  const sb = getSupabase();
  const { error } = await sb.from(table).upsert(rows, { onConflict: table === "sync_prefs" ? "user_id,key" : "user_id,id" });
  if (error) throw error;
}

export async function pushAllLocal(mode: AppMode = "home"): Promise<void> {
  if (!isSupabaseConfigured()) return;
  const user = useAuthStore.getState().user;
  if (!user) return;
  const userId = user.id;

  const [projects, conversations, memory] = await Promise.all([
    listProjects(mode),
    listConversations(mode),
    listMemory(),
  ]);

  await upsertRows(
    "sync_projects",
    projects.map((p) => ({
      user_id: userId,
      id: p.id,
      name: p.name,
      system_prompt: p.system_prompt,
      created_at: p.created_at,
      updated_at: p.updated_at,
      deleted_at: null,
    })),
  );

  await upsertRows(
    "sync_conversations",
    conversations.map((c) => ({
      user_id: userId,
      id: c.id,
      project_id: c.project_id,
      title: c.title,
      active_leaf_id: c.active_leaf_id,
      created_at: c.created_at,
      updated_at: c.updated_at,
      pinned: c.pinned ?? 0,
      unread: c.unread ?? 0,
      deleted_at: null,
    })),
  );

  const allMessages: Record<string, unknown>[] = [];
  const allArtifacts: Record<string, unknown>[] = [];
  const allWidgets: Record<string, unknown>[] = [];

  for (const conv of conversations) {
    const messages = await listMessages(mode, conv.id);
    for (const m of messages) {
      allMessages.push({
        user_id: userId,
        id: m.id,
        conversation_id: m.conversation_id,
        parent_id: m.parent_id,
        role: m.role,
        content: m.content,
        model_id: m.model_id,
        status: m.status === "streaming" ? "done" : m.status,
        created_at: m.created_at,
        updated_at: m.created_at,
        deleted_at: null,
      });
      const widgets = await listWidgets(mode, m.id);
      for (const w of widgets) {
        allWidgets.push({
          user_id: userId,
          id: w.id,
          message_id: w.message_id,
          widget_type: w.widget_type,
          state_json: w.state_json,
          updated_at: w.updated_at,
          deleted_at: null,
        });
      }
    }
    const artifacts = await listArtifacts(mode, conv.id);
    for (const a of artifacts) {
      allArtifacts.push({
        user_id: userId,
        id: a.id,
        conversation_id: a.conversation_id,
        message_id: a.message_id,
        kind: a.kind,
        title: a.title,
        content_path: a.content_path,
        content_text: a.content_text,
        meta_json: a.meta_json,
        created_at: a.created_at,
        updated_at: a.created_at,
        deleted_at: null,
      });
    }
  }

  // Batch in chunks to avoid payload limits
  const chunk = <T>(arr: T[], size: number) => {
    const out: T[][] = [];
    for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
    return out;
  };

  for (const part of chunk(allMessages, 80)) await upsertRows("sync_messages", part);
  for (const part of chunk(allArtifacts, 40)) await upsertRows("sync_artifacts", part);
  for (const part of chunk(allWidgets, 80)) await upsertRows("sync_widgets", part);

  await upsertRows(
    "sync_memory",
    memory.map((m) => ({
      user_id: userId,
      id: m.id,
      fact: m.fact,
      source_mode: m.source_mode,
      confidence: m.confidence,
      created_at: m.created_at,
      updated_at: m.updated_at,
      deleted_at: null,
    })),
  );

  await upsertRows(
    "sync_prefs",
    collectPrefs().map((p) => ({
      user_id: userId,
      key: p.key,
      value: p.value,
      updated_at: p.updated_at,
      deleted_at: null,
    })),
  );
}

async function applyRemoteRow(table: SyncTable, row: Record<string, unknown>, mode: AppMode) {
  if (row.deleted_at) {
    // Soft/hard local cleanup for tombstones
    if (table === "sync_memory" && typeof row.id === "string") {
      try {
        await deleteMemory(row.id);
      } catch {
        /* ignore */
      }
    }
    if (table === "sync_prefs" && typeof row.key === "string") {
      localStorage.removeItem(row.key);
    }
    if (table === "sync_conversations" && typeof row.id === "string") {
      const db = await getModeDb(mode);
      await db.execute(`DELETE FROM messages WHERE conversation_id = $1`, [row.id]);
      await db.execute(`DELETE FROM artifacts WHERE conversation_id = $1`, [row.id]);
      await db.execute(`DELETE FROM conversations WHERE id = $1`, [row.id]);
    }
    return;
  }

  if (table === "sync_projects") {
    const db = await getModeDb(mode);
    const existing = await db.select<{ id: string }>(`SELECT id FROM projects WHERE id = $1`, [row.id]);
    if (existing.length) {
      await db.execute(
        `UPDATE projects SET name = $1, system_prompt = $2, updated_at = $3 WHERE id = $4`,
        [row.name, row.system_prompt, row.updated_at, row.id],
      );
    } else {
      await db.execute(
        `INSERT INTO projects (id, name, system_prompt, created_at, updated_at) VALUES ($1,$2,$3,$4,$5)`,
        [row.id, row.name, row.system_prompt, row.created_at, row.updated_at],
      );
    }
    return;
  }

  if (table === "sync_conversations") {
    const db = await getModeDb(mode);
    const existing = await db.select<{ id: string }>(`SELECT id FROM conversations WHERE id = $1`, [
      row.id,
    ]);
    if (existing.length) {
      await db.execute(
        `UPDATE conversations SET project_id=$1, title=$2, active_leaf_id=$3, updated_at=$4, pinned=$5, unread=$6 WHERE id=$7`,
        [
          row.project_id,
          row.title,
          row.active_leaf_id,
          row.updated_at,
          row.pinned ?? 0,
          row.unread ?? 0,
          row.id,
        ],
      );
    } else {
      await db.execute(
        `INSERT INTO conversations (id, project_id, title, active_leaf_id, created_at, updated_at, pinned, unread)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
        [
          row.id,
          row.project_id,
          row.title,
          row.active_leaf_id,
          row.created_at,
          row.updated_at,
          row.pinned ?? 0,
          row.unread ?? 0,
        ],
      );
    }
    return;
  }

  if (table === "sync_messages") {
    const db = await getModeDb(mode);
    const existing = await db.select<{ id: string }>(`SELECT id FROM messages WHERE id = $1`, [row.id]);
    if (existing.length) {
      await updateMessageContent(mode, String(row.id), String(row.content ?? ""), (row.status as "done") || "done");
    } else {
      await insertMessage(mode, {
        id: String(row.id),
        conversation_id: String(row.conversation_id),
        parent_id: (row.parent_id as string | null) ?? null,
        role: row.role as "user" | "assistant" | "system" | "tool",
        content: String(row.content ?? ""),
        model_id: (row.model_id as string | null) ?? null,
        status: (row.status as "done") || "done",
        created_at: Number(row.created_at) || nowMs(),
      });
    }
    return;
  }

  if (table === "sync_artifacts") {
    const db = await getModeDb(mode);
    const existing = await db.select<{ id: string }>(`SELECT id FROM artifacts WHERE id = $1`, [row.id]);
    if (!existing.length) {
      await saveArtifact(mode, {
        id: String(row.id),
        conversation_id: String(row.conversation_id),
        message_id: (row.message_id as string | null) ?? null,
        kind: row.kind as "html" | "code" | "pdf" | "stl" | "obj" | "dcm" | "jupyter" | "image",
        title: (row.title as string | null) ?? null,
        content_path: (row.content_path as string | null) ?? null,
        content_text: (row.content_text as string | null) ?? null,
        meta_json: String(row.meta_json ?? "{}"),
        created_at: Number(row.created_at) || nowMs(),
      });
    }
    return;
  }

  if (table === "sync_widgets") {
    await upsertWidget(mode, {
      id: String(row.id),
      message_id: String(row.message_id),
      widget_type: row.widget_type as "checklist" | "progress" | "flashcard" | "flashcards" | "biomarker_table",
      state_json: String(row.state_json ?? "{}"),
      updated_at: Number(row.updated_at) || nowMs(),
    });
    return;
  }

  if (table === "sync_memory") {
    const rows = await listMemory();
    if (!rows.some((m) => m.id === row.id)) {
      const db = await initMetaDb();
      await db.execute(
        `INSERT INTO global_memory (id, fact, source_mode, confidence, created_at, updated_at) VALUES ($1,$2,$3,$4,$5,$6)`,
        [
          row.id,
          row.fact,
          row.source_mode,
          row.confidence ?? 1,
          row.created_at,
          row.updated_at,
        ],
      );
    } else {
      const db = await initMetaDb();
      await db.execute(
        `UPDATE global_memory SET fact=$1, source_mode=$2, confidence=$3, updated_at=$4 WHERE id=$5`,
        [row.fact, row.source_mode, row.confidence ?? 1, row.updated_at, row.id],
      );
    }
    return;
  }

  if (table === "sync_prefs" && typeof row.key === "string" && typeof row.value === "string") {
    localStorage.setItem(row.key, row.value);
  }
}

export async function pullRemote(mode: AppMode = "home"): Promise<number> {
  if (!isSupabaseConfigured()) return 0;
  const user = useAuthStore.getState().user;
  if (!user) return 0;

  const sb = getSupabase();
  const cursors = readCursors();
  let applied = 0;

  for (const table of TABLES) {
    const since = cursors[table] || 0;
    const { data, error } = await sb
      .from(table)
      .select("*")
      .gt("rev", since)
      .order("rev", { ascending: true })
      .limit(500);
    if (error) throw error;
    const rows = (data || []) as Array<Record<string, unknown> & { rev: number }>;
    for (const row of rows) {
      await applyRemoteRow(table, row, mode);
      cursors[table] = Math.max(cursors[table] || 0, Number(row.rev) || 0);
      applied += 1;
    }
  }

  writeCursors(cursors);
  localStorage.setItem(LAST_SYNC_KEY, String(Date.now()));
  return applied;
}

export async function fullSync(mode: AppMode = "home"): Promise<{ pushed: boolean; pulled: number }> {
  await pushAllLocal(mode);
  const pulled = await pullRemote(mode);
  return { pushed: true, pulled };
}

export function getLastSyncAt(): number | null {
  const v = localStorage.getItem(LAST_SYNC_KEY);
  return v ? Number(v) : null;
}
