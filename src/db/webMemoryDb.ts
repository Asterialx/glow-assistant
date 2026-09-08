/** Browser workspace DB backed by IndexedDB (survives reload). */

export type WebDbLike = {
  execute: (query: string, binds?: unknown[]) => Promise<{ rowsAffected: number }>;
  select: <T>(query: string, binds?: unknown[]) => Promise<T[]>;
};

const WEB_IDB_NAME = "glow-web-db";
const WEB_IDB_STORE = "tables";

function openWebIdb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(WEB_IDB_NAME, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(WEB_IDB_STORE)) {
        db.createObjectStore(WEB_IDB_STORE);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error("indexedDB open failed"));
  });
}

async function readWebTables(
  key: string,
): Promise<Record<string, Record<string, unknown>[]> | null> {
  if (typeof indexedDB === "undefined") return null;
  const db = await openWebIdb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(WEB_IDB_STORE, "readonly");
    const req = tx.objectStore(WEB_IDB_STORE).get(key);
    req.onsuccess = () => {
      resolve((req.result as Record<string, Record<string, unknown>[]>) || null);
    };
    req.onerror = () => reject(req.error);
  });
}

async function writeWebTables(
  key: string,
  tables: Record<string, Record<string, unknown>[]>,
): Promise<void> {
  if (typeof indexedDB === "undefined") return;
  const db = await openWebIdb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(WEB_IDB_STORE, "readwrite");
    tx.objectStore(WEB_IDB_STORE).put(tables, key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

class PersistentMemoryDb implements WebDbLike {
  tables: Record<string, Record<string, unknown>[]> = {};
  private persistKey: string;
  private persistTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(persistKey: string) {
    this.persistKey = persistKey;
  }

  async hydrate() {
    try {
      const saved = await readWebTables(this.persistKey);
      if (saved && typeof saved === "object") this.tables = saved;
    } catch (e) {
      console.warn("[glow] failed to load IndexedDB workspace", e);
    }
  }

  private schedulePersist() {
    if (this.persistTimer) clearTimeout(this.persistTimer);
    this.persistTimer = setTimeout(() => {
      this.persistTimer = null;
      void writeWebTables(this.persistKey, this.tables).catch((e) =>
        console.warn("[glow] failed to save IndexedDB workspace", e),
      );
    }, 40);
  }

  async execute(query: string, binds: unknown[] = []) {
    const q = query.trim().toLowerCase();
    if (q.startsWith("create") || q.startsWith("create index")) return { rowsAffected: 0 };
    if (q.startsWith("insert into")) {
      const table = query.match(/insert into\s+(\w+)/i)?.[1];
      if (!table) return { rowsAffected: 0 };
      if (!this.tables[table]) this.tables[table] = [];
      const colsMatch = query.match(/\(([^)]+)\)\s*values/i);
      const cols = colsMatch?.[1].split(",").map((c) => c.trim()) ?? [];
      const row: Record<string, unknown> = {};
      cols.forEach((c, i) => {
        row[c] = binds[i];
      });
      this.tables[table].push(row);
      this.schedulePersist();
      return { rowsAffected: 1 };
    }
    if (q.startsWith("alter table")) return { rowsAffected: 0 };
    if (q.startsWith("update")) {
      const table = query.match(/update\s+(\w+)/i)?.[1];
      if (!table || !this.tables[table]) return { rowsAffected: 0 };
      const whereId = binds[binds.length - 1];
      const row = this.tables[table].find((r) => r.id === whereId);
      if (!row) return { rowsAffected: 0 };

      if (/set content/i.test(query) && binds.length >= 3) {
        row.content = binds[0];
        row.status = binds[1];
      }
      if (
        table === "conversations" &&
        /project_id/i.test(query) &&
        /title/i.test(query) &&
        binds.length >= 7
      ) {
        row.project_id = binds[0];
        row.title = binds[1];
        row.active_leaf_id = binds[2];
        row.updated_at = binds[3];
        row.pinned = binds[4];
        row.unread = binds[5];
        this.schedulePersist();
        return { rowsAffected: 1 };
      }
      if (/active_leaf_id/i.test(query) && binds.length >= 3 && !/project_id/i.test(query)) {
        row.active_leaf_id = binds[0];
        row.updated_at = binds[1];
      }
      if (/set title/i.test(query) && binds.length >= 3 && !/project_id/i.test(query)) {
        row.title = binds[0];
        row.updated_at = binds[1];
      }
      if (/set project_id/i.test(query) && binds.length >= 3 && !/title/i.test(query)) {
        row.project_id = binds[0];
        row.updated_at = binds[1];
      }
      if (/set pinned/i.test(query) && binds.length >= 3) {
        row.pinned = binds[0];
        row.updated_at = binds[1];
      }
      if (/set unread/i.test(query) && binds.length >= 2) {
        row.unread = binds[0];
      }
      if (/system_prompt/i.test(query) && binds.length >= 3) {
        row.system_prompt = binds[0];
        row.updated_at = binds[1];
      }
      this.schedulePersist();
      return { rowsAffected: 1 };
    }
    if (q.startsWith("delete")) {
      const table = query.match(/delete from\s+(\w+)/i)?.[1];
      if (!table || !this.tables[table]) return { rowsAffected: 0 };
      const before = this.tables[table].length;
      if (/where\s+id\s*=\s*\$1/i.test(query)) {
        this.tables[table] = this.tables[table].filter((r) => r.id !== binds[0]);
      } else if (/where\s+conversation_id\s*=\s*\$1/i.test(query)) {
        this.tables[table] = this.tables[table].filter((r) => r.conversation_id !== binds[0]);
      } else if (/where\s+message_id\s*=\s*\$1/i.test(query)) {
        this.tables[table] = this.tables[table].filter((r) => r.message_id !== binds[0]);
      } else if (!/\bwhere\b/i.test(query)) {
        this.tables[table] = [];
      }
      const affected = before - this.tables[table].length;
      if (affected > 0) this.schedulePersist();
      return { rowsAffected: affected };
    }
    return { rowsAffected: 0 };
  }

  async select<T>(query: string, binds: unknown[] = []): Promise<T[]> {
    const table = query.match(/from\s+(\w+)/i)?.[1];
    if (!table || !this.tables[table]) return [];
    let rows = [...this.tables[table]];

    if (/where\s+id\s*=\s*\$1/i.test(query)) {
      rows = rows.filter((r) => r.id === binds[0]);
    }
    if (/where\s+conversation_id\s*=\s*\$1/i.test(query)) {
      rows = rows.filter((r) => r.conversation_id === binds[0]);
    }
    if (/where\s+project_id\s*=\s*\$1/i.test(query)) {
      rows = rows.filter((r) => r.project_id === binds[0]);
    }
    if (/where\s+mode\s*=\s*\$1/i.test(query)) {
      rows = rows.filter((r) => r.mode === binds[0]);
    }
    if (/where\s+message_id\s*=\s*\$1/i.test(query)) {
      rows = rows.filter((r) => r.message_id === binds[0]);
    }
    if (/where\s+record_type\s*=\s*\$1/i.test(query)) {
      rows = rows.filter((r) => r.record_type === binds[0]);
    }
    if (/order by created_at desc/i.test(query)) {
      rows.sort((a, b) => Number(b.created_at) - Number(a.created_at));
    } else if (/order by created_at asc/i.test(query)) {
      rows.sort((a, b) => Number(a.created_at) - Number(b.created_at));
    } else if (/order by updated_at desc/i.test(query)) {
      rows.sort((a, b) => Number(b.updated_at) - Number(a.updated_at));
    } else if (/order by updated_at asc/i.test(query)) {
      rows.sort((a, b) => Number(a.updated_at) - Number(b.updated_at));
    }
    if (/order by sort_order/i.test(query)) {
      rows.sort((a, b) => Number(a.sort_order) - Number(b.sort_order));
    }
    const limit = query.match(/limit\s+(\d+)/i);
    if (limit) rows = rows.slice(0, Number(limit[1]));
    return rows as T[];
  }
}

export async function createWebMemoryDb(name: string): Promise<WebDbLike> {
  const db = new PersistentMemoryDb(name);
  await db.hydrate();
  return db;
}
