// Admin/Lead-only edge function: resets a user's password to a new (auto-generated
// or supplied) value. The new password is returned in the response so the caller
// can read it out to the user. Existing passwords cannot be retrieved (one-way hash),
// so this replaces the password with a fresh one.
//
// - Admin can reset anyone (except other admins).
// - Team Lead can reset only members of their own team.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

interface Payload {
  target_user_id: string;
  // Optional: if not supplied a friendly random password is generated.
  new_password?: string;
}

function generatePassword(): string {
  const adjectives = ["Falcon", "Tiger", "River", "Sunny", "Brave", "Quiet", "Swift", "Lucky", "Royal", "Noble"];
  const a = adjectives[Math.floor(Math.random() * adjectives.length)];
  const num = Math.floor(1000 + Math.random() * 9000);
  return `${a}-${num}`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_PUBLISHABLE_KEY") ?? Deno.env.get("SUPABASE_ANON_KEY")!;

    const authHeader = req.headers.get("Authorization") ?? "";
    const token = authHeader.replace("Bearer ", "");
    if (!token) {
      return new Response(JSON.stringify({ error: "Missing authorization" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: `Bearer ${token}` } },
    });
    const { data: userData, error: userErr } = await userClient.auth.getUser();
    if (userErr || !userData.user) {
      return new Response(JSON.stringify({ error: "Invalid session" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const callerId = userData.user.id;

    const admin = createClient(supabaseUrl, serviceKey);

    const { data: callerRolesData } = await admin
      .from("user_roles").select("role").eq("user_id", callerId);
    const callerRoles = (callerRolesData ?? []).map((r) => r.role);
    const isAdmin = callerRoles.includes("admin");
    const isLead = callerRoles.includes("team_lead");
    if (!isAdmin && !isLead) {
      return new Response(JSON.stringify({ error: "Not authorized" }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = (await req.json()) as Payload;
    const targetId = body?.target_user_id;
    if (!targetId) {
      return new Response(JSON.stringify({ error: "Missing target_user_id" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Cannot reset another admin
    const { data: targetRolesData } = await admin
      .from("user_roles").select("role").eq("user_id", targetId);
    const targetRoles = (targetRolesData ?? []).map((r) => r.role);
    if (targetRoles.includes("admin") && targetId !== callerId) {
      return new Response(JSON.stringify({ error: "Cannot reset another admin's password" }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Lead may only reset members of their own team
    if (!isAdmin) {
      const { data: leadTeams } = await admin
        .from("team_members").select("team_id").eq("user_id", callerId);
      const myTeamIds = (leadTeams ?? []).map((t) => t.team_id);
      const { data: targetTeams } = await admin
        .from("team_members").select("team_id").eq("user_id", targetId);
      const targetTeamIds = (targetTeams ?? []).map((t) => t.team_id);
      const shareTeam = targetTeamIds.some((id) => myTeamIds.includes(id));
      if (!shareTeam) {
        return new Response(JSON.stringify({ error: "Cannot reset password for users outside your team" }), {
          status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    const newPassword = (body.new_password && body.new_password.length >= 6)
      ? body.new_password
      : generatePassword();

    const { error: updErr } = await admin.auth.admin.updateUserById(targetId, {
      password: newPassword,
    });
    if (updErr) throw updErr;

    return new Response(
      JSON.stringify({ success: true, new_password: newPassword }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return new Response(JSON.stringify({ error: message }), {
      status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
