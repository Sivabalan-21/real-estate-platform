import React, { useEffect, useState } from "react";
import { useNavigate, useLocation, Outlet } from "react-router-dom";

const API = "http://localhost:8000";
// Poll interval for the Approvals nav badge — cheap enough to just refetch
// on a timer rather than plumb a shared store through every owner page.
const APPROVALS_BADGE_POLL_MS = 30000;

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
  const displayName = localStorage.getItem("display_name") || username;
  const role = localStorage.getItem("role");
  const [pendingApprovalCount, setPendingApprovalCount] = useState(0);

  // Guard: only an Owner should ever see this shell. Anyone else who lands here
  // (stale link, typed URL, etc.) gets bounced to their own dashboard instead
  // of a blank/broken Owner shell.
  useEffect(() => {
    if (role && role !== "Owner") {
      navigate(ROLE_HOME[role] || "/", { replace: true });
    }
  }, [role, navigate]);

  // Nav badge for the Approvals item — polled independently of whichever
  // owner page is currently mounted, and refreshed whenever the owner
  // navigates (e.g. right after approving/rejecting a ticket elsewhere)
  // so the count doesn't go stale until the next 30s tick.
  useEffect(() => {
    if (role !== "Owner") return;
    const token = localStorage.getItem("token");
    let cancelled = false;

    const fetchCount = async () => {
      try {
        const res = await fetch(`${API}/owner/approvals`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) return;
        const data = await res.json();
        if (!cancelled) setPendingApprovalCount(data.count || 0);
      } catch {
        // Silent — a stale/missing badge count isn't worth surfacing an error for.
      }
    };

    fetchCount();
    const intervalId = window.setInterval(fetchCount, APPROVALS_BADGE_POLL_MS);
    return () => { cancelled = true; window.clearInterval(intervalId); };
  }, [role, location.pathname]);

  const logout = () => {
    const slug = localStorage.getItem("company_slug");
    localStorage.clear();
    navigate(slug ? `/portal/${slug}` : "/");
  };

  const NAV = [
    { icon: "⊞", label: "Dashboard",  path: "/owner/dashboard" },
    { icon: "🏢", label: "Properties", path: "/owner/properties" },
    { icon: "🛠️", label: "Tickets",    path: "/owner/tickets" },
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
            const showBadge = n.path === "/owner/approvals" && pendingApprovalCount > 0;
            return (
              <div
                key={n.path}
                style={{ ...s.navItem, ...(active ? s.navActive : {}) }}
                onClick={() => navigate(n.path)}
              >
                <span style={s.navIcon}>{n.icon}</span>
                <span style={s.navLabel}>{n.label}</span>
                {showBadge && (
                  <span style={s.navBadge}>{pendingApprovalCount > 99 ? "99+" : pendingApprovalCount}</span>
                )}
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
            <p style={s.userInfoName}>{displayName}</p>
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
  shell:        { display: "flex", minHeight: "100vh", fontFamily: "'DM Sans', sans-serif", background: "#f8fafc" },
  sidebar: {
  position: "fixed",
  top: 0,
  left: 0,
  width: 230,
  height: "100vh",
  boxSizing: "border-box",
  background: "#0f172a",
  display: "flex",
  flexDirection: "column",
  padding: "24px 16px",
  zIndex: 1000,
},
  brand:        { display: "flex", alignItems: "center", gap: 10, marginBottom: 36, paddingLeft: 8 },
  brandIcon:    { fontSize: 22, color: "#6366f1" },
  brandText:    { color: "#fff", fontSize: 18, fontWeight: 700, letterSpacing: 1 },
  nav:          { display: "flex", flexDirection: "column", gap: 4, flex: 1 },
  navItem:      { display: "flex", alignItems: "center", gap: 10, padding: "10px 12px", borderRadius: 8, color: "#94a3b8", cursor: "pointer", fontSize: 14, fontWeight: 500 },
  navActive:    { background: "#1e293b", color: "#fff" },
  navIcon:      { fontSize: 16 },
  navLabel:     { flex: 1 },
  navBadge:     { background: "#dc2626", color: "#fff", fontSize: 11, fontWeight: 700, borderRadius: 999, padding: "1px 7px", minWidth: 18, textAlign: "center", lineHeight: "16px" },
  sidebarUser:  { display: "flex", alignItems: "center", gap: 10, padding: "12px 8px", marginBottom: 8 },
  userAvatar:   { width: 32, height: 32, borderRadius: "50%", background: "#1e3a5f", color: "#7dd3fc", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700, fontSize: 13, flexShrink: 0 },
  userInfo:     { overflow: "hidden" },
  userInfoName: { margin: 0, fontSize: 13, color: "#fff", fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" },
  userInfoRole: { margin: "2px 0 0", fontSize: 11, color: "#94a3b8" },
  logoutBtn:    { background: "transparent", border: "1px solid #334155", color: "#94a3b8", padding: "9px 12px", borderRadius: 8, cursor: "pointer", fontSize: 13, display: "flex", alignItems: "center", gap: 8 },
  main: {
  flex: 1,
  minWidth: 0,
  marginLeft: 230,
  minHeight: "100vh",
},
};

export default OwnerLayout;