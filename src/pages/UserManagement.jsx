import { useCallback, useEffect, useState } from "react";
import * as api from "../userService";
import {
  ArrowRight, Calendar, CheckCircle2, Clock, FileText, ImagePlus, MoreHorizontal, Pencil,
  Search, ShieldAlert, ShieldCheck, UserPlus, Users, X,
} from "lucide-react";
import "./UserManagement.css";

const MAX_PROFILE_PICTURE_SIZE = 3 * 1024 * 1024;
const PROFILE_PICTURE_TYPES = ["image/jpeg", "image/png", "image/webp"];

const fmt = (date) => date
  ? new Date(date).toLocaleString("en-GB", {
      day: "2-digit", month: "short", year: "numeric",
      hour: "2-digit", minute: "2-digit",
    })
  : "-";

const initials = (name = "?") =>
  name.split(" ").map((part) => part[0]).join("").slice(0, 2).toUpperCase();

const accountStatus = (user) => {
  if (user.is_banned) return "banned";
  if (user.is_suspended) return "suspended";
  return "active";
};

export default function UserManagement() {
  const [users, setUsers] = useState([]);
  const [accountReports, setAccountReports] = useState([]);
  const [settings, setSettings] = useState(null);
  const [loadError, setLoadError] = useState("");
  const [tab, setTab] = useState("management");
  const [search, setSearch] = useState("");
  const [showAll, setShowAll] = useState(false);
  const [selected, setSelected] = useState(null);
  const [menuId, setMenuId] = useState(null);
  const [msg, setMsg] = useState("");
  const [loading, setLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);
  const [createBusy, setCreateBusy] = useState(false);
  const [newAccount, setNewAccount] = useState({
    fullName: "", email: "", password: "", role: "staff",
    phone: "", location: "", about: "", profilePicture: null,
  });
  const [editingUser, setEditingUser] = useState(null);
  const [profileDraft, setProfileDraft] = useState({ fullName: "", phone: "", location: "", about: "", profilePicture: null });
  const [profileBusy, setProfileBusy] = useState(false);
  const [imageError, setImageError] = useState("");
  const [now] = useState(() => Date.now());

  const load = useCallback(async () => {
    setLoading(true);
    const [usersResult, reportsResult, settingsResult] = await Promise.allSettled([
      api.getUsers(),
      api.getAccountReports(),
      api.getSettings(),
    ]);
    const errors = [];

    if (usersResult.status === "fulfilled") setUsers(usersResult.value);
    else {
      console.error("Could not load user accounts:", usersResult.reason);
      errors.push("user profiles");
    }

    if (reportsResult.status === "fulfilled") setAccountReports(reportsResult.value);
    else {
      console.error("Could not load account reports:", reportsResult.reason);
      errors.push("account reports");
    }

    if (settingsResult.status === "fulfilled") setSettings(settingsResult.value);
    else {
      console.error("Could not load security settings:", settingsResult.reason);
      errors.push("security settings");
    }

    setLoadError(errors.length
      ? `Could not load ${errors.join(", ")}. Check the admin portal SQL migration and Supabase access policies.`
      : "");
    setLoading(false);
  }, []);

  useEffect(() => {
    void Promise.resolve().then(load);
  }, [load]);

  const flash = (text) => {
    setMsg(text);
    window.setTimeout(() => setMsg(""), 3000);
  };

  const management = users.filter((user) => ["admin", "manager", "moderator"].includes(user.role));
  const staff = users.filter((user) => user.role === "staff");
  const flagged = users.filter((user) => user.flagged_post_count >= 1);
  const pendingReports = accountReports.length;
  const monthAgo = now - 30 * 86400000;
  const weekAgo = now - 7 * 86400000;
  const recent = (list, since) => list.filter((user) => new Date(user.created_at) > since).length;
  const tabUsers = tab === "management" ? management : tab === "staff" ? staff : flagged;
  const filtered = tabUsers.filter((user) =>
    `${user.full_name || user.username || ""} ${user.email || ""}`
      .toLowerCase().includes(search.toLowerCase())
  );
  const rows = showAll ? filtered : filtered.slice(0, 5);

  const toggleSuspended = async (user) => {
    try {
      await api.setUserSuspended(user.id, !user.is_suspended);
      flash(user.is_suspended ? "Account suspension removed" : "Account suspended");
      setMenuId(null);
      await load();
    } catch (error) {
      console.error("Could not update account suspension:", error);
      flash("Could not update this account. Check Supabase permissions.");
    }
  };

  const review = async (report, action) => {
    try {
      await api.reviewAccountReport(report, action);
      flash(action === "dismiss" ? "Account report dismissed" : "Account report action recorded");
      await load();
    } catch (error) {
      console.error("Could not review account report:", error);
      flash("Could not review this report. Check Supabase permissions and try again.");
    }
  };

  const saveSettings = async () => {
    try {
      const { data, error } = await api.saveSettings(settings);
      if (error) throw error;
      if (data) setSettings(data);
      flash("Security settings saved");
    } catch (error) {
      console.error("Could not save security settings:", error);
      flash("Could not save settings. Check the admin portal SQL migration and Supabase access policies.");
    }
  };

  const createAccount = async (event) => {
    event.preventDefault();
    setCreateBusy(true);
    try {
      const result = await api.createAccount(newAccount);
      flash(result.message || "Invitation sent.");
      setCreateOpen(false);
      setNewAccount({
        fullName: "", email: "", password: "", role: "staff",
        phone: "", location: "", about: "", profilePicture: null,
      });
      await load();
    } catch (error) {
      console.error("Could not create account:", error);
      flash(error.message || "Could not create this account.");
    } finally {
      setCreateBusy(false);
    }
  };

  const closeCreateDialog = () => {
    if (createBusy) return;
    setCreateOpen(false);
    setImageError("");
    setNewAccount({
      fullName: "", email: "", password: "", role: "staff",
      phone: "", location: "", about: "", profilePicture: null,
    });
  };

  const selectProfilePicture = (file, onSelect) => {
    setImageError("");
    if (!file) return;
    if (!PROFILE_PICTURE_TYPES.includes(file.type) || file.size > MAX_PROFILE_PICTURE_SIZE) {
      setImageError("Choose a JPEG, PNG, or WebP image no larger than 3 MB.");
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") onSelect(reader.result);
      else setImageError("Could not read the selected profile picture.");
    };
    reader.onerror = () => setImageError("Could not read the selected profile picture.");
    reader.readAsDataURL(file);
  };

  const openProfileEditor = (user) => {
    setImageError("");
    setEditingUser(user);
    setProfileDraft({
      fullName: user.full_name || "",
      phone: user.phone || "",
      location: user.location || "",
      about: user.about || "",
      profilePicture: null,
    });
  };

  const saveManagedProfile = async (event) => {
    event.preventDefault();
    if (!editingUser) return;
    setProfileBusy(true);
    setImageError("");
    try {
      await api.updateManagedProfile({ userId: editingUser.id, ...profileDraft });
      setEditingUser(null);
      flash("Account profile updated.");
      await load();
    } catch (error) {
      console.error("Could not update account profile:", error);
      flash(error.message || "Could not update this account profile.");
    } finally {
      setProfileBusy(false);
    }
  };

  const cards = [
    { label: "Staff Accounts", value: staff.length, icon: <FileText />, cls: "green",
      note: `+${recent(staff, monthAgo)} created in 30 days` },
    { label: "Pending Account Reports", value: pendingReports, icon: <Clock />, cls: "orange",
      note: "From user_reports" },
    { label: "Management Accounts", value: management.length, icon: <Users />, cls: "blue",
      note: `${management.filter((user) => accountStatus(user) === "active").length} active` },
    { label: "Flagged Accounts", value: flagged.length, icon: <ShieldAlert />, cls: "red",
      note: `+${recent(flagged, weekAgo)} flagged in 7 days` },
  ];

  return (
    <div className="um-page">
      {msg && <div className="um-toast" role="status">{msg}</div>}
      {loadError && <p className="um-error" role="alert">{loadError}</p>}

      <section className="um-header">
        <div>
          <h1>User Management</h1>
          <p>Manage accounts and review user reports from the TrackServ database.</p>
        </div>
        <div className="um-header-actions">
          <div className="um-search">
            <Search size={16} />
            <input
              placeholder="Search users..."
              aria-label="Search users"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
          </div>
          <button className="um-btn um-add-account" onClick={() => setCreateOpen(true)}>
            <UserPlus size={17} /> Add Account
          </button>
        </div>
      </section>

      <section className="um-cards">
        {cards.map((card) => (
          <div key={card.label} className={`um-card ${card.cls}`}>
            <div className="um-card-icon">{card.icon}</div>
            <div>
              <span>{card.label}</span>
              <h2>{loading ? "…" : card.value}</h2>
              <small>{card.note}</small>
            </div>
          </div>
        ))}
      </section>

      <section className="um-main">
        <div className="um-panel">
          <div className="um-title">
            <FileText size={34} color="#16a34a" />
            <div>
              <h3>Accounts</h3>
              <p>Account roles and status are read from the existing profiles table.</p>
            </div>
          </div>

          <div className="um-tabs">
            <button className={tab === "management" ? "active" : ""} onClick={() => setTab("management")}>
              Management
            </button>
            <button className={tab === "staff" ? "active" : ""} onClick={() => setTab("staff")}>
              Staff
            </button>
            <button className={tab === "reported" ? "active" : ""} onClick={() => setTab("reported")}>
              Flagged accounts
            </button>
          </div>

          <div className={`um-row um-head${tab === "reported" ? " flagged-row" : ""}`}>
            <span>User</span>
            {tab !== "reported" && <span>Role</span>}
            <span>Created</span><span>Status</span><span>Action</span>
          </div>

          {loading && <p className="um-empty">Loading profiles…</p>}
          {!loading && rows.length === 0 && !loadError && <p className="um-empty">No matching accounts.</p>}
          {rows.map((user) => {
            const displayName = user.full_name || user.username || "Unnamed account";
            const status = accountStatus(user);
            return (
              <div className={`um-row${tab === "reported" ? " flagged-row" : ""}`} key={user.id}>
                <div className="um-user">
                  <div className="um-avatar small">
                    {user.profile_picture
                      ? <img src={user.profile_picture} alt="" />
                      : initials(displayName)}
                  </div>
                  <div><strong>{displayName}</strong><small>{user.email || user.username}</small></div>
                </div>
                {tab !== "reported" && (
                  <span className={`um-pill ${["admin", "manager", "moderator"].includes(user.role) ? "purple" : "blue"}`}>
                    {["manager", "moderator"].includes(user.role) ? "Manager" : user.role}
                  </span>
                )}
                <span className="um-date">
                  <CheckCircle2 size={18} color="#16a34a" /> {fmt(user.created_at)}
                </span>
                <span className={`um-status ${status}`}>{status}</span>
                <div className="um-actions">
                  <button className="um-btn" onClick={() => setSelected(user)}>Details</button>
                  {["staff", "manager", "moderator"].includes(user.role) && (
                    <button className="um-outline" onClick={() => openProfileEditor(user)}>
                      <Pencil size={14} /> Edit profile
                    </button>
                  )}
                  {user.role !== "admin" && (
                    <div className="um-menu-wrap">
                      <button
                        className="um-dots"
                        aria-label={`Actions for ${displayName}`}
                        onClick={() => setMenuId(menuId === user.id ? null : user.id)}
                      >
                        <MoreHorizontal size={18} />
                      </button>
                      {menuId === user.id && (
                        <div className="um-menu">
                          <button onClick={() => toggleSuspended(user)}>
                            {user.is_suspended ? "Remove suspension" : "Suspend account"}
                          </button>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            );
          })}

          <div className="um-footer">
            <span>Showing {rows.length} of {filtered.length} accounts</span>
            <button className="um-outline" onClick={() => setShowAll(!showAll)}>
              {showAll ? "Show Less" : "View All"} <ArrowRight size={16} />
            </button>
          </div>
        </div>

        <div className="um-side">
          <div className="um-panel">
            <div className="um-title">
              <ShieldCheck size={34} color="#16a34a" />
              <div>
                <h3>Admin Security Settings</h3>
                <p>Stored in the admin_security_settings table.</p>
              </div>
            </div>
            {settings ? (
              <>
                {[
                  ["two_factor", "Two-factor authentication", "Require 2FA for admin accounts."],
                  ["password_expiry", "Password expiry policy", "Require periodic password changes."],
                  ["login_alerts", "Login alerts", "Notify admins of new login attempts."],
                ].map(([key, title, description]) => (
                  <div className="um-setting" key={key}>
                    <div><strong>{title}</strong><small>{description}</small></div>
                    <button
                      type="button"
                      role="switch"
                      aria-checked={settings[key]}
                      aria-label={title}
                      className={`um-switch ${settings[key] ? "on" : ""}`}
                      onClick={() => setSettings({ ...settings, [key]: !settings[key] })}
                    ><i /></button>
                  </div>
                ))}
                <div className="um-setting last">
                  <div className="um-lastchange">
                    <Calendar size={18} />
                    <div><strong>Last Password Change</strong><small>{fmt(settings.last_password_change)}</small></div>
                  </div>
                  <button className="um-btn" onClick={saveSettings}>Save Settings</button>
                </div>
              </>
            ) : <p className="um-empty">Run the supplied SQL migration to enable settings.</p>}
          </div>

          <div className="um-panel">
            <div className="um-title between">
              <div className="um-title">
                <ShieldAlert size={30} />
                <div>
                  <h3>Account Reports</h3>
                  <p>Pending reports from the existing user_reports table.</p>
                </div>
              </div>
              <span className="um-badge">{pendingReports} pending</span>
            </div>
            {!loading && accountReports.length === 0 && !loadError && (
              <p className="um-empty">No pending account reports.</p>
            )}
            {accountReports.map((report) => {
              const reported = report.reported_user;
              return (
                <div className="um-request" key={report.id}>
                  <div className="um-avatar small">{initials(reported?.full_name || reported?.username)}</div>
                  <div className="grow">
                    <strong>{reported?.full_name || reported?.username || "Unknown account"}</strong>
                    <small>{report.reason_type} · {report.description || "No details provided"}</small>
                    <small>Reported {fmt(report.created_at)}</small>
                  </div>
                  <button className="um-btn" onClick={() => review(report, "warning")}>Warn</button>
                  <button className="um-outline" onClick={() => review(report, "dismiss")}>Dismiss</button>
                  <button
                    className="um-outline"
                    onClick={() => review(report, "account_suspension")}
                    disabled={reported?.role === "admin"}
                  >
                    Deactivate account
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {selected && (
        <div className="um-overlay" onClick={() => setSelected(null)}>
          <div className="um-modal" onClick={(event) => event.stopPropagation()}>
            <h3>{selected.full_name || selected.username || "Account details"}</h3>
            <p><b>Email:</b> {selected.email || "-"}</p>
            <p><b>Username:</b> {selected.username}</p>
            <p><b>Role:</b> {selected.role}</p>
            <p><b>Status:</b> {accountStatus(selected)}</p>
            <p><b>Posts flagged for review:</b> {selected.flagged_post_count}</p>
            <p><b>Created:</b> {fmt(selected.created_at)}</p>
            <button className="um-btn" onClick={() => setSelected(null)}>Close</button>
          </div>
        </div>
      )}

      {createOpen && (
        <div className="um-overlay" onClick={closeCreateDialog}>
          <form
            className="um-modal um-create-modal"
            onSubmit={createAccount}
            onClick={(event) => event.stopPropagation()}
          >
            <div className="um-create-heading">
              <div>
                <h3>Add an account</h3>
                <p>Create a password for the new account. Share it with the user securely.</p>
              </div>
              <button
                type="button"
                className="um-close"
                aria-label="Close dialog"
                onClick={closeCreateDialog}
                disabled={createBusy}
              ><X size={20} /></button>
            </div>
            <label className="um-form-field">
              <span>Full name</span>
              <input
                autoComplete="name"
                value={newAccount.fullName}
                onChange={(event) => setNewAccount({ ...newAccount, fullName: event.target.value })}
                minLength={2}
                maxLength={120}
                required
              />
            </label>
            <label className="um-form-field">
              <span>Phone</span>
              <input
                type="tel"
                autoComplete="tel"
                maxLength={40}
                value={newAccount.phone}
                onChange={(event) => setNewAccount({ ...newAccount, phone: event.target.value })}
              />
            </label>
            <label className="um-form-field">
              <span>Office / service area</span>
              <input
                autoComplete="organization"
                maxLength={160}
                value={newAccount.location}
                onChange={(event) => setNewAccount({ ...newAccount, location: event.target.value })}
              />
            </label>
            <label className="um-form-field">
              <span>About</span>
              <textarea
                rows={3}
                maxLength={500}
                value={newAccount.about}
                onChange={(event) => setNewAccount({ ...newAccount, about: event.target.value })}
              />
            </label>
            <label className="um-form-field">
              <span>Profile picture</span>
              {newAccount.profilePicture && (
                <img className="um-profile-preview" src={newAccount.profilePicture} alt="Selected profile preview" />
              )}
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp"
                onChange={(event) => selectProfilePicture(event.target.files?.[0], (profilePicture) =>
                  setNewAccount((current) => ({ ...current, profilePicture }))
                )}
              />
              <small>Optional. JPEG, PNG, or WebP up to 3 MB.</small>
            </label>
            {imageError && <p className="um-error" role="alert">{imageError}</p>}
            <label className="um-form-field">
              <span>Email address</span>
              <input
                type="email"
                autoComplete="email"
                value={newAccount.email}
                onChange={(event) => setNewAccount({ ...newAccount, email: event.target.value })}
                required
              />
            </label>
            <label className="um-form-field">
              <span>Temporary password</span>
              <input
                type="password"
                autoComplete="new-password"
                value={newAccount.password}
                onChange={(event) => setNewAccount({ ...newAccount, password: event.target.value })}
                minLength={8}
                maxLength={128}
                required
              />
              <small>Use at least 8 characters. Do not reuse your own password.</small>
            </label>
            <label className="um-form-field">
              <span>Account type</span>
              <select
                value={newAccount.role}
                onChange={(event) => setNewAccount({ ...newAccount, role: event.target.value })}
              >
                <option value="staff">Staff</option>
                <option value="manager">Manager</option>
                <option value="admin">Admin</option>
              </select>
            </label>
            <p className="um-role-note">
              Manager accounts use the existing <code>moderator</code> role in your database.
            </p>
            <div className="um-create-actions">
              <button
                type="button"
                className="um-outline"
                onClick={closeCreateDialog}
                disabled={createBusy}
              >Cancel</button>
              <button className="um-btn" type="submit" disabled={createBusy || Boolean(imageError)}>
                {createBusy ? "Creating account…" : "Create account"}
              </button>
            </div>
          </form>
        </div>
      )}

      {editingUser && (
        <div className="um-overlay" onClick={() => {
          if (!profileBusy) {
            setEditingUser(null);
            setImageError("");
          }
        }}>
          <form
            className="um-modal um-create-modal"
            onSubmit={saveManagedProfile}
            onClick={(event) => event.stopPropagation()}
          >
            <div className="um-create-heading">
              <div>
                <h3>Edit account profile</h3>
                <p>Update details shown in the manager and staff portals.</p>
              </div>
              <button
                type="button"
                className="um-close"
                aria-label="Close dialog"
                onClick={() => {
                  setEditingUser(null);
                  setImageError("");
                }}
                disabled={profileBusy}
              ><X size={20} /></button>
            </div>
            <div className="um-profile-editor">
              <div className="um-avatar um-profile-editor-avatar">
                {profileDraft.profilePicture
                  ? <img src={profileDraft.profilePicture} alt="Selected profile preview" />
                  : editingUser.profile_picture
                    ? <img src={editingUser.profile_picture} alt="" />
                    : initials(profileDraft.fullName || editingUser.username || "?")}
              </div>
              <label className="um-picture-picker">
                <ImagePlus size={16} /> Choose picture
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  onChange={(event) => selectProfilePicture(event.target.files?.[0], (profilePicture) =>
                    setProfileDraft((current) => ({ ...current, profilePicture }))
                  )}
                  disabled={profileBusy}
                />
              </label>
            </div>
            <label className="um-form-field">
              <span>Full name</span>
              <input
                autoComplete="name"
                value={profileDraft.fullName}
                onChange={(event) => setProfileDraft({ ...profileDraft, fullName: event.target.value })}
                minLength={2}
                maxLength={120}
                required
              />
            </label>
            <label className="um-form-field">
              <span>Phone</span>
              <input
                type="tel"
                autoComplete="tel"
                value={profileDraft.phone}
                onChange={(event) => setProfileDraft({ ...profileDraft, phone: event.target.value })}
                maxLength={40}
              />
            </label>
            <label className="um-form-field">
              <span>Office / service area</span>
              <input
                value={profileDraft.location}
                onChange={(event) => setProfileDraft({ ...profileDraft, location: event.target.value })}
                maxLength={160}
              />
            </label>
            <label className="um-form-field">
              <span>About</span>
              <textarea
                rows={3}
                value={profileDraft.about}
                onChange={(event) => setProfileDraft({ ...profileDraft, about: event.target.value })}
                maxLength={500}
              />
            </label>
            {imageError && <p className="um-error" role="alert">{imageError}</p>}
            <div className="um-create-actions">
              <button
                type="button"
                className="um-outline"
                onClick={() => {
                  setEditingUser(null);
                  setImageError("");
                }}
                disabled={profileBusy}
              >Cancel</button>
              <button className="um-btn" type="submit" disabled={profileBusy || Boolean(imageError)}>
                {profileBusy ? "Saving profile…" : "Save profile"}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
