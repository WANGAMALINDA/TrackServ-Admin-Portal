import { supabase } from "./components/supabaseClient";

const throwIfError = (error) => {
  if (error) throw error;
};

const settingsFields = "id, two_factor, password_expiry, login_alerts, last_password_change";

export async function getUsers() {
  const { data, error } = await supabase
    .from("profiles")
    .select("id, full_name, username, email, role, phone, location, about, profile_picture, created_at, is_suspended, is_banned, flagged_post_count")
    .order("created_at", { ascending: false });

  throwIfError(error);
  return data || [];
}

export async function getAccountReports() {
  const { data, error } = await supabase
    .from("user_reports")
    .select(`
      id, reported_user_id, reporter_id, reason_type, description,
      status, action_taken, created_at, target_post_id, post_threshold_flagged,
      reported_user:profiles!user_reports_reported_user_id_fkey(id, full_name, email, username, role, is_suspended, is_banned, flagged_post_count),
      reporter:profiles!user_reports_reporter_id_fkey(full_name, username)
    `)
    .in("status", ["pending", "under_review"])
    .not("target_post_id", "is", null)
    .eq("post_threshold_flagged", true)
    .order("created_at", { ascending: false });

  throwIfError(error);
  return data || [];
}

export async function getSettings() {
  const { data, error } = await supabase
    .from("admin_security_settings")
    .select(settingsFields)
    .eq("id", 1)
    .maybeSingle();

  throwIfError(error);
  if (!data) throw new Error("Admin security settings are missing. Run the supplied admin portal SQL migration.");
  return data;
}

export async function setUserSuspended(userId, suspended) {
  const { error } = await supabase
    .from("profiles")
    .update({ is_suspended: suspended })
    .eq("id", userId);

  throwIfError(error);
}

export async function reviewAccountReport(report, action) {
  if (action === "account_suspension") {
    const { error: suspendError } = await supabase
      .from("profiles")
      .update({ is_suspended: true })
      .eq("id", report.reported_user_id);
    throwIfError(suspendError);
  }

  const update = action === "dismiss"
    ? { status: "dismissed", reviewed_at: new Date().toISOString() }
    : {
        status: "actioned",
        action_taken: action,
        reviewed_at: new Date().toISOString(),
      };

  const { data, error: authError } = await supabase.auth.getUser();
  throwIfError(authError);
  if (data.user?.id) update.reviewed_by = data.user.id;

  const { error } = await supabase
    .from("user_reports")
    .update(update)
    .eq("id", report.id);
  throwIfError(error);
}

export async function saveSettings(settings) {
  const { data, error } = await supabase
    .from("admin_security_settings")
    .update({
      two_factor: settings.two_factor,
      password_expiry: settings.password_expiry,
      login_alerts: settings.login_alerts,
    })
    .eq("id", 1)
    .select(settingsFields)
    .single();

  return { data, error };
}

export async function createAccount({ email, fullName, password, role, phone, location, about, profilePicture }) {
  const { data, error } = await supabase.functions.invoke("create-account", {
    body: {
      email,
      fullName,
      password,
      role,
      phone,
      location,
      about,
      profilePicture: await imageToDataUrl(profilePicture),
    },
  });

  if (error) {
    let message = error.message;
    if (error.context instanceof Response) {
      try {
        const responseBody = await error.context.clone().json();
        if (typeof responseBody.error === "string") message = responseBody.error;
      } catch {
        // Keep the Functions error message if the response is not JSON.
      }
    }
    throw new Error(message);
  }

  return data;
}

export async function updateManagedProfile({ userId, fullName, phone, location, about, profilePicture }) {
  const { data, error } = await supabase.functions.invoke("update-account-profile", {
    body: {
      userId,
      fullName,
      phone,
      location,
      about,
      profilePicture: await imageToDataUrl(profilePicture),
    },
  });

  if (error) {
    let message = error.message;
    if (error.context instanceof Response) {
      try {
        const responseBody = await error.context.clone().json();
        if (typeof responseBody.error === "string") message = responseBody.error;
      } catch {
        // Keep the Functions error message if the response is not JSON.
      }
    }
    throw new Error(message);
  }

  return data;
}

async function imageToDataUrl(file) {
  if (!file) return null;
  if (typeof file === "string") return file;

  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") resolve(reader.result);
      else reject(new Error("Could not read the selected profile picture."));
    };
    reader.onerror = () => reject(new Error("Could not read the selected profile picture."));
    reader.readAsDataURL(file);
  });
}
