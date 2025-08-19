import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

serve(async (req) => {
  try {
    const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

    const authHeader = req.headers.get("Authorization") || "";
    const jwt = authHeader.replace("Bearer ", "");
    const { data: me, error: meErr } = await admin.auth.getUser(jwt);
    if (meErr || !me?.user) return new Response(JSON.stringify({ error: "unauthorized" }), { status: 401 });

    const { data: isAdmin } = await admin
      .from("v_user_teams").select("is_admin").eq("user_id", me.user.id).eq("is_admin", true).limit(1);
    if (!isAdmin?.length) return new Response(JSON.stringify({ error: "forbidden" }), { status: 403 });

    const { email, team_id } = await req.json();
    if (!email) return new Response(JSON.stringify({ error: "email required" }), { status: 400 });

    const { data: invite, error } = await admin.auth.admin.inviteUserByEmail(email, {
      data: { invited_by: me.user.id, team_id: team_id || null },
    });
    if (error) throw error;

    return new Response(JSON.stringify({ ok: true, user: invite?.user }), { headers: { "content-type": "application/json" } });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e?.message || e) }), { status: 500 });
  }
});
