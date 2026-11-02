import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Activity,
  AlertTriangle,
  CalendarDays,
  ChartNoAxesCombined,
  FileText,
  Heart,
  MessageCircle,
  RefreshCw,
  ShieldAlert,
  Users,
} from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { supabase } from "../components/supabaseClient";
import "./Analysis.css";

const PAGE_SIZE = 1000;
const DAY_MS = 24 * 60 * 60 * 1000;
const OPEN_STATUSES = ["open", "under_review", "in_progress"];
const RESOLVED_STATUSES = ["resolved", "closed"];
const ROLE_COLORS = ["#16865b", "#4382d5", "#e7a434", "#8b5fc0", "#8b949e"];
const COLORS = {
  green: "#16865b",
  blue: "#4382d5",
  purple: "#8b5fc0",
  red: "#cf4d4d",
  slate: "#718096",
};

const activitySeries = [
  { key: "reports", label: "Service reports", color: COLORS.green },
  { key: "newAccounts", label: "New accounts", color: COLORS.blue },
  { key: "communityPosts", label: "Community posts", color: COLORS.purple },
];

async function loadRows(table, columns, { since, before, statuses } = {}) {
  const rows = [];
  let start = 0;

  while (true) {
    let query = supabase
      .from(table)
      .select(columns)
      .order("created_at", { ascending: true })
      .range(start, start + PAGE_SIZE - 1);

    if (since) query = query.gte("created_at", since);
    if (before) query = query.lt("created_at", before);
    if (statuses) query = query.in("status", statuses);

    const { data, error } = await query;
    if (error) throw error;

    rows.push(...(data || []));
    if (!data || data.length < PAGE_SIZE) return rows;
    start += PAGE_SIZE;
  }
}

function inDateRange(row, startDate, endDate) {
  if (!row.created_at) return false;
  const timestamp = new Date(row.created_at).getTime();
  const start = parseDateInput(startDate).getTime();
  const end = parseDateInput(endDate);
  end.setDate(end.getDate() + 1);
  return timestamp >= start && timestamp < end.getTime();
}

function countBy(rows, getKey) {
  return rows.reduce((counts, row) => {
    const key = getKey(row) || "Unknown";
    counts[key] = (counts[key] || 0) + 1;
    return counts;
  }, {});
}

function formatDateInput(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function parseDateInput(value) {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(year, month - 1, day);
}

function getWeekStart(date) {
  const weekStart = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  weekStart.setDate(weekStart.getDate() - ((weekStart.getDay() + 6) % 7));
  return weekStart;
}

function createTrend(series, startDate, endDate, grouping) {
  const buckets = new Map();
  const start = parseDateInput(startDate);
  const end = parseDateInput(endDate);
  const bucketDate = grouping === "weekly" ? getWeekStart(start)
    : grouping === "monthly" ? new Date(start.getFullYear(), start.getMonth(), 1)
      : start;

  while (bucketDate <= end) {
    const key = grouping === "monthly"
      ? `${bucketDate.getFullYear()}-${bucketDate.getMonth()}`
      : formatDateInput(bucketDate);
    buckets.set(key, {
      key,
      label: bucketDate.toLocaleDateString("en", { day: "numeric", month: "short" }),
      reports: 0,
      newAccounts: 0,
      communityPosts: 0,
    });
    if (grouping === "monthly") bucketDate.setMonth(bucketDate.getMonth() + 1);
    else if (grouping === "weekly") bucketDate.setDate(bucketDate.getDate() + 7);
    else bucketDate.setDate(bucketDate.getDate() + 1);
  }

  for (const [name, rows] of Object.entries(series)) {
    rows.forEach((row) => {
      if (!row.created_at) return;
      const date = new Date(row.created_at);
      if (date < start || date > new Date(end.getFullYear(), end.getMonth(), end.getDate(), 23, 59, 59, 999)) return;
      const key = grouping === "monthly"
        ? `${date.getFullYear()}-${date.getMonth()}`
        : formatDateInput(grouping === "weekly" ? getWeekStart(date) : date);
      const bucket = buckets.get(key);
      if (bucket) bucket[name] += 1;
    });
  }

  return [...buckets.values()];
}

function StatCard({ icon: Icon, label, value, note, color }) {
  return (
    <article className="analysis-stat">
      <span className="analysis-stat__icon" style={{ color, backgroundColor: `${color}15` }}>
        <Icon size={20} aria-hidden="true" />
      </span>
      <div className="analysis-stat__copy">
        <span>{label}</span>
        <strong>{value}</strong>
        <small>{note}</small>
      </div>
    </article>
  );
}

function ChartPanel({ title, description, children, className = "" }) {
  return (
    <section className={`analysis-panel ${className}`}>
      <header className="analysis-panel__header">
        <h2>{title}</h2>
        {description && <p>{description}</p>}
      </header>
      {children}
    </section>
  );
}

function EmptyChart({ children = "No data for this period." }) {
  return <div className="analysis-empty">{children}</div>;
}

function formatNumber(value) {
  return Number(value || 0).toLocaleString();
}

export default function Analysis() {
  const [now, setNow] = useState(() => Date.now());
  const [startDate, setStartDate] = useState(() => {
    const today = new Date(now);
    return `${today.getFullYear()}-04-01`;
  });
  const [endDate, setEndDate] = useState(() => formatDateInput(new Date(now)));
  const [selectedCategory, setSelectedCategory] = useState("all");
  const [selectedStatus, setSelectedStatus] = useState("all");
  const [activityGrouping, setActivityGrouping] = useState("daily");
  const [visibleActivitySeries, setVisibleActivitySeries] = useState(
    () => activitySeries.map((series) => series.key)
  );
  const [data, setData] = useState(null);
  const [errors, setErrors] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");

  const fetchAnalysis = useCallback(async () => {
    setLoading(true);
    setLoadError("");
    const refreshedAt = Date.now();
    setNow(refreshedAt);
    const currentDate = new Date(refreshedAt);
    const fiscalYearStart = `${currentDate.getFullYear()}-04-01`;
    const queryStart = parseDateInput(fiscalYearStart).toISOString();
    const queryEnd = new Date(currentDate.getFullYear(), currentDate.getMonth(), currentDate.getDate() + 1).toISOString();
    const requests = [
      ["Service reports", loadRows("reports", "id, status, created_at, assigned_to, category:categories(category_name)", { since: queryStart, before: queryEnd })],
      ["Accounts", loadRows("profiles", "id, role, full_name, username, created_at", { since: queryStart, before: queryEnd })],
      ["Community posts", loadRows("community_posts", "id, status, created_at", { since: queryStart, before: queryEnd })],
      ["Community comments", loadRows("comments", "id, created_at", { since: queryStart, before: queryEnd })],
      ["Community moderation reports", loadRows("user_reports", "id, status, created_at, target_post_id, post_threshold_flagged", { since: queryStart, before: queryEnd })],
    ];

    const [results, likesResult] = await Promise.all([
      Promise.all(requests.map(([, request]) => request.then(
        (rows) => ({ rows }),
        (error) => ({ error }),
      ))),
      supabase.from("likes")
        .select("id", { count: "exact", head: true })
        .gte("created_at", queryStart)
        .lt("created_at", queryEnd),
    ]);

    const loaded = {};
    const failures = [];
    results.forEach((result, index) => {
      const [label] = requests[index];
      if (result.error) {
        console.error(`Could not load ${label.toLowerCase()} analytics:`, result.error);
        failures.push({ label, message: result.error.message });
      } else {
        loaded[label] = result.rows;
      }
    });

    if (likesResult.error) {
      console.error("Could not load community likes analytics:", likesResult.error);
      failures.push({ label: "Community likes", message: likesResult.error.message });
    } else {
      loaded.likeCount = likesResult.count || 0;
    }

    setData(loaded);
    setErrors(failures);
    setLoadError(failures.length === requests.length + 1
      ? "Analytics data could not be loaded. Check the Admin Portal analytics policies in the Supabase SQL migration."
      : "");
    setLoading(false);
  }, []);

  useEffect(() => {
    void Promise.resolve().then(fetchAnalysis);
  }, [fetchAnalysis]);

  const analysis = useMemo(() => {
    if (!data) return null;
    const reportsInRange = (data["Service reports"] || []).filter((row) => inDateRange(row, startDate, endDate));
    const profiles = data.Accounts || [];
    const newProfiles = profiles.filter((row) => inDateRange(row, startDate, endDate));
    const posts = (data["Community posts"] || []).filter((row) => inDateRange(row, startDate, endDate));
    const publishedPosts = posts.filter((row) => row.status === "published");
    const comments = (data["Community comments"] || []).filter((row) => inDateRange(row, startDate, endDate));
    const moderationReports = (data["Community moderation reports"] || []).filter((row) =>
      inDateRange(row, startDate, endDate) && row.target_post_id && row.post_threshold_flagged
    );
    const reports = reportsInRange.filter((report) => {
      if (selectedCategory !== "all"
        && (report.category?.category_name || "Uncategorized") !== selectedCategory) return false;
      if (selectedStatus === "open" && !OPEN_STATUSES.includes(report.status)) return false;
      if (selectedStatus === "resolved" && !RESOLVED_STATUSES.includes(report.status)) return false;
      if (selectedStatus === "overdue"
        && (!OPEN_STATUSES.includes(report.status) || now - new Date(report.created_at).getTime() <= 7 * DAY_MS)) return false;
      if (["open", "under_review", "in_progress", "resolved", "closed"].includes(selectedStatus)
        && report.status !== selectedStatus) return false;
      return true;
    });
    const overdueReports = reports.filter((report) =>
      OPEN_STATUSES.includes(report.status)
      && now - new Date(report.created_at).getTime() > 7 * DAY_MS
    );

    const roles = countBy(newProfiles, (profile) => profile.role || "unassigned");
    const statuses = countBy(reports, (report) => report.status);
    const categories = countBy(reports, (report) => report.category?.category_name || "Uncategorized");
    const assignments = countBy(reports, (report) => report.assigned_to || "Unassigned");
    const profileById = new Map(profiles.map((profile) => [profile.id, profile]));
    const workload = Object.entries(assignments)
      .map(([id, count]) => {
        const profile = profileById.get(id);
        return {
          name: profile?.full_name || profile?.username || (id === "Unassigned" ? "Unassigned" : "Team member"),
          count,
        };
      })
      .sort((a, b) => b.count - a.count)
      .slice(0, 8);

    const roleData = Object.entries(roles)
      .map(([name, value]) => ({ name: name.replaceAll("_", " "), value }))
      .sort((a, b) => b.value - a.value);
    const statusData = Object.entries(statuses)
      .map(([name, value]) => ({ name: name.replaceAll("_", " "), value }))
      .sort((a, b) => b.value - a.value);
    const categoryData = Object.entries(categories)
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 7);
    return {
      reports,
      newProfiles,
      publishedPosts,
      comments,
      moderationReports,
      overdueReports,
      roles: roleData,
      statuses: statusData,
      categories: categoryData,
      workload,
      likeCount: data.likeCount || 0,
    };
  }, [data, endDate, now, selectedCategory, selectedStatus, startDate]);

  const activityTrend = useMemo(() => {
    if (!analysis) return [];
    return createTrend({
      reports: analysis.reports,
      newAccounts: analysis.newProfiles,
      communityPosts: analysis.publishedPosts,
    }, startDate, endDate, activityGrouping);
  }, [activityGrouping, analysis, endDate, startDate]);

  const toggleActivitySeries = (key) => {
    setVisibleActivitySeries((current) =>
      current.includes(key) ? current.filter((item) => item !== key) : [...current, key]
    );
  };

  const exportCsv = () => {
    if (!analysis) return;
    const rows = [
      ["Metric", "Value"],
      ["From", startDate],
      ["Through", endDate],
      ["Category filter", selectedCategory],
      ["Status filter", selectedStatus],
      ["System activity grouping", activityGrouping],
      ["Service reports", analysis.reports.length],
      ["Resolved reports", analysis.reports.filter((row) => RESOLVED_STATUSES.includes(row.status)).length],
      ["Overdue open reports", analysis.overdueReports.length],
      ["New accounts", analysis.newProfiles.length],
      ["Published community posts", analysis.publishedPosts.length],
      ["Community comments", analysis.comments.length],
      ["Community moderation reports", analysis.moderationReports.length],
      ["Community likes", analysis.likeCount],
      ...activityTrend.flatMap((bucket) => visibleActivitySeries.map((seriesKey) => {
        const series = activitySeries.find((item) => item.key === seriesKey);
        return [`System activity: ${series.label} (${bucket.label})`, bucket[seriesKey]];
      })),
    ];
    const csv = rows
      .map((row) => row.map((value) => `"${String(value).replace(/"/g, '""')}"`).join(","))
      .join("\r\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8;" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = "trackserv-admin-analysis.csv";
    link.click();
    URL.revokeObjectURL(url);
  };

  const fiscalYearStart = `${new Date(now).getFullYear()}-04-01`;
  const today = formatDateInput(new Date(now));
  const categoryOptions = [...new Set(
    (data?.["Service reports"] || []).map((report) => report.category?.category_name || "Uncategorized")
  )].sort((a, b) => a.localeCompare(b));

  return (
    <main className="analysis-page">
      <div className="analysis-container">
        <header className="analysis-heading">
          <div>
            <p className="analysis-eyebrow"><ChartNoAxesCombined size={16} /> TrackServ overview</p>
            <h1>System Analysis</h1>
            <p className="analysis-subtitle">Live performance metrics across service reports, accounts, and community activity.</p>
          </div>
          <div className="analysis-controls">
            <label className="analysis-date-control">
              <CalendarDays size={16} aria-hidden="true" />
              From
              <input
                type="date"
                aria-label="Filter analytics from date"
                min={fiscalYearStart}
                max={endDate > today ? today : endDate}
                value={startDate}
                onChange={(event) => {
                  const nextStartDate = event.target.value;
                  setStartDate(nextStartDate);
                  if (nextStartDate > endDate) setEndDate(nextStartDate);
                }}
              />
            </label>
            <label className="analysis-date-control">
              To
              <input
                type="date"
                aria-label="Filter analytics through date"
                min={startDate}
                max={today}
                value={endDate}
                onChange={(event) => setEndDate(event.target.value)}
              />
            </label>
            <label className="analysis-filter-control">
              Category
              <select value={selectedCategory} onChange={(event) => setSelectedCategory(event.target.value)}>
                <option value="all">All categories</option>
                {categoryOptions.map((category) => <option key={category} value={category}>{category}</option>)}
              </select>
            </label>
            <label className="analysis-filter-control">
              Report status
              <select value={selectedStatus} onChange={(event) => setSelectedStatus(event.target.value)}>
                <option value="all">All statuses</option>
                <option value="open">Open</option>
                <option value="in_progress">In progress</option>
                <option value="under_review">Under review</option>
                <option value="resolved">Resolved</option>
                <option value="closed">Closed</option>
                <option value="overdue">Overdue (over 7 days)</option>
              </select>
            </label>
            <button type="button" className="analysis-button" onClick={fetchAnalysis} disabled={loading}>
              <RefreshCw size={15} className={loading ? "analysis-spin" : ""} />
              Refresh
            </button>
            <button type="button" className="analysis-button analysis-button--primary" onClick={exportCsv} disabled={!analysis}>
              Export CSV
            </button>
          </div>
        </header>

        {loadError && <p className="analysis-error" role="alert">{loadError}</p>}
        {errors.length > 0 && !loadError && (
          <div className="analysis-warning" role="status">
            <AlertTriangle size={18} />
            <div>
              <strong>Some analytics could not be loaded</strong>
              <ul>{errors.map((error) => <li key={error.label}>{error.label}: {error.message}</li>)}</ul>
              <small>Apply the Admin Portal analytics policies from the Supabase SQL migration if access is denied.</small>
            </div>
          </div>
        )}

        {loading && !data ? (
          <div className="analysis-loading" aria-live="polite">Loading system analytics…</div>
        ) : analysis ? (
          <>
            <section className="analysis-stats" aria-label="System summary">
              <StatCard icon={FileText} label="Service reports" value={formatNumber(analysis.reports.length)} note={`${analysis.overdueReports.length} open over 7 days`} color={COLORS.green} />
              <StatCard icon={Users} label="New accounts" value={formatNumber(analysis.newProfiles.length)} note="Created in selected date range" color={COLORS.purple} />
              <StatCard icon={MessageCircle} label="Community posts" value={formatNumber(analysis.publishedPosts.length)} note="Published in selected date range" color={COLORS.blue} />
              <StatCard icon={ShieldAlert} label="Moderation reports" value={formatNumber(analysis.moderationReports.length)} note="In selected date range" color={COLORS.red} />
            </section>

            <section className="analysis-charts">
              <ChartPanel title="System activity" description="The shared date, category, and status filters apply to this chart and the rest of the analytics." className="analysis-panel--wide">
                <div className="analysis-activity-controls">
                  <label className="analysis-group-control">
                    Group by
                    <select value={activityGrouping} onChange={(event) => setActivityGrouping(event.target.value)}>
                      <option value="daily">Day</option>
                      <option value="weekly">Week</option>
                      <option value="monthly">Month</option>
                    </select>
                  </label>
                  <fieldset className="analysis-series-filter">
                    <legend>Show</legend>
                    {activitySeries.map((series) => (
                      <label key={series.key}>
                        <input
                          type="checkbox"
                          checked={visibleActivitySeries.includes(series.key)}
                          onChange={() => toggleActivitySeries(series.key)}
                        />
                        <span style={{ "--series-color": series.color }} />
                        {series.label}
                      </label>
                    ))}
                  </fieldset>
                </div>
                {!visibleActivitySeries.length ? (
                  <EmptyChart>Select at least one activity type to display.</EmptyChart>
                ) : activityTrend.every((bucket) =>
                  visibleActivitySeries.every((key) => !bucket[key])
                ) ? (
                  <EmptyChart />
                ) : (
                  <div className="analysis-chart">
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={activityTrend} margin={{ top: 8, right: 12, bottom: 0, left: -18 }}>
                        <CartesianGrid stroke="#e8edf1" strokeDasharray="3 3" />
                        <XAxis dataKey="label" tick={{ fontSize: 11 }} minTickGap={18} />
                        <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
                        <Tooltip />
                        <Legend />
                        {activitySeries.filter((series) => visibleActivitySeries.includes(series.key)).map((series) => (
                          <Line
                            key={series.key}
                            type="monotone"
                            dataKey={series.key}
                            name={series.label}
                            stroke={series.color}
                            strokeWidth={2.5}
                            dot={false}
                          />
                        ))}
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                )}
              </ChartPanel>

              <ChartPanel title="Reports by status" description="Service issues created during the selected period.">
                {analysis.statuses.length ? (
                  <div className="analysis-chart analysis-chart--short">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={analysis.statuses} layout="vertical" margin={{ top: 2, right: 15, bottom: 0, left: 4 }}>
                        <CartesianGrid stroke="#e8edf1" strokeDasharray="3 3" horizontal={false} />
                        <XAxis type="number" allowDecimals={false} tick={{ fontSize: 11 }} />
                        <YAxis type="category" dataKey="name" width={95} tick={{ fontSize: 11 }} />
                        <Tooltip />
                        <Bar dataKey="value" name="Reports" fill={COLORS.green} radius={[0, 5, 5, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                ) : <EmptyChart />}
              </ChartPanel>

              <ChartPanel title="New accounts by role" description="Accounts created within the selected date range.">
                {analysis.roles.length ? (
                  <div className="analysis-chart analysis-chart--short">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie data={analysis.roles} dataKey="value" nameKey="name" innerRadius={58} outerRadius={92} paddingAngle={3}>
                          {analysis.roles.map((entry, index) => <Cell key={entry.name} fill={ROLE_COLORS[index % ROLE_COLORS.length]} />)}
                        </Pie>
                        <Tooltip />
                        <Legend />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                ) : <EmptyChart />}
              </ChartPanel>

              <ChartPanel title="Most reported categories" description="Service reports grouped by issue category.">
                {analysis.categories.length ? (
                  <div className="analysis-chart analysis-chart--short">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={analysis.categories} layout="vertical" margin={{ top: 2, right: 15, bottom: 0, left: 4 }}>
                        <CartesianGrid stroke="#e8edf1" strokeDasharray="3 3" horizontal={false} />
                        <XAxis type="number" allowDecimals={false} tick={{ fontSize: 11 }} />
                        <YAxis type="category" dataKey="name" width={115} tick={{ fontSize: 11 }} />
                        <Tooltip />
                        <Bar dataKey="value" name="Reports" fill={COLORS.blue} radius={[0, 5, 5, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                ) : <EmptyChart />}
              </ChartPanel>

              <ChartPanel title="Report assignments by team member" description="Reports matching the shared date, category, and status filters.">
                {analysis.workload.length ? (
                  <div className="analysis-chart analysis-chart--short">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={analysis.workload} layout="vertical" margin={{ top: 2, right: 15, bottom: 0, left: 4 }}>
                        <CartesianGrid stroke="#e8edf1" strokeDasharray="3 3" horizontal={false} />
                        <XAxis type="number" allowDecimals={false} tick={{ fontSize: 11 }} />
                        <YAxis type="category" dataKey="name" width={115} tick={{ fontSize: 11 }} />
                        <Tooltip />
                        <Bar dataKey="count" name="Open assignments" fill={COLORS.purple} radius={[0, 5, 5, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                ) : <EmptyChart>There are no active assignments.</EmptyChart>}
              </ChartPanel>
            </section>

            <section className="analysis-domain-grid" aria-label="Module analytics">
              <article className="analysis-domain">
                <h2><Activity size={18} color={COLORS.green} /> Service operations</h2>
                <div className="analysis-domain__metric"><span>Resolved in period</span><strong>{formatNumber(analysis.reports.filter((row) => RESOLVED_STATUSES.includes(row.status)).length)}</strong></div>
                <div className="analysis-domain__metric"><span>Open over 7 days</span><strong>{formatNumber(analysis.overdueReports.length)}</strong></div>
              </article>
              <article className="analysis-domain">
                <h2><MessageCircle size={18} color={COLORS.purple} /> Community</h2>
                <div className="analysis-domain__metric"><span>Published posts</span><strong>{formatNumber(analysis.publishedPosts.length)}</strong></div>
                <div className="analysis-domain__metric"><span>Comments in period</span><strong>{formatNumber(analysis.comments.length)}</strong></div>
                <div className="analysis-domain__metric"><span><Heart size={14} /> Likes (all time)</span><strong>{formatNumber(analysis.likeCount)}</strong></div>
                <div className="analysis-domain__metric"><span><ShieldAlert size={14} /> Moderation reports</span><strong>{formatNumber(analysis.moderationReports.length)}</strong></div>
              </article>
            </section>
            <p className="analysis-footnote">Report and community activity use the selected date range. Account roles, open assignments, and total likes are current or all-time totals.</p>
          </>
        ) : (
          <div className="analysis-error" role="alert">No analytics data is available. Refresh to try again.</div>
        )}
      </div>
    </main>
  );
}
