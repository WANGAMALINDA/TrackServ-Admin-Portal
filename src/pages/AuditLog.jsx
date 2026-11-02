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

export default function AuditLog() {
  const [entries, setEntries] = useState([]);
  const [actors, setActors] = useState({});
  const [search, setSearch] = useState("");
  const [tableFilter, setTableFilter] = useState("all");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    const { data, error: queryError } = await supabase
      .from("audit_logs")
      .select("id, actor_id, action, table_name, record_id, changed_fields, created_at")
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
      return !query || [
        entry.action,
        entry.table_name,
        entry.record_id,
        actors[entry.actor_id],
        JSON.stringify(entry.changed_fields),
      ].some((value) => String(value || "").toLowerCase().includes(query));
    });
  }, [actors, entries, search, tableFilter]);

  return (
    <main className="admin-workflow-page">
      <header className="admin-workflow-header">
        <div>
          <p className="admin-workflow-eyebrow"><History size={15} /> Accountability</p>
          <h1>Audit Log</h1>
          <p>Search recorded account, moderation, and service-report changes.</p>
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
            <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search actor, action, record ID, or changed field" aria-label="Search audit log" />
          </label>
          <label className="admin-workflow-select">
            Area
            <select value={tableFilter} onChange={(event) => setTableFilter(event.target.value)}>
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
          {visibleEntries.map((entry) => (
            <article className="admin-audit-row" key={entry.id}>
              <span className={`admin-audit-action admin-audit-action--${entry.action}`}>{entry.action}</span>
              <div className="admin-audit-row__main">
                <strong>{tableLabels[entry.table_name] || entry.table_name}</strong>
                <span>Record <code>{entry.record_id}</code> · by {actors[entry.actor_id] || (entry.actor_id ? "Admin" : "System")}</span>
                <pre>{JSON.stringify(entry.changed_fields, null, 2)}</pre>
              </div>
              <time>{formatDate(entry.created_at)}</time>
            </article>
          ))}
        </div>
        {!loading && entries.length === 1000 && (
          <p className="admin-workflow-footnote">Showing the latest 1,000 entries. Narrow your search or filters to find activity.</p>
        )}
      </section>
    </main>
  );
}
