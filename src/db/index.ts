import { MODEL_CATALOG } from "../lib/models";
import type {
  AppMode,
  Artifact,
  Conversation,
  GlobalMemory,
  Message,
  Project,
  TokenUsage,
  UiWidget,
} from "../lib/types";
import { nowMs, uid } from "../lib/utils";
import { createWebMemoryDb } from "./webMemoryDb";

const isTauri = () =>
  typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

type DbLike = {
  execute: (query: string, binds?: unknown[]) => Promise<{ rowsAffected: number }>;
  select: <T>(query: string, binds?: unknown[]) => Promise<T[]>;
};

const MODE_SQL = `
CREATE TABLE IF NOT EXISTS projects (
  id TEXT PRIMARY KEY, name TEXT NOT NULL, system_prompt TEXT NOT NULL DEFAULT '',
  created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS conversations (
  id TEXT PRIMARY KEY, project_id TEXT, title TEXT NOT NULL DEFAULT 'New chat',
  active_leaf_id TEXT, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL,
  pinned INTEGER NOT NULL DEFAULT 0, unread INTEGER NOT NULL DEFAULT 0);
CREATE TABLE IF NOT EXISTS messages (
  id TEXT PRIMARY KEY, conversation_id TEXT NOT NULL, parent_id TEXT,
  role TEXT NOT NULL, content TEXT NOT NULL DEFAULT '', model_id TEXT,
  status TEXT NOT NULL DEFAULT 'done', created_at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS ui_widgets (
  id TEXT PRIMARY KEY, message_id TEXT NOT NULL, widget_type TEXT NOT NULL,
  state_json TEXT NOT NULL DEFAULT '{}', updated_at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS attachments (
  id TEXT PRIMARY KEY, message_id TEXT, conversation_id TEXT NOT NULL,
  file_name TEXT NOT NULL, mime_type TEXT, local_path TEXT NOT NULL,
  size_bytes INTEGER, created_at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS artifacts (
  id TEXT PRIMARY KEY, conversation_id TEXT NOT NULL, message_id TEXT,
  kind TEXT NOT NULL, title TEXT, content_path TEXT, content_text TEXT,
  meta_json TEXT NOT NULL DEFAULT '{}', created_at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS domain_records (
  id TEXT PRIMARY KEY, record_type TEXT NOT NULL, payload_json TEXT NOT NULL,
  created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS project_files (
  id TEXT PRIMARY KEY, project_id TEXT NOT NULL, path TEXT NOT NULL,
  label TEXT, created_at INTEGER NOT NULL);
`;

const META_SQL = `
CREATE TABLE IF NOT EXISTS app_settings (key TEXT PRIMARY KEY, value_json TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS model_catalog (
  id TEXT PRIMARY KEY, display_name TEXT NOT NULL, provider TEXT NOT NULL DEFAULT 'smartapi',
  cost_multiplier REAL, cost_per_image INTEGER, tier TEXT NOT NULL, use_case TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0, enabled INTEGER NOT NULL DEFAULT 1);
CREATE TABLE IF NOT EXISTS token_usage (
  id TEXT PRIMARY KEY, mode TEXT NOT NULL, conversation_id TEXT, message_id TEXT,
  model_id TEXT NOT NULL, input_tokens INTEGER NOT NULL DEFAULT 0,
  output_tokens INTEGER NOT NULL DEFAULT 0, cost_units REAL NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS global_memory (
  id TEXT PRIMARY KEY, fact TEXT NOT NULL, source_mode TEXT, confidence REAL DEFAULT 1.0,
  created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS game_mode_events (
  id TEXT PRIMARY KEY, process_name TEXT NOT NULL, action TEXT NOT NULL, created_at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS mcp_servers (
  id TEXT PRIMARY KEY, name TEXT NOT NULL, transport TEXT NOT NULL DEFAULT 'stdio',
  command_or_url TEXT NOT NULL, args_json TEXT NOT NULL DEFAULT '[]',
  enabled INTEGER NOT NULL DEFAULT 0, category TEXT NOT NULL DEFAULT 'general',
  created_at INTEGER NOT NULL);
`;

let metaDb: DbLike | null = null;
const modeDbs: Partial<Record<AppMode, DbLike>> = {};

async function loadDb(name: string): Promise<DbLike> {
  if (!isTauri()) {
    return createWebMemoryDb(name);
  }
  const { default: Database } = await import("@tauri-apps/plugin-sql");
  return Database.load(`sqlite:${name}.db`);
}

async function execStatements(db: DbLike, sql: string) {
  const statements = sql
    .split(";")
    .map((s) => s.trim())
    .filter(Boolean);
  for (const stmt of statements) {
    await db.execute(stmt);
  }
}

export async function initMetaDb(): Promise<DbLike> {
  if (metaDb) return metaDb;
  metaDb = await loadDb("glow_meta");
  await execStatements(metaDb, META_SQL);

  const existing = await metaDb.select<{ id: string }>("SELECT id FROM model_catalog LIMIT 1");
  if (existing.length === 0) {
    for (const m of MODEL_CATALOG) {
      await metaDb.execute(
        `INSERT INTO model_catalog (id, display_name, provider, cost_multiplier, cost_per_image, tier, use_case, sort_order, enabled)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,1)`,
        [
          m.id,
          m.displayName,
          m.provider,
          m.costMultiplier,
          m.costPerImage,
          m.tier,
          m.useCase,
          m.sortOrder,
        ],
      );
    }
  }
  return metaDb;
}

export async function getModeDb(mode: AppMode): Promise<DbLike> {
  if (modeDbs[mode]) return modeDbs[mode]!;
  const db = await loadDb(`glow_${mode}`);
  await execStatements(db, MODE_SQL);
  // Soft-migrate older DBs
  for (const col of ["pinned INTEGER NOT NULL DEFAULT 0", "unread INTEGER NOT NULL DEFAULT 0"]) {
    try {
      await db.execute(`ALTER TABLE conversations ADD COLUMN ${col}`);
    } catch {
      /* already exists */
    }
  }
  modeDbs[mode] = db;
  return db;
}

export async function listConversations(mode: AppMode): Promise<Conversation[]> {
  const db = await getModeDb(mode);
  const rows = await db.select<Conversation>(
    "SELECT * FROM conversations ORDER BY updated_at DESC LIMIT 200",
  );
  return rows.sort((a, b) => {
    const ap = Number(a.pinned) || 0;
    const bp = Number(b.pinned) || 0;
    if (ap !== bp) return bp - ap;
    return (b.updated_at || 0) - (a.updated_at || 0);
  });
}

export async function createConversation(
  mode: AppMode,
  projectId: string | null = null,
  title = "New chat",
): Promise<Conversation> {
  const db = await getModeDb(mode);
  const t = nowMs();
  const conv: Conversation = {
    id: uid(),
    project_id: projectId,
    title,
    active_leaf_id: null,
    created_at: t,
    updated_at: t,
    pinned: 0,
    unread: 0,
  };
  await db.execute(
    `INSERT INTO conversations (id, project_id, title, active_leaf_id, created_at, updated_at, pinned, unread)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
    [
      conv.id,
      conv.project_id,
      conv.title,
      conv.active_leaf_id,
      conv.created_at,
      conv.updated_at,
      0,
      0,
    ],
  );
  return conv;
}

export async function updateConversationLeaf(
  mode: AppMode,
  conversationId: string,
  leafId: string | null,
) {
  const db = await getModeDb(mode);
  await db.execute(
    `UPDATE conversations SET active_leaf_id = $1, updated_at = $2 WHERE id = $3`,
    [leafId, nowMs(), conversationId],
  );
}

export async function renameConversation(mode: AppMode, id: string, title: string) {
  const db = await getModeDb(mode);
  await db.execute(`UPDATE conversations SET title = $1, updated_at = $2 WHERE id = $3`, [
    title.trim() || "New chat",
    nowMs(),
    id,
  ]);
}

export async function deleteConversation(mode: AppMode, id: string) {
  const db = await getModeDb(mode);
  await db.execute(`DELETE FROM messages WHERE conversation_id = $1`, [id]);
  await db.execute(`DELETE FROM artifacts WHERE conversation_id = $1`, [id]);
  await db.execute(`DELETE FROM attachments WHERE conversation_id = $1`, [id]);
  await db.execute(`DELETE FROM conversations WHERE id = $1`, [id]);
}

/** Wipe local chats for a mode (used on sign-out; cloud copy remains until next login sync). */
export async function clearLocalWorkspace(mode: AppMode) {
  const db = await getModeDb(mode);
  const convs = await listConversations(mode);
  for (const c of convs) {
    await deleteConversation(mode, c.id);
  }
  try {
    await db.execute(`DELETE FROM widgets`);
  } catch {
    /* optional table */
  }
  try {
    await db.execute(`DELETE FROM projects`);
  } catch {
    /* optional */
  }
  const flusher = db as { flushPersist?: () => Promise<void> };
  if (typeof flusher.flushPersist === "function") {
    await flusher.flushPersist();
  }
}

export async function setConversationProject(
  mode: AppMode,
  id: string,
  projectId: string | null,
) {
  const db = await getModeDb(mode);
  await db.execute(
    `UPDATE conversations SET project_id = $1, updated_at = $2 WHERE id = $3`,
    [projectId, nowMs(), id],
  );
}

export async function setConversationPinned(mode: AppMode, id: string, pinned: boolean) {
  const db = await getModeDb(mode);
  await db.execute(`UPDATE conversations SET pinned = $1, updated_at = $2 WHERE id = $3`, [
    pinned ? 1 : 0,
    nowMs(),
    id,
  ]);
}

export async function setConversationUnread(mode: AppMode, id: string, unread: boolean) {
  const db = await getModeDb(mode);
  await db.execute(`UPDATE conversations SET unread = $1 WHERE id = $2`, [
    unread ? 1 : 0,
    id,
  ]);
}

export async function insertMessage(mode: AppMode, message: Message) {
  const db = await getModeDb(mode);
  await db.execute(
    `INSERT INTO messages (id, conversation_id, parent_id, role, content, model_id, status, created_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
    [
      message.id,
      message.conversation_id,
      message.parent_id,
      message.role,
      message.content,
      message.model_id,
      message.status,
      message.created_at,
    ],
  );
}

export async function updateMessageContent(
  mode: AppMode,
  id: string,
  content: string,
  status: Message["status"],
) {
  const db = await getModeDb(mode);
  await db.execute(`UPDATE messages SET content = $1, status = $2 WHERE id = $3`, [
    content,
    status,
    id,
  ]);
}

export async function listMessages(mode: AppMode, conversationId: string): Promise<Message[]> {
  const db = await getModeDb(mode);
  return db.select<Message>(
    `SELECT * FROM messages WHERE conversation_id = $1 ORDER BY created_at ASC`,
    [conversationId],
  );
}

/** Rebuild linear path from root to active leaf (tree branching). */
export function pathToLeaf(messages: Message[], leafId: string | null): Message[] {
  if (!leafId) {
    // fallback: chronological unique chain preferring latest siblings
    return messages.filter((m) => m.role !== "system");
  }
  const byId = new Map(messages.map((m) => [m.id, m]));
  const path: Message[] = [];
  let cur: Message | undefined = byId.get(leafId);
  while (cur) {
    path.push(cur);
    cur = cur.parent_id ? byId.get(cur.parent_id) : undefined;
  }
  return path.reverse();
}

export async function logTokenUsage(usage: Omit<TokenUsage, "id" | "created_at"> & { id?: string }) {
  const db = await initMetaDb();
  const row: TokenUsage = {
    id: usage.id || uid(),
    mode: usage.mode,
    conversation_id: usage.conversation_id,
    message_id: usage.message_id,
    model_id: usage.model_id,
    input_tokens: usage.input_tokens,
    output_tokens: usage.output_tokens,
    cost_units: usage.cost_units,
    created_at: nowMs(),
  };
  await db.execute(
    `INSERT INTO token_usage (id, mode, conversation_id, message_id, model_id, input_tokens, output_tokens, cost_units, created_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
    [
      row.id,
      row.mode,
      row.conversation_id,
      row.message_id,
      row.model_id,
      row.input_tokens,
      row.output_tokens,
      row.cost_units,
      row.created_at,
    ],
  );
  return row;
}

export async function listTokenUsage(limit = 200): Promise<TokenUsage[]> {
  const db = await initMetaDb();
  return db.select<TokenUsage>(
    `SELECT * FROM token_usage ORDER BY created_at DESC LIMIT ${limit}`,
  );
}

export async function listProjects(mode: AppMode): Promise<Project[]> {
  const db = await getModeDb(mode);
  return db.select<Project>(`SELECT * FROM projects ORDER BY created_at DESC`);
}

export async function createProject(
  mode: AppMode,
  name: string,
  systemPrompt = "",
): Promise<Project> {
  const db = await getModeDb(mode);
  const t = nowMs();
  const p: Project = {
    id: uid(),
    name,
    system_prompt: systemPrompt,
    created_at: t,
    updated_at: t,
  };
  await db.execute(
    `INSERT INTO projects (id, name, system_prompt, created_at, updated_at) VALUES ($1,$2,$3,$4,$5)`,
    [p.id, p.name, p.system_prompt, p.created_at, p.updated_at],
  );
  return p;
}

export async function updateProjectPrompt(mode: AppMode, id: string, systemPrompt: string) {
  const db = await getModeDb(mode);
  await db.execute(`UPDATE projects SET system_prompt = $1, updated_at = $2 WHERE id = $3`, [
    systemPrompt,
    nowMs(),
    id,
  ]);
}

export async function listProjectFiles(
  mode: AppMode,
  projectId: string,
): Promise<Array<{ id: string; project_id: string; path: string; label: string | null; created_at: number }>> {
  const db = await getModeDb(mode);
  return db.select(`SELECT * FROM project_files WHERE project_id = $1 ORDER BY created_at DESC`, [
    projectId,
  ]);
}

export async function addProjectFile(
  mode: AppMode,
  projectId: string,
  path: string,
  label?: string,
) {
  const db = await getModeDb(mode);
  const id = uid();
  await db.execute(
    `INSERT INTO project_files (id, project_id, path, label, created_at) VALUES ($1,$2,$3,$4,$5)`,
    [id, projectId, path, label || null, nowMs()],
  );
  return id;
}

export async function removeProjectFile(mode: AppMode, id: string) {
  const db = await getModeDb(mode);
  await db.execute(`DELETE FROM project_files WHERE id = $1`, [id]);
}

export async function saveArtifact(mode: AppMode, artifact: Artifact) {
  const db = await getModeDb(mode);
  await db.execute(
    `INSERT INTO artifacts (id, conversation_id, message_id, kind, title, content_path, content_text, meta_json, created_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
    [
      artifact.id,
      artifact.conversation_id,
      artifact.message_id,
      artifact.kind,
      artifact.title,
      artifact.content_path,
      artifact.content_text,
      artifact.meta_json,
      artifact.created_at,
    ],
  );
}

export async function listArtifacts(mode: AppMode, conversationId: string): Promise<Artifact[]> {
  const db = await getModeDb(mode);
  return db.select<Artifact>(
    `SELECT * FROM artifacts WHERE conversation_id = $1 ORDER BY created_at DESC`,
    [conversationId],
  );
}

export async function upsertWidget(mode: AppMode, widget: UiWidget) {
  const db = await getModeDb(mode);
  await db.execute(`DELETE FROM ui_widgets WHERE id = $1`, [widget.id]);
  await db.execute(
    `INSERT INTO ui_widgets (id, message_id, widget_type, state_json, updated_at) VALUES ($1,$2,$3,$4,$5)`,
    [widget.id, widget.message_id, widget.widget_type, widget.state_json, widget.updated_at],
  );
}

export async function deleteWidgetsForMessage(mode: AppMode, messageId: string) {
  const db = await getModeDb(mode);
  await db.execute(`DELETE FROM ui_widgets WHERE message_id = $1`, [messageId]);
}

export async function listWidgets(mode: AppMode, messageId: string): Promise<UiWidget[]> {
  const db = await getModeDb(mode);
  return db.select<UiWidget>(`SELECT * FROM ui_widgets WHERE message_id = $1`, [messageId]);
}

export async function addMemory(fact: string, sourceMode: AppMode, confidence = 1) {
  const db = await initMetaDb();
  const t = nowMs();
  const row: GlobalMemory = {
    id: uid(),
    fact,
    source_mode: sourceMode,
    confidence,
    created_at: t,
    updated_at: t,
  };
  await db.execute(
    `INSERT INTO global_memory (id, fact, source_mode, confidence, created_at, updated_at) VALUES ($1,$2,$3,$4,$5,$6)`,
    [row.id, row.fact, row.source_mode, row.confidence, row.created_at, row.updated_at],
  );
  return row;
}

export async function listMemory(): Promise<GlobalMemory[]> {
  const db = await initMetaDb();
  return db.select<GlobalMemory>(`SELECT * FROM global_memory ORDER BY created_at DESC LIMIT 100`);
}

export async function deleteMemory(id: string) {
  const db = await initMetaDb();
  await db.execute(`DELETE FROM global_memory WHERE id = $1`, [id]);
}

export async function clearMemory() {
  const rows = await listMemory();
  for (const row of rows) await deleteMemory(row.id);
}

export async function saveDomainRecord(
  mode: AppMode,
  recordType: string,
  payload: unknown,
) {
  const db = await getModeDb(mode);
  const t = nowMs();
  const id = uid();
  await db.execute(
    `INSERT INTO domain_records (id, record_type, payload_json, created_at, updated_at) VALUES ($1,$2,$3,$4,$5)`,
    [id, recordType, JSON.stringify(payload), t, t],
  );
  return id;
}

export async function listDomainRecords(mode: AppMode, recordType: string) {
  const db = await getModeDb(mode);
  return db.select<{ id: string; payload_json: string; created_at: number }>(
    `SELECT * FROM domain_records WHERE record_type = $1 ORDER BY created_at DESC`,
    [recordType],
  );
}

export async function bootstrapDatabases() {
  await initMetaDb();
  await getModeDb("home");
}
