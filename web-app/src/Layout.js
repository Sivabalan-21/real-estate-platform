import React from "react";
import { useNavigate, useLocation, Outlet } from "react-router-dom";

function Layout() {
  const navigate  = useNavigate();
  const location  = useLocation();
  const role      = localStorage.getItem("role");
  const username  = localStorage.getItem("username");

  const logout = () => {
    localStorage.clear();
    navigate("/");
  };

  const NAV = [
    { icon: "⊞", label: "Dashboard",       path: "/dashboard"    },
    { icon: "◈", label: "User Management", path: "/users/manage" },
  ];

  return (
    <div style={s.container}>
      <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&display=swap" rel="stylesheet" />

      {/* SIDEBAR */}
      <div style={s.sidebar}>
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
            {(username || "S")[0].toUpperCase()}
          </div>
          <div style={s.userInfo}>
            <p style={s.userInfoName}>{username}</p>
            <p style={s.userInfoRole}>{role}</p>
          </div>
        </div>

        <button style={s.logoutBtn} onClick={logout}>
          <span>⎋</span> Sign Out
        </button>
      </div>

      {/* MAIN CONTENT */}
      <div style={s.main}>
        <div style={s.content}>
          <Outlet />   {/* 🔥 FIX: THIS RENDERS CHILD ROUTES */}
        </div>
      </div>
    </div>
  );
}

const s = {
  container:    { display: "flex", height: "100vh", fontFamily: "'DM Sans', sans-serif" },

  sidebar:      {
    width: 230,
    background: "#0f172a",
    display: "flex",
    flexDirection: "column",
    padding: "24px 16px"
  },

  brand:        {
    display: "flex",
    alignItems: "center",
    gap: 10,
    marginBottom: 36,
    paddingLeft: 8
  },

  brandIcon:    { fontSize: 22, color: "#6366f1" },
  brandText:    { color: "#fff", fontSize: 18, fontWeight: 700, letterSpacing: 1 },

  nav:          { display: "flex", flexDirection: "column", gap: 4, flex: 1 },

  navItem:      {
    display: "flex",
    alignItems: "center",
    gap: 10,
    padding: "10px 12px",
    borderRadius: 8,
    color: "#94a3b8",
    cursor: "pointer",
    fontSize: 14,
    fontWeight: 500
  },

  navActive:    { background: "#1e293b", color: "#fff" },
  navIcon:      { fontSize: 16 },

  sidebarUser:  {
    display: "flex",
    alignItems: "center",
    gap: 10,
    padding: "12px 8px",
    marginBottom: 8
  },

  userAvatar:   {
    width: 32,
    height: 32,
    borderRadius: "50%",
    background: "#312e81",
    color: "#a5b4fc",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontWeight: 700,
    fontSize: 13
  },

  userInfo:     { overflow: "hidden" },

  userInfoName: {
    margin: 0,
    fontSize: 13,
    color: "#fff",
    fontWeight: 600
  },

  userInfoRole: {
    margin: "2px 0 0",
    fontSize: 11,
    color: "#94a3b8"
  },

  logoutBtn:    {
    background: "transparent",
    border: "1px solid #334155",
    color: "#94a3b8",
    padding: "9px 12px",
    borderRadius: 8,
    cursor: "pointer",
    fontSize: 13,
    display: "flex",
    alignItems: "center",
    gap: 8
  },

  main:   { flex: 1, overflow: "auto" },

  content: {
    minHeight: "100vh",
    background: "#f8fafc",
    padding: 20
  }
};

export default Layout;