export async function openBrowserSnapshot(name: string) {
  // Snapshot persistence has one writer per account/database, including other tabs.
  // Refuse a second writer rather than silently overwriting its conversations.
  if (!navigator.locks) throw new Error("Этот браузер не поддерживает безопасное локальное хранение Glow.");
  let release!: () => void;
  let lockFinished!: Promise<void>;
  const acquired = new Promise<void>((resolve, reject) => {
    lockFinished = navigator.locks.request(`glow-db:${name}`, { ifAvailable: true }, async lock => {
      if (!lock) { reject(new Error("Glow уже открыт для этого аккаунта в другой вкладке. Закройте её и обновите страницу.")); return; }
      const held = new Promise<void>(done => { release = done; });
      resolve();
      await held;
    }).catch(reject);
  });
  await acquired;
  const database = await new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(name, 1);
    request.onupgradeneeded = () => request.result.createObjectStore("snapshots");
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
    request.onblocked = () => reject(new Error("Закройте другие вкладки Glow и повторите попытку."));
  }).catch(error => { release(); throw error; });
  window.addEventListener("pagehide", () => { database.close(); release(); }, { once: true });
  window.addEventListener("pageshow", event => { if (event.persisted) window.location.reload(); });
  database.onversionchange = () => database.close();
  return {
    async close() { database.close(); release(); await lockFinished; },
    async load(): Promise<Record<string, Record<string, unknown>[]> | undefined> {
      return new Promise((resolve, reject) => {
        const transaction = database.transaction("snapshots", "readonly");
        const request = transaction.objectStore("snapshots").get("tables");
        transaction.oncomplete = () => resolve(request.result);
        transaction.onabort = () => reject(transaction.error);
        transaction.onerror = () => reject(transaction.error);
      });
    },
    async save(tables: Record<string, Record<string, unknown>[]>) {
      return new Promise<void>((resolve, reject) => {
        const transaction = database.transaction("snapshots", "readwrite");
        transaction.objectStore("snapshots").put(tables, "tables");
        transaction.oncomplete = () => resolve();
        transaction.onabort = () => reject(transaction.error || new Error("Не удалось сохранить данные."));
        transaction.onerror = () => reject(transaction.error);
      });
    },
  };
}
