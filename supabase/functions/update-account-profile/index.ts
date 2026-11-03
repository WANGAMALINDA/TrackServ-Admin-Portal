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
    return jsonResponse({ error: "Profile management is not configured on the server." }, 500);
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
    console.error("Could not verify the caller's admin role:", callerError);
    return jsonResponse({ error: "Could not verify admin access." }, 500);
  }
  if (callerProfile?.role !== "admin" || callerProfile.is_suspended) {
    return jsonResponse({ error: "Only active administrators can update account profiles." }, 403);
  }

  let body: {
    userId?: unknown;
    fullName?: unknown;
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

  const userId = typeof body.userId === "string" ? body.userId : "";
  const fullName = typeof body.fullName === "string" ? body.fullName.trim() : "";
  const phone = typeof body.phone === "string" ? body.phone.trim() : "";
  const location = typeof body.location === "string" ? body.location.trim() : "";
  const about = typeof body.about === "string" ? body.about.trim() : "";

  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(userId)) {
    return jsonResponse({ error: "Choose a valid account to update." }, 400);
  }
  if (fullName.length < 2 || fullName.length > 120 || phone.length > 40
    || location.length > 160 || about.length > 500) {
    return jsonResponse({ error: "Enter a name and keep profile details within their allowed lengths." }, 400);
  }

  const { data: targetProfile, error: targetError } = await adminClient
    .from("profiles")
    .select("role")
    .eq("id", userId)
    .maybeSingle();

  if (targetError) {
    console.error("Could not load the target account profile:", targetError);
    return jsonResponse({ error: "Could not load the selected account profile." }, 500);
  }
  if (!targetProfile || !["manager", "moderator", "staff"].includes(targetProfile.role)) {
    return jsonResponse({ error: "Only manager and staff account profiles can be edited here." }, 403);
  }

  const updates: Record<string, string> = { full_name: fullName, phone, location, about };
  let uploadedImagePath = "";
  let profileImage: DecodedProfilePicture | null;
  try {
    profileImage = decodeProfilePicture(body.profilePicture);
  } catch (error) {
    return jsonResponse({ error: error instanceof Error ? error.message : "The profile picture is invalid." }, 400);
  }

  if (profileImage) {
    uploadedImagePath = `${userId}/avatar-${Date.now()}.${profileImage.extension}`;
    const { error: uploadError } = await adminClient.storage
      .from("Profile")
      .upload(uploadedImagePath, profileImage.bytes, { contentType: profileImage.contentType, upsert: true });

    if (uploadError) {
      console.error("Could not upload the account profile picture:", uploadError);
      return jsonResponse({ error: "Could not upload the profile picture. Check the Profile storage bucket and try again." }, 500);
    }

    const { data: imageUrl } = adminClient.storage.from("Profile").getPublicUrl(uploadedImagePath);
    updates.profile_picture = `${imageUrl.publicUrl}?updated=${Date.now()}`;
  }

  const { error: updateError } = await adminClient
    .from("profiles")
    .update(updates)
    .eq("id", userId);

  if (updateError) {
    console.error("Could not save the account profile:", updateError);
    if (uploadedImagePath) {
      const { error: cleanupError } = await adminClient.storage.from("Profile").remove([uploadedImagePath]);
      if (cleanupError) {
        console.error("Could not remove the profile picture after profile update failed:", cleanupError);
      }
    }
    return jsonResponse({ error: "Could not save the account profile. Please try again." }, 500);
  }

  return jsonResponse({ message: "Account profile updated." });
});
