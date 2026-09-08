import { create } from "zustand";
import type { Session, User } from "@supabase/supabase-js";
import { getSupabase, isSupabaseConfigured } from "../lib/supabase/client";
import { getOrCreateDeviceId, getDeviceName } from "../lib/accountSync";
import { resetLocalSessionAfterSignOut } from "../lib/sessionCleanup";

export type AuthStatus = "loading" | "anon" | "needs_verification" | "authenticated" | "unavailable";

export type ProfileInput = {
  firstName: string;
  lastName: string;
  age: number;
};

type AuthState = {
  status: AuthStatus;
  user: User | null;
  session: Session | null;
  pendingEmail: string | null;
  error: string | null;
  init: () => Promise<void>;
  signUp: (email: string, password: string) => Promise<{ needsVerification: boolean }>;
  verifyEmail: (email: string, code: string) => Promise<void>;
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
  resendCode: (email: string) => Promise<void>;
  completeProfile: (profile: ProfileInput) => Promise<void>;
  clearError: () => void;
};

function mapErr(e: unknown): string {
  if (e && typeof e === "object" && "message" in e) return String((e as { message: string }).message);
  return e instanceof Error ? e.message : String(e);
}

export const useAuthStore = create<AuthState>((set, get) => ({
  status: isSupabaseConfigured() ? "loading" : "unavailable",
  user: null,
  session: null,
  pendingEmail: null,
  error: null,

  clearError: () => set({ error: null }),

  init: async () => {
    if (!isSupabaseConfigured()) {
      set({ status: "unavailable", user: null, session: null });
      return;
    }
    try {
      const sb = getSupabase();
      const { data } = await sb.auth.getSession();
      const session = data.session;
      set({
        session,
        user: session?.user ?? null,
        status: session?.user ? "authenticated" : "anon",
      });
      sb.auth.onAuthStateChange((_event, next) => {
        set({
          session: next,
          user: next?.user ?? null,
          status: next?.user ? "authenticated" : get().pendingEmail ? "needs_verification" : "anon",
        });
      });
    } catch (e) {
      set({ status: "unavailable", error: mapErr(e) });
    }
  },

  signUp: async (email, password) => {
    const sb = getSupabase();
    set({ error: null });
    const { data, error } = await sb.auth.signUp({
      email: email.trim(),
      password,
      options: {
        data: {
          device_id: getOrCreateDeviceId(),
          device_name: getDeviceName(),
        },
      },
    });
    if (error) {
      set({ error: error.message });
      throw error;
    }
    // If email confirmations are on, session may be null until OTP verified.
    if (data.session?.user) {
      set({
        session: data.session,
        user: data.session.user,
        status: "authenticated",
        pendingEmail: null,
      });
      return { needsVerification: false };
    }
    set({
      status: "needs_verification",
      pendingEmail: email.trim(),
      user: null,
      session: null,
    });
    return { needsVerification: true };
  },

  verifyEmail: async (email, code) => {
    const sb = getSupabase();
    set({ error: null });
    const token = code.trim().replace(/\s+/g, "");
    // Prefer signup OTP; fall back to email type used by some projects.
    let result = await sb.auth.verifyOtp({
      email: email.trim(),
      token,
      type: "signup",
    });
    if (result.error) {
      result = await sb.auth.verifyOtp({
        email: email.trim(),
        token,
        type: "email",
      });
    }
    if (result.error) {
      set({ error: result.error.message });
      throw result.error;
    }
    set({
      session: result.data.session,
      user: result.data.user,
      status: "authenticated",
      pendingEmail: null,
    });
  },

  signIn: async (email, password) => {
    const sb = getSupabase();
    set({ error: null });
    const { data, error } = await sb.auth.signInWithPassword({
      email: email.trim(),
      password,
    });
    if (error) {
      set({ error: error.message });
      throw error;
    }
    set({
      session: data.session,
      user: data.user,
      status: "authenticated",
      pendingEmail: null,
    });
  },

  signOut: async () => {
    if (!isSupabaseConfigured()) {
      await resetLocalSessionAfterSignOut();
      set({
        session: null,
        user: null,
        status: "anon",
        pendingEmail: null,
        error: null,
      });
      return;
    }
    const sb = getSupabase();
    await sb.auth.signOut();
    await resetLocalSessionAfterSignOut();
    set({
      session: null,
      user: null,
      status: "anon",
      pendingEmail: null,
      error: null,
    });
  },

  resendCode: async (email) => {
    const sb = getSupabase();
    set({ error: null });
    const { error } = await sb.auth.resend({
      type: "signup",
      email: email.trim(),
    });
    if (error) {
      set({ error: error.message });
      throw error;
    }
  },

  completeProfile: async ({ firstName, lastName, age }) => {
    const sb = getSupabase();
    set({ error: null });
    const first = firstName.trim();
    const last = lastName.trim();
    const { data, error } = await sb.auth.updateUser({
      data: {
        first_name: first,
        last_name: last,
        age,
        full_name: `${first} ${last}`.trim(),
        profile_complete: true,
      },
    });
    if (error) {
      set({ error: error.message });
      throw error;
    }
    set({
      user: data.user,
      status: "authenticated",
      pendingEmail: null,
    });
  },
}));
