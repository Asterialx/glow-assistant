import { createClient } from "npm:@supabase/supabase-js@2";

// This endpoint validates the caller with Auth before using the privileged client.
Deno.serve(async (request: Request) => {
  const origin = request.headers.get("Origin");
  const allowed = (Deno.env.get("GLOW_ALLOWED_ORIGINS") || "http://localhost:1420").split(",").map(s => s.trim());
  if (!origin || !allowed.includes(origin)) return new Response("Forbidden", { status: 403 });
  const headers = { "Access-Control-Allow-Origin": origin, "Vary": "Origin", "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info", "Access-Control-Allow-Methods": "POST, OPTIONS" };
  const respond = (status: number, message: string) => Response.json({ message }, { status, headers });
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers });
  if (request.method !== "POST") return respond(405, "Method not allowed");
  const url = Deno.env.get("SUPABASE_URL");
  const secret = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const publicKey = Deno.env.get("SUPABASE_ANON_KEY");
  const token = request.headers.get("Authorization")?.match(/^Bearer (\S+)$/i)?.[1];
  if (!url || !secret || !publicKey) return respond(503, "Server configuration missing");
  if (!token) return respond(401, "Authentication required");
  const client = createClient(url, publicKey, { auth: { persistSession: false }, global: { headers: { Authorization: `Bearer ${token}` } } });
  const { data: { user }, error: authError } = await client.auth.getUser(token);
  if (authError || !user?.email_confirmed_at) return respond(401, "Authentication required");
  const { data: access, error: accessError } = await client.from("glow_access").select("role,active").eq("user_id", user.id).single();
  if (accessError || access?.role !== "admin" || !access.active) return respond(403, "Administrator access required");
  try {
    const body = await request.text();
    if (body.length > 2048) return respond(413, "Request too large");
    const payload = JSON.parse(body);
    const email = typeof payload.email === "string" ? payload.email.trim().toLowerCase() : "";
    const credits = payload.credits;
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254 || !Number.isSafeInteger(credits) || credits < 0 || credits > 1000000) return respond(400, "Invalid invitation");
    const { error: prepareError } = await client.rpc("glow_admin_invite", { p_email: email, p_credits: credits });
    if (prepareError) return respond(409, "Invitation could not be prepared; account may already exist");
    const admin = createClient(url, secret, { auth: { persistSession: false } });
    const { error: sendError } = await admin.auth.admin.inviteUserByEmail(email, { redirectTo: origin });
    // Pending invitation remains available for inspection/retry if SMTP fails.
    if (sendError) return respond(502, "Invitation prepared but email delivery failed");
    return respond(200, "Invitation sent");
  } catch { return respond(400, "Invalid request"); }
});
