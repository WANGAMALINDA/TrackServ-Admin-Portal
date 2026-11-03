import { useEffect, useRef, useState } from "react";
import {
  CalendarDays,
  Camera,
  Check,
  LockKeyhole,
  Mail,
  MapPin,
  Pencil,
  Phone,
  ShieldCheck,
  UserRound,
  X,
} from "lucide-react";
import { supabase } from "../components/supabaseClient";
import "./AdminProfile.css";

const MAX_PROFILE_PICTURE_SIZE = 3 * 1024 * 1024;
const PROFILE_PICTURE_TYPES = ["image/jpeg", "image/png", "image/webp"];
const PROFILE_FIELDS = "id, full_name, email, phone, location, about, profile_picture, created_at, role";
const EMPTY_PROFILE = {
  id: "",
  full_name: "",
  email: "",
  phone: "",
  location: "",
  about: "",
  profile_picture: "",
  created_at: null,
  role: "admin",
};

function formatMemberSince(value) {
  if (!value) return "Not available";
  return new Date(value).toLocaleDateString("en-ZA", { month: "long", year: "numeric" });
}

function formatDate(value) {
  if (!value) return "Not provided";
  return new Date(value).toLocaleDateString("en-ZA", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

export default function AdminProfile() {
  const [profile, setProfile] = useState(EMPTY_PROFILE);
  const [draft, setDraft] = useState({
    full_name: "",
    phone: "",
    location: "",
    about: "",
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const fileInput = useRef(null);

  useEffect(() => {
    let active = true;

    async function loadProfile() {
      setLoading(true);
      setError("");

      const { data: { user }, error: authError } = await supabase.auth.getUser();
      if (authError) throw authError;
      if (!user) throw new Error("Your session has expired. Please sign in again.");

      const { data, error: profileError } = await supabase
        .from("profiles")
        .select(PROFILE_FIELDS)
        .eq("id", user.id)
        .maybeSingle();
      if (profileError) throw profileError;
      if (!data) throw new Error("Your account profile could not be found.");
      if (data.role !== "admin") throw new Error("Administrator access is required to view this profile.");

      if (!active) return;
      const loadedProfile = { ...data, email: user.email || data.email || "" };
      setProfile(loadedProfile);
      setDraft({
        full_name: loadedProfile.full_name || "",
        phone: loadedProfile.phone || "",
        location: loadedProfile.location || "",
        about: loadedProfile.about || "",
      });
      setLoading(false);
    }

    loadProfile().catch((loadError) => {
      console.error("Could not load the administrator profile:", loadError);
      if (active) {
        setError(loadError.message || "Could not load your profile. Please try again.");
        setLoading(false);
      }
    });

    return () => {
      active = false;
    };
  }, []);

  const cancelEdit = () => {
    setDraft({
      full_name: profile.full_name || "",
      phone: profile.phone || "",
      location: profile.location || "",
      about: profile.about || "",
    });
    setEditing(false);
    setError("");
  };

  const saveProfile = async (event) => {
    event.preventDefault();
    setSaving(true);
    setError("");
    setNotice("");

    const { data, error: updateError } = await supabase
      .from("profiles")
      .update({
        full_name: draft.full_name.trim(),
        phone: draft.phone.trim(),
        location: draft.location.trim(),
        about: draft.about.trim(),
      })
      .eq("id", profile.id)
      .select(PROFILE_FIELDS)
      .single();

    if (updateError) {
      console.error("Could not save the administrator profile:", updateError);
      setError(`Could not save your profile: ${updateError.message}`);
      setSaving(false);
      return;
    }

    setProfile((current) => ({ ...current, ...data, email: current.email }));
    setEditing(false);
    setSaving(false);
    setNotice("Profile updated.");
  };

  const changeProfilePicture = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    setError("");
    setNotice("");

    if (!PROFILE_PICTURE_TYPES.includes(file.type) || file.size > MAX_PROFILE_PICTURE_SIZE) {
      setError("Choose a JPEG, PNG, or WebP image no larger than 3 MB.");
      return;
    }

    const extension = file.type.split("/")[1];
    const path = `${profile.id}/avatar.${extension}`;
    const { error: uploadError } = await supabase.storage
      .from("Profile")
      .upload(path, file, { upsert: true, contentType: file.type });

    if (uploadError) {
      console.error("Could not upload the administrator profile photo:", uploadError);
      setError(`Could not upload your profile photo: ${uploadError.message}`);
      return;
    }

    const { data: publicUrl } = supabase.storage.from("Profile").getPublicUrl(path);
    const { data, error: updateError } = await supabase
      .from("profiles")
      .update({ profile_picture: publicUrl.publicUrl })
      .eq("id", profile.id)
      .select(PROFILE_FIELDS)
      .single();

    if (updateError) {
      console.error("Could not save the administrator profile photo:", updateError);
      setError(`Photo uploaded, but your profile could not be updated: ${updateError.message}`);
      return;
    }

    setProfile((current) => ({ ...current, ...data, email: current.email }));
    setNotice("Profile photo updated.");
  };

  if (loading) {
    return <main className="admin-profile-page"><p className="admin-profile-message">Loading your profile…</p></main>;
  }

  if (!profile.id) {
    return (
      <main className="admin-profile-page">
        <div className="admin-profile-alert admin-profile-alert--error" role="alert">
          {error || "Your account profile could not be found."}
        </div>
      </main>
    );
  }

  return (
    <main className="admin-profile-page">
      <header className="admin-profile-header">
        <div>
          <p className="admin-profile-eyebrow"><UserRound size={15} /> Administrator account</p>
          <h1>My Profile</h1>
          <p>Manage your personal information and profile photo.</p>
        </div>
        {!editing && (
          <button className="admin-profile-button admin-profile-button--primary" type="button" onClick={() => setEditing(true)}>
            <Pencil size={15} /> Edit profile
          </button>
        )}
      </header>

      {error && <div className="admin-profile-alert admin-profile-alert--error" role="alert">{error}</div>}
      {notice && <div className="admin-profile-alert admin-profile-alert--success" role="status">{notice}</div>}

      <section className="admin-profile-grid">
        <article className="admin-profile-card admin-profile-identity">
          <div className="admin-profile-avatar-wrap">
            {profile.profile_picture
              ? <img className="admin-profile-avatar" src={profile.profile_picture} alt="" />
              : <span className="admin-profile-avatar admin-profile-avatar--placeholder">
                  {(profile.full_name || profile.email || "A").trim().charAt(0).toUpperCase()}
                </span>}
            <button
              className="admin-profile-avatar-edit"
              type="button"
              aria-label="Change profile photo"
              onClick={() => fileInput.current?.click()}
            >
              <Camera size={15} />
            </button>
            <input
              ref={fileInput}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              hidden
              onChange={changeProfilePicture}
            />
          </div>
          <div className="admin-profile-identity-copy">
            <h2>{profile.full_name || "Administrator"}</h2>
            <span className="admin-profile-role"><ShieldCheck size={14} /> Administrator</span>
            <p><CalendarDays size={14} /> Member since {formatMemberSince(profile.created_at)}</p>
          </div>
        </article>

        <article className="admin-profile-card admin-profile-access">
          <div className="admin-profile-card-heading">
            <span className="admin-profile-icon"><LockKeyhole size={18} /></span>
            <div>
              <h2>Account access</h2>
              <p>Your administrator permissions are managed by your account role.</p>
            </div>
          </div>
          <div className="admin-profile-access-row">
            <span>Access level</span>
            <strong>Administrator</strong>
          </div>
          <div className="admin-profile-access-row">
            <span>Portal</span>
            <strong>TrackServ Admin Portal</strong>
          </div>
          <p className="admin-profile-access-note">Contact another administrator to change your access level.</p>
        </article>

        <article className="admin-profile-card admin-profile-details">
          <div className="admin-profile-card-heading">
            <span className="admin-profile-icon"><UserRound size={18} /></span>
            <div>
              <h2>Personal information</h2>
              <p>Your contact details for your administrator account.</p>
            </div>
          </div>

          {editing ? (
            <form className="admin-profile-form" onSubmit={saveProfile}>
              <label>
                Full name
                <input
                  autoComplete="name"
                  required
                  value={draft.full_name}
                  onChange={(event) => setDraft((current) => ({ ...current, full_name: event.target.value }))}
                />
              </label>
              <label>
                Phone
                <input
                  autoComplete="tel"
                  type="tel"
                  value={draft.phone}
                  onChange={(event) => setDraft((current) => ({ ...current, phone: event.target.value }))}
                />
              </label>
              <label>
                Office or service area
                <input
                  autoComplete="organization-title"
                  value={draft.location}
                  onChange={(event) => setDraft((current) => ({ ...current, location: event.target.value }))}
                />
              </label>
              <label>
                About
                <textarea
                  rows={4}
                  value={draft.about}
                  onChange={(event) => setDraft((current) => ({ ...current, about: event.target.value }))}
                />
              </label>
              <div className="admin-profile-form-actions">
                <button className="admin-profile-button" type="button" onClick={cancelEdit} disabled={saving}>
                  <X size={15} /> Cancel
                </button>
                <button className="admin-profile-button admin-profile-button--primary" type="submit" disabled={saving}>
                  <Check size={15} /> {saving ? "Saving…" : "Save changes"}
                </button>
              </div>
            </form>
          ) : (
            <dl className="admin-profile-details-list">
              <div>
                <dt><Mail size={15} /> Email</dt>
                <dd>{profile.email || "Not provided"}</dd>
              </div>
              <div>
                <dt><Phone size={15} /> Phone</dt>
                <dd>{profile.phone || "Not provided"}</dd>
              </div>
              <div>
                <dt><MapPin size={15} /> Office or service area</dt>
                <dd>{profile.location || "Not provided"}</dd>
              </div>
              <div className="admin-profile-about">
                <dt>About</dt>
                <dd>{profile.about || "No profile description added."}</dd>
              </div>
              <div>
                <dt><CalendarDays size={15} /> Account created</dt>
                <dd>{formatDate(profile.created_at)}</dd>
              </div>
            </dl>
          )}
        </article>
      </section>
    </main>
  );
}
