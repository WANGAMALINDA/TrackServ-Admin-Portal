import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-api-version",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const jsonResponse = (body: Record<string, unknown>, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

const isUuid = (value: string) =>
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);

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
    return jsonResponse({ error: "Administrator access review is not configured on the server." }, 500);
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
    .select("role, is_suspended")
    .eq("id", authData.user.id)
    .maybeSingle();

  if (callerError) {
    console.error("Could not verify the caller's admin access:", callerError);
    return jsonResponse({ error: "Could not verify administrator access." }, 500);
  }
  if (callerProfile?.role !== "admin" || callerProfile.is_suspended) {
    return jsonResponse({ error: "Only active administrators can manage administrator access." }, 403);
  }

  let body: { action?: unknown; userId?: unknown };
  try {
    body = await request.json();
  } catch {
    return jsonResponse({ error: "Request body must be valid JSON." }, 400);
  }

  if (body.action === "list") {
    const { data: profiles, error: profilesError } = await adminClient
      .from("profiles")
      .select("id, full_name, username, email, role, is_suspended, is_banned")
      .eq("role", "admin")
      .order("full_name", { ascending: true });

    if (profilesError) {
      console.error("Could not load administrator profiles:", profilesError);
      return jsonResponse({ error: "Could not load administrator accounts." }, 500);
    }

    let admins;
    try {
      admins = await Promise.all((profiles || []).map(async (profile) => {
        const { data, error } = await adminClient.auth.admin.getUserById(profile.id);
        if (error) {
          console.error(`Could not load sign-in metadata for admin ${profile.id}:`, error);
          throw error;
        }

        return {
          id: profile.id,
          full_name: profile.full_name,
          username: profile.username,
          email: data.user.email || profile.email,
          role: profile.role,
          is_suspended: Boolean(profile.is_suspended),
          is_banned: Boolean(profile.is_banned),
          last_sign_in_at: data.user.last_sign_in_at || null,
        };
      }));
    } catch (error) {
      console.error("Could not assemble administrator access review:", error);
      return jsonResponse({ error: "Could not load administrator sign-in details." }, 500);
    }

    return jsonResponse({
      admins,
      currentAdminId: authData.user.id,
    });
  }

  const userId = typeof body.userId === "string" ? body.userId : "";
  const action = body.action;
  if (!isUuid(userId)) {
    return jsonResponse({ error: "Choose a valid administrator account." }, 400);
  }
  if (!["revoke_admin", "suspend", "unsuspend"].includes(String(action))) {
    return jsonResponse({ error: "Choose a valid administrator access action." }, 400);
  }
  if (userId === authData.user.id) {
    return jsonResponse({ error: "You cannot revoke or suspend your own administrator account." }, 400);
  }

  const { data: target, error: targetError } = await adminClient
    .from("profiles")
    .select("id, role, is_suspended, full_name, username")
    .eq("id", userId)
    .maybeSingle();

  if (targetError) {
    console.error("Could not load the target administrator profile:", targetError);
    return jsonResponse({ error: "Could not load the selected administrator account." }, 500);
  }
  if (!target || target.role !== "admin") {
    return jsonResponse({ error: "The selected account is no longer an administrator." }, 404);
  }

  if (action !== "unsuspend") {
    const { count, error: countError } = await adminClient
      .from("profiles")
      .select("id", { count: "exact", head: true })
      .eq("role", "admin")
      .or("is_suspended.is.null,is_suspended.eq.false")
      .neq("id", target.id);

    if (countError) {
      console.error("Could not verify remaining active administrators:", countError);
      return jsonResponse({ error: "Could not verify administrator coverage." }, 500);
    }
    if (!count) {
      return jsonResponse({ error: "At least one other active administrator must remain." }, 409);
    }
  }

  const updates = action === "revoke_admin"
    ? { role: "moderator" }
    : { is_suspended: action === "suspend" };
  const { data: updatedProfile, error: updateError } = await adminClient
    .from("profiles")
    .update(updates)
    .eq("id", target.id)
    .eq("role", "admin")
    .select("id")
    .maybeSingle();

  if (updateError) {
    console.error(`Could not apply ${String(action)} to the administrator account:`, updateError);
    return jsonResponse({ error: "Could not update administrator access. Please try again." }, 500);
  }
  if (!updatedProfile) {
    return jsonResponse({ error: "Administrator access changed before this request completed. Refresh and try again." }, 409);
  }

  const accountName = target.full_name || target.username || "The account";
  const message = action === "revoke_admin"
    ? `Administrator access revoked for ${accountName}; the account role is now Manager.`
    : action === "suspend"
      ? `Administrator account suspended for ${accountName}.`
      : `Administrator account suspension removed for ${accountName}.`;

  return jsonResponse({ message });
});
