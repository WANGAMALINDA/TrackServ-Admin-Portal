import { useCallback, useEffect, useMemo, useState } from "react";
import { History, RefreshCw, Search } from "lucide-react";
import { supabase } from "../components/supabaseClient";
import "./AdminWorkflows.css";

const formatDate = (value) => value
  ? new Date(value).toLocaleString("en-ZA", { dateStyle: "medium", timeStyle: "short" })
  : "—";

const tableLabels = {
  profiles: "Accounts",
  reports: "Service reports",
  user_reports: "Community reports",
  community_posts: "Community posts",
};

function readableFieldName(value) {
  return value
    .replaceAll("_", " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function readableValue(value) {
  if (value == null || value === "") return "Not set";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (Array.isArray(value)) return value.map(readableValue).join(", ");
  if (typeof value === "object") {
    return Object.entries(value)
      .map(([key, nestedValue]) => `${readableFieldName(key)}: ${readableValue(nestedValue)}`)
      .join("; ");
  }
  return String(value);
}

function getChangeDescriptions(changedFields) {
  if (!changedFields || typeof changedFields !== "object" || Array.isArray(changedFields)) return [];

  return Object.entries(changedFields).map(([field, change]) => {
    const label = readableFieldName(field);
    if (change && typeof change === "object" && !Array.isArray(change)
      && ("before" in change || "after" in change)) {
      return `${label}: ${readableValue(change.before)} → ${readableValue(change.after)}`;
    }
    return `${label}: ${readableValue(change)}`;
  });
}

export default function AuditLog() {
  const [entries, setEntries] = useState([]);
  const [actors, setActors] = useState({});
  const [search, setSearch] = useState("");
  const [tableFilter, setTableFilter] = useState("all");
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    const retentionCutoff = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const { data, error: queryError } = await supabase
      .from("audit_logs")
      .select("id, actor_id, action, table_name, changed_fields, created_at")
      .gte("created_at", retentionCutoff)
      .order("created_at", { ascending: false })
      .limit(1000);

    if (queryError) {
      console.error("Could not load the admin audit log:", queryError);
      setError(`Could not load the audit log: ${queryError.message}. Apply the audit-log SQL migration if this table has not been created.`);
      setLoading(false);
      return;
    }

    const actorIds = [...new Set((data || []).map((entry) => entry.actor_id).filter(Boolean))];
    const { data: profileRows, error: profilesError } = actorIds.length
      ? await supabase.from("profiles").select("id, full_name, username").in("id", actorIds)
      : { data: [], error: null };
    if (profilesError) {
      console.error("Could not load audit actor names:", profilesError);
      setError(`Audit events loaded, but actor names could not be loaded: ${profilesError.message}`);
      setLoading(false);
      return;
    }

    setEntries(data || []);
    setActors(Object.fromEntries((profileRows || []).map((profile) => [
      profile.id,
      profile.full_name || profile.username || "Admin",
    ])));
    setLoading(false);
  }, []);

  useEffect(() => {
    void Promise.resolve().then(load);
  }, [load]);

  const visibleEntries = useMemo(() => {
    const query = search.trim().toLowerCase();
    return entries.filter((entry) => {
      if (tableFilter !== "all" && entry.table_name !== tableFilter) return false;
      const changes = getChangeDescriptions(entry.changed_fields);
      return !query || [
        entry.action,
        entry.table_name,
        actors[entry.actor_id],
        ...changes,
      ].some((value) => String(value || "").toLowerCase().includes(query));
    });
  }, [actors, entries, search, tableFilter]);
  const pageSize = 5;
  const pageCount = Math.ceil(visibleEntries.length / pageSize);
  const currentPage = Math.min(page, Math.max(pageCount, 1));
  const pageEntries = visibleEntries.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  return (
    <main className="admin-workflow-page">
      <header className="admin-workflow-header">
        <div>
          <p className="admin-workflow-eyebrow"><History size={15} /> Accountability</p>
          <h1>Audit Log</h1>
          <p>Search recorded changes from the past 7 days. Audit entries are deleted after 7 days.</p>
        </div>
        <button className="admin-workflow-button" type="button" onClick={load} disabled={loading}>
          <RefreshCw size={16} className={loading ? "admin-workflow-spin" : ""} /> Refresh
        </button>
      </header>

      {error && <div className="admin-workflow-alert admin-workflow-alert--error" role="alert">{error}</div>}

      <section className="admin-workflow-panel">
        <div className="admin-workflow-toolbar">
          <label className="admin-workflow-search">
            <Search size={16} aria-hidden="true" />
            <input value={search} onChange={(event) => {
              setSearch(event.target.value);
              setPage(1);
            }} placeholder="Search actor, action, or changed field" aria-label="Search audit log" />
          </label>
          <label className="admin-workflow-select">
            Area
            <select value={tableFilter} onChange={(event) => {
              setTableFilter(event.target.value);
              setPage(1);
            }}>
              <option value="all">All activity</option>
              <option value="profiles">Accounts</option>
              <option value="reports">Service reports</option>
              <option value="community_posts">Community posts</option>
              <option value="user_reports">Community reports</option>
            </select>
          </label>
        </div>

        {loading && <p className="admin-workflow-empty">Loading audit events…</p>}
        {!loading && visibleEntries.length === 0 && !error && <p className="admin-workflow-empty">No audit entries match this search.</p>}
        <div className="admin-audit-list">
          {pageEntries.map((entry) => {
            const changes = getChangeDescriptions(entry.changed_fields);
            return (
              <article className="admin-audit-row" key={entry.id}>
                <span className={`admin-audit-action admin-audit-action--${entry.action}`}>{entry.action}</span>
                <div className="admin-audit-row__main">
                  <strong>{tableLabels[entry.table_name] || entry.table_name}</strong>
                  <span>By {actors[entry.actor_id] || (entry.actor_id ? "Admin" : "System")}</span>
                  <ul className="admin-audit-changes">
                    {changes.length
                      ? changes.map((change) => <li key={change}>{change}</li>)
                      : <li>No field details recorded.</li>}
                  </ul>
                </div>
                <time>{formatDate(entry.created_at)}</time>
              </article>
            );
          })}
        </div>
        {!loading && visibleEntries.length > 0 && (
          <nav className="admin-moderation-pagination" aria-label="Audit log pages">
            <span>
              Showing {(currentPage - 1) * pageSize + 1}–{Math.min(currentPage * pageSize, visibleEntries.length)} of {visibleEntries.length}
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
