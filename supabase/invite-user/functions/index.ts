// supabase/invite-user/functions/index.ts
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const DEFAULT_REDIRECT = Deno.env.get("INVITE_REDIRECT_TO") || ""; 
// e.g. https://albertoroca96.github.io/retail-inventory-tracker/auth/callback

// ✅ Required CORS headers for browser calls
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Max-Age": "86400",
};

serve(async (req) => {
  // ✅ Short-circuit preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

    // AuthN the caller (the browser’s preflight does NOT include this header, hence the early return above)
    const authHeader = req.headers.get("Authorization") || "";
    const jwt = authHeader.replace("Bearer ", "");
    const { data: me, error: meErr } = await admin.auth.getUser(jwt);
    if (meErr || !me?.user) {
      return new Response(JSON.stringify({ error: "unauthorized" }), { status: 401, headers: corsHeaders });
    }

    // Only team admins may invite
    const { data: isAdmin } = await admin
      .from("v_user_teams")
      .select("is_admin")
      .eq("user_id", me.user.id)
      .eq("is_admin", true)
      .limit(1);

    if (!isAdmin?.length) {
      return new Response(JSON.stringify({ error: "forbidden" }), { status: 403, headers: corsHeaders });
    }

    // Read payload
    const body = await req.json().catch(() => ({}));
    const email: string | undefined = body?.email;
    const team_id: string | undefined = body?.team_id;
    const redirectTo: string | undefined = body?.redirectTo || DEFAULT_REDIRECT || undefined;

    if (!email) {
      return new Response(JSON.stringify({ error: "email required" }), { status: 400, headers: corsHeaders });
    }

    // Send invite (note: redirectTo ensures the link lands inside your app)
    const { data: invite, error } = await admin.auth.admin.inviteUserByEmail(email, {
      redirectTo, // 👈 important
      data: { invited_by: me.user.id, team_id: team_id || null },
    });
    if (error) throw error;

    return new Response(JSON.stringify({ ok: true, user: invite?.user }), {
      headers: { "content-type": "application/json", ...corsHeaders },
    });
  } catch (e: any) {
    return new Response(JSON.stringify({ error: String(e?.message || e) }), {
      status: 500,
      headers: corsHeaders,
    });
  }
});
