import { supabase } from "../auth/client";

export interface ModelRestriction {
  /** Requests per user per UTC day; mirrors glow_reserve_tokens in the database. */
  dailyLimit: number;
}

/** Models that are limited per day and only offered in a fresh Chat conversation. */
export const RESTRICTED_MODELS: Record<string, ModelRestriction> = {
  "abliterated-model-large-flash": { dailyLimit: 5 },
};

export const isRestrictedModel = (id: string) => id in RESTRICTED_MODELS;

/** Requests the current user already made today (UTC) with this model; failed ones do not count. */
export async function countModelRequestsToday(userId: string, modelId: string): Promise<number | null> {
  if (!supabase) return null;
  const start = new Date();
  start.setUTCHours(0, 0, 0, 0);
  const { count, error } = await supabase
    .from("glow_token_requests")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .eq("model", modelId)
    .neq("status", "failed")
    .gte("created_at", start.toISOString());
  return error ? null : count ?? 0;
}
