import React, { useEffect, useState } from "react";
import { useNavigate, useLocation, Outlet } from "react-router-dom";

const API = "http://187.127.180.107";

// Where each role's own dashboard lives — used to bounce a mismatched role
// away from the Tenant shell instead of rendering it for the wrong user.
const ROLE_HOME = {
  "Super Admin": "/dashboard",
  "Company Admin": "/admin/dashboard",
  "Regional Manager": "/admin/dashboard",
  "Property Manager": "/pm/dashboard",
  "Tenant": "/tenant/dashboard",
  "Owner": "/owner/dashboard",
  "Vendor": "/vendor/dashboard",
};

function useIsMobile(breakpoint = 640) {
  const [isMobile, setIsMobile] = useState(
    typeof window !== "undefined" ? window.innerWidth < breakpoint : false
  );
  useEffect(() => {
    const onResize = () => setIsMobile(window.innerWidth < breakpoint);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [breakpoint]);
  return isMobile;
}

function TenantLayout() {
  const navigate = useNavigate();
  const location = useLocation();
  const username = localStorage.getItem("username");
  const role = localStorage.getItem("role");
  const token = localStorage.getItem("token");
  const isMobile = useIsMobile();

  // The always-visible 230px sidebar ate over half of a 375px screen and
  // clipped/overflowed the rest — this collapses it into a top bar with a
  // slide-in drawer below the mobile breakpoint instead.
  const [drawerOpen, setDrawerOpen] = useState(false);

  // The sidebar should greet a tenant by the display name they chose at
  // registration, not their login username — falls back to username until
  // this loads (or if they never set one).
  const [displayName, setDisplayName] = useState(username);
  const [phone, setPhone] = useState("");
  const [editOpen, setEditOpen] = useState(false);
  const [editForm, setEditForm] = useState({ full_name: "", phone: "" });
  const [editSaving, setEditSaving] = useState(false);
  const [editError, setEditError] = useState("");

  const loadProfile = () => {
    fetch(`${API}/users/me`, { headers: { Authorization: `Bearer ${token}` } })
      .then(res => (res.ok ? res.json() : null))
      .then(data => {
        if (!data) return;
        if (data.full_name) setDisplayName(data.full_name);
        setPhone(data.phone || "");
        setEditForm({ full_name: data.full_name || "", phone: data.phone || "" });
      })
      .catch(() => {});
  };

  useEffect(() => { loadProfile(); }, [token]); // eslint-disable-line react-hooks/exhaustive-deps

  const saveProfile = async () => {
    setEditSaving(true);
    setEditError("");
    try {
      const res = await fetch(`${API}/users/me`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ full_name: editForm.full_name, phone: editForm.phone }),
      });
      const data = await res.json();
      if (!res.ok) {
        setEditError(data.detail || "Couldn't save changes.");
        return;
      }
      setDisplayName(data.full_name || username);
      setPhone(data.phone || "");
      setEditOpen(false);
    } catch {
      setEditError("Server error. Please try again.");
    } finally {
      setEditSaving(false);
    }
  };

  // Guard: only a Tenant should ever see this shell.
  useEffect(() => {
    if (role && role !== "Tenant") {
      navigate(ROLE_HOME[role] || "/", { replace: true });
    }
  }, [role, navigate]);

  const logout = () => {
    const slug = localStorage.getItem("company_slug");
    localStorage.clear();
    navigate(slug ? `/portal/${slug}` : "/");
  };

  const NAV = [
    { icon: "🏠", label: "My Home",     path: "/tenant/dashboard" },
    { icon: "🛠", label: "Maintenance", path: "/tenant/maintenance" },
    { icon: "💳", label: "Payments",    path: "/tenant/payments" },
  ];

  if (role && role !== "Tenant") return null; // redirect effect above is already firing

  const sidebarContent = (
    <>
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
              onClick={() => { navigate(n.path); setDrawerOpen(false); }}
            >
              <span style={s.navIcon}>{n.icon}</span>
              <span>{n.label}</span>
            </div>
          );
        })}
      </nav>

      {/* USER INFO */}
      <div
        style={s.sidebarUser}
        onClick={() => { setEditForm({ full_name: displayName || "", phone }); setEditError(""); setEditOpen(true); }}
        title="Edit profile"
      >
        <div style={s.userAvatar}>
          {(displayName || "T")[0].toUpperCase()}
        </div>
        <div style={s.userInfo}>
          <p style={s.userInfoName}>{displayName}</p>
          <p style={s.userInfoRole}>Tenant</p>
        </div>
        <span style={s.editPencil}>✎</span>
      </div>

      <button style={s.logoutBtn} onClick={logout}>
        <span>⎋</span> Sign Out
      </button>
    </>
  );

  return (
    <div style={isMobile ? s.shellMobile : s.shell}>
      <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&display=swap" rel="stylesheet" />

      {isMobile ? (
        <>
          {/* MOBILE TOP BAR */}
          <div style={s.topBar}>
            <button style={s.hamburgerBtn} onClick={() => setDrawerOpen(true)} aria-label="Open menu">☰</button>
            <div style={s.topBarBrand}>
              <span style={s.brandIcon}>⬡</span>
              <span style={s.brandText}>PropOS</span>
            </div>
            <div style={{ width: 32 }} /> {/* balances the hamburger for centered brand */}
          </div>

          {/* SLIDE-IN DRAWER */}
          {drawerOpen && (
            <div style={s.drawerOverlay} onClick={() => setDrawerOpen(false)}>
              <aside style={s.drawerPanel} onClick={e => e.stopPropagation()}>
                {sidebarContent}
              </aside>
            </div>
          )}
        </>
      ) : (
        /* DESKTOP SIDEBAR */
        <aside style={s.sidebar}>{sidebarContent}</aside>
      )}

      {/* MAIN */}
      <main style={isMobile ? s.mainMobile : s.main}>
        <Outlet />
      </main>

      {/* EDIT PROFILE MODAL */}
      {editOpen && (
        <div style={s.modalOverlay} onClick={() => !editSaving && setEditOpen(false)}>
          <div style={s.modalCard} onClick={e => e.stopPropagation()}>
            <h3 style={s.modalTitle}>Edit Profile</h3>

            <label style={s.modalLabel}>Display Name</label>
            <input
              style={s.modalInput}
              value={editForm.full_name}
              onChange={e => setEditForm(f => ({ ...f, full_name: e.target.value }))}
              placeholder="What should we call you?"
            />

            <label style={s.modalLabel}>Phone</label>
            <input
              style={s.modalInput}
              value={editForm.phone}
              onChange={e => setEditForm(f => ({ ...f, phone: e.target.value }))}
              placeholder="+1 (555) 000-0000"
            />

            {editError && <p style={s.modalError}>{editError}</p>}

            <div style={s.modalActions}>
              <button style={s.modalCancelBtn} onClick={() => setEditOpen(false)} disabled={editSaving}>
                Cancel
              </button>
              <button style={s.modalSaveBtn} onClick={saveProfile} disabled={editSaving}>
                {editSaving ? "Saving…" : "Save"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

const s = {
  shell:        { display: "flex", height: "100vh", fontFamily: "'DM Sans', sans-serif", background: "#f8fafc" },
  shellMobile:  { display: "flex", flexDirection: "column", minHeight: "100vh", width: "100%", fontFamily: "'DM Sans', sans-serif", background: "#f8fafc", overflowX: "hidden", boxSizing: "border-box" },
  sidebar:      { width: 230, background: "#0f172a", display: "flex", flexDirection: "column", padding: "24px 16px" },

  topBar:       { display: "flex", alignItems: "center", justifyContent: "space-between", background: "#0f172a", padding: "12px 16px", boxSizing: "border-box", width: "100%" },
  hamburgerBtn: { background: "none", border: "none", color: "#fff", fontSize: 20, cursor: "pointer", width: 32, padding: 0 },
  topBarBrand:  { display: "flex", alignItems: "center", gap: 8 },

  drawerOverlay:{ position: "fixed", inset: 0, background: "rgba(15,23,42,0.5)", zIndex: 60, display: "flex" },
  drawerPanel:  { width: 240, maxWidth: "80vw", height: "100%", background: "#0f172a", display: "flex", flexDirection: "column", padding: "24px 16px", boxSizing: "border-box" },

  brand:        { display: "flex", alignItems: "center", gap: 10, marginBottom: 36, paddingLeft: 8 },
  brandIcon:    { fontSize: 22, color: "#6366f1" },
  brandText:    { color: "#fff", fontSize: 18, fontWeight: 700, letterSpacing: 1 },
  nav:          { display: "flex", flexDirection: "column", gap: 4, flex: 1 },
  navItem:      { display: "flex", alignItems: "center", gap: 10, padding: "10px 12px", borderRadius: 8, color: "#94a3b8", cursor: "pointer", fontSize: 14, fontWeight: 500 },
  navActive:    { background: "#1e293b", color: "#fff" },
  navIcon:      { fontSize: 16 },
  sidebarUser:  { display: "flex", alignItems: "center", gap: 10, padding: "12px 8px", marginBottom: 8, borderRadius: 8, cursor: "pointer" },
  userAvatar:   { width: 32, height: 32, borderRadius: "50%", background: "#1e3a5f", color: "#7dd3fc", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700, fontSize: 13, flexShrink: 0 },
  userInfo:     { overflow: "hidden", flex: 1 },
  userInfoName: { margin: 0, fontSize: 13, color: "#fff", fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" },
  userInfoRole: { margin: "2px 0 0", fontSize: 11, color: "#94a3b8" },
  editPencil:   { fontSize: 12, color: "#64748b", flexShrink: 0 },
  logoutBtn:    { background: "transparent", border: "1px solid #334155", color: "#94a3b8", padding: "9px 12px", borderRadius: 8, cursor: "pointer", fontSize: 13, display: "flex", alignItems: "center", gap: 8 },
  main:         { flex: 1, overflow: "auto" },
  mainMobile:   { flex: 1, width: "100%", boxSizing: "border-box", overflowX: "hidden" },

  modalOverlay: { position: "fixed", inset: 0, background: "rgba(15,23,42,0.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 50 },
  modalCard:    { background: "#fff", borderRadius: 14, padding: 28, width: 360, maxWidth: "90vw", boxShadow: "0 20px 40px rgba(0,0,0,0.2)", boxSizing: "border-box" },
  modalTitle:   { margin: "0 0 18px", fontSize: 18, fontWeight: 700, color: "#0f172a" },
  modalLabel:   { display: "block", fontSize: 12, fontWeight: 600, color: "#475569", marginBottom: 6, marginTop: 14 },
  modalInput:   { width: "100%", boxSizing: "border-box", padding: "10px 12px", borderRadius: 8, border: "1px solid #e2e8f0", fontSize: 14, fontFamily: "inherit" },
  modalError:   { color: "#dc2626", fontSize: 13, marginTop: 12, marginBottom: 0 },
  modalActions: { display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 22 },
  modalCancelBtn: { background: "#f1f5f9", border: "none", color: "#475569", padding: "9px 16px", borderRadius: 8, cursor: "pointer", fontSize: 13, fontWeight: 600 },
  modalSaveBtn: { background: "#6366f1", border: "none", color: "#fff", padding: "9px 16px", borderRadius: 8, cursor: "pointer", fontSize: 13, fontWeight: 600 },
};

export default TenantLayout;