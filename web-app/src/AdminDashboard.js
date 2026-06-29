import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";

const STAT_CARDS = [
  { label: "Admins",            key: "Admin",            icon: "🛡️", color: "#6366f1" },
  { label: "Property Managers", key: "Property Manager", icon: "🏢", color: "#0ea5e9" },
  { label: "Tenants",           key: "Tenant",           icon: "🏠", color: "#10b981" },
  { label: "Vendors",           key: "Vendor",           icon: "🔧", color: "#f59e0b" },
  { label: "Owners",            key: "Owner",            icon: "👑", color: "#ec4899" },
];

function AdminDashboard() {
  const navigate  = useNavigate();
  const token     = localStorage.getItem("token");
  const username  = localStorage.getItem("username");
  const role      = localStorage.getItem("role");
  const companyName = localStorage.getItem("company_name");

  const visibleCards = role === "Company Admin"
    ? STAT_CARDS
    : STAT_CARDS.filter(card => card.key !== "Admin");

  const [stats,   setStats]   = useState({ Admin: 0, "Property Manager": 0, Tenant: 0, Vendor: 0, Owner: 0 });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!token) { navigate("/"); return; }

    fetch("http://194.164.149.22/api/users/my-hierarchy", {
      headers: { Authorization: `Bearer ${token}` }
    })
      .then(r => {
        if (!r.ok) {
          console.error("API failed:", r.status);
          return [];
        }
        return r.json();
      })
      .then(data => {
        if (Array.isArray(data)) {
          const s = { Admin: 0, "Property Manager": 0, Tenant: 0, Vendor: 0, Owner: 0 };
          data.forEach(u => { if (s[u.role] !== undefined) s[u.role]++; });
          setStats(s);
        }
        setLoading(false);
      })
      .catch((err) => {
        console.error("Dashboard API Error:", err);
        setLoading(false);
      });
  }, [navigate, token]);

  const total = Object.values(stats).reduce((a, b) => a + b, 0);

  return (
    <div style={s.page}>
      {/* TOPBAR */}
      <header style={s.topbar}>
        <div style={s.topbarLeft}>
          <div style={s.avatar}>
            {username ? username[0].toUpperCase() : "A"}
          </div>
          <div>
            <p style={s.greeting}>
              Good day, <strong>{username}</strong>
            </p>
            <p style={s.subtext}>
              {companyName} · {role || "Administrator"}
            </p>
          </div>
        </div>
        <span style={s.badge}>
          <span style={s.badgeDot} />
          {role || "Admin"}
        </span>
      </header>

      <div style={s.body}>
        {loading ? (
          <div style={s.loader}>Loading dashboard…</div>
        ) : (
          <>
            {/* STATS */}
            <section style={s.statsGrid}>
              {visibleCards.map(c => (
                <div key={c.key} style={{ ...s.statCard, borderTop: `3px solid ${c.color}` }}>
                  <span style={s.statIcon}>{c.icon}</span>
                  <div>
                    <p style={s.statValue}>{stats[c.key]}</p>
                    <p style={s.statLabel}>{c.label}</p>
                  </div>
                </div>
              ))}
            </section>

            {/* CTA */}
            <section style={s.ctaRow}>
              <div style={s.ctaCard}>
                <div style={s.ctaLeft}>
                  <h3 style={s.ctaTitle}>User Management</h3>
                  <p style={s.ctaDesc}>
                    Invite and manage users in your role hierarchy.
                    You have <strong>{total}</strong> user{total !== 1 ? "s" : ""} in your hierarchy.
                  </p>
                </div>
                <button style={s.ctaBtn} onClick={() => navigate("/admin/users")}>
                  Manage Users →
                </button>
              </div>
            </section>

            {/* ROLE BREAKDOWN */}
            <section style={s.breakdown}>
              <h3 style={s.breakdownTitle}>Role Breakdown</h3>
              <div style={s.bars}>
                {visibleCards.map(c => {
                  const pct = total > 0 ? Math.round((stats[c.key] / total) * 100) : 0;
                  return (
                    <div key={c.key} style={s.barRow}>
                      <span style={s.barLabel}>{c.icon} {c.label}</span>
                      <div style={s.barTrack}>
                        <div style={{ ...s.barFill, width: `${pct}%`, background: c.color }} />
                      </div>
                      <span style={s.barCount}>{stats[c.key]}</span>
                    </div>
                  );
                })}
              </div>
            </section>
          </>
        )}
      </div>
    </div>
  );
}

const s = {
  page:           { display: "flex", flexDirection: "column", minHeight: "100vh", background: "#f8fafc", fontFamily: "'DM Sans', sans-serif" },

  /* ── Topbar ── */
  topbar:         { display: "flex", justifyContent: "space-between", alignItems: "center", padding: "16px 32px", borderBottom: "1px solid #e2e8f0", background: "#fff" },
  topbarLeft:     { display: "flex", alignItems: "center", gap: 14 },
  avatar:         { width: 40, height: 40, borderRadius: "50%", background: "#ede9fe", color: "#6366f1", fontWeight: 700, fontSize: 16, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 },
  greeting:       { margin: 0, fontSize: 14, color: "#1e293b", lineHeight: 1.4 },
  subtext:        { margin: "3px 0 0", fontSize: 12, color: "#94a3b8" },
  badge:          { display: "flex", alignItems: "center", gap: 6, background: "#ede9fe", color: "#6366f1", padding: "5px 14px", borderRadius: 20, fontSize: 12, fontWeight: 600 },
  badgeDot:       { width: 6, height: 6, borderRadius: "50%", background: "#6366f1", flexShrink: 0 },

  /* ── Body ── */
  body:           { padding: "28px 32px", flex: 1 },
  loader:         { color: "#94a3b8", fontSize: 14, padding: 40 },

  /* ── Stat Cards ── */
  statsGrid:      { display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 16, marginBottom: 24 },
  statCard:       { background: "#fff", borderRadius: 10, padding: "18px 20px", display: "flex", alignItems: "center", gap: 14, boxShadow: "0 1px 4px rgba(0,0,0,.06)" },
  statIcon:       { fontSize: 26 },
  statValue:      { margin: 0, fontSize: 26, fontWeight: 700, color: "#0f172a" },
  statLabel:      { margin: "2px 0 0", fontSize: 12, color: "#64748b" },

  /* ── CTA ── */
  ctaRow:         { marginBottom: 24 },
  ctaCard:        { background: "#fff", borderRadius: 12, padding: "24px 28px", display: "flex", justifyContent: "space-between", alignItems: "center", boxShadow: "0 1px 4px rgba(0,0,0,.06)" },
  ctaLeft:        { flex: 1, marginRight: 24 },
  ctaTitle:       { margin: "0 0 6px", color: "#0f172a", fontSize: 16, fontWeight: 700 },
  ctaDesc:        { margin: 0, color: "#64748b", fontSize: 13, lineHeight: 1.6 },
  ctaBtn:         { background: "#6366f1", color: "#fff", border: "none", padding: "11px 22px", borderRadius: 8, cursor: "pointer", fontWeight: 600, fontSize: 14, whiteSpace: "nowrap" },

  /* ── Role Breakdown ── */
  breakdown:      { background: "#fff", borderRadius: 12, padding: "24px 28px", boxShadow: "0 1px 4px rgba(0,0,0,.06)" },
  breakdownTitle: { margin: "0 0 20px", fontSize: 15, fontWeight: 700, color: "#0f172a" },
  bars:           { display: "flex", flexDirection: "column", gap: 14 },
  barRow:         { display: "flex", alignItems: "center", gap: 12 },
  barLabel:       { width: 160, fontSize: 13, color: "#475569", flexShrink: 0 },
  barTrack:       { flex: 1, height: 8, background: "#f1f5f9", borderRadius: 4, overflow: "hidden" },
  barFill:        { height: "100%", borderRadius: 4, transition: "width .4s ease" },
  barCount:       { width: 28, fontSize: 13, fontWeight: 600, color: "#0f172a", textAlign: "right", flexShrink: 0 },
};

export default AdminDashboard;