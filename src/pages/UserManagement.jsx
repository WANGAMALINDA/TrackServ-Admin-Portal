import { useCallback, useEffect, useState } from "react";
import * as api from "../userService";
import {
  ArrowRight, CheckCircle2, Clock, FileText, ImagePlus, KeyRound, LogOut, MoreHorizontal, Pencil,
  Search, ShieldAlert, ShieldCheck, UserPlus, Users, X,
} from "lucide-react";
import { supabase } from "../components/supabaseClient";
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
  const [reporterCounts, setReporterCounts] = useState({});
  const [adminSecurity, setAdminSecurity] = useState({ email: "", lastSignIn: null });
  const [securityBusy, setSecurityBusy] = useState("");
  const [securityError, setSecurityError] = useState("");
  const [securityNotice, setSecurityNotice] = useState("");
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
  const [accountActionBusy, setAccountActionBusy] = useState("");
  const [imageError, setImageError] = useState("");
  const [now] = useState(() => Date.now());

  const load = useCallback(async () => {
    setLoading(true);
    const [usersResult, reportsResult, reporterCountsResult] = await Promise.allSettled([
      api.getUsers(),
      api.getAccountReports(),
      api.getCommunityReportCounts(),
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

    if (reporterCountsResult.status === "fulfilled") setReporterCounts(reporterCountsResult.value);
    else {
      console.error("Could not load distinct community reporter counts:", reporterCountsResult.reason);
      errors.push("community report counts");
    }

    setLoadError(errors.length
      ? `Could not load ${errors.join(", ")}. Please refresh and try again.`
      : "");
    setLoading(false);
  }, []);

  useEffect(() => {
    void Promise.resolve().then(load);
  }, [load]);

  useEffect(() => {
    let active = true;
    supabase.auth.getUser().then(({ data: { user }, error }) => {
      if (error) throw error;
      if (!user) throw new Error("No authenticated admin session was found.");
      if (active) {
        setAdminSecurity({
          email: user.email || "",
          lastSignIn: user.last_sign_in_at || null,
        });
      }
    }).catch((error) => {
      console.error("Could not load the signed-in admin security details:", error);
      if (active) setSecurityError("Could not load your signed-in account details. Refresh and try again.");
    });

    return () => {
      active = false;
    };
  }, []);

  const flash = (text) => {
    setMsg(text);
    window.setTimeout(() => setMsg(""), 3000);
  };

  const management = users.filter((user) => ["admin", "manager", "moderator"].includes(user.role));
  const staff = users.filter((user) => user.role === "staff");
  const pendingReports = accountReports.length;
  const openReportsByUser = accountReports.reduce((groups, report) => {
    const userId = report.reported_user_id;
    if (!userId) return groups;
    const reports = groups.get(userId) || [];
    reports.push(report);
    groups.set(userId, reports);
    return groups;
  }, new Map());
  const accountReportGroups = users
    .filter((user) => user.role !== "admin" && (reporterCounts[user.id] || 0) >= 4)
    .map((reported) => ({
      reported,
      reports: openReportsByUser.get(reported.id) || [],
    }));
  const monthAgo = now - 30 * 86400000;
  const recent = (list, since) => list.filter((user) => new Date(user.created_at) > since).length;
  const tabUsers = tab === "management" ? management : staff;
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
      flash("Could not update this account. Please try again.");
    }
  };

  const review = async (report, action) => {
    try {
      await api.reviewAccountReport(report, action);
      flash(action === "dismiss" ? "Account report dismissed" : "Account report action recorded");
      await load();
    } catch (error) {
      console.error("Could not review account report:", error);
      flash("Could not review this report. Please try again.");
    }
  };

  const moderateReportedAccount = async (user, action) => {
    const reporterCount = reporterCounts[user.id] || 0;
    if (action === "warn" && reporterCount < 4) return;
    if (action === "delete") {
      if (reporterCount < 5) return;
      const confirmed = window.confirm(
        `Permanently delete ${user.full_name || user.username || "this account"}? At least five different people have reported this account. This cannot be undone.`
      );
      if (!confirmed) return;
    }

    setAccountActionBusy(`${user.id}:${action}`);
    try {
      await api.moderateReportedAccount({
        userId: user.id,
        action,
        confirmed: action === "delete",
      });
      flash(action === "warn" ? "Account warning sent." : "Account permanently deleted.");
      await load();
    } catch (error) {
      console.error(`Could not ${action} the reported account:`, error);
      flash(error.message || `Could not ${action} the reported account.`);
    } finally {
      setAccountActionBusy("");
    }
  };

  const sendPasswordReset = async () => {
    setSecurityBusy("password");
    setSecurityError("");
    setSecurityNotice("");
    try {
      if (!adminSecurity.email) throw new Error("No email address is available for the signed-in admin.");
      const { error } = await supabase.auth.resetPasswordForEmail(adminSecurity.email, {
        redirectTo: `${window.location.origin}${import.meta.env.BASE_URL}`,
      });
      if (error) throw error;
      setSecurityNotice(`Password reset email sent to ${adminSecurity.email}.`);
    } catch (error) {
      console.error("Could not send the admin password reset email:", error);
      setSecurityError(error.message || "Could not send a password reset email. Please try again.");
    } finally {
      setSecurityBusy("");
    }
  };

  const revokeOtherSessions = async () => {
    if (!window.confirm("Sign out this admin account from all other sessions? This session will remain active.")) return;

    setSecurityBusy("sessions");
    setSecurityError("");
    setSecurityNotice("");
    try {
      const { error } = await supabase.auth.signOut({ scope: "others" });
      if (error) throw error;
      setSecurityNotice("All other sessions have been signed out.");
    } catch (error) {
      console.error("Could not sign out the admin's other sessions:", error);
      setSecurityError(error.message || "Could not sign out other sessions. Please try again.");
    } finally {
      setSecurityBusy("");
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
          </div>

          <div className="um-row um-head">
            <span>User</span><span>Role</span>
            <span>Created</span><span>Status</span><span>Action</span>
          </div>

          {loading && <p className="um-empty">Loading profiles…</p>}
          {!loading && rows.length === 0 && !loadError && <p className="um-empty">No matching accounts.</p>}
          {rows.map((user) => {
            const displayName = user.full_name || user.username || "Unnamed account";
            const status = accountStatus(user);
            return (
              <div className="um-row" key={user.id}>
                <div className="um-user">
                  <div className="um-avatar small">
                    {user.profile_picture
                      ? <img src={user.profile_picture} alt="" />
                      : initials(displayName)}
                  </div>
                  <div><strong>{displayName}</strong><small>{user.email || user.username}</small></div>
                </div>
                <span className={`um-pill ${["admin", "manager", "moderator"].includes(user.role) ? "purple" : "blue"}`}>
                  {["manager", "moderator"].includes(user.role) ? "Manager" : user.role}
                </span>
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
                <h3>Admin Account Security</h3>
              </div>
            </div>
            <p className="um-security-copy">Protect the administrator account currently signed in to this portal.</p>
            <div className="um-security-identity">
              <strong>Signed-in account</strong>
              <span>{adminSecurity.email || "Loading account…"}</span>
              <small>Last sign-in: {adminSecurity.lastSignIn ? fmt(adminSecurity.lastSignIn) : "Unavailable"}</small>
            </div>
            <div className="um-security-actions">
              <button
                className="um-outline"
                type="button"
                onClick={sendPasswordReset}
                disabled={Boolean(securityBusy) || !adminSecurity.email}
              >
                <KeyRound size={15} />
                {securityBusy === "password" ? "Sending…" : "Send password reset email"}
              </button>
              <button
                className="um-outline"
                type="button"
                onClick={revokeOtherSessions}
                disabled={Boolean(securityBusy)}
              >
                <LogOut size={15} />
                {securityBusy === "sessions" ? "Signing out…" : "Sign out other sessions"}
              </button>
            </div>
            {securityError && <p className="um-security-message error" role="alert">{securityError}</p>}
            {securityNotice && <p className="um-security-message success" role="status">{securityNotice}</p>}
          </div>

          <div className="um-panel">
            <div className="um-title between">
              <div className="um-title">
                <ShieldAlert size={30} />
                <div>
                  <h3>Account Reports</h3>
                </div>
              </div>
              <span className="um-badge">{pendingReports} pending</span>
            </div>
            {!loading && accountReports.length === 0 && !loadError && (
              <p className="um-empty">No pending account reports.</p>
            )}
            {accountReportGroups.map(({ reported, reports }) => {
              const reporterCount = reporterCounts[reported?.id] || 0;
              const isAdminAccount = reported?.role === "admin";
              return (
                <div className="um-request" key={reported?.id || reports[0].id}>
                  <div className="um-avatar small">{initials(reported?.full_name || reported?.username)}</div>
                  <div className="grow">
                    <strong>{reported?.full_name || reported?.username || "Unknown account"}</strong>
                    <small>{reporterCount} distinct reporter{reporterCount === 1 ? "" : "s"} · {reports.length} open report{reports.length === 1 ? "" : "s"}</small>
                    <div className="um-account-report-list">
                      {reports.length === 0 && <small>No open reports remain for this account.</small>}
                      {reports.map((report) => (
                        <div key={report.id}>
                          <small>{report.reason_type?.replaceAll("_", " ")} · {report.description || "No details provided"} · Reported {fmt(report.created_at)}</small>
                          <button className="um-outline" onClick={() => review(report, "dismiss")}>Dismiss report</button>
                        </div>
                      ))}
                    </div>
                  </div>
                  <button
                    className="um-btn"
                    onClick={() => moderateReportedAccount(reported, "warn")}
                    disabled={isAdminAccount || reporterCount < 4 || accountActionBusy === `${reported?.id}:warn`}
                    title={reporterCount < 4 ? "A warning requires reports from four different people." : "Send an account warning"}
                  >
                    {accountActionBusy === `${reported?.id}:warn` ? "Sending…" : "Warn account"}
                  </button>
                  <button
                    className="um-outline"
                    onClick={() => review(reports[0], "account_suspension")}
                    disabled={isAdminAccount || reports.length === 0}
                  >
                    Deactivate account
                  </button>
                  <button
                    className="um-outline"
                    onClick={() => moderateReportedAccount(reported, "delete")}
                    disabled={isAdminAccount || reporterCount < 5 || accountActionBusy === `${reported?.id}:delete`}
                    title={reporterCount < 5 ? "Account deletion requires reports from five different people." : "Permanently delete this account"}
                  >
                    {accountActionBusy === `${reported?.id}:delete` ? "Deleting…" : "Delete account"}
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
