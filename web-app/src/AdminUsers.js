import React, { useEffect, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";

const ROLE_OPTIONS_BY_CURRENT_ROLE = {
  "Company Admin": ["Admin"],
  "Admin": ["Property Manager", "Tenant", "Owner", "Vendor"],
};

const ROLE_META = {
  "Admin":            { color: "#6366f1", bg: "#ede9fe", icon: "🛡️" },
  "Property Manager": { color: "#0ea5e9", bg: "#e0f2fe", icon: "🏢" },
  "Tenant":           { color: "#10b981", bg: "#d1fae5", icon: "🏠" },
  "Vendor":           { color: "#f59e0b", bg: "#fef3c7", icon: "🔧" },
  "Owner":            { color: "#ec4899", bg: "#fce7f3", icon: "👑" },
};

// ─── SHARED UI COMPONENTS ─────────────────────────────────────────────────────
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

function RoleBadge({ role }) {
  const m = ROLE_META[role] || { color: "#64748b", bg: "#f1f5f9", icon: "•" };
  return (
    <span style={{ ...s.badge, background: m.bg, color: m.color }}>
      {m.icon} {role}
    </span>
  );
}

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

// ─── MAIN ─────────────────────────────────────────────────────────────────────
function AdminUsers() {
  const navigate = useNavigate();
  const token    = localStorage.getItem("token");
  const currentRole = localStorage.getItem("role");
  const allowedRoles = ROLE_OPTIONS_BY_CURRENT_ROLE[currentRole] || [];

  const [users,       setUsers]       = useState([]);
  const [loading,     setLoading]     = useState(true);
  const [search,      setSearch]      = useState("");
  const [filterRole,  setFilterRole]  = useState("All");
  const [toast,       setToast]       = useState(null);

  // ── Invite modal
  const [showInvite,   setShowInvite]   = useState(false);
  const [inviteEmail,  setInviteEmail]  = useState("");
  const [inviteRole,   setInviteRole]   = useState("Property Manager");
  const [inviting,     setInviting]     = useState(false);
  const [inviteErr,    setInviteErr]    = useState("");

  // ── Edit modal
  const [editUser,      setEditUser]      = useState(null);
  const [editRole,      setEditRole]      = useState("");
  const [editStatus,    setEditStatus]    = useState("");
  const [editEmail,     setEditEmail]     = useState("");
  const [editEmailErr,  setEditEmailErr]  = useState("");
  const [sendReset,     setSendReset]     = useState(false);
  const [dangerOpen,    setDangerOpen]    = useState(false);
  const [editing,       setEditing]       = useState(false);

  // ── Delete modal
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleting,     setDeleting]     = useState(false);

  // ─── helpers ─────────────────────────────────────────────────────────────
  const showToast = (msg, type = "success") => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3000);
  };

  // Fetches only users in THIS admin's hierarchy
  const fetchUsers = useCallback(async () => {
    try {
      const res = await fetch("http://187.127.180.107/users/my-hierarchy", {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.status === 401) { navigate("/"); return; }
      const data = await res.json();
      const filtered = Array.isArray(data)
        ? data.filter(u => u.role !== "Super Admin")
        : [];
      setUsers(filtered);
    } catch {
      showToast("Failed to load users", "error");
    } finally {
      setLoading(false);
    }
  }, [token, navigate]);

  useEffect(() => {
    if (!token) { navigate("/"); return; }
    fetchUsers();
  }, [fetchUsers, navigate, token]);

  // ─── filtered list ────────────────────────────────────────────────────────
  const filtered = users.filter(u => {
    const matchSearch = !search ||
      u.email?.toLowerCase().includes(search.toLowerCase()) ||
      u.username?.toLowerCase().includes(search.toLowerCase());
    const matchRole = filterRole === "All" || u.role === filterRole;
    return matchSearch && matchRole;
  });

  // ─── INVITE ───────────────────────────────────────────────────────────────
  const handleInvite = async () => {
    if (!inviteEmail.trim()) { setInviteErr("Email is required"); return; }
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(inviteEmail)) { setInviteErr("Enter a valid email address"); return; }

    // ✅ ROLE RESTRICTION — double-check on frontend
    if (!allowedRoles.includes(inviteRole)) {
      setInviteErr("You are not allowed to create this role");
      return;
    }

    setInviting(true);
    setInviteErr("");
    try {
      const res = await fetch("http://187.127.180.107/users/create", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ email: inviteEmail, role: inviteRole })
      });
      const data = await res.json();
      if (!res.ok) { setInviteErr(data.detail || "Failed to send invite"); return; }

      showToast(`Invite sent to ${inviteEmail}`);
      setShowInvite(false);
      setInviteEmail("");
      setInviteRole(allowedRoles[0] || "");
      fetchUsers();
    } catch {
      setInviteErr("Server error. Please try again.");
    } finally {
      setInviting(false);
    }
  };

  // ─── EDIT ─────────────────────────────────────────────────────────────────
  const openEdit = (u) => {
    setEditUser(u);
    setEditRole(u.role);
    setEditStatus(u.status || "active");
    setEditEmail(u.email || "");
    setEditEmailErr("");
    setSendReset(false);
    setDangerOpen(false);
  };

  const handleEdit = async () => {
    if (!allowedRoles.includes(editRole)) {
      showToast("Invalid role selection", "error");
      return;
    }
    if (editEmail && editEmail !== editUser.email) {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(editEmail)) { setEditEmailErr("Enter a valid email address"); return; }
    }
    setEditing(true);
    try {
      const body = { role: editRole, status: editStatus, send_reset: sendReset };
      if (editEmail && editEmail !== editUser.email) body.email = editEmail;
      const res = await fetch(
        `http://187.127.180.107/users/update/${editUser.username || editUser.user_id}`,
  {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`
    },
    body: JSON.stringify(body)
  }
);
      if (!res.ok) { const d = await res.json(); showToast(d.detail || "Update failed", "error"); return; }
      showToast("User updated successfully");
      setEditUser(null);
      fetchUsers();
    } catch {
      showToast("Server error", "error");
    } finally {
      setEditing(false);
    }
  };

  // ─── DELETE ───────────────────────────────────────────────────────────────
  const handleDelete = async () => {
    setDeleting(true);
    try {
      const res = await fetch(`http://187.127.180.107/users/delete/${deleteTarget.user_id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` }
      });
      if (!res.ok) { showToast("Delete failed", "error"); return; }
      showToast(`${deleteTarget.username || deleteTarget.email} deleted`);
      setDeleteTarget(null);
      fetchUsers();
    } catch {
      showToast("Server error", "error");
    } finally {
      setDeleting(false);
    }
  };

  const handleResendRegistration = async (user) => {
    try {
      const res = await fetch(`http://187.127.180.107/users/resend-registration/${user.user_id}`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await res.json();
      if (!res.ok) { showToast(data.detail || "Failed to resend registration link", "error"); return; }
      showToast(`Registration link resent to ${user.email}`);
      fetchUsers();
    } catch {
      showToast("Server error", "error");
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
          <p style={s.pageSub}>{users.length} user{users.length !== 1 ? "s" : ""} in your hierarchy</p>
        </div>
        <button style={s.primaryBtn} onClick={() => { setShowInvite(true); setInviteErr(""); setInviteRole(allowedRoles[0] || ""); }}>
          + Invite User
        </button>
      </div>

      {/* FILTERS */}
      <div style={s.filters}>
        <div style={s.searchWrap}>
          <span style={s.searchIcon}>⌕</span>
          <input
            style={s.searchInput}
            placeholder="Search by name or email…"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
        <div style={s.roleFilters}>
          {["All", ...allowedRoles].map(r => (
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
          <div style={s.emptyState}>
            <p style={s.emptyIcon}>◈</p>
            <p style={s.emptyTitle}>No users found</p>
            <p style={s.emptyDesc}>Invite users for your role hierarchy to get started.</p>
            <button style={s.emptyBtn} onClick={() => { setShowInvite(true); setInviteRole(allowedRoles[0] || ""); }}>+ Invite User</button>
          </div>
        ) : (
          <table style={s.table}>
            <thead>
              <tr style={s.thead}>
                <th style={s.th}>User</th>
                <th style={s.th}>Role</th>
                <th style={s.th}>Status</th>
                <th style={s.th}>Joined</th>
                <th style={{ ...s.th, textAlign: "right" }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((u, i) => (
                <tr key={u.user_id || i} style={s.tr}>
                  <td style={s.td}>
                    <div style={s.userCell}>
                      <div style={{ ...s.avatar, background: ROLE_META[u.role]?.bg || "#f1f5f9", color: ROLE_META[u.role]?.color || "#64748b" }}>
                        {(u.username || u.email || "?")[0].toUpperCase()}
                      </div>
                      <div>
                        <p style={s.userName}>{u.username || <span style={s.pending}>Pending registration</span>}</p>
                        <p style={s.userEmail}>{u.email}</p>
                      </div>
                    </div>
                  </td>
                  <td style={s.td}><RoleBadge role={u.role} /></td>
                  <td style={s.td}><StatusBadge status={u.status || "pending"} /></td>
                  <td style={s.td}>
                    <span style={s.date}>
                      {u.created_at ? new Date(u.created_at).toLocaleDateString() : "—"}
                    </span>
                  </td>
                  <td style={{ ...s.td, textAlign: "right" }}>
                    {(u.status === "invited" || !u.username) && (
                      <button style={s.resendBtn} onClick={() => handleResendRegistration(u)}>Resend</button>
                    )}
                    <button style={s.editBtn}   onClick={() => openEdit(u)}>Edit</button>
                    <button style={s.deleteBtn} onClick={() => setDeleteTarget(u)}>Delete</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* ── INVITE MODAL ─────────────────────────────────────────────────── */}
      {showInvite && (
        <Modal title="Invite New User" onClose={() => setShowInvite(false)}>
          <div style={ms.body}>
            <label style={ms.label}>Email Address <span style={ms.req}>*</span></label>
            <input
              style={{ ...ms.input, ...(inviteErr && !inviteEmail ? ms.inputErr : {}) }}
              placeholder="user@example.com"
              value={inviteEmail}
              onChange={e => { setInviteEmail(e.target.value); setInviteErr(""); }}
              onKeyDown={e => e.key === "Enter" && handleInvite()}
            />

            <label style={ms.label}>Assign Role <span style={ms.req}>*</span></label>
            <select style={ms.input} value={inviteRole} onChange={e => setInviteRole(e.target.value)}>
              {allowedRoles.map(r => <option key={r} value={r}>{r}</option>)}
            </select>

            {/* ✅ ROLE RESTRICTION NOTE */}
            <div style={ms.infoBox}>
              <span style={ms.infoIcon}>ℹ</span>
              <span style={ms.infoText}>
                You can invite: {allowedRoles.join(", ")}.
              </span>
            </div>

            {inviteErr && <p style={ms.errorMsg}>{inviteErr}</p>}

            <div style={ms.footer}>
              <button style={ms.cancelBtn} onClick={() => setShowInvite(false)}>Cancel</button>
              <button style={ms.submitBtn} onClick={handleInvite} disabled={inviting}>
                {inviting ? "Sending…" : "Send Invite"}
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* ── EDIT MODAL ───────────────────────────────────────────────────── */}
      {editUser && (
        <Modal title={`Edit — ${editUser.username || editUser.email}`} onClose={() => setEditUser(null)}>
          <div style={ms.body}>

            {/* EMAIL — editable */}
            <label style={ms.label}>Email Address</label>
            <input
              style={{ ...ms.input, ...(editEmailErr ? ms.inputErr : {}) }}
              value={editEmail}
              placeholder={editUser.email}
              onChange={e => { setEditEmail(e.target.value); setEditEmailErr(""); }}
            />
            {editEmailErr && <p style={{ ...ms.errorMsg, marginTop: -12 }}>{editEmailErr}</p>}

            {/* ROLE */}
            <label style={ms.label}>Role</label>
            <select style={ms.input} value={editRole} onChange={e => setEditRole(e.target.value)}>
              {allowedRoles.map(r => <option key={r} value={r}>{r}</option>)}
            </select>

            {/* STATUS */}
            <label style={ms.label}>Status</label>
            <select style={ms.input} value={editStatus} onChange={e => setEditStatus(e.target.value)}>
              <option value="invited">Invited</option>
              <option value="active">Active</option>
              <option value="suspended">Suspended</option>
            </select>

            {/* SECURITY */}
            <label style={{ ...ms.label, marginBottom: 8 }}>Security</label>
            <div style={ms.securityBox}>
              <label style={ms.checkRow}>
                <input
                  type="checkbox"
                  checked={sendReset}
                  onChange={e => setSendReset(e.target.checked)}
                  style={ms.checkbox}
                />
                <div>
                  <p style={ms.checkTitle}>Send password reset link</p>
                  <p style={ms.checkDesc}>User will receive email to reset password</p>
                </div>
              </label>
            </div>

            {/* DANGER ZONE */}
            <div style={ms.dangerZoneWrap}>
              <button
                style={ms.dangerToggle}
                onClick={() => setDangerOpen(o => !o)}
              >
                <span style={ms.dangerCaret}>{dangerOpen ? "▲" : "▼"}</span>
                DANGER ZONE
              </button>
              {dangerOpen && (
                <div style={ms.dangerBody}>
                  <p style={ms.dangerDesc}>
                    Permanently delete this user. This action cannot be undone and will remove all associated data.
                  </p>
                  <button
                    style={ms.dangerDeleteBtn}
                    onClick={() => { setEditUser(null); setDeleteTarget(editUser); }}
                  >
                    Delete this user
                  </button>
                </div>
              )}
            </div>

            <div style={ms.footer}>
              <button style={ms.cancelBtn} onClick={() => setEditUser(null)}>Cancel</button>
              <button style={ms.submitBtn} onClick={handleEdit} disabled={editing}>
                {editing ? "Saving…" : "Save Changes"}
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* ── DELETE MODAL ─────────────────────────────────────────────────── */}
      {deleteTarget && (
        <Modal title="Confirm Deletion" onClose={() => setDeleteTarget(null)}>
          <div style={ms.body}>
            <p style={ms.deleteMsg}>
              Are you sure you want to delete{" "}
              <strong>{deleteTarget.username || deleteTarget.email}</strong>?
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

// ─── STYLES ──────────────────────────────────────────────────────────────────
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
  avatar:      { width: 34, height: 34, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700, fontSize: 14, flexShrink: 0 },
  userName:    { margin: 0, fontWeight: 600, color: "#0f172a", fontSize: 13 },
  userEmail:   { margin: "2px 0 0", color: "#64748b", fontSize: 12 },
  pending:     { color: "#94a3b8", fontStyle: "italic", fontWeight: 400 },
  badge:       { padding: "3px 10px", borderRadius: 20, fontSize: 11, fontWeight: 600 },
  date:        { color: "#64748b", fontSize: 12 },
  editBtn:     { background: "#ede9fe", color: "#6366f1", border: "none", padding: "5px 12px", borderRadius: 6, cursor: "pointer", fontSize: 12, fontWeight: 600, marginRight: 6 },
  resendBtn:   { background: "#e0f2fe", color: "#0369a1", border: "none", padding: "5px 12px", borderRadius: 6, cursor: "pointer", fontSize: 12, fontWeight: 600, marginRight: 6 },
  deleteBtn:   { background: "#fee2e2", color: "#ef4444", border: "none", padding: "5px 12px", borderRadius: 6, cursor: "pointer", fontSize: 12, fontWeight: 600 },
  empty:       { padding: 40, textAlign: "center", color: "#94a3b8", fontSize: 14 },
  emptyState:  { padding: "60px 40px", textAlign: "center" },
  emptyIcon:   { fontSize: 36, color: "#cbd5e1", margin: "0 0 12px" },
  emptyTitle:  { margin: "0 0 6px", fontSize: 16, fontWeight: 600, color: "#475569" },
  emptyDesc:   { margin: "0 0 20px", fontSize: 13, color: "#94a3b8" },
  emptyBtn:    { background: "#6366f1", color: "#fff", border: "none", padding: "10px 20px", borderRadius: 8, cursor: "pointer", fontWeight: 600, fontSize: 13 },
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
  infoBox:   { display: "flex", alignItems: "flex-start", gap: 8, background: "#f0f9ff", border: "1px solid #bae6fd", borderRadius: 8, padding: "10px 12px", marginBottom: 16 },
  infoIcon:  { color: "#0ea5e9", fontWeight: 700, flexShrink: 0, fontSize: 14 },
  infoText:  { fontSize: 12, color: "#0369a1", lineHeight: 1.5 },
  errorMsg:  { color: "#ef4444", fontSize: 12, marginBottom: 12 },
  deleteMsg: { color: "#475569", fontSize: 14, lineHeight: 1.6, marginBottom: 20 },
  footer:    { display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 16 },
  cancelBtn: { background: "#f1f5f9", color: "#475569", border: "none", padding: "9px 18px", borderRadius: 8, cursor: "pointer", fontSize: 13, fontWeight: 600 },
  submitBtn: { background: "#6366f1", color: "#fff", border: "none", padding: "9px 18px", borderRadius: 8, cursor: "pointer", fontSize: 13, fontWeight: 600 },
  dangerBtn: { background: "#ef4444", color: "#fff", border: "none", padding: "9px 18px", borderRadius: 8, cursor: "pointer", fontSize: 13, fontWeight: 600 },
  // Security section
  securityBox:     { border: "1px solid #e2e8f0", borderRadius: 8, padding: "12px 14px", marginBottom: 16 },
  checkRow:        { display: "flex", alignItems: "flex-start", gap: 10, cursor: "pointer" },
  checkbox:        { marginTop: 2, accentColor: "#6366f1", width: 15, height: 15, flexShrink: 0 },
  checkTitle:      { margin: 0, fontSize: 13, fontWeight: 600, color: "#0f172a" },
  checkDesc:       { margin: "2px 0 0", fontSize: 11, color: "#94a3b8" },
  // Danger zone
  dangerZoneWrap:  { marginBottom: 16 },
  dangerToggle:    { width: "100%", background: "#fff5f5", border: "1px solid #fecaca", color: "#ef4444", padding: "10px 14px", borderRadius: 8, cursor: "pointer", fontSize: 12, fontWeight: 700, textAlign: "left", letterSpacing: .5, display: "flex", alignItems: "center", gap: 8 },
  dangerCaret:     { fontSize: 10 },
  dangerBody:      { border: "1px solid #fecaca", borderTop: "none", borderRadius: "0 0 8px 8px", padding: "14px", background: "#fff" },
  dangerDesc:      { margin: "0 0 12px", fontSize: 12, color: "#64748b", lineHeight: 1.5 },
  dangerDeleteBtn: { background: "#fee2e2", color: "#ef4444", border: "1px solid #fca5a5", padding: "8px 16px", borderRadius: 6, cursor: "pointer", fontSize: 12, fontWeight: 700 },
};

export default AdminUsers;
