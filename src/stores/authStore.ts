import { create } from "zustand";
import { getOrCreateAccount, saveAccount } from "../lib/accountSync";
import {
  getAuthServerUrl,
  hasAuthServer,
  loadAuthSession,
  loginAccount,
  localDeleteAccount,
  registerAccount,
  saveAuthSession,
  serverLogout,
  serverRefresh,
  setAuthServerUrl,
  type AuthSession,
  type LoginInput,
  type RegisterInput,
  AuthError,
} from "../lib/auth";

function applyProfile(session: AuthSession) {
  const acc = getOrCreateAccount(session.user.displayName);
  acc.accountId = session.user.id;
  acc.displayName = session.user.displayName;
  acc.preferredName = session.user.displayName;
  saveAccount(acc);
  localStorage.setItem("glow.userName", session.user.displayName);
}

interface AuthState {
  session: AuthSession | null;
  busy: boolean;
  error: string | null;
  serverUrl: string;
  hydrate: () => void;
  setServerUrl: (url: string) => void;
  clearError: () => void;
  register: (input: RegisterInput) => Promise<boolean>;
  login: (input: LoginInput) => Promise<boolean>;
  logout: () => Promise<void>;
  deleteAccount: () => Promise<void>;
  refreshIfNeeded: () => Promise<void>;
}

export const useAuthStore = create<AuthState>((set, get) => ({
  session: loadAuthSession(),
  busy: false,
  error: null,
  serverUrl: getAuthServerUrl(),

  hydrate: () => {
    set({
      session: loadAuthSession(),
      serverUrl: getAuthServerUrl(),
      error: null,
    });
  },

  setServerUrl: (url) => {
    setAuthServerUrl(url);
    set({ serverUrl: getAuthServerUrl() });
  },

  clearError: () => set({ error: null }),

  register: async (input) => {
    set({ busy: true, error: null });
    try {
      const session = await registerAccount(input);
      saveAuthSession(session);
      applyProfile(session);
      set({ session, busy: false });
      return true;
    } catch (e) {
      set({
        busy: false,
        error: e instanceof AuthError ? e.message : "Не удалось зарегистрироваться.",
      });
      return false;
    }
  },

  login: async (input) => {
    set({ busy: true, error: null });
    try {
      const session = await loginAccount(input);
      saveAuthSession(session);
      applyProfile(session);
      set({ session, busy: false });
      return true;
    } catch (e) {
      set({
        busy: false,
        error: e instanceof AuthError ? e.message : "Не удалось войти.",
      });
      return false;
    }
  },

  logout: async () => {
    const session = get().session;
    if (session?.backend === "server") {
      await serverLogout(session.tokens.accessToken);
    }
    saveAuthSession(null);
    set({ session: null, error: null });
  },

  deleteAccount: async () => {
    const session = get().session;
    if (session?.backend === "local") localDeleteAccount(session.user.email);
    await get().logout();
    for (const k of ["glow.account", "glow.devices", "glow.sync", "glow.userName"]) {
      localStorage.removeItem(k);
    }
  },

  refreshIfNeeded: async () => {
    const session = get().session;
    if (!session || session.backend !== "server") return;
    if (session.tokens.expiresAt > Date.now() + 60_000) return;
    try {
      const next = await serverRefresh(session.tokens.refreshToken);
      saveAuthSession(next);
      applyProfile(next);
      set({ session: next });
    } catch {
      saveAuthSession(null);
      set({ session: null });
    }
  },
}));

// keep for Settings badge
export { hasAuthServer };
