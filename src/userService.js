import { supabase } from "./components/supabaseClient";

const MAX_ACCOUNT_WARNINGS = 3;

const throwIfError = (error) => {
  if (error) throw error;
};

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
      reported_user:profiles!user_reports_reported_user_id_fkey(id, full_name, email, username, profile_picture, role, is_suspended, is_banned, flagged_post_count),
      reporter:profiles!user_reports_reporter_id_fkey(full_name, username)
    `)
    .in("status", ["pending", "under_review"])
    .not("target_post_id", "is", null)
    .order("created_at", { ascending: false });

  throwIfError(error);
  return data || [];
}

export async function getCommunityReportCounts() {
  const { data, error } = await supabase.rpc("get_community_report_counts", {
    p_user_id: null,
  });
  throwIfError(error);
  return Object.fromEntries((data || []).map(({ reported_user_id, reporter_count }) => [
    reported_user_id,
    Number(reporter_count),
  ]));
}

export async function getAccountWarningCounts() {
  const { data, error } = await supabase
    .from("profile_activity")
    .select("user_id")
    .eq("event_type", "warning");

  throwIfError(error);
  return (data || []).reduce((counts, { user_id }) => {
    counts[user_id] = Math.min((counts[user_id] || 0) + 1, MAX_ACCOUNT_WARNINGS);
    return counts;
  }, {});
}

export async function getAdminAccessReview() {
  const { data, error } = await supabase.functions.invoke("admin-access-review", {
    body: { action: "list" },
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

export async function updateAdminAccess({ userId, action }) {
  const { data, error } = await supabase.functions.invoke("admin-access-review", {
    body: { userId, action },
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

export async function moderateReportedAccount({ userId, action, confirmed = false }) {
  const { data, error } = await supabase.functions.invoke("moderate-account", {
    body: { userId, action, confirmed },
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

export async function reactivateAllAccounts() {
  return moderateReportedAccount({ action: "reactivate_all" });
}

export async function setUserSuspended(userId, suspended) {
  const { error } = await supabase
    .from("profiles")
    .update({ is_suspended: suspended })
    .eq("id", userId);

  throwIfError(error);
}

export async function reviewAccountReport(report, action) {
  const { error } = await supabase.rpc("review_account_report", {
    p_report_id: report.id,
    p_action: action,
  });
  throwIfError(error);
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
