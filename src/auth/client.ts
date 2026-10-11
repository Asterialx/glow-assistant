import { createClient } from "@supabase/supabase-js";
import { configureAccountStorage } from "./accountStorage";

const url = import.meta.env.VITE_SUPABASE_URL;
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
export const supabase = url && key ? createClient(url, key, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
}) : null;
export const betaAuthEnabled = import.meta.env.VITE_BETA_AUTH_ENABLED === "true";
configureAccountStorage(betaAuthEnabled);

export interface Access { user_id: string; email: string; role: "admin" | "member"; active: boolean }
export interface Profile { user_id: string; display_name: string; age: number | null; onboarding_completed: boolean }

export async function loadAccount() {
  if (!supabase) throw new Error("Подключение Supabase не настроено.");
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) throw new Error("Войдите в Glow заново.");
  if (!user.email_confirmed_at) throw new Error("Подтвердите адрес электронной почты.");
  const [access, profile] = await Promise.all([
    supabase.from("glow_access").select("user_id,email,role,active").eq("user_id", user.id).single(),
    supabase.from("glow_profiles").select("user_id,display_name,age,onboarding_completed").eq("user_id", user.id).single(),
  ]);
  if (access.error || profile.error) throw new Error("Не удалось проверить доступ. Проверьте подключение и настройку базы.");
  if (!access.data.active) throw new Error("Доступ к Glow приостановлен администратором.");
  return { access: access.data as Access, profile: profile.data as Profile };
}
