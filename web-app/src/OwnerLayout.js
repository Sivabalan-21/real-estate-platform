import React, { useEffect } from "react";
import { useNavigate, useLocation, Outlet } from "react-router-dom";

// Where each role's own dashboard lives — used to bounce a mismatched role
// away from the Owner shell instead of rendering it for the wrong user.
const ROLE_HOME = {
  "Super Admin": "/dashboard",
  "Company Admin": "/admin/dashboard",
  "Regional Manager": "/admin/dashboard",
  "Property Manager": "/pm/dashboard",
  "Tenant": "/tenant/dashboard",
  "Vendor": "/vendor/dashboard",
};

function OwnerLayout() {
  const navigate = useNavigate();
  const location = useLocation();
  const username = localStorage.getItem("username");
  const role = localStorage.getItem("role");

  // Guard: only an Owner should ever see this shell. Anyone else who lands here
  // (stale link, typed URL, etc.) gets bounced to their own dashboard instead
  // of a blank/broken Owner shell.
  useEffect(() => {
    if (role && role !== "Owner") {
      navigate(ROLE_HOME[role] || "/", { replace: true });
    }
  }, [role, navigate]);

  const logout = () => {
    const slug = localStorage.getItem("company_slug");
    localStorage.clear();
    navigate(slug ? `/portal/${slug}` : "/");
  };

  const NAV = [
    { icon: "⊞", label: "Dashboard",  path: "/owner/dashboard" },
    { icon: "🏢", label: "Properties", path: "/owner/properties" },
    { icon: "✅", label: "Approvals",  path: "/owner/approvals" },
    { icon: "📊", label: "Reports",    path: "/owner/reports" },
  ];

  if (role && role !== "Owner") return null; // redirect effect above is already firing

  return (
    <div style={s.shell}>
      <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&display=swap" rel="stylesheet" />

      {/* SIDEBAR */}
      <aside style={s.sidebar}>
        <div style={s.brand}>
          <span style={s.brandIcon}>⬡</span>
          <span style={s.brandText}>PropOS</span>
        </div>

        <nav style={s.nav}>
          {NAV.map(n => {
            const active = location.pathname === n.path;
            return (
              <div
                key={n.path}
                style={{ ...s.navItem, ...(active ? s.navActive : {}) }}
                onClick={() => navigate(n.path)}
              >
                <span style={s.navIcon}>{n.icon}</span>
                <span>{n.label}</span>
              </div>
            );
          })}
        </nav>

        {/* USER INFO */}
        <div style={s.sidebarUser}>
          <div style={s.userAvatar}>
            {(username || "O")[0].toUpperCase()}
          </div>
          <div style={s.userInfo}>
            <p style={s.userInfoName}>{username}</p>
            <p style={s.userInfoRole}>Owner</p>
          </div>
        </div>

        <button style={s.logoutBtn} onClick={logout}>
          <span>⎋</span> Sign Out
        </button>
      </aside>

      {/* MAIN */}
      <main style={s.main}>
        <Outlet />
      </main>
    </div>
  );
}

const s = {
  shell:        { display: "flex", height: "100vh", fontFamily: "'DM Sans', sans-serif", background: "#f8fafc" },
  sidebar:      { width: 230, background: "#0f172a", display: "flex", flexDirection: "column", padding: "24px 16px" },
  brand:        { display: "flex", alignItems: "center", gap: 10, marginBottom: 36, paddingLeft: 8 },
  brandIcon:    { fontSize: 22, color: "#6366f1" },
  brandText:    { color: "#fff", fontSize: 18, fontWeight: 700, letterSpacing: 1 },
  nav:          { display: "flex", flexDirection: "column", gap: 4, flex: 1 },
  navItem:      { display: "flex", alignItems: "center", gap: 10, padding: "10px 12px", borderRadius: 8, color: "#94a3b8", cursor: "pointer", fontSize: 14, fontWeight: 500 },
  navActive:    { background: "#1e293b", color: "#fff" },
  navIcon:      { fontSize: 16 },
  sidebarUser:  { display: "flex", alignItems: "center", gap: 10, padding: "12px 8px", marginBottom: 8 },
  userAvatar:   { width: 32, height: 32, borderRadius: "50%", background: "#1e3a5f", color: "#7dd3fc", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700, fontSize: 13, flexShrink: 0 },
  userInfo:     { overflow: "hidden" },
  userInfoName: { margin: 0, fontSize: 13, color: "#fff", fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" },
  userInfoRole: { margin: "2px 0 0", fontSize: 11, color: "#94a3b8" },
  logoutBtn:    { background: "transparent", border: "1px solid #334155", color: "#94a3b8", padding: "9px 12px", borderRadius: 8, cursor: "pointer", fontSize: 13, display: "flex", alignItems: "center", gap: 8 },
  main:         { flex: 1, overflow: "auto" },
};

export default OwnerLayout;