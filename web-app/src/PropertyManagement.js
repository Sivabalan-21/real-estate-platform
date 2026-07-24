import React, { useEffect, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";

const API = "http://194.164.149.22/api";

export default function PropertyManagement() {
  const navigate = useNavigate();
  const token    = localStorage.getItem("token");
  const role     = localStorage.getItem("role");
  const isPM     = role === "Property Manager";
  const canManage = ["Admin", "Company Admin", "Super Admin", "Property Manager"].includes(role);

  const [properties,  setProperties]  = useState([]);
  const [me,          setMe]          = useState(null); // current user profile (for quota display)
  const [loading,     setLoading]     = useState(true);
  const [showCreate,  setShowCreate]  = useState(false);
  const [editProp,    setEditProp]    = useState(null);
  const [toast,       setToast]       = useState(null);
  const [deleteTarget,setDeleteTarget]= useState(null);
  const [deleting,    setDeleting]    = useState(false);

  // Create form state
  const [form, setForm] = useState({
    name: "", address: "", description: "", total_units: "", status: "active"
  });
  const [dimensions, setDimensions] = useState([{ name: "", unit: "", value: "" }]);
  const [saving, setSaving] = useState(false);
  const [formErr, setFormErr] = useState("");

  const showToast = (msg, type = "success") => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3500);
  };

  const fetchProperties = useCallback(async () => {
    try {
      const res = await fetch(`${API}/properties`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.status === 401) { navigate("/"); return; }
      const data = await res.json();
      setProperties(Array.isArray(data) ? data : []);
    } catch {
      showToast("Failed to load properties", "error");
    } finally {
      setLoading(false);
    }
  }, [token, navigate]);

  const fetchMe = useCallback(async () => {
    if (!isPM) return;
    try {
      const res = await fetch(`${API}/users/me`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await res.json();
      setMe(data);
    } catch {}
  }, [token, isPM]);

  useEffect(() => {
    fetchProperties();
    fetchMe();
  }, [fetchProperties, fetchMe]);

  const resetForm = () => {
    setForm({ name: "", address: "", description: "", total_units: "", status: "active" });
    setDimensions([{ name: "", unit: "", value: "" }]);
    setFormErr("");
  };

  const addDimension = () => setDimensions(d => [...d, { name: "", unit: "", value: "" }]);
  const removeDimension = (i) => setDimensions(d => d.filter((_, idx) => idx !== i));
  const updateDimension = (i, field, val) => {
    setDimensions(d => d.map((dim, idx) => idx === i ? { ...dim, [field]: val } : dim));
  };

  const handleCreate = async () => {
    if (!form.name.trim()) { setFormErr("Property name is required"); return; }
    const validDims = dimensions.filter(d => d.name.trim() && d.value.trim());
    setSaving(true);
    setFormErr("");
    try {
      const res = await fetch(`${API}/properties`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          name: form.name,
          address: form.address,
          description: form.description,
          total_units: parseInt(form.total_units) || 0,
          status: form.status,
          dimensions: validDims.map(d => ({ name: d.name, unit: d.unit, value: d.value })),
        })
      });
      const data = await res.json();
      if (!res.ok) { setFormErr(data.detail || "Failed to create property"); return; }
      showToast("Property created successfully");
      setShowCreate(false);
      resetForm();
      fetchProperties();
      fetchMe(); // refresh quota display
    } catch {
      setFormErr("Server error. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  const handleEdit = async () => {
    if (!editProp.name.trim()) { setFormErr("Property name is required"); return; }
    setSaving(true);
    setFormErr("");
    try {
      const res = await fetch(`${API}/properties/${editProp.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          name: editProp.name,
          address: editProp.address,
          description: editProp.description,
          total_units: parseInt(editProp.total_units) || 0,
          status: editProp.status,
        })
      });
      const data = await res.json();
      if (!res.ok) { setFormErr(data.detail || "Failed to update property"); return; }
      showToast("Property updated successfully");
      setEditProp(null);
      fetchProperties();
      fetchMe();
    } catch {
      setFormErr("Server error. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    setDeleting(true);
    try {
      const res = await fetch(`${API}/properties/${deleteTarget.id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` }
      });
      if (!res.ok) { const d = await res.json(); showToast(d.detail || "Delete failed", "error"); return; }
      showToast("Property deleted");
      setDeleteTarget(null);
      fetchProperties();
      fetchMe();
    } catch {
      showToast("Server error", "error");
    } finally {
      setDeleting(false);
    }
  };

  const remainingUnits = me ? (me.max_units || 0) - (me.used_units || 0) : null;

  return (
    <div style={s.page}>
      <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&display=swap" rel="stylesheet" />

      {toast && (
        <div style={{ ...s.toast, background: toast.type === "error" ? "#ef4444" : "#10b981" }}>
          {toast.msg}
        </div>
      )}

      {/* HEADER */}
      <div style={s.header}>
        <div>
          <h2 style={s.pageTitle}>Property Management</h2>
          <p style={s.pageSub}>
            {properties.length} {isPM ? "properties you manage" : "properties in your company"}
            {isPM && remainingUnits !== null && (
              <span style={s.quotaBadge}>
                {remainingUnits} unit(s) remaining of {me.max_units || 0}
              </span>
            )}
          </p>
        </div>
        {isPM && (
          <button style={s.primaryBtn} onClick={() => { setShowCreate(true); resetForm(); }}>
            + Add Property
          </button>
        )}
      </div>

      {/* PROPERTY LIST */}
      {loading ? (
        <div style={s.empty}>Loading properties…</div>
      ) : properties.length === 0 ? (
        <div style={s.emptyCard}>
          <p style={s.emptyIcon}>🏢</p>
          <p style={s.emptyTitle}>No properties yet</p>
          <p style={s.emptySub}>
            {isPM ? 'Click "Add Property" to create your first property.' : "No properties have been created yet."}
          </p>
        </div>
      ) : (
        <div style={s.grid}>
          {properties.map(p => (
            <div key={p.id} style={s.card}>
              <div style={s.cardHeader}>
                <div>
                  <h3 style={s.cardTitle}>{p.name}</h3>
                  <p style={s.cardAddress}>{p.address || "No address"}</p>
                </div>
                <span style={{ ...s.statusBadge, background: p.status === "active" ? "#d1fae5" : "#fee2e2", color: p.status === "active" ? "#065f46" : "#991b1b" }}>
                  {p.status}
                </span>
              </div>

              {p.description && <p style={s.cardDesc}>{p.description}</p>}

              {/* Dimensions */}
              {p.dimensions?.length > 0 && (
                <div style={s.dimSection}>
                  <p style={s.dimLabel}>Dimensions</p>
                  <div style={s.dimGrid}>
                    {p.dimensions.map(d => (
                      <div key={d.id} style={s.dimChip}>
                        <span style={s.dimName}>{d.name}</span>
                        <span style={s.dimValue}>{d.value} {d.unit || ""}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Units */}
              <div style={s.unitsRow}>
                <span style={s.unitsLabel}>Total Units</span>
                <span style={s.unitsValue}>{p.total_units}</span>
              </div>

              {/* Owner */}
              <div style={s.assignSection}>
                <p style={s.dimLabel}>Property Manager</p>
                <span style={s.pmChip}>{p.created_by}</span>
              </div>

              {/* Actions */}
              {canManage && (
                <div style={s.cardActions}>
                  <button style={s.editBtn} onClick={() => { setEditProp({ ...p }); setFormErr(""); }}>Edit</button>
                  <button style={s.deleteBtn} onClick={() => setDeleteTarget(p)}>Delete</button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* CREATE MODAL (PM only) */}
      {showCreate && isPM && (
        <div style={ms.overlay} onClick={() => setShowCreate(false)}>
          <div style={ms.box} onClick={e => e.stopPropagation()}>
            <div style={ms.header}>
              <h3 style={ms.title}>Add New Property</h3>
              <button style={ms.close} onClick={() => setShowCreate(false)}>✕</button>
            </div>
            <div style={ms.body}>

              {remainingUnits !== null && (
                <p style={ms.quotaNote}>
                  You have <strong>{remainingUnits}</strong> unit(s) remaining of your {me.max_units || 0} allocated.
                </p>
              )}

              <label style={ms.label}>Property Name <span style={ms.req}>*</span></label>
              <input style={ms.input} placeholder="e.g. Block A, Tower 1" value={form.name}
                onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />

              <label style={ms.label}>Address</label>
              <input style={ms.input} placeholder="Full address" value={form.address}
                onChange={e => setForm(f => ({ ...f, address: e.target.value }))} />

              <label style={ms.label}>Description</label>
              <textarea style={{ ...ms.input, height: 70, resize: "vertical" }} placeholder="Optional description"
                value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} />

              <div style={{ display: "flex", gap: 12 }}>
                <div style={{ flex: 1 }}>
                  <label style={ms.label}>Total Units</label>
                  <input style={ms.input} type="number" placeholder="0" value={form.total_units}
                    onChange={e => setForm(f => ({ ...f, total_units: e.target.value }))} />
                </div>
                <div style={{ flex: 1 }}>
                  <label style={ms.label}>Status</label>
                  <select style={ms.input} value={form.status} onChange={e => setForm(f => ({ ...f, status: e.target.value }))}>
                    <option value="active">Active</option>
                    <option value="inactive">Inactive</option>
                  </select>
                </div>
              </div>

              {/* Dimensions */}
              <label style={{ ...ms.label, marginTop: 4 }}>Dimensions</label>
              {dimensions.map((dim, i) => (
                <div key={i} style={ms.dimRow}>
                  <input style={{ ...ms.input, marginBottom: 0, flex: 2 }} placeholder="Name (e.g. Square Feet)"
                    value={dim.name} onChange={e => updateDimension(i, "name", e.target.value)} />
                  <input style={{ ...ms.input, marginBottom: 0, flex: 1 }} placeholder="Unit (e.g. sqft)"
                    value={dim.unit} onChange={e => updateDimension(i, "unit", e.target.value)} />
                  <input style={{ ...ms.input, marginBottom: 0, flex: 1 }} placeholder="Value"
                    value={dim.value} onChange={e => updateDimension(i, "value", e.target.value)} />
                  {dimensions.length > 1 && (
                    <button style={ms.removeDimBtn} onClick={() => removeDimension(i)}>✕</button>
                  )}
                </div>
              ))}
              <button style={ms.addDimBtn} onClick={addDimension}>+ Add Dimension</button>

              {formErr && <p style={ms.errorMsg}>{formErr}</p>}

              <div style={ms.footer}>
                <button style={ms.cancelBtn} onClick={() => setShowCreate(false)}>Cancel</button>
                <button style={ms.submitBtn} onClick={handleCreate} disabled={saving}>
                  {saving ? "Creating…" : "Create Property"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* EDIT MODAL */}
      {editProp && (
        <div style={ms.overlay} onClick={() => setEditProp(null)}>
          <div style={ms.box} onClick={e => e.stopPropagation()}>
            <div style={ms.header}>
              <h3 style={ms.title}>Edit Property</h3>
              <button style={ms.close} onClick={() => setEditProp(null)}>✕</button>
            </div>
            <div style={ms.body}>

              <label style={ms.label}>Property Name <span style={ms.req}>*</span></label>
              <input style={ms.input} value={editProp.name}
                onChange={e => setEditProp(p => ({ ...p, name: e.target.value }))} />

              <label style={ms.label}>Address</label>
              <input style={ms.input} value={editProp.address || ""}
                onChange={e => setEditProp(p => ({ ...p, address: e.target.value }))} />

              <label style={ms.label}>Description</label>
              <textarea style={{ ...ms.input, height: 70, resize: "vertical" }}
                value={editProp.description || ""}
                onChange={e => setEditProp(p => ({ ...p, description: e.target.value }))} />

              <div style={{ display: "flex", gap: 12 }}>
                <div style={{ flex: 1 }}>
                  <label style={ms.label}>Total Units</label>
                  <input style={ms.input} type="number" value={editProp.total_units || 0}
                    onChange={e => setEditProp(p => ({ ...p, total_units: e.target.value }))} />
                </div>
                <div style={{ flex: 1 }}>
                  <label style={ms.label}>Status</label>
                  <select style={ms.input} value={editProp.status}
                    onChange={e => setEditProp(p => ({ ...p, status: e.target.value }))}>
                    <option value="active">Active</option>
                    <option value="inactive">Inactive</option>
                  </select>
                </div>
              </div>

              {formErr && <p style={ms.errorMsg}>{formErr}</p>}

              <div style={ms.footer}>
                <button style={ms.cancelBtn} onClick={() => setEditProp(null)}>Cancel</button>
                <button style={ms.submitBtn} onClick={handleEdit} disabled={saving}>
                  {saving ? "Saving…" : "Save Changes"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* DELETE CONFIRM */}
      {deleteTarget && (
        <div style={ms.overlay} onClick={() => setDeleteTarget(null)}>
          <div style={{ ...ms.box, maxWidth: 400 }} onClick={e => e.stopPropagation()}>
            <div style={ms.header}>
              <h3 style={ms.title}>Delete Property</h3>
              <button style={ms.close} onClick={() => setDeleteTarget(null)}>✕</button>
            </div>
            <div style={ms.body}>
              <p style={{ fontSize: 14, color: "#475569", marginBottom: 20 }}>
                Are you sure you want to delete <strong>{deleteTarget.name}</strong>? This cannot be undone.
              </p>
              <div style={ms.footer}>
                <button style={ms.cancelBtn} onClick={() => setDeleteTarget(null)}>Cancel</button>
                <button style={{ ...ms.submitBtn, background: "#ef4444" }} onClick={handleDelete} disabled={deleting}>
                  {deleting ? "Deleting…" : "Delete"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

const s = {
  page:        { padding: 32, background: "#f8fafc", minHeight: "100vh", fontFamily: "'DM Sans', sans-serif" },
  header:      { display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 24 },
  pageTitle:   { margin: 0, fontSize: 24, fontWeight: 700, color: "#0f172a" },
  pageSub:     { margin: "4px 0 0", fontSize: 13, color: "#64748b" },
  quotaBadge:  { marginLeft: 10, background: "#ede9fe", color: "#6366f1", padding: "2px 10px", borderRadius: 20, fontSize: 12, fontWeight: 600 },
  primaryBtn:  { background: "#6366f1", color: "#fff", border: "none", padding: "10px 20px", borderRadius: 8, cursor: "pointer", fontWeight: 600, fontSize: 14 },
  empty:       { textAlign: "center", color: "#94a3b8", padding: 40, fontSize: 14 },
  emptyCard:   { background: "#fff", borderRadius: 12, border: "1px solid #e2e8f0", padding: "60px 20px", textAlign: "center" },
  emptyIcon:   { fontSize: 40, margin: "0 0 12px" },
  emptyTitle:  { fontSize: 16, fontWeight: 700, color: "#0f172a", margin: "0 0 6px" },
  emptySub:    { fontSize: 13, color: "#64748b", margin: 0 },
  grid:        { display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(340px, 1fr))", gap: 20 },
  card:        { background: "#fff", borderRadius: 12, border: "1px solid #e2e8f0", padding: 20, boxShadow: "0 1px 4px rgba(0,0,0,.04)" },
  cardHeader:  { display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 8 },
  cardTitle:   { margin: 0, fontSize: 16, fontWeight: 700, color: "#0f172a" },
  cardAddress: { margin: "2px 0 0", fontSize: 12, color: "#64748b" },
  cardDesc:    { fontSize: 13, color: "#475569", margin: "8px 0", lineHeight: 1.5 },
  statusBadge: { padding: "3px 10px", borderRadius: 20, fontSize: 11, fontWeight: 600, flexShrink: 0 },
  dimSection:  { marginTop: 12 },
  dimLabel:    { fontSize: 11, fontWeight: 600, color: "#94a3b8", textTransform: "uppercase", letterSpacing: 0.5, margin: "0 0 6px" },
  dimGrid:     { display: "flex", flexWrap: "wrap", gap: 6 },
  dimChip:     { background: "#f1f5f9", borderRadius: 6, padding: "4px 10px", fontSize: 12, display: "flex", gap: 6, alignItems: "center" },
  dimName:     { color: "#475569", fontWeight: 600 },
  dimValue:    { color: "#6366f1", fontWeight: 700 },
  unitsRow:    { display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 12, padding: "8px 0", borderTop: "1px solid #f1f5f9" },
  unitsLabel:  { fontSize: 12, color: "#64748b" },
  unitsValue:  { fontSize: 14, fontWeight: 700, color: "#0f172a" },
  assignSection:{ marginTop: 12, paddingTop: 12, borderTop: "1px solid #f1f5f9" },
  pmChip:      { background: "#ede9fe", color: "#6366f1", padding: "3px 10px", borderRadius: 20, fontSize: 12, fontWeight: 600 },
  notAssigned: { fontSize: 12, color: "#94a3b8", margin: "4px 0" },
  cardActions: { display: "flex", gap: 8, marginTop: 14, justifyContent: "flex-end" },
  editBtn:     { background: "#ede9fe", color: "#6366f1", border: "none", padding: "6px 14px", borderRadius: 6, cursor: "pointer", fontSize: 12, fontWeight: 600 },
  deleteBtn:   { background: "#fee2e2", color: "#ef4444", border: "none", padding: "6px 14px", borderRadius: 6, cursor: "pointer", fontSize: 12, fontWeight: 600 },
  toast:       { position: "fixed", top: 20, right: 20, color: "#fff", padding: "12px 20px", borderRadius: 8, fontSize: 13, fontWeight: 600, zIndex: 9999, boxShadow: "0 4px 12px rgba(0,0,0,.15)" },
};

const ms = {
  overlay:     { position: "fixed", inset: 0, background: "rgba(15,23,42,.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000, padding: 20 },
  box:         { background: "#fff", borderRadius: 12, width: "100%", maxWidth: 560, maxHeight: "90vh", overflowY: "auto", boxShadow: "0 20px 60px rgba(0,0,0,.2)" },
  header:      { display: "flex", justifyContent: "space-between", alignItems: "center", padding: "18px 24px", borderBottom: "1px solid #f1f5f9", position: "sticky", top: 0, background: "#fff", zIndex: 1 },
  title:       { margin: 0, fontSize: 16, fontWeight: 700, color: "#0f172a" },
  close:       { background: "none", border: "none", fontSize: 18, cursor: "pointer", color: "#94a3b8" },
  body:        { padding: 24 },
  quotaNote:   { fontSize: 13, color: "#475569", background: "#f1f5f9", padding: "8px 12px", borderRadius: 8, marginBottom: 14 },
  label:       { display: "block", fontSize: 11, fontWeight: 600, color: "#475569", marginBottom: 5, textTransform: "uppercase", letterSpacing: 0.5 },
  req:         { color: "#ef4444" },
  input:       { width: "100%", padding: "10px 12px", border: "1px solid #e2e8f0", borderRadius: 8, fontSize: 13, marginBottom: 14, outline: "none", boxSizing: "border-box", fontFamily: "inherit" },
  errorMsg:    { color: "#ef4444", fontSize: 12, marginBottom: 12 },
  footer:      { display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 8 },
  cancelBtn:   { background: "#f1f5f9", color: "#475569", border: "none", padding: "9px 18px", borderRadius: 8, cursor: "pointer", fontSize: 13, fontWeight: 600 },
  submitBtn:   { background: "#6366f1", color: "#fff", border: "none", padding: "9px 18px", borderRadius: 8, cursor: "pointer", fontSize: 13, fontWeight: 600 },
  dimRow:      { display: "flex", gap: 8, marginBottom: 8, alignItems: "center" },
  addDimBtn:   { background: "none", border: "1px dashed #c7d2fe", color: "#6366f1", padding: "7px 14px", borderRadius: 8, cursor: "pointer", fontSize: 12, fontWeight: 600, width: "100%", marginBottom: 8 },
  removeDimBtn:{ background: "#fee2e2", color: "#ef4444", border: "none", borderRadius: 6, padding: "4px 8px", cursor: "pointer", fontSize: 12, flexShrink: 0 },
};