import { nowMs, uid } from "./utils";

export type AuthBackend = "local" | "server";

export interface AuthUser {
  id: string;
  email: string;
  displayName: string;
  createdAt: number;
}

export interface AuthSession {
  user: AuthUser;
  tokens: {
    accessToken: string;
    refreshToken: string;
    expiresAt: number;
  };
  backend: AuthBackend;
}

export interface RegisterInput {
  email: string;
  password: string;
  displayName: string;
}

export interface LoginInput {
  email: string;
  password: string;
}

export class AuthError extends Error {
  code: string;
  constructor(code: string, message: string) {
    super(message);
    this.code = code;
    this.name = "AuthError";
  }
}

const USERS_KEY = "glow.auth.users";
const SESSION_KEY = "glow.auth.session";
const SERVER_URL_KEY = "glow.auth.serverUrl";

type StoredUser = {
  id: string;
  email: string;
  displayName: string;
  salt: string;
  hash: string;
  createdAt: number;
};

function b64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let s = "";
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]!);
  return btoa(s);
}

function fromB64(s: string): Uint8Array {
  const bin = atob(s);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

async function hashPassword(password: string, saltB64: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(password),
    "PBKDF2",
    false,
    ["deriveBits"],
  );
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", salt: fromB64(saltB64), iterations: 100_000, hash: "SHA-256" },
    key,
    256,
  );
  return b64(bits);
}

function token(): string {
  return b64(crypto.getRandomValues(new Uint8Array(24)).buffer)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function normEmail(email: string) {
  return email.trim().toLowerCase();
}

function loadUsers(): Record<string, StoredUser> {
  try {
    return JSON.parse(localStorage.getItem(USERS_KEY) || "{}");
  } catch {
    return {};
  }
}

function saveUsers(map: Record<string, StoredUser>) {
  localStorage.setItem(USERS_KEY, JSON.stringify(map));
}

function checkCreds(email: string, password: string, displayName?: string) {
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normEmail(email))) {
    throw new AuthError("invalid_email", "Введи нормальный email.");
  }
  if (password.length < 8) {
    throw new AuthError("weak_password", "Пароль минимум 8 символов.");
  }
  if (displayName !== undefined && !displayName.trim()) {
    throw new AuthError("invalid_name", "Имя не может быть пустым.");
  }
}

function makeSession(user: StoredUser, backend: AuthBackend): AuthSession {
  return {
    user: {
      id: user.id,
      email: user.email,
      displayName: user.displayName,
      createdAt: user.createdAt,
    },
    tokens: {
      accessToken: token(),
      refreshToken: token(),
      expiresAt: nowMs() + 30 * 24 * 60 * 60 * 1000,
    },
    backend,
  };
}

export function getAuthServerUrl(): string {
  return (
    localStorage.getItem(SERVER_URL_KEY)?.trim() ||
    import.meta.env.VITE_GLOW_AUTH_URL ||
    ""
  ).replace(/\/+$/, "");
}

export function setAuthServerUrl(url: string) {
  const v = url.trim().replace(/\/+$/, "");
  if (v) localStorage.setItem(SERVER_URL_KEY, v);
  else localStorage.removeItem(SERVER_URL_KEY);
}

export function hasAuthServer() {
  return Boolean(getAuthServerUrl());
}

export function loadAuthSession(): AuthSession | null {
  try {
    const s = JSON.parse(localStorage.getItem(SESSION_KEY) || "null") as AuthSession | null;
    if (!s?.user?.email || !s?.tokens?.accessToken) return null;
    return s;
  } catch {
    return null;
  }
}

export function saveAuthSession(session: AuthSession | null) {
  if (!session) localStorage.removeItem(SESSION_KEY);
  else localStorage.setItem(SESSION_KEY, JSON.stringify(session));
}

async function authFetch(url: string, init?: RequestInit): Promise<Response> {
  const tauri = typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
  if (import.meta.env.DEV || !tauri) return fetch(url, init);
  try {
    const { fetch: tFetch } = await import("@tauri-apps/plugin-http");
    return await tFetch(url, {
      method: (init?.method as "GET" | "POST" | "PUT" | "DELETE" | "PATCH") || "GET",
      headers: init?.headers as Record<string, string> | undefined,
      body: init?.body as string | undefined,
    });
  } catch {
    return fetch(url, init);
  }
}

type ServerBody = {
  user: { id: string; email: string; displayName: string; createdAt?: number };
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
};

async function postServer(path: string, body: unknown): Promise<AuthSession> {
  const base = getAuthServerUrl();
  if (!base) throw new AuthError("no_server", "Сервер не настроен.");

  let res: Response;
  try {
    res = await authFetch(`${base}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  } catch (e) {
    throw new AuthError("network", e instanceof Error ? e.message : "Сервер недоступен.");
  }

  if (!res.ok) {
    let msg = res.statusText || "Ошибка";
    try {
      const j = (await res.json()) as { error?: { message?: string; code?: string } };
      throw new AuthError(j.error?.code || `http_${res.status}`, j.error?.message || msg);
    } catch (e) {
      if (e instanceof AuthError) throw e;
      throw new AuthError(`http_${res.status}`, msg);
    }
  }

  const data = (await res.json()) as ServerBody;
  if (!data?.accessToken || !data?.user?.email) {
    throw new AuthError("bad_response", "Странный ответ сервера.");
  }

  return {
    user: {
      id: data.user.id,
      email: data.user.email,
      displayName: data.user.displayName,
      createdAt: data.user.createdAt ?? nowMs(),
    },
    tokens: {
      accessToken: data.accessToken,
      refreshToken: data.refreshToken,
      expiresAt: data.expiresAt,
    },
    backend: "server",
  };
}

export async function localRegister(input: RegisterInput): Promise<AuthSession> {
  checkCreds(input.email, input.password, input.displayName);
  const email = normEmail(input.email);
  const users = loadUsers();
  if (users[email]) throw new AuthError("email_taken", "Такой email уже зарегистрирован.");

  const salt = b64(crypto.getRandomValues(new Uint8Array(16)).buffer);
  const hash = await hashPassword(input.password, salt);
  const user: StoredUser = {
    id: uid(),
    email,
    displayName: input.displayName.trim(),
    salt,
    hash,
    createdAt: nowMs(),
  };
  users[email] = user;
  saveUsers(users);
  return makeSession(user, "local");
}

export async function localLogin(input: LoginInput): Promise<AuthSession> {
  checkCreds(input.email, input.password);
  const email = normEmail(input.email);
  const user = loadUsers()[email];
  if (!user) throw new AuthError("invalid_credentials", "Неверный email или пароль.");
  const hash = await hashPassword(input.password, user.salt);
  if (hash !== user.hash) throw new AuthError("invalid_credentials", "Неверный email или пароль.");
  return makeSession(user, "local");
}

export function localDeleteAccount(email: string) {
  const users = loadUsers();
  delete users[normEmail(email)];
  saveUsers(users);
}

export async function serverRegister(input: RegisterInput) {
  return postServer("/v1/auth/register", input);
}

export async function serverLogin(input: LoginInput) {
  return postServer("/v1/auth/login", input);
}

export async function serverRefresh(refreshToken: string) {
  return postServer("/v1/auth/refresh", { refreshToken });
}

export async function serverLogout(accessToken: string) {
  const base = getAuthServerUrl();
  if (!base) return;
  try {
    await authFetch(`${base}/v1/auth/logout`, {
      method: "POST",
      headers: { Authorization: `Bearer ${accessToken}` },
    });
  } catch {
    /* offline logout is fine */
  }
}

export async function registerAccount(input: RegisterInput) {
  return hasAuthServer() ? serverRegister(input) : localRegister(input);
}

export async function loginAccount(input: LoginInput) {
  return hasAuthServer() ? serverLogin(input) : localLogin(input);
}
