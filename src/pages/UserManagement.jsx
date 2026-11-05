import { useCallback, useEffect, useState } from "react";
import * as api from "../userService";
import {
  ArrowRight, Ban, CheckCircle2, Clock, FileText, ImagePlus, MoreHorizontal, Pencil,
  Search, ShieldAlert, ShieldCheck, UserPlus, Users, UserRoundX, X,
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
  const [reporterCounts, setReporterCounts] = useState({});
  const [adminAccounts, setAdminAccounts] = useState([]);
  const [currentAdminId, setCurrentAdminId] = useState("");
  const [adminAccessBusy, setAdminAccessBusy] = useState("");
  const [adminAccessError, setAdminAccessError] = useState("");
  const [adminAccessNotice, setAdminAccessNotice] = useState("");
  const [loadError, setLoadError] = useState("");
  const [tab, setTab] = useState("management");
  const [search, setSearch] = useState("");
  const [showAll, setShowAll] = useState(false);
  const [showAllFlagged, setShowAllFlagged] = useState(false);
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
    const [usersResult, reportsResult, reporterCountsResult, adminAccessResult] = await Promise.allSettled([
      api.getUsers(),
      api.getAccountReports(),
      api.getCommunityReportCounts(),
      api.getAdminAccessReview(),
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

    if (adminAccessResult.status === "fulfilled") {
      setAdminAccounts(adminAccessResult.value.admins);
      setCurrentAdminId(adminAccessResult.value.currentAdminId);
      setAdminAccessError("");
    } else {
      console.error("Could not load administrator access review:", adminAccessResult.reason);
      setAdminAccessError("Could not load administrator access details. Refresh and try again.");
      errors.push("administrator access review");
    }

    setLoadError(errors.length
      ? `Could not load ${errors.join(", ")}. Please refresh and try again.`
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
  const visibleAccountReportGroups = showAllFlagged ? accountReportGroups : accountReportGroups.slice(0, 5);
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

    setAccountActionBusy(`${user.id}:${action}`);
    try {
      if (action === "reactivate") {
        await api.setUserSuspended(user.id, false);
        flash("Account reactivated.");
      } else {
        await api.moderateReportedAccount({ userId: user.id, action });
        flash("Account warning sent.");
      }
      await load();
    } catch (error) {
      console.error(`Could not ${action} the reported account:`, error);
      flash(error.message || `Could not ${action} the reported account.`);
    } finally {
      setAccountActionBusy("");
    }
  };

  const manageAdminAccess = async (user, action) => {
    if (user.id === currentAdminId) {
      setAdminAccessError("You cannot change your own administrator access.");
      return;
    }
    const label = action === "revoke_admin"
      ? "revoke administrator access and change this account's role to Manager"
      : action === "suspend"
        ? "suspend this administrator account"
        : "remove this administrator account's suspension";
    if (!window.confirm(`Are you sure you want to ${label} for ${user.full_name || user.username || user.email || "this account"}?`)) return;

    setAdminAccessBusy(user.id);
    setAdminAccessError("");
    setAdminAccessNotice("");
    try {
      const { message } = await api.updateAdminAccess({ userId: user.id, action });
      setAdminAccessNotice(message);
      await load();
    } catch (error) {
      console.error(`Could not ${action} for administrator account:`, error);
      setAdminAccessError(error.message || "Could not update administrator access. Please try again.");
    } finally {
      setAdminAccessBusy("");
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
                <h3>Admin Access Review</h3>
              </div>
            </div>
            <p className="um-security-copy">Review administrator roles, account status, and recent sign-ins. Your own access is protected.</p>
            {adminAccessError && <p className="um-security-message error" role="alert">{adminAccessError}</p>}
            {adminAccessNotice && <p className="um-security-message success" role="status">{adminAccessNotice}</p>}
            {!loading && adminAccounts.length === 0 && !adminAccessError && (
              <p className="um-empty">No administrator accounts found.</p>
            )}
            <div className="um-admin-access-list">
              {adminAccounts.map((admin) => {
                const isCurrentAdmin = admin.id === currentAdminId;
                const status = admin.is_banned ? "banned" : admin.is_suspended ? "suspended" : "active";
                return (
                  <article className="um-admin-access-item" key={admin.id}>
                    <div className="um-admin-access-heading">
                      <div className="um-admin-access-name">
                        <strong>{admin.full_name || admin.username || "Administrator"}</strong>
                        <small>{admin.email || "No email address"}</small>
                      </div>
                      {isCurrentAdmin && <span className="um-current-admin">You</span>}
                    </div>
                    <div className="um-admin-access-meta">
                      <span>Role: {admin.role === "admin" ? "Administrator" : admin.role}</span>
                      <span className={`um-status ${status}`}>Status: {status}</span>
                      <small>Last sign-in: {admin.last_sign_in_at ? fmt(admin.last_sign_in_at) : "No sign-in recorded"}</small>
                    </div>
                    <div className="um-admin-access-actions">
                      <button
                        className="um-outline"
                        type="button"
                        onClick={() => manageAdminAccess(admin, admin.is_suspended ? "unsuspend" : "suspend")}
                        disabled={isCurrentAdmin || Boolean(adminAccessBusy)}
                        title={isCurrentAdmin ? "You cannot suspend your own account" : undefined}
                      >
                        <Ban size={14} />
                        {adminAccessBusy === admin.id
                          ? "Updating…"
                          : admin.is_suspended ? "Unsuspend account" : "Suspend"}
                      </button>
                      <button
                        className="um-outline danger"
                        type="button"
                        onClick={() => manageAdminAccess(admin, "revoke_admin")}
                        disabled={isCurrentAdmin || Boolean(adminAccessBusy)}
                        title={isCurrentAdmin ? "You cannot revoke your own administrator access" : undefined}
                      >
                        <UserRoundX size={14} /> Revoke admin access
                      </button>
                    </div>
                  </article>
                );
              })}
            </div>
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
            {visibleAccountReportGroups.length > 0 && (
              <div className="um-flagged-table-wrap">
                <table className="um-flagged-table">
                  <thead>
                    <tr>
                      <th>Account</th>
                      <th>Reports</th>
                      <th>Latest reason</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {visibleAccountReportGroups.map(({ reported, reports }) => {
                      const reporterCount = reporterCounts[reported?.id] || 0;
                      const isAdminAccount = reported?.role === "admin";
                      const latestReport = reports[0];
                      return (
                        <tr key={reported?.id || latestReport?.id}>
                          <td>
                            <div className="um-user">
                              <div className="um-avatar small">{initials(reported?.full_name || reported?.username)}</div>
                              <div><strong>{reported?.full_name || reported?.username || "Unknown account"}</strong><small>{reported?.email || "No email address"}</small></div>
                            </div>
                          </td>
                          <td>{reporterCount} reporter{reporterCount === 1 ? "" : "s"}<br /><small>{reports.length} open</small></td>
                          <td>{latestReport ? `${latestReport.reason_type?.replaceAll("_", " ")} · ${latestReport.description || "No details provided"}` : "No open reports remain."}</td>
                          <td>
                            <div className="um-actions">
                              {reports.map((report) => <button key={report.id} className="um-outline" onClick={() => review(report, "dismiss")}>Dismiss</button>)}
                              <button className="um-btn" onClick={() => moderateReportedAccount(reported, "warn")} disabled={isAdminAccount || reporterCount < 4 || accountActionBusy === `${reported?.id}:warn`}>Warn</button>
                              <button className="um-outline" onClick={() => review(latestReport, "account_suspension")} disabled={isAdminAccount || !latestReport}>Deactivate</button>
                              <button className="um-outline" onClick={() => moderateReportedAccount(reported, "reactivate")} disabled={isAdminAccount || !reported?.is_suspended || accountActionBusy === `${reported?.id}:reactivate`}>Reactivate</button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
            {accountReportGroups.length > 5 && (
              <div className="um-footer">
                <span>Showing {visibleAccountReportGroups.length} of {accountReportGroups.length} flagged accounts</span>
                <button className="um-outline" onClick={() => setShowAllFlagged((current) => !current)}>
                  {showAllFlagged ? "Show Less" : "View All"} <ArrowRight size={16} />
                </button>
              </div>
            )}
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
