import React, { useEffect, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";

// ─── ROLE CONFIG ────────────────────────────────────────────────────────────
const SUPER_ADMIN_CREATE_ROLES = ["Company Admin", "Admin", "Property Manager", "Tenant", "Owner", "Vendor"];
const ROLE_META = {
  "Company Admin":    { color: "#7c3aed", bg: "#f3e8ff", icon: "◆" },
  "Admin":            { color: "#6366f1", bg: "#ede9fe", icon: "🛡️" },
  "Property Manager": { color: "#0ea5e9", bg: "#e0f2fe", icon: "🏢" },
  "Tenant":           { color: "#10b981", bg: "#d1fae5", icon: "🏠" },
  "Vendor":           { color: "#f59e0b", bg: "#fef3c7", icon: "🔧" },
  "Owner":            { color: "#ec4899", bg: "#fce7f3", icon: "👑" },
};

// ─── MODAL ───────────────────────────────────────────────────────────────────
function Modal({ title, onClose, children }) {
  return (
    <div style={ms.overlay} onClick={onClose}>
      <div style={ms.box} onClick={e => e.stopPropagation()}>
        <div style={ms.header}>
          <h3 style={ms.title}>{title}</h3>
          <button style={ms.close} onClick={onClose}>✕</button>
        </div>
        {children}
      </div>
    </div>
  );
}

// ─── STATUS BADGE ─────────────────────────────────────────────────────────────
function StatusBadge({ status }) {
  const map = {
    active:   { bg: "#d1fae5", color: "#065f46", label: "Active"   },
    invited:  { bg: "#e0f2fe", color: "#075985", label: "Invited"  },
    suspended:{ bg: "#fee2e2", color: "#991b1b", label: "Suspended" },
  };
  const cfg = map[status] || map.invited;
  return (
    <span style={{ ...s.badge, background: cfg.bg, color: cfg.color }}>
      {cfg.label}
    </span>
  );
}

// ─── ROLE BADGE ───────────────────────────────────────────────────────────────
function RoleBadge({ role }) {
  const m = ROLE_META[role] || { color: "#64748b", bg: "#f1f5f9", icon: "•" };
  return (
    <span style={{ ...s.badge, background: m.bg, color: m.color }}>
      {m.icon} {role}
    </span>
  );
}

  const ROLE_OPTIONS_BY_CURRENT_ROLE = {
  "Company Admin": ["Admin"],
  "Admin": ["Property Manager", "Tenant", "Owner", "Vendor"],
};
const VISIBLE_ROLES_BY_CURRENT_ROLE = {
  "Super Admin": ["Company Admin", "Admin", "Property Manager", "Tenant", "Owner", "Vendor"],
  "Company Admin": ["Admin", "Property Manager", "Tenant", "Owner", "Vendor"],
  "Admin": ["Property Manager", "Tenant", "Owner", "Vendor"],
};

// ─── MAIN COMPONENT ──────────────────────────────────────────────────────────
function ViewUsers() {

  const currentRole = localStorage.getItem("role");
  const allowedRoles = ROLE_OPTIONS_BY_CURRENT_ROLE[currentRole] || [];

  const canEdit = (targetRole) => {
    if (currentRole === "Admin" && targetRole === "Company Admin") {
    return false;
  }
  return true;
};

  const navigate = useNavigate();
  const token    = localStorage.getItem("token");

  const [users,      setUsers]      = useState([]);
  const [loading,    setLoading]    = useState(true);
  const [search,     setSearch]     = useState("");
  const [filterRole, setFilterRole] = useState("All");
  const [toast,      setToast]      = useState(null);

  // CREATE modal state
  const [showCreate,  setShowCreate]  = useState(false);
  const [createEmail, setCreateEmail] = useState("");
  const [selectedCompanyId, setSelectedCompanyId] = useState("");
  const [companies, setCompanies] = useState([]);
  const [createRole,  setCreateRole]  = useState("Company Admin");
  const [creating,    setCreating]    = useState(false);
  const [createErr,   setCreateErr]   = useState("");

  // EDIT modal state
  const [editUser,           setEditUser]           = useState(null);
  const [editRole,           setEditRole]           = useState("");
  const [editStatus,         setEditStatus]         = useState("");
  const [editEmail,          setEditEmail]          = useState("");
  const [editSendReset,      setEditSendReset]      = useState(false);
  const [editErr,            setEditErr]            = useState("");
  const [editing,            setEditing]            = useState(false);
  const [showDangerZone,     setShowDangerZone]     = useState(false);

  // DELETE confirm state
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleting,     setDeleting]     = useState(false);

  // ── helpers ──────────────────────────────────────────────────────────────
  const showToast = (msg, type = "success") => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3500);
  };

  const fetchUsers = useCallback(async () => {
    try {
      const res = await fetch("http://194.164.149.22/api/users/my-hierarchy", {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.status === 401) { 
        navigate("/"); 
        return; 
      }
      if (!res.ok) {
        return; // don't logout on 403/500 — just skip
      }
      const data = await res.json();
      setUsers(Array.isArray(data) ? data : []);
    } catch {
      showToast("Failed to fetch users", "error");
      // no navigate() here — network error ≠ logout
    } finally {
      setLoading(false);
    }
  }, [token, navigate]);

  useEffect(() => { 
    // Detect if another tab clears localStorage (logout/session wipe)
    const handleStorageChange = (e) => {
      if (e.key === "token" && !e.newValue) {
        // Token was removed in another tab — don't auto-logout this tab
        // Just stop polling, the user is still active here
      }
    };
    window.addEventListener("storage", handleStorageChange);

    fetchUsers();

    // ── AUTO-REFRESH ──────────────────────────────────────────────────────
    // Only poll on the Super Admin screen — other roles must not be affected.
    let interval = null;
    if (currentRole === "Super Admin") {
      interval = setInterval(() => {
        // Only poll if this tab is currently active
        // Prevents background tabs from triggering state changes
        if (!document.hidden) {
          fetchUsers();
        }
      }, 30000);
    }

    fetch("http://194.164.149.22/api/companies", {
      headers: {
        Authorization: `Bearer ${token}`
      }
    })
      .then(res => res.json())
      .then(data => {
  if (Array.isArray(data)) {
    setCompanies(data);
  } else {
    setCompanies([]);
  }
})
    // Clear the interval when the component unmounts (only set for Super Admin)
    return () => { 
      if (interval) clearInterval(interval);
      window.removeEventListener("storage", handleStorageChange);
    };

  }, [fetchUsers, navigate, token,currentRole]);

  // ── filtered list ─────────────────────────────────────────────────────────
  const filtered = users.filter(u => {
    const matchSearch = !search ||
  u.email?.toLowerCase().includes(search.toLowerCase()) ||
  u.username?.toLowerCase().includes(search.toLowerCase()) ||
  u.company_name?.toLowerCase().includes(search.toLowerCase());
const matchRole = filterRole === "All" || u.role === filterRole;
return matchSearch && matchRole;
});

  // ── CREATE ────────────────────────────────────────────────────────────────
  const handleCreate = async () => {
    if (!createEmail.trim()) { setCreateErr("Email is required"); return; }
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(createEmail)) { setCreateErr("Enter a valid email address"); return; }
    if (
      createRole !== "Company Admin" &&
      currentRole === "Super Admin" &&
      !selectedCompanyId
    ) {
      setCreateErr("Please select a company");
      return;
    }

    setCreating(true);
    setCreateErr("");
    try {
      const res = await fetch("http://194.164.149.22/api/users/create", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          email: createEmail,
          role: createRole,
          company_id: createRole !== "Company Admin" ? selectedCompanyId : null
        })
      });
      const data = await res.json();

      if (!res.ok) {
        if (Array.isArray(data.detail)) {
          setCreateErr(data.detail[0]?.msg || "Validation error");
        } else {
          setCreateErr(data.detail || "Failed to send invite");
        }
        return;
      }

      showToast(`Invite sent to ${createEmail}`);
      setShowCreate(false);
      setCreateEmail("");
      setSelectedCompanyId("");
      setCreateRole("Company Admin");
      fetchUsers();
    } catch {
      setCreateErr("Could not reach the server. Please check your connection.");
    } finally {
      setCreating(false);
    }
  };

  // ── EDIT ──────────────────────────────────────────────────────────────────
  const openEdit = (u) => {
    setEditUser(u);
    setEditRole(u.role);
    setEditStatus(u.status || "active");
    setEditEmail(u.email || "");
    setEditSendReset(false);
    setEditErr("");
    setShowDangerZone(false);
  };

  const handleEdit = async () => {
    setEditErr("");
    if (editEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(editEmail)) {
      setEditErr("Enter a valid email address"); return;
    }
    setEditing(true);
    try {
      const body = {
        role:       editRole,
        status:     editStatus,
        send_reset: editSendReset,
      };
      if (editEmail && editEmail !== editUser.email) body.email = editEmail;

      const url = `http://194.164.149.22/api/users/update/${editUser.username || editUser.user_id}`;

      const res = await fetch(url, {
        method: "PUT",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify(body)
      });

      if (!res.ok) {
        const data = await res.json();

        // Only force-logout on 401 (token expired/invalid)
        if (res.status === 401) {
          const companySlug = localStorage.getItem("company_slug");
          localStorage.clear();
          navigate(companySlug ? `/portal/${companySlug}` : "/");
          return;
        }

        // For 400/403/404 — show the error message, DO NOT logout
        setEditErr(data.detail || "Failed to update user");
        return;
      }

      showToast("User updated successfully");
      setEditUser(null);
      fetchUsers();
    } catch {
      showToast("Could not reach the server", "error");
    } finally {
      setEditing(false);
    }
  };

  // ── DELETE ────────────────────────────────────────────────────────────────
  const handleDelete = async () => {
    setDeleting(true);
    try {
      const res = await fetch(`http://194.164.149.22/api/users/delete/${deleteTarget.user_id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` }
      });
      if (!res.ok) {

        const data = await res.json();

  showToast(
    data.detail || "Delete failed",
    "error"
  );

  return;
}
      showToast(`User deleted`);
      setDeleteTarget(null);
      fetchUsers();
    } catch {
      showToast("Could not reach the server", "error");
    } finally {
      setDeleting(false);
    }
  };

  const handleResendRegistration = async (user) => {
    try {
      const res = await fetch(`http://194.164.149.22/api/users/resend-registration/${user.user_id}`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await res.json();
      if (!res.ok) { showToast(data.detail || "Failed to resend registration link", "error"); return; }
      showToast(`Registration link resent to ${user.email}`);
      fetchUsers();
    } catch {
      showToast("Could not reach the server", "error");
    }
  };

  // ─── RENDER ───────────────────────────────────────────────────────────────
  return (
    <div style={s.page}>
      <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&display=swap" rel="stylesheet" />

      {/* TOAST */}
      {toast && (
        <div style={{ ...s.toast, background: toast.type === "error" ? "#ef4444" : "#10b981" }}>
          {toast.msg}
        </div>
      )}

      {/* HEADER */}
      <div style={s.header}>
        <div>
          <h2 style={s.pageTitle}>User Management</h2>
          <p style={s.pageSub}>{users.length} total users across all roles</p>
        </div>
        <button style={s.primaryBtn} onClick={() => { setShowCreate(true); setCreateErr(""); setCreateEmail(""); setSelectedCompanyId(""); setCreateRole("Company Admin"); }}>
          + Invite User
        </button>
      </div>

      {/* FILTERS */}
      <div style={s.filters}>
        <div style={s.searchWrap}>
          <span style={s.searchIcon}>⌕</span>
          <input
            style={s.searchInput}
            placeholder="Search by name, email or company…"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
        <div style={s.roleFilters}>
  {["All", ...(VISIBLE_ROLES_BY_CURRENT_ROLE[currentRole] || [])].map(r => (
    <button
      key={r}
      style={{ ...s.filterBtn, ...(filterRole === r ? s.filterActive : {}) }}
      onClick={() => setFilterRole(r)}
    >
      {r === "All" ? "All Roles" : r}
    </button>
  ))}
</div>
      </div>

      {/* TABLE */}
      <div style={s.tableWrap}>
        {loading ? (
          <div style={s.empty}>Loading users…</div>
        ) : filtered.length === 0 ? (
          <div style={s.empty}>No users found</div>
        ) : (
          <table style={s.table}>
            <thead>
              <tr style={s.thead}>
                <th style={s.th}>User</th>
                <th style={s.th}>Role</th>
                <th style={s.th}>Status</th>
                <th style={s.th}>Joined</th>
                <th style={s.th}>Company</th>
                <th style={s.th}>Company Code</th>
                <th style={{ ...s.th, textAlign: "right" }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((u, i) => (
                <tr key={u.user_id || i} style={s.tr}>
                  <td style={s.td}>
                    <div style={s.userCell}>
                      <div style={s.avatar}>
                        {(u.username || u.email || "?")[0].toUpperCase()}
                      </div>
                      <div>
                        <p style={s.userName}>{u.username || "—"}</p>
                        <p style={s.userEmail}>{u.email}</p>
                      </div>
                    </div>
                  </td>
                  <td style={s.td}><RoleBadge role={u.role} /></td>

                  <td style={s.td}>
                    <StatusBadge status={u.status || "invited"} />
                  </td>

                  <td style={s.td}>
                    {u.created_at
    ? new Date(u.created_at).toLocaleDateString()
    : "—"}
</td>

                  <td style={s.td}>
                    {u.company_name || "—"}
                  </td>

                  <td style={s.td}>
                    {u.company_code
                      ? <span style={s.codeChip}>{u.company_code}</span>
                      : <span style={{ color: "#94a3b8" }}>—</span>
                    }
                  </td>
                  
                  <td style={{ ...s.td, textAlign: "right" }}>
                    <div style={s.actionsCell}>
                      {u.status === "invited" && (
                        <button 
                          style={s.resendBtn} 
                          onClick={() => handleResendRegistration(u)}
                          title="Resend invitation email"
                        >
                          Resend
                        </button>
                      )}
                      {canEdit(u.role) && (
                        <button 
                          style={s.editBtn} 
                          onClick={() => openEdit(u)}
                          title="Edit user details"
                        >
                          Edit
                        </button>
                      )}
                      {canEdit(u.role) && (
                        <button 
                          style={s.deleteBtn} 
                          onClick={() => setDeleteTarget(u)}
                          title="Delete user"
                        >
                          Delete
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* ── CREATE MODAL ─────────────────────────────────────────────────── */}
      {showCreate && (
        <Modal title="Invite New User" onClose={() => setShowCreate(false)}>
          <div style={ms.body}>
            <label style={ms.label}>Email Address <span style={ms.req}>*</span></label>
            <input
              style={{ ...ms.input, ...(createErr && !createEmail ? ms.inputErr : {}) }}
              placeholder="user@example.com"
              value={createEmail}
              onChange={e => { setCreateEmail(e.target.value); setCreateErr(""); }}
              onKeyDown={e => e.key === "Enter" && handleCreate()}
              autoFocus
            />

            <label style={ms.label}>Assign Role <span style={ms.req}>*</span></label>
            <select style={ms.input} value={createRole} onChange={e => setCreateRole(e.target.value)}>
              {SUPER_ADMIN_CREATE_ROLES.map(r => <option key={r}>{r}</option>)}
            </select>

           {createRole !== "Company Admin" && (
  <>
    <label style={ms.label}>
      Select Company <span style={ms.req}>*</span>
    </label>

    <select
      style={{
        ...ms.input,
        ...(String(createErr).toLowerCase().includes("company")
          ? ms.inputErr
          : {})
      }}
      value={selectedCompanyId}
      onChange={(e) => {
        setSelectedCompanyId(e.target.value);
        setCreateErr("");
      }}
    >
      <option value="">
        Choose company
      </option>

      {Array.isArray(companies) &&
        companies.map((c) => (
        <option
          key={c.id}
          value={c.id}
        >
          {c.name}
        </option>
      ))}
    </select>
  </>
)}

            {createErr && <p style={ms.errorMsg}>{createErr}</p>}

            <div style={ms.footer}>
              <button style={ms.cancelBtn} onClick={() => setShowCreate(false)}>Cancel</button>
              <button style={ms.submitBtn} onClick={handleCreate} disabled={creating}>
                {creating ? "Sending…" : "Send Invite"}
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* ── EDIT MODAL ───────────────────────────────────────────────────── */}
      {editUser && (
        <Modal title={`Edit — ${editUser.username || editUser.email}`} onClose={() => setEditUser(null)}>
          <div style={ms.body}>

            {/* ── Identity ── */}
            <label style={ms.label}>Email Address</label>
            <input
              style={{ ...ms.input, ...(editErr && editErr.includes("email") ? ms.inputErr : {}) }}
              value={editEmail}
              placeholder={editUser.email}
              onChange={e => { setEditEmail(e.target.value); setEditErr(""); }}
            />

            {/* ── Access & Role ── */}
            <label style={ms.label}>Role</label>
            <select style={ms.input} value={editRole} onChange={e => setEditRole(e.target.value)}>
              {SUPER_ADMIN_CREATE_ROLES.map(r => <option key={r}>{r}</option>)}
            </select>

            <label style={ms.label}>Status</label>
            <select style={ms.input} value={editStatus} onChange={e => setEditStatus(e.target.value)}>
              <option value="invited">Invited</option>
              <option value="active">Active</option>
              <option value="suspended">Suspended</option>
            </select>
            {/* ── Security Action ── */}
<label style={{ ...ms.label, marginTop: 4 }}>Security</label>

<div style={ms.checkGroup}>
  <label style={ms.checkRow}>
    <input
      type="checkbox"
      checked={editSendReset}
      onChange={(e) => setEditSendReset(e.target.checked)}
      style={ms.checkbox}
    />
    <span style={ms.checkText}>
      <strong>Send password reset link</strong>
      <small>User will receive email to reset password</small>
    </span>
  </label>
</div>

            {/* ── Danger Zone ── */}
            <div style={ms.dangerZoneWrap}>
              <button
                style={ms.dangerZoneToggle}
                onClick={() => setShowDangerZone(p => !p)}
              >
                {showDangerZone ? "▲" : "▼"} Danger Zone
              </button>
              {showDangerZone && (
                <div style={ms.dangerZoneBody}>
                  <p style={ms.dangerZoneDesc}>
                    Deleting <strong>{editUser.username || editUser.email}</strong> is permanent and cannot be undone.
                  </p>
                  <button
                    style={ms.dangerBtn}
                    onClick={() => { setEditUser(null); setDeleteTarget(editUser); }}
                  >
                    Delete this user
                  </button>
                </div>
              )}
            </div>

            {editErr && <p style={ms.errorMsg}>{editErr}</p>}

            <div style={ms.footer}>
              <button style={ms.cancelBtn} onClick={() => setEditUser(null)}>Cancel</button>
              <button style={ms.submitBtn} onClick={handleEdit} disabled={editing}>
                {editing ? "Saving…" : "Save Changes"}
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* ── DELETE CONFIRM MODAL ─────────────────────────────────────────── */}
      {deleteTarget && (
        <Modal title="Confirm Deletion" onClose={() => setDeleteTarget(null)}>
          <div style={ms.body}>
            <p style={ms.deleteMsg}>
              Are you sure you want to delete <strong>{deleteTarget.username || deleteTarget.email}</strong>?
              This action cannot be undone.
            </p>
            <div style={ms.footer}>
              <button style={ms.cancelBtn} onClick={() => setDeleteTarget(null)}>Cancel</button>
              <button style={ms.dangerBtn} onClick={handleDelete} disabled={deleting}>
                {deleting ? "Deleting…" : "Delete User"}
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}

// ─── STYLES ───────────────────────────────────────────────────────────────────
const s = {
  page:        { padding: "32px", background: "#f8fafc", minHeight: "100vh", fontFamily: "'DM Sans', sans-serif" },
  header:      { display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 24 },
  pageTitle:   { margin: 0, fontSize: 24, fontWeight: 700, color: "#0f172a" },
  pageSub:     { margin: "4px 0 0", fontSize: 13, color: "#64748b" },
  primaryBtn:  { background: "#6366f1", color: "#fff", border: "none", padding: "10px 20px", borderRadius: 8, cursor: "pointer", fontWeight: 600, fontSize: 14 },
  filters:     { display: "flex", gap: 12, marginBottom: 20, flexWrap: "wrap", alignItems: "center" },
  searchWrap:  { position: "relative", flex: "0 0 280px" },
  searchIcon:  { position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", color: "#94a3b8", fontSize: 18 },
  searchInput: { width: "100%", padding: "9px 12px 9px 36px", border: "1px solid #e2e8f0", borderRadius: 8, fontSize: 13, outline: "none", boxSizing: "border-box" },
  roleFilters: { display: "flex", gap: 6, flexWrap: "wrap" },
  filterBtn:   { padding: "7px 14px", border: "1px solid #e2e8f0", borderRadius: 20, background: "#fff", fontSize: 12, cursor: "pointer", color: "#475569", fontWeight: 500 },
  filterActive:{ background: "#6366f1", borderColor: "#6366f1", color: "#fff" },
  tableWrap:   { background: "#fff", borderRadius: 12, boxShadow: "0 1px 4px rgba(0,0,0,.06)", overflow: "hidden" },
  table:       { width: "100%", borderCollapse: "collapse" },
  thead:       { background: "#f8fafc" },
  th:          { padding: "12px 16px", fontSize: 12, fontWeight: 600, color: "#64748b", textAlign: "left", textTransform: "uppercase", letterSpacing: .5 },
  tr:          { borderTop: "1px solid #f1f5f9" },
  td:          { padding: "14px 16px", verticalAlign: "middle", fontSize: 13 },
  userCell:    { display: "flex", alignItems: "center", gap: 10 },
  avatar:      { width: 34, height: 34, borderRadius: "50%", background: "#ede9fe", color: "#6366f1", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700, fontSize: 14, flexShrink: 0 },
  userName:    { margin: 0, fontWeight: 600, color: "#0f172a", fontSize: 13 },
  userEmail:   { margin: "2px 0 0", color: "#64748b", fontSize: 12 },
  badge:       { padding: "3px 10px", borderRadius: 20, fontSize: 11, fontWeight: 600 },
  date:        { color: "#64748b", fontSize: 12 },
  actionsCell: { display: "flex", gap: 6, justifyContent: "flex-end", alignItems: "center" },
  editBtn:     { background: "#ede9fe", color: "#6366f1", border: "none", padding: "5px 12px", borderRadius: 6, cursor: "pointer", fontSize: 12, fontWeight: 600, transition: "all 0.2s" },
  resendBtn:   { background: "#e0f2fe", color: "#0369a1", border: "none", padding: "5px 12px", borderRadius: 6, cursor: "pointer", fontSize: 12, fontWeight: 600, transition: "all 0.2s" },
  deleteBtn:   { background: "#fee2e2", color: "#ef4444", border: "none", padding: "5px 12px", borderRadius: 6, cursor: "pointer", fontSize: 12, fontWeight: 600, transition: "all 0.2s" },
  empty:       { padding: 40, textAlign: "center", color: "#94a3b8", fontSize: 14 },
  codeChip:    { display: "inline-block", padding: "2px 8px", borderRadius: 4, background: "#f1f5f9", color: "#334155", fontFamily: "monospace", fontSize: 12, fontWeight: 700, letterSpacing: 0.5, border: "1px solid #e2e8f0" },
  toast:       { position: "fixed", top: 20, right: 20, color: "#fff", padding: "12px 20px", borderRadius: 8, fontSize: 13, fontWeight: 600, zIndex: 9999, boxShadow: "0 4px 12px rgba(0,0,0,.15)" },
};

const ms = {
  overlay:   { position: "fixed", inset: 0, background: "rgba(15,23,42,.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000 },
  box:       { background: "#fff", borderRadius: 12, width: 420, boxShadow: "0 20px 60px rgba(0,0,0,.2)", overflow: "hidden" },
  header:    { display: "flex", justifyContent: "space-between", alignItems: "center", padding: "18px 24px", borderBottom: "1px solid #f1f5f9" },
  title:     { margin: 0, fontSize: 16, fontWeight: 700, color: "#0f172a" },
  close:     { background: "none", border: "none", fontSize: 18, cursor: "pointer", color: "#94a3b8", lineHeight: 1 },
  body:      { padding: 24 },
  label:     { display: "block", fontSize: 12, fontWeight: 600, color: "#475569", marginBottom: 6, textTransform: "uppercase", letterSpacing: .5 },
  req:       { color: "#ef4444" },
  input:     { width: "100%", padding: "10px 12px", border: "1px solid #e2e8f0", borderRadius: 8, fontSize: 13, marginBottom: 16, outline: "none", boxSizing: "border-box" },
  inputErr:  { borderColor: "#ef4444" },
  errorMsg:  { color: "#ef4444", fontSize: 12, marginBottom: 12 },
  deleteMsg: { color: "#475569", fontSize: 14, lineHeight: 1.6, marginBottom: 20 },
  footer:    { display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 8 },
  cancelBtn: { background: "#f1f5f9", color: "#475569", border: "none", padding: "9px 18px", borderRadius: 8, cursor: "pointer", fontSize: 13, fontWeight: 600 },
  submitBtn: { background: "#6366f1", color: "#fff", border: "none", padding: "9px 18px", borderRadius: 8, cursor: "pointer", fontSize: 13, fontWeight: 600 },
  dangerBtn:       { background: "#ef4444", color: "#fff", border: "none", padding: "9px 18px", borderRadius: 8, cursor: "pointer", fontSize: 13, fontWeight: 600 },
  checkGroup:      { display: "flex", flexDirection: "column", gap: 10, marginBottom: 16, padding: "12px", background: "#f8fafc", borderRadius: 8, border: "1px solid #e2e8f0" },
  checkRow:        { display: "flex", alignItems: "flex-start", gap: 10, cursor: "pointer" },
  checkbox:        { marginTop: 3, accentColor: "#6366f1", width: 15, height: 15, flexShrink: 0 },
  checkText:       { display: "flex", flexDirection: "column", gap: 2 },
  dangerZoneWrap:  { borderRadius: 8, border: "1px solid #fecaca", overflow: "hidden", marginBottom: 16 },
  dangerZoneToggle:{ width: "100%", background: "#fff5f5", border: "none", padding: "10px 14px", textAlign: "left", fontSize: 12, fontWeight: 700, color: "#dc2626", cursor: "pointer", letterSpacing: ".4px", textTransform: "uppercase" },
  dangerZoneBody:  { padding: "14px 16px", background: "#fff" },
  dangerZoneDesc:  { fontSize: 13, color: "#475569", marginBottom: 12, lineHeight: 1.6 },
};

export default ViewUsers;