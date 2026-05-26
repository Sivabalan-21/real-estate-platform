import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";

function Dashboard() {
  const navigate = useNavigate();
  const username = localStorage.getItem("username");
  const token = localStorage.getItem("token");
  const [stats, setStats] = useState({ "Company Admin": 0, Admin: 0, "Property Manager": 0, Tenant: 0, Vendor: 0, Owner: 0 });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!token) { navigate("/"); return; }
    fetch("http://localhost:8000/users", {
      headers: { Authorization: `Bearer ${token}` }
    })
      .then(r => r.json())
      .then(data => {
        if (Array.isArray(data)) {
          const s = { "Company Admin": 0, Admin: 0, "Property Manager": 0, Tenant: 0, Vendor: 0, Owner: 0 };
          data.forEach(u => { if (s[u.role] !== undefined) s[u.role]++; });
          setStats(s);
        }
        setLoading(false);
      })
      .catch(() => { navigate("/"); });
  }, [navigate, token]);

  const STAT_CARDS = [
    { label: "Company Admins",    key: "Company Admin",    icon: "◆",  color: "#7c3aed" },
    { label: "Admins",            key: "Admin",            icon: "🛡️",  color: "#6366f1" },
    { label: "Property Managers", key: "Property Manager", icon: "🏢",  color: "#0ea5e9" },
    { label: "Tenants",           key: "Tenant",           icon: "🏠",  color: "#10b981" },
    { label: "Vendors",           key: "Vendor",           icon: "🔧",  color: "#f59e0b" },
    { label: "Owners",            key: "Owner",            icon: "👑",  color: "#ec4899" },
  ];

  return (
    <div style={s.shell}>
      {/* SIDEBAR */}

      {/* MAIN */}
      <main style={s.main}>
        <header style={s.topbar}>
          <div>
            <p style={s.greeting}>Good day, <strong>{username}</strong></p>
            <p style={s.subrole}>Super Administrator</p>
          </div>
          <span style={s.badge}>Super Admin</span>
        </header>

        {loading ? (
          <div style={s.loader}>Loading...</div>
        ) : (
          <>
            <section style={s.statsGrid}>
              {STAT_CARDS.map(c => (
                <div key={c.key} style={{ ...s.statCard, borderTop: `3px solid ${c.color}` }}>
                  <span style={s.statIcon}>{c.icon}</span>
                  <div>
                    <p style={s.statValue}>{stats[c.key]}</p>
                    <p style={s.statLabel}>{c.label}</p>
                  </div>
                </div>
              ))}
            </section>

            <section style={s.ctaSection}>
              <div style={s.ctaCard}>
                <h3 style={s.ctaTitle}>User Management</h3>
                <p style={s.ctaDesc}>
                  Create, edit, delete, and manage all users across every role in the system.
                  Invited users complete their own registration via secure email link.
                </p>
                <button style={s.ctaBtn} onClick={() => navigate("/users/manage")}>
                  Open User Management →
                </button>
              </div>
            </section>
          </>
        )}
      </main>
    </div>
  );
}

const s = {
  shell: { display: "flex", height: "100vh", fontFamily: "'DM Sans', sans-serif", background: "#f8fafc" },
  sidebar: { width: 230, background: "#0f172a", display: "flex", flexDirection: "column", padding: "24px 16px" },
  brand: { display: "flex", alignItems: "center", gap: 10, marginBottom: 36, paddingLeft: 8 },
  brandIcon: { fontSize: 22, color: "#6366f1" },
  brandText: { color: "#fff", fontSize: 20, fontWeight: 700, letterSpacing: 1 },
  nav: { display: "flex", flexDirection: "column", gap: 4, flex: 1 },
  navItem: { display: "flex", alignItems: "center", gap: 10, padding: "10px 12px", borderRadius: 8, color: "#94a3b8", cursor: "pointer", fontSize: 14, transition: "all .15s" },
  navActive: { background: "#1e293b", color: "#fff" },
  navIcon: { fontSize: 16 },
  logoutBtn: { background: "transparent", border: "1px solid #334155", color: "#94a3b8", padding: "10px 12px", borderRadius: 8, cursor: "pointer", fontSize: 13, display: "flex", alignItems: "center", gap: 8 },
  main: { flex: 1, overflow: "auto", display: "flex", flexDirection: "column" },
  topbar: { display: "flex", justifyContent: "space-between", alignItems: "center", padding: "24px 32px", borderBottom: "1px solid #e2e8f0", background: "#fff" },
  greeting: { margin: 0, fontSize: 15, color: "#1e293b" },
  subrole: { margin: "2px 0 0", fontSize: 12, color: "#94a3b8" },
  badge: { background: "#ede9fe", color: "#6d28d9", padding: "4px 12px", borderRadius: 20, fontSize: 12, fontWeight: 600 },
  statsGrid: { display: "grid", gridTemplateColumns: "repeat(6, 1fr)", gap: 16, padding: "28px 32px 0" },
  statCard: { background: "#fff", borderRadius: 10, padding: "18px 20px", display: "flex", alignItems: "center", gap: 14, boxShadow: "0 1px 4px rgba(0,0,0,.06)" },
  statIcon: { fontSize: 26 },
  statValue: { margin: 0, fontSize: 26, fontWeight: 700, color: "#0f172a" },
  statLabel: { margin: "2px 0 0", fontSize: 12, color: "#64748b" },
  ctaSection: { padding: "24px 32px" },
  ctaCard: { background: "#fff", borderRadius: 12, padding: "28px 32px", maxWidth: 520, boxShadow: "0 1px 4px rgba(0,0,0,.06)" },
  ctaTitle: { margin: "0 0 8px", color: "#0f172a", fontSize: 18 },
  ctaDesc: { margin: "0 0 20px", color: "#64748b", fontSize: 14, lineHeight: 1.6 },
  ctaBtn: { background: "#6366f1", color: "#fff", border: "none", padding: "11px 22px", borderRadius: 8, cursor: "pointer", fontWeight: 600, fontSize: 14 },
  loader: { padding: 40, color: "#94a3b8" },
};

export default Dashboard;
