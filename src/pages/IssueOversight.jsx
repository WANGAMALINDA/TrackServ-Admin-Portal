import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertTriangle, Clock3, FileSearch, RefreshCw, Search, Zap } from "lucide-react";
import { supabase } from "../components/supabaseClient";
import "./AdminWorkflows.css";

const OPEN_STATUSES = ["open", "under_review", "in_progress"];
const DAY_MS = 24 * 60 * 60 * 1000;
const PAGE_SIZE = 4;
const formatDate = (value) => value
  ? new Date(value).toLocaleString("en-ZA", { dateStyle: "medium", timeStyle: "short" })
  : "—";

export default function IssueOversight() {
  const [now, setNow] = useState(() => Date.now());
  const [reports, setReports] = useState([]);
  const [profiles, setProfiles] = useState({});
  const [statusFilter, setStatusFilter] = useState("open");
  const [overdueOnly, setOverdueOnly] = useState(false);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState(null);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    setNow(Date.now());
    const { data, error: reportsError } = await supabase
      .from("reports")
      .select("id, title, description, location, status, severity, created_at, updated_at, assigned_to, category:categories(category_name)")
      .in("status", OPEN_STATUSES)
      .order("created_at", { ascending: true });

    if (reportsError) {
      console.error("Could not load open service issues:", reportsError);
      setError(`Could not load service issues: ${reportsError.message}`);
      setLoading(false);
      return;
    }

    const assigneeIds = [...new Set((data || []).map((report) => report.assigned_to).filter(Boolean))];
    if (assigneeIds.length) {
      const { data: staff, error: staffError } = await supabase
        .from("profiles")
        .select("id, full_name, username")
        .in("id", assigneeIds);
      if (staffError) {
        console.error("Could not load service issue assignees:", staffError);
        setError(`Could not load assignee details: ${staffError.message}`);
        setLoading(false);
        return;
      }
      setProfiles(Object.fromEntries((staff || []).map((profile) => [profile.id, profile])));
    } else {
      setProfiles({});
    }
    setReports(data || []);
    setLoading(false);
  }, []);

  useEffect(() => {
    void Promise.resolve().then(load);
  }, [load]);

  const visibleReports = useMemo(() => {
    const query = search.trim().toLowerCase();
    return reports.filter((report) => {
      if (statusFilter !== "open" && report.status !== statusFilter) return false;
      if (overdueOnly && now - new Date(report.created_at).getTime() < 7 * DAY_MS) return false;
      const assignee = profiles[report.assigned_to];
      return !query || [
        report.title,
        report.description,
        report.location,
        report.category?.category_name,
        assignee?.full_name,
        assignee?.username,
      ].some((value) => String(value || "").toLowerCase().includes(query));
    });
  }, [now, overdueOnly, profiles, reports, search, statusFilter]);
  const pageCount = Math.max(1, Math.ceil(visibleReports.length / PAGE_SIZE));
  const currentPage = Math.min(page, pageCount);
  const pageReports = visibleReports.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  const setPriority = async (report, severity) => {
    setBusyId(report.id);
    setError("");
    const { error: updateError } = await supabase
      .from("reports")
      .update({ severity, updated_at: new Date().toISOString() })
      .eq("id", report.id);
    if (updateError) {
      console.error(`Could not change service issue priority to ${severity}:`, updateError);
      setError(`Could not change report priority: ${updateError.message}`);
    } else {
      await load();
    }
    setBusyId(null);
  };

  const overdueCount = reports.filter((report) => now - new Date(report.created_at).getTime() >= 7 * DAY_MS).length;
  const unassignedCount = reports.filter((report) => !report.assigned_to).length;

  return (
    <main className="admin-workflow-page">
      <header className="admin-workflow-header">
        <div>
          <p className="admin-workflow-eyebrow"><FileSearch size={15} /> Operations oversight</p>
          <h1>Service Issue Oversight</h1>
          <p>Monitor unresolved reports, flag overdue work, and escalate priority.</p>
        </div>
        <button className="admin-workflow-button" type="button" onClick={load} disabled={loading}>
          <RefreshCw size={16} className={loading ? "admin-workflow-spin" : ""} /> Refresh
        </button>
      </header>

      {error && <div className="admin-workflow-alert admin-workflow-alert--error" role="alert">{error}</div>}

      <section className="admin-workflow-stats">
        <article><span>Unresolved reports</span><strong>{loading ? "…" : reports.length}</strong></article>
        <article><span>Open over 7 days</span><strong>{loading ? "…" : overdueCount}</strong></article>
        <article><span>Unassigned</span><strong>{loading ? "…" : unassignedCount}</strong></article>
      </section>

      <section className="admin-workflow-panel">
        <div className="admin-workflow-toolbar">
          <label className="admin-workflow-search">
            <Search size={16} aria-hidden="true" />
            <input value={search} onChange={(event) => {
              setSearch(event.target.value);
              setPage(1);
            }} placeholder="Search reports, location, assignee" aria-label="Search reports" />
          </label>
          <label className="admin-workflow-select">
            Status
            <select value={statusFilter} onChange={(event) => {
              setStatusFilter(event.target.value);
              setPage(1);
            }}>
              <option value="open">All unresolved</option>
              {OPEN_STATUSES.map((status) => <option value={status} key={status}>{status.replaceAll("_", " ")}</option>)}
            </select>
          </label>
          <label className="admin-workflow-check">
            <input type="checkbox" checked={overdueOnly} onChange={(event) => {
              setOverdueOnly(event.target.checked);
              setPage(1);
            }} />
            <Clock3 size={15} /> Over 7 days
          </label>
        </div>

        {loading && <p className="admin-workflow-empty">Loading unresolved reports…</p>}
        {!loading && visibleReports.length === 0 && !error && <p className="admin-workflow-empty">No unresolved reports match these filters.</p>}
        <div className="admin-issue-list">
          {pageReports.map((report) => {
            const ageDays = Math.floor((now - new Date(report.created_at).getTime()) / DAY_MS);
            const highPriority = report.severity === "High";
            return (
              <article className="admin-issue-card" key={report.id}>
                <div className="admin-issue-card__main">
                  <div className="admin-issue-card__title">
                    <div>
                      <h2>{report.title || report.category?.category_name || "Service report"}</h2>
                      <p>{report.description || "No description provided."}</p>
                    </div>
                    <span className={`admin-workflow-badge ${highPriority ? "admin-workflow-badge--flagged" : ""}`}>
                      {report.severity || "Normal"} priority
                    </span>
                  </div>
                  <div className="admin-issue-meta">
                    <span>{report.category?.category_name || "Uncategorized"}</span>
                    <span>{report.status.replaceAll("_", " ")}</span>
                    <span>{report.location || "No location"}</span>
                    <span>{ageDays} days old</span>
                    <span>{report.assigned_to
                      ? `Assigned: ${profiles[report.assigned_to]?.full_name || profiles[report.assigned_to]?.username || "Staff"}`
                      : "Unassigned"}</span>
                    <span>Updated {formatDate(report.updated_at || report.created_at)}</span>
                  </div>
                  {ageDays >= 7 && (
                    <p className="admin-issue-overdue"><AlertTriangle size={14} /> This unresolved report has been open for at least 7 days.</p>
                  )}
                  <div className="admin-workflow-actions">
                    <button
                      className={`admin-workflow-button ${highPriority ? "" : "admin-workflow-button--primary"}`}
                      type="button"
                      disabled={busyId === report.id}
                      onClick={() => setPriority(report, highPriority ? "Normal" : "High")}
                    >
                      <Zap size={15} />
                      {busyId === report.id
                        ? "Updating…"
                        : highPriority ? "De-escalate to normal" : "Escalate to high"}
                    </button>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
        {!loading && visibleReports.length > 0 && (
          <nav className="admin-moderation-pagination" aria-label="Service issue pages">
            <span>
              Showing {(currentPage - 1) * PAGE_SIZE + 1}–{Math.min(currentPage * PAGE_SIZE, visibleReports.length)} of {visibleReports.length}
            </span>
            <div>
              <button
                className="admin-workflow-button"
                type="button"
                onClick={() => setPage(currentPage - 1)}
                disabled={currentPage === 1}
              >
                Previous
              </button>
              <span aria-live="polite">Page {currentPage} of {pageCount}</span>
              <button
                className="admin-workflow-button"
                type="button"
                onClick={() => setPage(currentPage + 1)}
                disabled={currentPage === pageCount}
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
