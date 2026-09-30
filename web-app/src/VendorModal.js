import React, { useState } from "react";

const API = "http://localhost:8000";

// Must match VendorCategory.ALL in auth-backend/models.py — the API rejects
// anything else with a 400.
export const VENDOR_CATEGORIES = [
  "Plumbing", "Electrical", "HVAC", "Roofing",
  "Drywall", "Pest Control", "Appliance", "General",
];

// vendor = null  -> Add mode  (POST /vendors)
// vendor = {...} -> Edit mode (PUT /vendors/:id)
function VendorModal({ vendor, onClose, onSaved }) {
  const token = localStorage.getItem("token");
  const isEdit = Boolean(vendor);

  const [form, setForm] = useState({
    name: vendor?.name || "",
    category: vendor?.category || "General",
    phone: vendor?.phone || "",
    email: vendor?.email || "",
    website: vendor?.website || "",
    notes: vendor?.notes || "",
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const set = (field) => (e) => setForm({ ...form, [field]: e.target.value });

  const submit = async (e) => {
    e.preventDefault();
    if (!form.name.trim()) {
      setError("Name is required");
      return;
    }
    setSaving(true);
    setError("");
    try {
      const res = await fetch(
        isEdit ? `${API}/vendors/${vendor.id}` : `${API}/vendors`,
        {
          method: isEdit ? "PUT" : "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            ...form,
            name: form.name.trim(),
            // Send null instead of "" so optional fields stay empty in the DB
            phone: form.phone.trim() || null,
            email: form.email.trim() || null,
            website: form.website.trim() || null,
            notes: form.notes.trim() || null,
          }),
        }
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        // FastAPI validation errors come back as an array in `detail`
        setError(
          typeof data.detail === "string"
            ? data.detail
            : "Could not save vendor — check the fields and try again"
        );
        return;
      }
      onSaved(data);
    } catch {
      setError("Could not reach the server");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={s.overlay} onClick={onClose}>
      <div style={s.modal} onClick={(e) => e.stopPropagation()}>
        <h2 style={s.title}>{isEdit ? "Edit Vendor" : "Add Vendor"}</h2>

        <form onSubmit={submit}>
          <label style={s.label}>Name *</label>
          <input style={s.input} value={form.name} onChange={set("name")} autoFocus />

          <label style={s.label}>Category</label>
          <select style={s.input} value={form.category} onChange={set("category")}>
            {VENDOR_CATEGORIES.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>

          <label style={s.label}>Phone</label>
          <input style={s.input} type="tel" value={form.phone} onChange={set("phone")} />

          <label style={s.label}>Email</label>
          <input style={s.input} type="email" value={form.email} onChange={set("email")} />

          <label style={s.label}>Website</label>
          <input style={s.input} value={form.website} onChange={set("website")} placeholder="https://" />

          <label style={s.label}>Notes</label>
          <textarea
            style={{ ...s.input, minHeight: 70, resize: "vertical" }}
            value={form.notes}
            onChange={set("notes")}
          />

          {error && <p style={s.error}>{error}</p>}

          <div style={s.actions}>
            <button type="button" style={s.cancelBtn} onClick={onClose}>Cancel</button>
            <button type="submit" style={s.saveBtn} disabled={saving}>
              {saving ? "Saving…" : isEdit ? "Save Changes" : "Add Vendor"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

const s = {
  overlay: { position: "fixed", inset: 0, background: "rgba(15,23,42,0.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 2000 },
  modal: { background: "#fff", borderRadius: 14, padding: 28, width: 460, maxWidth: "92vw", maxHeight: "90vh", overflowY: "auto", fontFamily: "'DM Sans', sans-serif" },
  title: { margin: "0 0 12px", fontSize: 20, fontWeight: 700, color: "#0f172a" },
  label: { display: "block", marginTop: 14, marginBottom: 5, fontSize: 13, fontWeight: 600, color: "#334155" },
  input: { width: "100%", boxSizing: "border-box", padding: "9px 12px", border: "1px solid #cbd5e1", borderRadius: 8, fontSize: 14, fontFamily: "inherit" },
  error: { color: "#b91c1c", fontSize: 13, margin: "12px 0 0" },
  actions: { display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 22 },
  cancelBtn: { padding: "9px 18px", border: "1px solid #cbd5e1", background: "#fff", borderRadius: 8, cursor: "pointer", fontSize: 14 },
  saveBtn: { padding: "9px 18px", border: "none", background: "#6366f1", color: "#fff", borderRadius: 8, cursor: "pointer", fontSize: 14, fontWeight: 600 },
};

export default VendorModal;