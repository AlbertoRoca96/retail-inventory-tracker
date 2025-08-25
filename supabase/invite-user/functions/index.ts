// Edge Function: invite-user
// Deployed by: supabase functions deploy invite-user --no-verify-jwt

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const DEFAULT_REDIRECT = Deno.env.get("INVITE_REDIRECT_TO") || "";

// CORS per Supabase guide
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Max-Age": "86400",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  // Preflight
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return new Response("Method Not Allowed", { status: 405, headers: { ...corsHeaders, Allow: "POST, OPTIONS" } });

  try {
    // Verify caller via the bearer token they send
    const authHeader = req.headers.get("Authorization") ?? "";
    const jwt = authHeader.replace("Bearer ", "");
    const userClient = createClient(SUPABASE_URL, ANON_KEY);
    const { data: me, error: meErr } = await userClient.auth.getUser(jwt); // getUser accepts a JWT param
    if (meErr || !me?.user) return json({ error: "unauthorized" }, 401);

    // Admin client (service role) for DB + invite
    const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

    // Only team admins may invite
    const { data: isAdmin } = await admin
      .from("v_user_teams")
      .select("is_admin")
      .eq("user_id", me.user.id)
      .eq("is_admin", true)
      .limit(1);

    if (!isAdmin?.length) return json({ error: "forbidden" }, 403);

    // Parse payload
    const body = await req.json().catch(() => ({}));
    const email: string | undefined = body?.email;
    const team_id: string | undefined = body?.team_id;
    const redirectTo: string | undefined = body?.redirectTo || DEFAULT_REDIRECT || undefined;
    if (!email) return json({ error: "email required" }, 400);

    // Send invite with optional redirect
    const { data: invite, error } = await admin.auth.admin.inviteUserByEmail(email, {
      redirectTo, // email link redirect target
      data: { invited_by: me.user.id, team_id: team_id ?? null },
    });
    if (error) return json({ error: error.message }, error.status ?? 400);

    return json({ ok: true, user: invite?.user ?? null });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return json({ error: msg }, 500);
  }
});
