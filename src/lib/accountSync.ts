import { uid, nowMs } from "./utils";

export interface LinkedDevice {
  id: string;
  name: string;
  platform: string;
  linkedAt: number;
  lastSeenAt: number;
  isThis: boolean;
}

export interface GlowAccount {
  accountId: string;
  syncKey: string;
  displayName: string;
  preferredName: string;
  work: string;
  createdAt: number;
}

export interface PairingPayload {
  v: 1;
  accountId: string;
  syncKey: string;
  displayName: string;
  preferredName: string;
  work: string;
  fromDeviceId: string;
  fromDeviceName: string;
  issuedAt: number;
  expiresAt: number;
}

const ACCOUNT_KEY = "glow.account";
const DEVICES_KEY = "glow.devices";
const DEVICE_ID_KEY = "glow.deviceId";
const DEVICE_NAME_KEY = "glow.deviceName";

function randomCode(len = 8): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let out = "";
  const bytes = crypto.getRandomValues(new Uint8Array(len));
  for (let i = 0; i < len; i++) out += alphabet[bytes[i]! % alphabet.length];
  return out;
}

function platformLabel(): string {
  const ua = navigator.userAgent;
  if (/Windows/i.test(ua)) return "Windows";
  if (/Mac/i.test(ua)) return "macOS";
  if (/Linux/i.test(ua)) return "Linux";
  return "Desktop";
}

export function getOrCreateDeviceId(): string {
  let id = localStorage.getItem(DEVICE_ID_KEY);
  if (!id) {
    id = uid();
    localStorage.setItem(DEVICE_ID_KEY, id);
  }
  return id;
}

export function getDeviceName(): string {
  const stored = localStorage.getItem(DEVICE_NAME_KEY);
  if (stored) return stored;
  const name = `Glow on ${platformLabel()}`;
  localStorage.setItem(DEVICE_NAME_KEY, name);
  return name;
}

export function setDeviceName(name: string) {
  localStorage.setItem(DEVICE_NAME_KEY, name);
  const devices = listDevices().map((d) =>
    d.isThis ? { ...d, name, lastSeenAt: nowMs() } : d,
  );
  saveDevices(devices);
}

export function getOrCreateAccount(displayName?: string): GlowAccount {
  const raw = localStorage.getItem(ACCOUNT_KEY);
  if (raw) {
    try {
      const acc = JSON.parse(raw) as GlowAccount;
      if (acc.displayName === "Sergey" || acc.preferredName === "Sergey") {
        acc.displayName = acc.displayName === "Sergey" ? "Guest" : acc.displayName;
        acc.preferredName = acc.preferredName === "Sergey" ? "Guest" : acc.preferredName;
        saveAccount(acc);
      }
      // Don't auto-fill syncKey — leave empty until Generate
      if (acc.syncKey == null) {
        acc.syncKey = "";
        saveAccount(acc);
      }
      return acc;
    } catch {
      /* fallthrough */
    }
  }
  const name =
    displayName ||
    localStorage.getItem("glow.userName") ||
    "Guest";
  const account: GlowAccount = {
    accountId: uid(),
    syncKey: "", // empty until user generates
    displayName: name === "Sergey" ? "Guest" : name,
    preferredName: name === "Sergey" ? "Guest" : name,
    work: "Other",
    createdAt: nowMs(),
  };
  localStorage.setItem(ACCOUNT_KEY, JSON.stringify(account));
  ensureThisDeviceListed();
  return account;
}

export function ensureSyncKey(account?: GlowAccount): GlowAccount {
  const acc = account || getOrCreateAccount();
  if (acc.syncKey) return acc;
  acc.syncKey = `${randomCode(4)}-${randomCode(4)}-${randomCode(4)}-${randomCode(4)}`;
  saveAccount(acc);
  return acc;
}

export function saveAccount(account: GlowAccount) {
  localStorage.setItem(ACCOUNT_KEY, JSON.stringify(account));
}

function saveDevices(devices: LinkedDevice[]) {
  localStorage.setItem(DEVICES_KEY, JSON.stringify(devices));
}

export function listDevices(): LinkedDevice[] {
  ensureThisDeviceListed();
  try {
    return JSON.parse(localStorage.getItem(DEVICES_KEY) || "[]") as LinkedDevice[];
  } catch {
    return [];
  }
}

export function ensureThisDeviceListed() {
  const id = getOrCreateDeviceId();
  const name = getDeviceName();
  let devices: LinkedDevice[] = [];
  try {
    devices = JSON.parse(localStorage.getItem(DEVICES_KEY) || "[]") as LinkedDevice[];
  } catch {
    devices = [];
  }
  const idx = devices.findIndex((d) => d.id === id);
  const now = nowMs();
  if (idx >= 0) {
    devices[idx] = {
      ...devices[idx]!,
      name,
      lastSeenAt: now,
      isThis: true,
      platform: platformLabel(),
    };
  } else {
    devices.unshift({
      id,
      name,
      platform: platformLabel(),
      linkedAt: now,
      lastSeenAt: now,
      isThis: true,
    });
  }
  devices = devices.map((d) => ({ ...d, isThis: d.id === id }));
  saveDevices(devices);
}

export function createPairingCode(): { code: string; payload: PairingPayload } {
  const account = ensureSyncKey(getOrCreateAccount());
  const payload: PairingPayload = {
    v: 1,
    accountId: account.accountId,
    syncKey: account.syncKey,
    displayName: account.displayName,
    preferredName: account.preferredName,
    work: account.work,
    fromDeviceId: getOrCreateDeviceId(),
    fromDeviceName: getDeviceName(),
    issuedAt: nowMs(),
    expiresAt: nowMs() + 15 * 60 * 1000,
  };
  const encoded = btoa(unescape(encodeURIComponent(JSON.stringify(payload))))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
  // Short display code + store full payload under that code locally for demo;
  // cross-device paste uses the full encoded string / sync key.
  const code = `${randomCode(3)}-${randomCode(3)}`;
  sessionStorage.setItem(`glow.pair.${code}`, encoded);
  localStorage.setItem("glow.lastPairCode", code);
  localStorage.setItem(`glow.pairblob.${code}`, encoded);
  return { code, payload };
}

export function resolvePairingInput(input: string): PairingPayload | null {
  const trimmed = input.trim();
  if (!trimmed) return null;

  // Short code from same machine session / shared clipboard blob
  const blob =
    localStorage.getItem(`glow.pairblob.${trimmed.toUpperCase()}`) ||
    sessionStorage.getItem(`glow.pair.${trimmed.toUpperCase()}`);
  if (blob) {
    try {
      const json = decodeURIComponent(escape(atob(blob.replace(/-/g, "+").replace(/_/g, "/"))));
      const payload = JSON.parse(json) as PairingPayload;
      if (payload.expiresAt < nowMs()) return null;
      return payload;
    } catch {
      /* continue */
    }
  }

  // Full encoded payload pasted
  try {
    const padded = trimmed.replace(/-/g, "+").replace(/_/g, "/");
    const json = decodeURIComponent(escape(atob(padded)));
    const payload = JSON.parse(json) as PairingPayload;
    if (payload.v !== 1) return null;
    if (payload.expiresAt < nowMs()) return null;
    return payload;
  } catch {
    /* continue */
  }

  // Sync key paste: GLOW-XXXX-... style account key
  const account = getOrCreateAccount();
  if (trimmed.toUpperCase() === account.syncKey.toUpperCase()) {
    return {
      v: 1,
      accountId: account.accountId,
      syncKey: account.syncKey,
      displayName: account.displayName,
      preferredName: account.preferredName,
      work: account.work,
      fromDeviceId: "key",
      fromDeviceName: "Sync key",
      issuedAt: nowMs(),
      expiresAt: nowMs() + 60_000,
    };
  }

  return null;
}

export function linkWithPayload(payload: PairingPayload): { ok: true } | { ok: false; error: string } {
  if (payload.expiresAt < nowMs()) {
    return { ok: false, error: "Pairing code expired" };
  }
  const account: GlowAccount = {
    accountId: payload.accountId,
    syncKey: payload.syncKey,
    displayName: payload.displayName,
    preferredName: payload.preferredName,
    work: payload.work,
    createdAt: nowMs(),
  };
  saveAccount(account);
  localStorage.setItem("glow.userName", account.displayName);

  const devices = listDevices();
  if (payload.fromDeviceId !== "key" && !devices.some((d) => d.id === payload.fromDeviceId)) {
    devices.push({
      id: payload.fromDeviceId,
      name: payload.fromDeviceName,
      platform: "Linked",
      linkedAt: nowMs(),
      lastSeenAt: nowMs(),
      isThis: false,
    });
    saveDevices(devices);
  }
  ensureThisDeviceListed();
  return { ok: true };
}

export function unlinkDevice(deviceId: string) {
  const id = getOrCreateDeviceId();
  if (deviceId === id) return;
  saveDevices(listDevices().filter((d) => d.id !== deviceId));
}

export function rotateSyncKey(): GlowAccount {
  const account = getOrCreateAccount();
  account.syncKey = `${randomCode(4)}-${randomCode(4)}-${randomCode(4)}-${randomCode(4)}`;
  saveAccount(account);
  return account;
}

export function generateSyncKey(): GlowAccount {
  return ensureSyncKey(getOrCreateAccount());
}

export function exportSyncPackage(): string {
  const account = ensureSyncKey(getOrCreateAccount());
  const pkg = {
    v: 1 as const,
    exportedAt: nowMs(),
    account,
    theme: localStorage.getItem("glow.theme"),
    locale: localStorage.getItem("glow.locale"),
    instructions: localStorage.getItem("glow.instructions"),
    feedbackProfile: localStorage.getItem("glow.feedbackProfile"),
    apiKeySet: Boolean(localStorage.getItem("claude2.apiKey") || localStorage.getItem("glow.apiKey")),
    devices: listDevices().map(({ id, name, platform, linkedAt }) => ({
      id,
      name,
      platform,
      linkedAt,
    })),
  };
  return JSON.stringify(pkg, null, 2);
}

export function importSyncPackage(json: string): { ok: true } | { ok: false; error: string } {
  try {
    const pkg = JSON.parse(json) as {
      v: number;
      account: GlowAccount;
      theme?: string | null;
      locale?: string | null;
      instructions?: string | null;
      feedbackProfile?: string | null;
      devices?: LinkedDevice[];
    };
    if (pkg.v !== 1 || !pkg.account?.syncKey) {
      return { ok: false, error: "Invalid sync package" };
    }
    saveAccount(pkg.account);
    localStorage.setItem("glow.userName", pkg.account.displayName);
    if (pkg.theme) localStorage.setItem("glow.theme", pkg.theme);
    if (pkg.locale) localStorage.setItem("glow.locale", pkg.locale);
    if (pkg.instructions != null) localStorage.setItem("glow.instructions", pkg.instructions);
    if (pkg.feedbackProfile != null) localStorage.setItem("glow.feedbackProfile", pkg.feedbackProfile);
    if (pkg.devices?.length) {
      const thisId = getOrCreateDeviceId();
      const merged = pkg.devices.map((d) => ({
        ...d,
        lastSeenAt: d.lastSeenAt || nowMs(),
        isThis: d.id === thisId,
      }));
      if (!merged.some((d) => d.id === thisId)) {
        merged.unshift({
          id: thisId,
          name: getDeviceName(),
          platform: platformLabel(),
          linkedAt: nowMs(),
          lastSeenAt: nowMs(),
          isThis: true,
        });
      }
      saveDevices(merged);
    } else {
      ensureThisDeviceListed();
    }
    return { ok: true };
  } catch {
    return { ok: false, error: "Could not parse sync package" };
  }
}

export function getAppsPageUrl(): string {
  return "https://glowassistant.local/apps";
}
