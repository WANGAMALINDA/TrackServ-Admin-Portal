import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertTriangle, Check, Eye, Flag, RefreshCw, Search, Trash2 } from "lucide-react";
import { supabase } from "../components/supabaseClient";
import "./AdminWorkflows.css";

const formatDate = (value) => value
  ? new Date(value).toLocaleString("en-ZA", { dateStyle: "medium", timeStyle: "short" })
  : "—";

const displayName = (profile) => profile?.full_name || profile?.username || profile?.email || "Unknown user";

function readableFieldName(value) {
  return value
    .replaceAll("_", " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function readableContentValue(value) {
  if (value == null || value === "") return "Not provided";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (Array.isArray(value)) return value.map(readableContentValue).join(", ");
  if (typeof value === "object") {
    return Object.entries(value)
      .map(([key, nestedValue]) => `${readableFieldName(key)}: ${readableContentValue(nestedValue)}`)
      .join("; ");
  }
  return String(value);
}

function getPostContentFields(content) {
  let value = content;
  if (typeof value === "string" && /^[{[]/.test(value.trim())) {
    try {
      value = JSON.parse(value);
    } catch {
      return [{ label: "Content", value: content }];
    }
  }

  if (value && typeof value === "object" && !Array.isArray(value)) {
    return Object.entries(value).map(([field, fieldValue]) => ({
      label: readableFieldName(field),
      value: readableContentValue(fieldValue),
    }));
  }

  return [{ label: "Content", value: readableContentValue(value) }];
}

export default function CommunityModeration() {
  const [reports, setReports] = useState([]);
  const [posts, setPosts] = useState({});
  const [profiles, setProfiles] = useState({});
  const [statusFilter, setStatusFilter] = useState("pending");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    const { data: reportRows, error: reportsError } = await supabase
      .from("user_reports")
      .select("id, reporter_id, target_post_id, reason_type, description, status, action_taken, created_at, reviewed_at, reviewed_by, post_threshold_flagged")
      .not("target_post_id", "is", null)
      .order("created_at", { ascending: false });

    if (reportsError) {
      console.error("Could not load community moderation reports:", reportsError);
      setError(`Could not load moderation reports: ${reportsError.message}`);
      setLoading(false);
      return;
    }

    const postIds = [...new Set((reportRows || []).map((report) => report.target_post_id).filter(Boolean))];
    const userIds = [...new Set((reportRows || []).flatMap((report) =>
      [report.reporter_id, report.reviewed_by].filter(Boolean)
    ))];
    const [postsResult, profilesResult] = await Promise.all([
      postIds.length
        ? supabase.from("community_posts").select("id, user_id, title, content, status, post_type, created_at").in("id", postIds)
        : Promise.resolve({ data: [], error: null }),
      userIds.length
        ? supabase.from("profiles").select("id, full_name, username, email").in("id", userIds)
        : Promise.resolve({ data: [], error: null }),
    ]);

    if (postsResult.error || profilesResult.error) {
      const requestError = postsResult.error || profilesResult.error;
      console.error("Could not load community moderation details:", requestError);
      setError(`Could not load moderation details: ${requestError.message}`);
      setLoading(false);
      return;
    }

    setReports(reportRows || []);
    setPosts(Object.fromEntries((postsResult.data || []).map((post) => [post.id, post])));
    setProfiles(Object.fromEntries((profilesResult.data || []).map((profile) => [profile.id, profile])));
    setLoading(false);
  }, []);

  useEffect(() => {
    void Promise.resolve().then(load);
  }, [load]);

  const visibleReports = useMemo(() => {
    const query = search.trim().toLowerCase();
    return reports.filter((report) => {
      if (statusFilter !== "all" && report.status !== statusFilter) return false;
      const post = posts[report.target_post_id];
      const postContent = getPostContentFields(post?.content)
        .map(({ label, value }) => `${label}: ${value}`);
      return !query || [
        report.reason_type,
        report.description,
        post?.title,
        ...postContent,
        displayName(profiles[report.reporter_id]),
      ].some((value) => String(value || "").toLowerCase().includes(query));
    });
  }, [posts, profiles, reports, search, statusFilter]);
  const pageSize = 3;
  const pageCount = Math.ceil(visibleReports.length / pageSize);
  const currentPage = Math.min(page, Math.max(pageCount, 1));
  const pageReports = visibleReports.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  const review = async (report, action) => {
    setBusyId(report.id);
    setError("");
    setNotice("");
    try {
      const { data: { user }, error: authError } = await supabase.auth.getUser();
      if (authError) throw authError;
      if (!user) throw new Error("Your session expired. Sign in again.");

      if (action === "remove") {
        const { error: postError } = await supabase
          .from("community_posts")
          .update({ status: "removed" })
          .eq("id", report.target_post_id);
        if (postError) throw postError;
      }

      const reportUpdate = {
        status: action === "dismiss" ? "dismissed" : action === "review" ? "under_review" : "actioned",
        reviewed_at: new Date().toISOString(),
        reviewed_by: user.id,
      };
      if (action === "remove") reportUpdate.action_taken = "post_removed";

      const { error: updateError } = await supabase
        .from("user_reports")
        .update(reportUpdate)
        .eq("id", report.id);
      if (updateError) throw updateError;

      setNotice(action === "remove"
        ? "Post removed and moderation decision recorded."
        : action === "dismiss" ? "Report dismissed." : "Report moved to review.");
      await load();
    } catch (requestError) {
      console.error("Could not update community moderation report:", requestError);
      setError(requestError.message || "Could not save this moderation decision.");
    } finally {
      setBusyId(null);
    }
  };

  const pendingCount = reports.filter((report) => ["pending", "under_review"].includes(report.status)).length;
  const removedCount = reports.filter((report) => report.action_taken === "post_removed").length;

  return (
    <main className="admin-workflow-page">
      <header className="admin-workflow-header">
        <div>
          <p className="admin-workflow-eyebrow"><Flag size={15} /> Trust & safety</p>
          <h1>Community Moderation</h1>
          <p>Review flagged community posts and record moderation decisions.</p>
        </div>
        <button className="admin-workflow-button" type="button" onClick={load} disabled={loading}>
          <RefreshCw size={16} className={loading ? "admin-workflow-spin" : ""} /> Refresh
        </button>
      </header>

      {error && <div className="admin-workflow-alert admin-workflow-alert--error" role="alert">{error}</div>}
      {notice && <div className="admin-workflow-alert admin-workflow-alert--success" role="status">{notice}</div>}

      <section className="admin-workflow-stats">
        <article><span>Open reports</span><strong>{loading ? "…" : pendingCount}</strong></article>
        <article><span>Reports in view</span><strong>{loading ? "…" : visibleReports.length}</strong></article>
        <article><span>Posts removed</span><strong>{loading ? "…" : removedCount}</strong></article>
      </section>

      <section className="admin-workflow-panel">
        <div className="admin-workflow-toolbar">
          <label className="admin-workflow-search">
            <Search size={16} aria-hidden="true" />
            <input value={search} onChange={(event) => {
              setSearch(event.target.value);
              setPage(1);
            }} placeholder="Search reports and posts" aria-label="Search reports and posts" />
          </label>
          <label className="admin-workflow-select">
            Status
            <select value={statusFilter} onChange={(event) => {
              setStatusFilter(event.target.value);
              setPage(1);
            }}>
              <option value="pending">Pending</option>
              <option value="under_review">Under review</option>
              <option value="all">All reports</option>
              <option value="actioned">Actioned</option>
              <option value="dismissed">Dismissed</option>
            </select>
          </label>
        </div>

        {loading && <p className="admin-workflow-empty">Loading community reports…</p>}
        {!loading && visibleReports.length === 0 && !error && <p className="admin-workflow-empty">No reports match this filter.</p>}
        <div className="admin-moderation-list">
          {pageReports.map((report) => {
            const post = posts[report.target_post_id];
            const postContent = post ? getPostContentFields(post.content) : [];
            const open = ["pending", "under_review"].includes(report.status);
            return (
              <article className="admin-moderation-card" key={report.id}>
                <div className="admin-moderation-card__top">
                  <div>
                    <span className={`admin-workflow-badge admin-workflow-badge--${report.status}`}>{report.status.replaceAll("_", " ")}</span>
                    {report.post_threshold_flagged && <span className="admin-workflow-badge admin-workflow-badge--flagged"><AlertTriangle size={13} /> Threshold flagged</span>}
                  </div>
                  <time>{formatDate(report.created_at)}</time>
                </div>
                <div className="admin-moderation-card__content">
                  <div>
                    <h2>{post?.title || "Post unavailable"}</h2>
                    {post ? (
                      postContent.length ? (
                        <dl className="admin-moderation-card__fields">
                          {postContent.map(({ label, value }) => (
                            <div key={label}>
                              <dt>{label}</dt>
                              <dd>{value}</dd>
                            </div>
                          ))}
                        </dl>
                      ) : <p className="admin-moderation-card__body">No post text.</p>
                    ) : <p className="admin-moderation-card__body">The reported post has been deleted.</p>}
                    <small>Post status: {post?.status || "deleted"}{post?.post_type ? ` · ${post.post_type}` : ""}</small>
                  </div>
                  <div className="admin-moderation-card__report">
                    <strong>{report.reason_type?.replaceAll("_", " ") || "Reported content"}</strong>
                    <p>{report.description || "No additional explanation provided."}</p>
                    <small>Reported by {displayName(profiles[report.reporter_id])}</small>
                  </div>
                </div>
                <footer className="admin-moderation-card__footer">
                  <span>{report.action_taken ? `Decision: ${report.action_taken.replaceAll("_", " ")}` : "No decision recorded"}</span>
                  {open && (
                    <div className="admin-workflow-actions">
                      {report.status === "pending" && (
                        <button className="admin-workflow-button" type="button" disabled={busyId === report.id} onClick={() => review(report, "review")}>
                          <Eye size={15} /> Review
                        </button>
                      )}
                      <button className="admin-workflow-button" type="button" disabled={busyId === report.id} onClick={() => review(report, "dismiss")}>
                        <Check size={15} /> Dismiss
                      </button>
                      {post && post.status !== "removed" && (
                        <button className="admin-workflow-button admin-workflow-button--danger" type="button" disabled={busyId === report.id} onClick={() => review(report, "remove")}>
                          <Trash2 size={15} /> Remove post
                        </button>
                      )}
                    </div>
                  )}
                  {report.reviewed_at && <small>Reviewed {formatDate(report.reviewed_at)} by {displayName(profiles[report.reviewed_by])}</small>}
                </footer>
              </article>
            );
          })}
        </div>
        {!loading && visibleReports.length > 0 && (
          <nav className="admin-moderation-pagination" aria-label="Community moderation pages">
            <span>
              Showing {(currentPage - 1) * pageSize + 1}–{Math.min(currentPage * pageSize, visibleReports.length)} of {visibleReports.length}
            </span>
            <div>
              <button
                className="admin-workflow-button"
                type="button"
                onClick={() => setPage(currentPage - 1)}
                disabled={currentPage === 1}
                aria-label="Previous page"
              >
                Previous
              </button>
              <span>Page {currentPage} of {Math.max(pageCount, 1)}</span>
              <button
                className="admin-workflow-button"
                type="button"
                onClick={() => setPage(currentPage + 1)}
                disabled={currentPage >= pageCount}
                aria-label="Next page"
              >
                Next
              </button>
            </div>
          </nav>
        )}
      </section>
    </main>
  );
}
