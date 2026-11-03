import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { decodeProfilePicture, type DecodedProfilePicture } from "../_shared/profilePicture.ts";

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
    return jsonResponse({ error: "Account creation is not configured on the server." }, 500);
  }

  const accessToken = authorization.slice("Bearer ".length);
  const authClient = createClient(supabaseUrl, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: authData, error: authError } = await authClient.auth.getUser(accessToken);
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
    console.error("Could not verify the caller's admin role:", callerError);
    return jsonResponse({ error: "Could not verify admin access." }, 500);
  }
  if (callerProfile?.role !== "admin" || callerProfile.is_suspended) {
    return jsonResponse({ error: "Only active administrators can create accounts." }, 403);
  }

  let body: {
    email?: unknown;
    fullName?: unknown;
    password?: unknown;
    role?: unknown;
    phone?: unknown;
    location?: unknown;
    about?: unknown;
    profilePicture?: unknown;
  };
  try {
    body = await request.json();
  } catch {
    return jsonResponse({ error: "Request body must be valid JSON." }, 400);
  }

  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  const fullName = typeof body.fullName === "string" ? body.fullName.trim() : "";
  const password = typeof body.password === "string" ? body.password : "";
  const phone = typeof body.phone === "string" ? body.phone.trim() : "";
  const location = typeof body.location === "string" ? body.location.trim() : "";
  const about = typeof body.about === "string" ? body.about.trim() : "";
  const requestedRole = body.role;
  const validEmail = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email);
  if (!validEmail || fullName.length < 2 || fullName.length > 120
    || phone.length > 40 || location.length > 160 || about.length > 500) {
    return jsonResponse({ error: "Enter a valid email address and name; profile details must be within their allowed lengths." }, 400);
  }
  if (password.length < 8 || password.length > 128) {
    return jsonResponse({ error: "Password must be between 8 and 128 characters." }, 400);
  }
  if (!["staff", "manager", "admin"].includes(String(requestedRole))) {
    return jsonResponse({ error: "Choose Staff, Manager, or Admin." }, 400);
  }

  const role = requestedRole === "manager" ? "moderator" : String(requestedRole);
  let profileImage: DecodedProfilePicture | null;
  let profilePicture = "";
  try {
    profileImage = decodeProfilePicture(body.profilePicture);
  } catch (error) {
    return jsonResponse({ error: error instanceof Error ? error.message : "The profile picture is invalid." }, 400);
  }

  const { data: created, error: createError } = await adminClient.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { full_name: fullName, role },
  });

  if (createError || !created.user) {
    console.error("Could not create the account:", createError);
    return jsonResponse({ error: createError?.message || "Could not create the account." }, 400);
  }

  const imagePath = profileImage ? `${created.user.id}/avatar.${profileImage.extension}` : "";
  if (profileImage) {
    const { error: uploadError } = await adminClient.storage
      .from("Profile")
      .upload(imagePath, profileImage.bytes, { contentType: profileImage.contentType, upsert: true });

    if (uploadError) {
      console.error("Could not upload the new account profile picture:", uploadError);
      const { error: cleanupError } = await adminClient.auth.admin.deleteUser(created.user.id);
      if (cleanupError) {
        console.error("Could not remove the account after profile picture upload failed:", cleanupError);
      }
      return jsonResponse({ error: "Could not upload the profile picture. Check the Profile storage bucket and try again." }, 500);
    }

    const { data: imageUrl } = adminClient.storage.from("Profile").getPublicUrl(imagePath);
    profilePicture = imageUrl.publicUrl;
  }

  const username = `account-${created.user.id.replaceAll("-", "").slice(0, 20)}`;
  const { error: profileError } = await adminClient
    .from("profiles")
    .upsert({
      id: created.user.id,
      full_name: fullName,
      username,
      email,
      role,
      phone,
      location,
      about,
      profile_picture: profilePicture,
    }, { onConflict: "id" });

  if (profileError) {
    console.error("The auth account was created, but its profile could not be saved:", profileError);
    if (imagePath) {
      const { error: imageCleanupError } = await adminClient.storage.from("Profile").remove([imagePath]);
      if (imageCleanupError) {
        console.error("Could not remove the profile picture after profile creation failed:", imageCleanupError);
      }
    }
    const { error: cleanupError } = await adminClient.auth.admin.deleteUser(created.user.id);
    if (cleanupError) {
      console.error("Could not remove the auth account after profile creation failed:", cleanupError);
    }
    return jsonResponse({
      error: "The account profile could not be saved. Contact an administrator before trying again.",
    }, 500);
  }

  return jsonResponse({
    user: {
      id: created.user.id,
      email,
      full_name: fullName,
      role,
    },
    message: "Account created. Share the temporary password with the user through a secure channel and ask them to change it.",
  }, 201);
});
