// Admin-only edge function: creates a salesperson user without touching the caller's session.
// Verifies the caller is an admin or team_lead, creates the auth user with the service role,
// then assigns them to the requested team. The default role 'salesperson' is set by the
// existing on_auth_user_created trigger (handle_new_user).

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

interface CreatePayload {
  email: string;
  password: string;
  full_name: string;
  team_id: string;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_PUBLISHABLE_KEY") ?? Deno.env.get("SUPABASE_ANON_KEY")!;

    // Identify caller from their JWT
    const authHeader = req.headers.get("Authorization") ?? "";
    const token = authHeader.replace("Bearer ", "");
    if (!token) {
      return new Response(JSON.stringify({ error: "Missing authorization" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: `Bearer ${token}` } },
    });
    const { data: userData, error: userErr } = await userClient.auth.getUser();
    if (userErr || !userData.user) {
      return new Response(JSON.stringify({ error: "Invalid session" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const callerId = userData.user.id;

    const admin = createClient(supabaseUrl, serviceKey);

    // Authorize caller: must be admin or team_lead
    const { data: rolesData, error: rolesErr } = await admin
      .from("user_roles")
      .select("role")
      .eq("user_id", callerId);
    if (rolesErr) throw rolesErr;
    const callerRoles = (rolesData ?? []).map((r) => r.role);
    const isAdmin = callerRoles.includes("admin");
    const isLead = callerRoles.includes("team_lead");
    if (!isAdmin && !isLead) {
      return new Response(JSON.stringify({ error: "Not authorized" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = (await req.json()) as CreatePayload;
    const { email, password, full_name, team_id } = body ?? ({} as CreatePayload);

    if (!email || !password || !full_name || !team_id) {
      return new Response(JSON.stringify({ error: "Missing required fields" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Team Lead can only add to their own team
    if (!isAdmin) {
      const { data: leadTeams } = await admin
        .from("team_members")
        .select("team_id")
        .eq("user_id", callerId);
      const myTeamIds = (leadTeams ?? []).map((t) => t.team_id);
      if (!myTeamIds.includes(team_id)) {
        return new Response(JSON.stringify({ error: "Cannot add to a team you don't belong to" }), {
          status: 403,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    // Create the user with email pre-confirmed so they can log in immediately.
    const { data: created, error: createErr } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { full_name },
    });
    if (createErr) throw createErr;

    const newUserId = created.user?.id;
    if (!newUserId) throw new Error("User creation returned no id");

    // Assign to the team. The on_auth_user_created trigger already creates
    // the profile and the default 'salesperson' user_roles entry.
    const { error: tmErr } = await admin
      .from("team_members")
      .insert({ team_id, user_id: newUserId });
    if (tmErr && !tmErr.message.toLowerCase().includes("duplicate")) {
      // Roll back the auth user so the operation is atomic.
      await admin.auth.admin.deleteUser(newUserId).catch(() => {});
      throw new Error(`Team assignment failed: ${tmErr.message}`);
    }

    return new Response(
      JSON.stringify({ user_id: newUserId, success: true }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return new Response(JSON.stringify({ error: message }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
