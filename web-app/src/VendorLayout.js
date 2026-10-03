import React from "react";
import { useNavigate, Outlet } from "react-router-dom";

const ROLE_HOME = {
  "Super Admin": "/dashboard",
  "Company Admin": "/admin/dashboard",
  "Regional Manager": "/admin/dashboard",
  "Property Manager": "/pm/dashboard",
  "Tenant": "/tenant/dashboard",
  "Owner": "/owner/dashboard",
  "Vendor": "/vendor/dashboard",
};

function VendorLayout() {
  const navigate = useNavigate();
  const role = sessionStorage.getItem("role");
  const username = sessionStorage.getItem("username") || "Vendor";

  if (role && role !== "Vendor") {
    navigate(ROLE_HOME[role] || "/", { replace: true });
    return null;
  }

  const logout = () => {
    const slug = sessionStorage.getItem("company_slug");
    sessionStorage.clear();
    navigate(slug ? `/portal/${slug}` : "/");
  };

  return (
    <div style={s.shell}>
      <aside style={s.sidebar}>
        <div style={s.brand}>PropOS</div>
        <nav style={{ flex: 1 }}>
          <div style={s.navActive} onClick={() => navigate("/vendor/dashboard")}>
            My Jobs
          </div>
        </nav>
        <div style={s.user}>
          <div style={s.name}>{username}</div>
          <div style={s.roleTxt}>Vendor</div>
        </div>
        <button style={s.logout} onClick={logout}>Sign Out</button>
      </aside>
      <main style={s.main}><Outlet /></main>
    </div>
  );
}

const s = {
  shell: { display: "flex", height: "100vh", fontFamily: "'DM Sans', sans-serif", background: "#f8fafc" },
  sidebar: { width: 230, background: "#0f172a", display: "flex", flexDirection: "column", padding: "24px 16px", boxSizing: "border-box" },
  brand: { color: "#fff", fontSize: 18, fontWeight: 700, letterSpacing: 1, marginBottom: 36, paddingLeft: 8 },
  navActive: { background: "#1e293b", color: "#fff", padding: "10px 12px", borderRadius: 8, cursor: "pointer", fontSize: 14, fontWeight: 500 },
  user: { padding: "12px 8px" },
  name: { color: "#fff", fontSize: 13, fontWeight: 600 },
  roleTxt: { color: "#94a3b8", fontSize: 11, marginTop: 2 },
  logout: { background: "transparent", border: "1px solid #334155", color: "#94a3b8", padding: "9px 12px", borderRadius: 8, cursor: "pointer", fontSize: 13 },
  main: { flex: 1, overflow: "auto" },
};

export default VendorLayout;