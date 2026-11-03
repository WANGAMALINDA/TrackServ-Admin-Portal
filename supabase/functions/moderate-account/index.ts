import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const jsonResponse = (body: Record<string, unknown>, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

const isUuid = (value: string) =>
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);

async function countDistinctReporters(adminClient: ReturnType<typeof createClient>, userId: string) {
  const reporterIds = new Set<string>();
  const pageSize = 500;
  let offset = 0;

  while (true) {
    const { data, error } = await adminClient
      .from("user_reports")
      .select("reporter_id")
      .eq("reported_user_id", userId)
      .not("target_post_id", "is", null)
      .order("id", { ascending: true })
      .range(offset, offset + pageSize - 1);

    if (error) {
      console.error("Could not count reports for the target account:", error);
      throw new Error("Could not verify the account's report count.");
    }

    for (const report of data || []) {
      if (report.reporter_id) reporterIds.add(report.reporter_id);
    }
    if ((data || []).length < pageSize) return reporterIds.size;
    offset += pageSize;
  }
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  if (request.method !== "POST") {
    return jsonResponse({ error: "Method not allowed." }, 405);
  }

  const authorization = request.headers.get("Authorization");
  if (!authorization?.startsWith("Bearer ")) {
    return jsonResponse({ error: "Authentication is required." }, 401);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !anonKey || !serviceRoleKey) {
    console.error("Supabase function environment is missing required values.");
    return jsonResponse({ error: "Account moderation is not configured on the server." }, 500);
  }

  const authClient = createClient(supabaseUrl, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: authData, error: authError } = await authClient.auth.getUser(
    authorization.slice("Bearer ".length),
  );
  if (authError || !authData.user) {
    return jsonResponse({ error: "Your session is invalid or expired. Sign in again." }, 401);
  }

  const adminClient = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: callerProfile, error: callerError } = await adminClient
    .from("profiles")
    .select("role")
    .eq("id", authData.user.id)
    .maybeSingle();

  if (callerError) {
    console.error("Could not verify the caller's admin role:", callerError);
    return jsonResponse({ error: "Could not verify admin access." }, 500);
  }
  if (callerProfile?.role !== "admin") {
    return jsonResponse({ error: "Only administrators can moderate reported accounts." }, 403);
  }

  let body: { userId?: unknown; action?: unknown; confirmed?: unknown };
  try {
    body = await request.json();
  } catch {
    return jsonResponse({ error: "Request body must be valid JSON." }, 400);
  }

  const userId = typeof body.userId === "string" ? body.userId : "";
  const action = body.action;
  if (!isUuid(userId)) {
    return jsonResponse({ error: "Choose a valid account." }, 400);
  }
  if (action !== "warn" && action !== "delete") {
    return jsonResponse({ error: "Choose a valid account moderation action." }, 400);
  }
  if (userId === authData.user.id) {
    return jsonResponse({ error: "You cannot moderate your own administrator account here." }, 400);
  }
  if (action === "delete" && body.confirmed !== true) {
    return jsonResponse({ error: "Confirm the permanent account deletion before continuing." }, 400);
  }

  const { data: targetProfile, error: targetError } = await adminClient
    .from("profiles")
    .select("id, role, full_name, username")
    .eq("id", userId)
    .maybeSingle();

  if (targetError) {
    console.error("Could not load the target account profile:", targetError);
    return jsonResponse({ error: "Could not load the selected account." }, 500);
  }
  if (!targetProfile) {
    return jsonResponse({ error: "The selected account no longer exists." }, 404);
  }
  if (targetProfile.role === "admin") {
    return jsonResponse({ error: "Administrator accounts cannot be moderated from this action." }, 403);
  }

  let distinctReporterCount: number;
  try {
    distinctReporterCount = await countDistinctReporters(adminClient, userId);
  } catch (error) {
    return jsonResponse({ error: error instanceof Error ? error.message : "Could not verify the report count." }, 500);
  }

  const requiredReporters = action === "warn" ? 4 : 5;
  if (distinctReporterCount < requiredReporters) {
    return jsonResponse({
      error: action === "warn"
        ? "An account warning requires reports from at least four different people."
        : "Permanent account deletion requires reports from at least five different people.",
    }, 409);
  }

  if (action === "warn") {
    const { error: activityError } = await adminClient
      .from("profile_activity")
      .insert({
        user_id: userId,
        actor_id: authData.user.id,
        event_type: "warning",
        message: "An administrator issued an account warning after reports from at least four different community members.",
      });

    if (activityError) {
      console.error("Could not add the account warning to the user's activity timeline:", activityError);
      return jsonResponse({ error: "The warning could not be recorded on the user's activity timeline." }, 500);
    }

    return jsonResponse({
      message: `Warning sent to ${targetProfile.full_name || targetProfile.username || "the account holder"}.`,
      distinctReporterCount,
    });
  }

  const { error: deleteError } = await adminClient.auth.admin.deleteUser(userId, false);
  if (deleteError) {
    console.error("Could not permanently delete the reported account:", deleteError);
    return jsonResponse({ error: `Could not permanently delete the account: ${deleteError.message}` }, 409);
  }

  return jsonResponse({
    message: "The reported account was permanently deleted.",
    distinctReporterCount,
  });
});
