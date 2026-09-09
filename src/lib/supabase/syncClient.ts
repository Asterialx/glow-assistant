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
  switchWorkspaceOwner,
} from "../../db";
import { getSupabase, isSupabaseConfigured } from "./client";
import { useAuthStore } from "../../stores/authStore";
import { useChatStore } from "../../stores/chatStore";
import { useUiStore } from "../../stores/uiStore";
import { applyTheme, type ThemeId } from "../themes";
import type { Locale } from "../i18n";
import { nowMs } from "../utils";

const CURSOR_KEY = "glow.sync.cursors";
const LAST_SYNC_KEY = "glow.sync.lastAt";
const SYNC_USER_KEY = "glow.sync.userId";

type Cursors = Record<string, number>;

/** Bumped on sign-out so in-flight push/pull cannot rewrite cursors into an empty local DB. */
let syncGeneration = 0;

export function invalidateSyncGeneration(): void {
  syncGeneration += 1;
}

export function clearSyncCursors(): void {
  try {
    localStorage.removeItem(CURSOR_KEY);
    localStorage.removeItem(LAST_SYNC_KEY);
  } catch {
    /* ignore */
  }
}

export function clearSyncUserMarker(): void {
  try {
    localStorage.removeItem(SYNC_USER_KEY);
  } catch {
    /* ignore */
  }
}

function readSyncUserMarker(): string | null {
  try {
    return localStorage.getItem(SYNC_USER_KEY);
  } catch {
    return null;
  }
}

function writeSyncUserMarker(userId: string) {
  try {
    localStorage.setItem(SYNC_USER_KEY, userId);
  } catch {
    /* ignore */
  }
}

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
  // Messages: delete+insert so `rev` always increases when content changes.
  // Plain upsert keeps the old bigserial rev → other devices never pull the AI reply.
  if (table === "sync_messages") {
    const userId = useAuthStore.getState().user?.id;
    if (!userId) return;
    const ids = rows.map((r) => String(r.id));
    const { error: delErr } = await sb
      .from(table)
      .delete()
      .eq("user_id", userId)
      .in("id", ids);
    if (delErr) throw delErr;
    const { error: insErr } = await sb.from(table).insert(rows);
    if (insErr) throw insErr;
    return;
  }
  const { error } = await sb
    .from(table)
    .upsert(rows, { onConflict: table === "sync_prefs" ? "user_id,key" : "user_id,id" });
  if (error) throw error;
}

export async function pushAllLocal(
  mode: AppMode = "home",
  opts?: { chatsOnly?: boolean },
): Promise<void> {
  if (!isSupabaseConfigured()) return;
  const user = useAuthStore.getState().user;
  if (!user) return;
  const userId = user.id;
  const chatsOnly = Boolean(opts?.chatsOnly);

  const [projects, conversations, memory] = await Promise.all([
    chatsOnly ? Promise.resolve([]) : listProjects(mode),
    listConversations(mode),
    chatsOnly ? Promise.resolve([]) : listMemory(),
  ]);

  if (!chatsOnly) {
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
  }

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
      // Never sync in-progress / empty assistant stubs — other devices would keep the empty
      // row forever because upsert does not bump `rev` without a DB trigger.
      if (m.status === "streaming") continue;
      if (
        m.role === "assistant" &&
        !String(m.content || "").trim() &&
        m.status !== "error"
      ) {
        continue;
      }
      const touched = nowMs();
      allMessages.push({
        user_id: userId,
        id: m.id,
        conversation_id: m.conversation_id,
        parent_id: m.parent_id,
        role: m.role,
        content: m.content,
        model_id: m.model_id,
        status: m.status,
        created_at: m.created_at,
        updated_at: touched,
        deleted_at: null,
      });
      if (!chatsOnly) {
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
  if (!chatsOnly) {
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
    const existing = await db.select<{ id: string; updated_at: number }>(
      `SELECT id, updated_at FROM conversations WHERE id = $1`,
      [row.id],
    );
    const remoteUpdated = Number(row.updated_at) || 0;
    if (existing.length) {
      // LWW: keep newer local edit (Ai_asisst-style merge).
      if (Number(existing[0]!.updated_at) > remoteUpdated) return;
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
    const existing = await db.select<{ id: string; content: string }>(
      `SELECT id, content FROM messages WHERE id = $1`,
      [row.id],
    );
    const nextContent = String(row.content ?? "");
    const nextStatus = (row.status as "done") || "done";
    if (existing.length) {
      // Always apply remote content (assistant replies update after first empty stub).
      await updateMessageContent(mode, String(row.id), nextContent, nextStatus);
    } else {
      await insertMessage(mode, {
        id: String(row.id),
        conversation_id: String(row.conversation_id),
        parent_id: (row.parent_id as string | null) ?? null,
        role: row.role as "user" | "assistant" | "system" | "tool",
        content: nextContent,
        model_id: (row.model_id as string | null) ?? null,
        status: nextStatus,
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

const CHAT_TABLES: SyncTable[] = ["sync_conversations", "sync_messages", "sync_artifacts"];

export async function pullRemote(
  mode: AppMode = "home",
  opts?: { chatsOnly?: boolean },
): Promise<number> {
  if (!isSupabaseConfigured()) return 0;
  const user = useAuthStore.getState().user;
  if (!user) return 0;

  const gen = syncGeneration;
  const sb = getSupabase();
  const cursors = readCursors();
  let applied = 0;
  const tables = opts?.chatsOnly ? CHAT_TABLES : TABLES;

  for (const table of tables) {
    if (gen !== syncGeneration) return applied;
    // Page through changes — a single 500-cap left devices half-synced.
    for (;;) {
      if (gen !== syncGeneration) return applied;
      const since = cursors[table] || 0;
      const { data, error } = await sb
        .from(table)
        .select("*")
        .gt("rev", since)
        .order("rev", { ascending: true })
        .limit(500);
      if (error) throw error;
      const rows = (data || []) as Array<Record<string, unknown> & { rev: number }>;
      if (!rows.length) break;
      for (const row of rows) {
        if (gen !== syncGeneration) return applied;
        await applyRemoteRow(table, row, mode);
        cursors[table] = Math.max(cursors[table] || 0, Number(row.rev) || 0);
        applied += 1;
      }
      if (rows.length < 500) break;
    }
  }

  if (gen !== syncGeneration) return applied;
  writeCursors(cursors);
  localStorage.setItem(LAST_SYNC_KEY, String(Date.now()));
  return applied;
}

export async function fullSync(
  mode: AppMode = "home",
  opts?: { forceFullPull?: boolean },
): Promise<{ pushed: boolean; pulled: number }> {
  try {
    const gen = syncGeneration;
    const user = useAuthStore.getState().user;
    const userId = user?.id ?? null;
    const localConvs = await listConversations(mode);
    const userChanged = Boolean(userId && readSyncUserMarker() !== userId);
    // Empty workspace, new login, or explicit force → never trust stale cursors.
    if (opts?.forceFullPull || userChanged || localConvs.length === 0) {
      clearSyncCursors();
    }
    if (gen !== syncGeneration) return { pushed: false, pulled: 0 };

    await pushAllLocal(mode);
    if (gen !== syncGeneration) return { pushed: false, pulled: 0 };

    let pulled = await pullRemote(mode);
    if (gen !== syncGeneration) return { pushed: false, pulled: 0 };

    // Recovery: local still empty but cloud has chats (stale cursor / partial wipe).
    const after = await listConversations(mode);
    if (after.length === 0 && userId) {
      const sb = getSupabase();
      const { count, error } = await sb
        .from("sync_conversations")
        .select("id", { count: "exact", head: true })
        .is("deleted_at", null);
      if (!error && (count ?? 0) > 0) {
        clearSyncCursors();
        pulled += await pullRemote(mode);
      }
    }

    if (gen !== syncGeneration) return { pushed: false, pulled: 0 };
    if (userId) writeSyncUserMarker(userId);
    return { pushed: true, pulled };
  } catch (e) {
    const raw = e && typeof e === "object" && "message" in e ? String((e as { message: string }).message) : String(e);
    if (/PGRST205|schema cache|Could not find the table/i.test(raw)) {
      throw new Error(
        "Sync tables missing. In Supabase → SQL Editor run supabase/migrations/001_glow_accounts_sync.sql then try again.",
      );
    }
    throw e instanceof Error ? e : new Error(raw);
  }
}

let syncChain: Promise<void> = Promise.resolve();
let debounceTimer: ReturnType<typeof setTimeout> | null = null;
let liveBroadcastChannel: ReturnType<ReturnType<typeof getSupabase>["channel"]> | null = null;

async function notifyPeersNeedSync() {
  const userId = useAuthStore.getState().user?.id;
  if (!userId || !liveBroadcastChannel) return;
  try {
    await liveBroadcastChannel.send({
      type: "broadcast",
      event: "glow-sync",
      payload: { t: Date.now() },
    });
  } catch (e) {
    console.warn("[glow] sync broadcast failed", e);
  }
}

/** Mark a chat deleted in the cloud so other devices drop it too. */
export async function pushConversationDeleted(conversationId: string): Promise<void> {
  if (!isSupabaseConfigured()) return;
  const user = useAuthStore.getState().user;
  if (!user) return;
  const sb = getSupabase();
  const userId = user.id;
  const t = nowMs();

  const { error: msgErr } = await sb
    .from("sync_messages")
    .delete()
    .eq("user_id", userId)
    .eq("conversation_id", conversationId);
  if (msgErr) throw msgErr;

  const { error: artErr } = await sb
    .from("sync_artifacts")
    .delete()
    .eq("user_id", userId)
    .eq("conversation_id", conversationId);
  if (artErr) throw artErr;

  // Fresh row + deleted_at so peers polling by rev always see the tombstone.
  const { error: delErr } = await sb
    .from("sync_conversations")
    .delete()
    .eq("user_id", userId)
    .eq("id", conversationId);
  if (delErr) throw delErr;

  const { error: insErr } = await sb.from("sync_conversations").insert({
    user_id: userId,
    id: conversationId,
    project_id: null,
    title: "",
    active_leaf_id: null,
    created_at: t,
    updated_at: t,
    pinned: 0,
    unread: 0,
    deleted_at: t,
  });
  if (insErr) throw insErr;

  await notifyPeersNeedSync();
}

/** Queue a sync; coalesce bursts. `immediate` starts ASAP (after current in-flight). */
export function requestLiveSync(
  mode: AppMode = "home",
  opts?: { immediate?: boolean; pushOnly?: boolean; chatsOnly?: boolean },
): Promise<{ pushed: boolean; pulled: number } | null> {
  if (useAuthStore.getState().status !== "authenticated") {
    return Promise.resolve(null);
  }

  const chatsOnly = opts?.chatsOnly || opts?.pushOnly;

  const run = () =>
    new Promise<{ pushed: boolean; pulled: number }>((resolve, reject) => {
      syncChain = syncChain
        .then(async () => {
          try {
            // Push chats first, ping peers immediately, then optional pull.
            await pushAllLocal(mode, { chatsOnly: Boolean(chatsOnly) });
            await notifyPeersNeedSync();
            if (opts?.pushOnly) {
              resolve({ pushed: true, pulled: 0 });
              return;
            }
            const pulled = await pullRemote(mode, { chatsOnly: Boolean(chatsOnly) });
            if (!chatsOnly) {
              // already full push above when chatsOnly false
            } else {
              // Prefs/memory in background — don't block live chat UX
              void pushAllLocal(mode).catch(() => null);
            }
            resolve({ pushed: true, pulled });
          } catch (e) {
            reject(e);
          }
        })
        .catch(() => {
          /* keep chain alive */
        });
    });

  if (opts?.immediate) {
    if (debounceTimer) {
      clearTimeout(debounceTimer);
      debounceTimer = null;
    }
    return run().catch((e) => {
      console.warn("[glow] live sync failed", e);
      return null;
    });
  }

  return new Promise((resolve) => {
    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      debounceTimer = null;
      void run()
        .then(resolve)
        .catch((e) => {
          console.warn("[glow] live sync failed", e);
          resolve(null);
        });
    }, 0);
  });
}

export type LiveSyncStop = () => void;

/**
 * Keep devices in sync via Realtime broadcast + short poll.
 * Works even when postgres_changes publication is not enabled.
 */
export function startLiveChatSync(
  mode: AppMode,
  onPulled: (pulled: number) => void,
): LiveSyncStop {
  if (!isSupabaseConfigured()) return () => undefined;
  const userId = useAuthStore.getState().user?.id;
  if (!userId) return () => undefined;

  let stopped = false;
  const sb = getSupabase();

  const pullOnly = async () => {
    if (stopped) return;
    if (useAuthStore.getState().status !== "authenticated") return;
    if (typeof document !== "undefined" && document.visibilityState === "hidden") return;
    // Don't pull into local DB while this tab is streaming — can corrupt the open reply.
    if (useChatStore.getState().streaming) return;
    try {
      // Fast path: only chat tables (not prefs/memory) for near-instant UI.
      const pulled = await pullRemote(mode, { chatsOnly: true });
      if (pulled > 0) onPulled(pulled);
    } catch (e) {
      console.warn("[glow] live pull failed", e);
    }
  };

  const channel = sb
    .channel(`glow-sync-${userId}`, {
      config: { broadcast: { ack: false, self: false } },
    })
    .on("broadcast", { event: "glow-sync" }, () => {
      void pullOnly();
    })
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "sync_conversations", filter: `user_id=eq.${userId}` },
      () => {
        void pullOnly();
      },
    )
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "sync_messages", filter: `user_id=eq.${userId}` },
      () => {
        void pullOnly();
      },
    )
    .subscribe((status) => {
      if (status === "SUBSCRIBED") {
        console.info("[glow] live sync channel ready");
      } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
        console.warn("[glow] realtime channel issue — poll fallback active", status);
      }
    });

  liveBroadcastChannel = channel;

  // Aggressive poll (~400ms) when broadcast is slow/unavailable
  const pollId = window.setInterval(() => {
    void pullOnly();
  }, 400);

  // Occasional full sync for prefs/memory
  const fullId = window.setInterval(() => {
    if (useChatStore.getState().streaming) return;
    void fullSync(mode).catch(() => null);
  }, 60_000);

  // Pull when tab becomes visible again
  const onVis = () => {
    if (document.visibilityState === "visible") void pullOnly();
  };
  document.addEventListener("visibilitychange", onVis);

  return () => {
    stopped = true;
    window.clearInterval(pollId);
    window.clearInterval(fullId);
    document.removeEventListener("visibilitychange", onVis);
    if (liveBroadcastChannel === channel) liveBroadcastChannel = null;
    void sb.removeChannel(channel);
  };
}

/** Apply synced localStorage prefs into live Zustand stores. */
export function applySyncedPrefsToUi() {
  const theme = localStorage.getItem("glow.theme") as ThemeId | null;
  if (theme) {
    applyTheme(theme);
    useUiStore.setState({ themeId: theme });
  }
  const locale = localStorage.getItem("glow.locale") as Locale | null;
  if (locale === "ru" || locale === "en") {
    useUiStore.setState({ locale });
  }
  const userName = localStorage.getItem("glow.userName");
  if (userName && userName !== "Guest" && userName !== "Sergey") {
    useUiStore.setState({ userName });
  } else {
    const meta = useAuthStore.getState().user?.user_metadata;
    const first = typeof meta?.first_name === "string" ? meta.first_name.trim() : "";
    const last = typeof meta?.last_name === "string" ? meta.last_name.trim() : "";
    const full =
      (typeof meta?.full_name === "string" && meta.full_name.trim()) ||
      [first, last].filter(Boolean).join(" ").trim();
    if (full) {
      localStorage.setItem("glow.userName", full);
      useUiStore.setState({ userName: full });
    }
  }
  const model = localStorage.getItem("glow.model");
  if (model) useChatStore.getState().setSelectedModelId(model);
  const temperature = Number(localStorage.getItem("glow.temperature"));
  if (Number.isFinite(temperature)) useChatStore.getState().setTemperature(temperature);
  const maxTokens = Number(localStorage.getItem("glow.maxTokens"));
  if (Number.isFinite(maxTokens)) useChatStore.getState().setMaxTokens(maxTokens);
}

/** Push/pull cloud data, apply prefs, and refresh chat lists in the UI. */
let hydrateInflight: Promise<{ pushed: boolean; pulled: number }> | null = null;

/**
 * Bind the signed-in user's local workspace, paint chats immediately, then
 * merge with cloud (Ai_asisst local-first pattern on top of Supabase).
 */
export async function syncAndHydrateWorkspace(
  mode: AppMode = "home",
  opts?: { forceFullPull?: boolean },
): Promise<{ pushed: boolean; pulled: number }> {
  const userId = useAuthStore.getState().user?.id ?? null;
  if (userId) {
    await switchWorkspaceOwner(userId);
    // Instant paint from per-user local cache before any network.
    const [localConvs, localProjects] = await Promise.all([
      listConversations(mode),
      listProjects(mode),
    ]);
    const keepId = useChatStore.getState().activeConversationId;
    const keepStreaming = useChatStore.getState().streaming;
    const stillOpen = Boolean(keepId && localConvs.some((c) => c.id === keepId));
    useChatStore.setState({
      conversations: localConvs,
      projects: localProjects,
      ...(keepStreaming || stillOpen
        ? {}
        : {
            activeConversationId: null,
            messages: [],
            branchPath: [],
            artifacts: [],
            activeArtifactId: null,
          }),
    });
  }

  if (hydrateInflight) {
    if (!opts?.forceFullPull) return hydrateInflight;
    await hydrateInflight.catch(() => null);
  }

  const gen = syncGeneration;
  const run = (async () => {
    const prev = useChatStore.getState();
    const keepId = prev.activeConversationId;
    const keepStreaming = prev.streaming;

    const result = await fullSync(mode, { forceFullPull: opts?.forceFullPull ?? true });
    if (gen !== syncGeneration) return result;

    applySyncedPrefsToUi();
    const [conversations, projects] = await Promise.all([
      listConversations(mode),
      listProjects(mode),
    ]);

    if (gen !== syncGeneration) return result;

    const stillExists = Boolean(keepId && conversations.some((c) => c.id === keepId));

    // Never wipe an open/streaming chat — that caused "chat closed" mid-request.
    if (keepStreaming || stillExists) {
      useChatStore.setState({ conversations, projects });
      return result;
    }

    useChatStore.setState({
      conversations,
      projects,
      activeConversationId: null,
      messages: [],
      branchPath: [],
      artifacts: [],
      activeArtifactId: null,
    });
    useUiStore.getState().closeArtifacts();
    return result;
  })();

  hydrateInflight = run;
  try {
    return await run;
  } finally {
    if (hydrateInflight === run) hydrateInflight = null;
  }
}

export function getLastSyncAt(): number | null {
  const v = localStorage.getItem(LAST_SYNC_KEY);
  return v ? Number(v) : null;
}
