import { getOrCreateDeviceId } from "../accountSync";
import { getSupabase, isSupabaseConfigured } from "./client";
import { useAuthStore } from "../../stores/authStore";

/** Free messages before login is required. */
export const GUEST_MESSAGE_LIMIT = 5;

const LOCAL_KEY = "glow.trial.count";

function localBump(): { count: number; limit: number; blocked: boolean } {
  const prev = Number(localStorage.getItem(LOCAL_KEY) || "0") || 0;
  const count = prev + 1;
  localStorage.setItem(LOCAL_KEY, String(count));
  return { count, limit: GUEST_MESSAGE_LIMIT, blocked: count > GUEST_MESSAGE_LIMIT };
}

export function readLocalTrialCount(): number {
  return Number(localStorage.getItem(LOCAL_KEY) || "0") || 0;
}

/**
 * Call before sending a guest message.
 * Authenticated users always pass.
 * Falls back to localStorage if RPC / network fails.
 */
export async function checkGuestMessageAllowed(): Promise<{
  allowed: boolean;
  count: number;
  limit: number;
  reason?: string;
}> {
  const auth = useAuthStore.getState();
  if (auth.status === "authenticated") {
    return { allowed: true, count: 0, limit: GUEST_MESSAGE_LIMIT };
  }

  if (!isSupabaseConfigured()) {
    const r = localBump();
    return {
      allowed: !r.blocked,
      count: r.count,
      limit: r.limit,
      reason: r.blocked ? "guest_limit" : undefined,
    };
  }

  try {
    const sb = getSupabase();
    const deviceId = getOrCreateDeviceId();
    const { data, error } = await sb.rpc("trial_ping", {
      p_device_id: deviceId,
      p_limit: GUEST_MESSAGE_LIMIT,
    });
    if (error) throw error;
    const row = data as { count: number; limit: number; blocked: boolean };
    // Keep local mirror for offline UX
    localStorage.setItem(LOCAL_KEY, String(row.count));
    return {
      allowed: !row.blocked,
      count: row.count,
      limit: row.limit,
      reason: row.blocked ? "guest_limit" : undefined,
    };
  } catch {
    const r = localBump();
    return {
      allowed: !r.blocked,
      count: r.count,
      limit: r.limit,
      reason: r.blocked ? "guest_limit" : undefined,
    };
  }
}
