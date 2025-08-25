// supabase/invite-user/functions/index.ts
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
  if (req.method !== "POST") {
    return new Response("Method Not Allowed", {
      status: 405,
      headers: { ...corsHeaders, Allow: "POST, OPTIONS" },
    });
  }

  try {
    // Verify caller via the bearer token they send
    const authHeader = req.headers.get("Authorization") ?? "";
    const jwt = authHeader.replace("Bearer ", "");
    const userClient = createClient(SUPABASE_URL, ANON_KEY);
    const { data: me, error: meErr } = await userClient.auth.getUser(jwt); // getUser accepts a JWT param
    if (meErr || !me?.user) return json({ error: "unauthorized" }, 401);

    // Admin client (service role) for DB + auth admin actions
    const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

    // Parse payload
    const body = await req.json().catch(() => ({}));
    const email: string = String(body?.email || "").trim().toLowerCase();
    const team_id: string | undefined = body?.team_id;
    const redirectTo: string | undefined = body?.redirectTo || DEFAULT_REDIRECT || undefined;

    if (!email) return json({ error: "email required" }, 400);
    if (!team_id) return json({ error: "team_id required" }, 400);

    // Ensure the caller is an admin of THIS team
    const { data: adminRow, error: adminErr } = await admin
      .from("v_user_teams")
      .select("team_id,is_admin")
      .eq("user_id", me.user.id)
      .eq("team_id", team_id)
      .eq("is_admin", true)
      .limit(1)
      .maybeSingle();

    if (adminErr) return json({ error: adminErr.message }, 400);
    if (!adminRow) return json({ error: "forbidden" }, 403);

    // 1) Try the normal invite flow (Supabase will send the email)
    const { data: invite, error: inviteErr } = await admin.auth.admin.inviteUserByEmail(email, {
      redirectTo, // email link redirect target
      data: { invited_by: me.user.id, team_id },
    });

    if (!inviteErr && invite?.user?.id) {
      // Also add to team for convenience (idempotent)
      await admin
        .from("team_members")
        .upsert([{ team_id, user_id: invite.user.id }], {
          onConflict: "team_id,user_id",
          ignoreDuplicates: true,
        });

      return json({ ok: true, invited: true, user: invite.user });
    }

    // 2) If invite failed because user already exists, resolve/create user and add to team
    //    generateLink('magiclink') both creates (if needed) and returns the user + action_link
    const { data: link, error: linkErr } = await admin.auth.admin.generateLink({
      type: "magiclink",
      email,
      options: { redirectTo },
    });

    if (linkErr) {
      // If it's some other failure (not "already registered"), surface the original invite error if present
      const message = inviteErr?.message || linkErr.message || "invite_failed";
      const status = (inviteErr as any)?.status ?? (linkErr as any)?.status ?? 400;
      return json({ error: message }, status);
    }

    const userId = link.user?.id;
    if (!userId) return json({ error: "failed_to_resolve_user_id" }, 400);

    // Add membership (idempotent)
    const { error: upsertErr } = await admin
      .from("team_members")
      .upsert([{ team_id, user_id: userId }], {
        onConflict: "team_id,user_id",
        ignoreDuplicates: true,
      });
    if (upsertErr) return json({ error: upsertErr.message }, 400);

    // Return the action_link so the UI can show or email it via your provider
    return json({
      ok: true,
      invited: false,
      added_to_team: true,
      user_id: userId,
      action_link: link?.properties?.action_link ?? null,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return json({ error: msg }, 500);
  }
});
