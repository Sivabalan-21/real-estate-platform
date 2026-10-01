import React, { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  apiGet, endSession, formatDate, initials, DASHBOARD_ROLES,
} from "./superAdminShared";

const POLL_MS = 30000;
const COMPANY_PREVIEW_LIMIT = 3;

// ─── METRIC CARD ─────────────────────────────────────────────────────────────
function MetricCard({ icon, value, label, color }) {
  return (
    <div style={{ ...s.metricCard, borderTop: `3px solid ${color}` }}>
      <span style={s.metricIcon}>{icon}</span>
      <div>
        <p style={s.metricValue}>{value}</p>
        <p style={s.metricLabel}>{label}</p>
      </div>
    </div>
  );
}

// ─── USERS BY ROLE (bar chart, plain SVG/CSS — no chart dependency) ─────────
function RoleBars({ counts }) {
  const max = Math.max(1, ...DASHBOARD_ROLES.map(r => counts[r.key] || 0));
  const CHART_H = 150;
  return (
    <div style={s.bars} role="img" aria-label="Users by role bar chart">
      {DASHBOARD_ROLES.map(r => {
        const v = counts[r.key] || 0;
        return (
          <div key={r.key} style={s.barCol}>
            <span style={s.barValue}>{v}</span>
            <div style={s.barTrack}>
              <div
                style={{
                  ...s.bar,
                  height: v === 0 ? 3 : Math.max(6, (v / max) * CHART_H),
                  background: r.color,
                  opacity: v === 0 ? 0.35 : 0.85,
                }}
              />
            </div>
            <span style={s.barLabel}>{r.label}</span>
          </div>
        );
      })}
    </div>
  );
}

// ─── USER DISTRIBUTION (donut, plain SVG) ───────────────────────────────────
function Donut({ counts, total }) {
  const SIZE = 170, STROKE = 26;
  const R = (SIZE - STROKE) / 2;
  const C = 2 * Math.PI * R;
  let offset = 0;

  return (
    <div style={s.donutWrap}>
      <div style={{ position: "relative", width: SIZE, height: SIZE, flexShrink: 0 }}>
        <svg width={SIZE} height={SIZE} viewBox={`0 0 ${SIZE} ${SIZE}`} role="img" aria-label="User distribution donut chart">
          <g transform={`rotate(-90 ${SIZE / 2} ${SIZE / 2})`}>
            <circle cx={SIZE / 2} cy={SIZE / 2} r={R} fill="none" stroke="#f1f5f9" strokeWidth={STROKE} />
            {total > 0 && DASHBOARD_ROLES.map(r => {
              const v = counts[r.key] || 0;
              if (!v) return null;
              const len = (v / total) * C;
              const el = (
                <circle
                  key={r.key} cx={SIZE / 2} cy={SIZE / 2} r={R} fill="none"
                  stroke={r.color} strokeWidth={STROKE}
                  strokeDasharray={`${len} ${C - len}`} strokeDashoffset={-offset}
                />
              );
              offset += len;
              return el;
            })}
          </g>
        </svg>
        <div style={s.donutCenter}>
          <span style={s.donutTotal}>{total}</span>
          <span style={s.donutCaption}>Total Users</span>
        </div>
      </div>

      <ul style={s.legend}>
        {DASHBOARD_ROLES.map(r => {
          const v = counts[r.key] || 0;
          const pct = total > 0 ? Math.round((v / total) * 1000) / 10 : 0;
          return (
            <li key={r.key} style={s.legendRow}>
              <span style={{ ...s.dot, background: r.color }} />
              <span style={s.legendLabel}>{r.label}</span>
              <span style={s.legendValue}>{v} ({pct}%)</span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

// ─── PAGE ────────────────────────────────────────────────────────────────────
function Dashboard() {
  const navigate = useNavigate();
  const token = localStorage.getItem("token");
  const username = localStorage.getItem("display_name") || localStorage.getItem("username");

  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async ({ silent = false } = {}) => {
    if (!token) { navigate("/"); return; }
    if (!silent) setLoading(true);
    try {
      const res = await apiGet("/admin/dashboard", token);
      if (res.status === 401) { endSession(navigate); return; }
      if (res.status === 403) { setError("You are not authorized to view the dashboard."); return; }
      if (!res.ok) throw new Error();
      setData(await res.json());
      setError("");
    } catch {
      // A failed background refresh keeps the last good numbers on screen.
      if (!silent) setError("Failed to load dashboard data.");
    } finally {
      if (!silent) setLoading(false);
    }
  }, [token, navigate]);

  useEffect(() => {
    load();
    const tick = setInterval(() => { if (!document.hidden) load({ silent: true }); }, POLL_MS);
    const onVisible = () => { if (!document.hidden) load({ silent: true }); };
    document.addEventListener("visibilitychange", onVisible);
    return () => { clearInterval(tick); document.removeEventListener("visibilitychange", onVisible); };
  }, [load]);

  const counts = data?.role_counts || {};
  const companies = data?.companies || [];
  const preview = [...companies]
    .sort((a, b) => (b.user_count || 0) - (a.user_count || 0))
    .slice(0, COMPANY_PREVIEW_LIMIT);

  return (
    <div style={s.page}>
      <header style={s.topbar}>
        <div>
          <p style={s.greeting}>Good day, <strong>{username}</strong></p>
          <p style={s.subrole}>Super Administrator</p>
        </div>
        <span style={s.badge}>Super Admin</span>
      </header>

      {loading ? (
        <div style={s.state}>Loading dashboard…</div>
      ) : error && !data ? (
        <div style={{ ...s.state, color: "#ef4444" }}>
          {error} <button style={s.linkBtn} onClick={() => load()}>Retry</button>
        </div>
      ) : (
        <div style={s.body}>
          {/* METRICS */}
          <section style={s.metricGrid}>
            {DASHBOARD_ROLES.map(r => (
              <MetricCard key={r.key} icon={r.icon} color={r.color}
                value={counts[r.key] ?? 0} label={r.label} />
            ))}
            <MetricCard icon="🏬" color="#0891b2" value={data.total_companies} label="Total Companies" />
            <MetricCard icon="👥" color="#4f46e5" value={data.total_users} label="Total Users" />
          </section>

          {/* USER MANAGEMENT + COMPANY OVERVIEW */}
          <section style={s.row}>
            <div style={s.card}>
              <h3 style={s.cardTitle}>User Management</h3>
              <p style={s.cardDesc}>
                Create, edit, delete, and manage all users across every role in the system.
              </p>
              <button style={s.primaryBtn} onClick={() => navigate("/users/manage")}>
                Open User Management →
              </button>
            </div>

            <div style={s.card}>
              <div style={s.cardHead}>
                <h3 style={{ ...s.cardTitle, margin: 0 }}>Company Overview</h3>
                <button style={s.linkBtn} onClick={() => navigate("/companies/manage")}>View All →</button>
              </div>

              {companies.length === 0 ? (
                <p style={s.emptyInline}>No companies yet.</p>
              ) : (
                <div style={s.companyList}>
                  {preview.map(c => (
                    <div
                      key={c.id} role="button" tabIndex={0} style={s.companyItem}
                      onClick={() => navigate(`/users/manage?company_id=${encodeURIComponent(c.id)}`)}
                      onKeyDown={e => { if (e.key === "Enter") navigate(`/users/manage?company_id=${encodeURIComponent(c.id)}`); }}
                    >
                      <div style={s.companyAvatar}>{initials(c.name)}</div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={s.companyTop}>
                          <span style={s.companyName}>{c.name}</span>
                          <span style={s.userCount}>
                            👥 {c.user_count} {c.user_count === 1 ? "user" : "users"}
                          </span>
                        </div>
                        <div style={s.companyMeta}>
                          <span><span style={s.metaKey}>Company Code</span> {c.company_code || "—"}</span>
                          <span><span style={s.metaKey}>Created On</span> {formatDate(c.created_at)}</span>
                          <span><span style={s.metaKey}>Slug</span> {c.slug || "—"}</span>
                        </div>
                      </div>
                      <span style={s.chevron}>›</span>
                    </div>
                  ))}
                  {companies.length > preview.length && (
                    <p style={s.moreNote}>+ {companies.length - preview.length} more — use “View All”.</p>
                  )}
                </div>
              )}
            </div>
          </section>

          {/* CHARTS */}
          <section style={s.row}>
            <div style={s.card}>
              <h3 style={s.cardTitle}>Users by Role</h3>
              <RoleBars counts={counts} />
            </div>
            <div style={s.card}>
              <h3 style={s.cardTitle}>User Distribution</h3>
              <Donut counts={counts} total={data.total_users} />
            </div>
          </section>
        </div>
      )}
    </div>
  );
}

const s = {
  page:   { fontFamily: "'DM Sans', sans-serif", background: "#f8fafc", minHeight: "100vh", margin: -20 },
  topbar: { display: "flex", justifyContent: "space-between", alignItems: "center", padding: "20px 32px", background: "#fff", borderBottom: "1px solid #e2e8f0", gap: 12, flexWrap: "wrap" },
  greeting: { margin: 0, fontSize: 16, color: "#1e293b" },
  subrole:  { margin: "2px 0 0", fontSize: 12, color: "#94a3b8" },
  badge:    { background: "#ede9fe", color: "#6d28d9", padding: "4px 12px", borderRadius: 20, fontSize: 12, fontWeight: 600 },
  body:     { padding: "24px 32px 40px", display: "flex", flexDirection: "column", gap: 20 },
  state:    { padding: 48, color: "#94a3b8", fontSize: 14 },

  metricGrid: { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))", gap: 16 },
  metricCard: { background: "#fff", borderRadius: 12, padding: "18px 20px", display: "flex", alignItems: "center", gap: 14, boxShadow: "0 1px 4px rgba(15,23,42,.07)" },
  metricIcon: { fontSize: 26, width: 32, textAlign: "center" },
  metricValue: { margin: 0, fontSize: 26, fontWeight: 700, color: "#0f172a", lineHeight: 1.1 },
  metricLabel: { margin: "3px 0 0", fontSize: 12.5, color: "#64748b" },

  row:  { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(340px, 1fr))", gap: 20 },
  card: { background: "#fff", borderRadius: 12, padding: "24px 26px", boxShadow: "0 1px 4px rgba(15,23,42,.07)", minWidth: 0 },
  cardHead: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 },
  cardTitle: { margin: "0 0 10px", fontSize: 17, fontWeight: 700, color: "#0f172a" },
  cardDesc:  { margin: "0 0 20px", color: "#64748b", fontSize: 14, lineHeight: 1.6 },
  primaryBtn: { background: "#6366f1", color: "#fff", border: "none", padding: "11px 22px", borderRadius: 8, cursor: "pointer", fontWeight: 600, fontSize: 14 },
  linkBtn:    { background: "none", border: "none", color: "#4f46e5", cursor: "pointer", fontWeight: 600, fontSize: 13 },
  emptyInline: { color: "#94a3b8", fontSize: 14, margin: "8px 0 0" },

  companyList: { display: "flex", flexDirection: "column", gap: 10 },
  companyItem: { display: "flex", alignItems: "center", gap: 14, padding: "14px 16px", border: "1px solid #e2e8f0", borderRadius: 10, background: "#fafbff", cursor: "pointer" },
  companyAvatar: { width: 42, height: 42, borderRadius: 10, background: "#4f46e5", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700, fontSize: 14, flexShrink: 0 },
  companyTop: { display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, flexWrap: "wrap" },
  companyName: { fontWeight: 700, color: "#0f172a", fontSize: 15 },
  userCount:   { fontSize: 13, color: "#334155", fontWeight: 600 },
  companyMeta: { display: "flex", gap: "4px 20px", flexWrap: "wrap", marginTop: 6, fontSize: 12.5, color: "#0f172a" },
  metaKey:     { color: "#94a3b8", marginRight: 4 },
  chevron:     { color: "#94a3b8", fontSize: 22 },
  moreNote:    { margin: "2px 0 0", fontSize: 12, color: "#94a3b8" },

  bars:     { display: "flex", alignItems: "flex-end", gap: 8, minHeight: 210, paddingTop: 8, overflowX: "auto" },
  barCol:   { flex: "1 0 62px", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "flex-end", gap: 6 },
  barValue: { fontSize: 13, fontWeight: 700, color: "#0f172a" },
  barTrack: { height: 150, width: "100%", display: "flex", alignItems: "flex-end", justifyContent: "center", borderBottom: "1px solid #e2e8f0" },
  bar:      { width: "72%", maxWidth: 64, borderRadius: "5px 5px 0 0", transition: "height .3s" },
  barLabel: { fontSize: 11.5, color: "#64748b", textAlign: "center", lineHeight: 1.3, minHeight: 30 },

  donutWrap:   { display: "flex", alignItems: "center", gap: 28, flexWrap: "wrap", justifyContent: "center" },
  donutCenter: { position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" },
  donutTotal:  { fontSize: 30, fontWeight: 700, color: "#0f172a", lineHeight: 1 },
  donutCaption: { fontSize: 11.5, color: "#64748b", marginTop: 4 },
  legend:      { listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 9, minWidth: 210 },
  legendRow:   { display: "flex", alignItems: "center", gap: 10, fontSize: 13 },
  dot:         { width: 10, height: 10, borderRadius: "50%", flexShrink: 0 },
  legendLabel: { color: "#475569", flex: 1 },
  legendValue: { color: "#0f172a", fontWeight: 600, fontVariantNumeric: "tabular-nums" },
};

export default Dashboard;