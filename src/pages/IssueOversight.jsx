import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertTriangle, Clock3, FileSearch, History, RefreshCw, Search, ShieldAlert, Zap } from "lucide-react";
import { supabase } from "../components/supabaseClient";
import "./AdminWorkflows.css";

const OPEN_STATUSES = ["open", "under_review", "in_progress"];
const DAY_MS = 24 * 60 * 60 * 1000;
const formatDate = (value) => value
  ? new Date(value).toLocaleString("en-ZA", { dateStyle: "medium", timeStyle: "short" })
  : "—";

export default function IssueOversight() {
  const [now, setNow] = useState(() => Date.now());
  const [reports, setReports] = useState([]);
  const [profiles, setProfiles] = useState({});
  const [history, setHistory] = useState({});
  const [statusFilter, setStatusFilter] = useState("open");
  const [overdueOnly, setOverdueOnly] = useState(false);
  const [search, setSearch] = useState("");
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

  const escalate = async (report) => {
    setBusyId(report.id);
    setError("");
    const { error: updateError } = await supabase
      .from("reports")
      .update({ severity: "High", updated_at: new Date().toISOString() })
      .eq("id", report.id);
    if (updateError) {
      console.error("Could not escalate service issue:", updateError);
      setError(`Could not escalate report: ${updateError.message}`);
    } else {
      await load();
    }
    setBusyId(null);
  };

  const toggleHistory = async (reportId) => {
    if (history[reportId]) {
      setHistory((current) => ({ ...current, [reportId]: null }));
      return;
    }
    setHistory((current) => ({ ...current, [reportId]: { loading: true, rows: [] } }));
    const { data, error: historyError } = await supabase
      .from("audit_logs")
      .select("id, actor_id, action, changed_fields, created_at")
      .eq("table_name", "reports")
      .eq("record_id", reportId)
      .order("created_at", { ascending: false });
    if (historyError) {
      console.error("Could not load service issue history:", historyError);
      setHistory((current) => ({ ...current, [reportId]: { error: historyError.message, rows: [] } }));
      return;
    }
    const actorIds = [...new Set((data || []).map((entry) => entry.actor_id).filter(Boolean))];
    const { data: actors, error: actorsError } = actorIds.length
      ? await supabase.from("profiles").select("id, full_name, username").in("id", actorIds)
      : { data: [], error: null };
    if (actorsError) {
      console.error("Could not load audit actor details:", actorsError);
      setHistory((current) => ({ ...current, [reportId]: { error: actorsError.message, rows: [] } }));
      return;
    }
    const actorNames = Object.fromEntries((actors || []).map((actor) => [
      actor.id,
      actor.full_name || actor.username || "Admin",
    ]));
    setHistory((current) => ({
      ...current,
      [reportId]: {
        rows: (data || []).map((entry) => ({ ...entry, actorName: actorNames[entry.actor_id] || "System" })),
      },
    }));
  };

  const overdueCount = reports.filter((report) => now - new Date(report.created_at).getTime() >= 7 * DAY_MS).length;
  const unassignedCount = reports.filter((report) => !report.assigned_to).length;

  return (
    <main className="admin-workflow-page">
      <header className="admin-workflow-header">
        <div>
          <p className="admin-workflow-eyebrow"><FileSearch size={15} /> Operations oversight</p>
          <h1>Service Issue Oversight</h1>
          <p>Monitor unresolved reports, flag overdue work, escalate priority, and inspect change history.</p>
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
            <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search reports, location, assignee" aria-label="Search reports" />
          </label>
          <label className="admin-workflow-select">
            Status
            <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
              <option value="open">All unresolved</option>
              {OPEN_STATUSES.map((status) => <option value={status} key={status}>{status.replaceAll("_", " ")}</option>)}
            </select>
          </label>
          <label className="admin-workflow-check">
            <input type="checkbox" checked={overdueOnly} onChange={(event) => setOverdueOnly(event.target.checked)} />
            <Clock3 size={15} /> Over 7 days
          </label>
        </div>

        {loading && <p className="admin-workflow-empty">Loading unresolved reports…</p>}
        {!loading && visibleReports.length === 0 && !error && <p className="admin-workflow-empty">No unresolved reports match these filters.</p>}
        <div className="admin-issue-list">
          {visibleReports.map((report) => {
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
                    {!highPriority && (
                      <button className="admin-workflow-button admin-workflow-button--primary" type="button" disabled={busyId === report.id} onClick={() => escalate(report)}>
                        <Zap size={15} /> {busyId === report.id ? "Escalating…" : "Escalate to high"}
                      </button>
                    )}
                    <button className="admin-workflow-button" type="button" onClick={() => toggleHistory(report.id)}>
                      <History size={15} /> {history[report.id] ? "Hide history" : "Status & assignment history"}
                    </button>
                  </div>
                </div>
                {history[report.id] && (
                  <div className="admin-issue-history">
                    <h3>Recorded changes</h3>
                    {history[report.id].loading && <p>Loading report history…</p>}
                    {history[report.id].error && <p className="admin-workflow-inline-error">{history[report.id].error}. Apply the audit-log SQL migration if this table is unavailable.</p>}
                    {!history[report.id].loading && !history[report.id].error && history[report.id].rows.length === 0 && <p>No changes recorded. History is collected after the audit-log migration is applied.</p>}
                    {history[report.id].rows.map((entry) => (
                      <div className="admin-issue-history__row" key={entry.id}>
                        <time>{formatDate(entry.created_at)}</time>
                        <strong>{entry.actorName}</strong>
                        <span>{entry.action}</span>
                        <code>{JSON.stringify(entry.changed_fields)}</code>
                      </div>
                    ))}
                  </div>
                )}
              </article>
            );
          })}
        </div>
      </section>
      <p className="admin-workflow-footnote"><ShieldAlert size={14} /> This page is for admin visibility and priority escalation. Assignment and routine status workflows remain in the Manager Portal.</p>
    </main>
  );
}
