import React, { useEffect, useState, useCallback } from "react";

const API = "http://187.127.180.107";

const STATUS_STYLES = {
  open:        { bg: "#fee2e2", color: "#991b1b", label: "Open" },
  in_progress: { bg: "#fef3c7", color: "#92400e", label: "In progress" },
  closed:      { bg: "#d1fae5", color: "#065f46", label: "Closed" },
};

function TenantMaintenance() {
  const token = localStorage.getItem("token");

  const [unit, setUnit] = useState(null);
  const [unitError, setUnitError] = useState("");
  const [tickets, setTickets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ title: "", description: "", priority: "normal" });
  const [saving, setSaving] = useState(false);
  const [formErr, setFormErr] = useState("");

  const fetchAll = useCallback(async () => {
    setLoading(true);
    try {
      const unitRes = await fetch(`${API}/units/me`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const unitData = await unitRes.json();
      if (!unitRes.ok) {
        setUnitError(unitData.detail || "Could not load your unit");
        setLoading(false);
        return;
      }
      setUnit(unitData);
      setUnitError("");

      const ticketsRes = await fetch(
        `${API}/properties/${unitData.property_id}/maintenance-tickets`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      const ticketsData = await ticketsRes.json();
      if (ticketsRes.ok) {
        // A tenant only sees tickets tied to their own unit (or unassigned
        // ones raised on the property before a unit was picked).
        setTickets(
          Array.isArray(ticketsData)
            ? ticketsData.filter(t => !t.unit_id || t.unit_id === unitData.id)
            : []
        );
      }
    } catch {
      setUnitError("Server error. Please try again.");
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  const handleSubmit = async () => {
    if (!form.title.trim()) { setFormErr("Title is required"); return; }
    setSaving(true);
    setFormErr("");
    try {
      const res = await fetch(
        `${API}/properties/${unit.property_id}/maintenance-tickets`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
          body: JSON.stringify({
            title: form.title.trim(),
            description: form.description.trim() || null,
            priority: form.priority,
            unit_id: unit.id,
          }),
        }
      );
      const data = await res.json();
      if (!res.ok) { setFormErr(data.detail || "Failed to submit request"); return; }
      setTickets(prev => [data, ...prev]);
      setShowForm(false);
      setForm({ title: "", description: "", priority: "normal" });
    } catch {
      setFormErr("Server error. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={s.page}>
      <div style={s.header}>
        <h2 style={s.title}>Maintenance</h2>
        {unit && (
          <button style={s.newBtn} onClick={() => { setShowForm(true); setFormErr(""); }}>
            + New Request
          </button>
        )}
      </div>

      {loading && <p style={s.muted}>Loading…</p>}

      {!loading && unitError && (
        <p style={s.muted}>
          {unitError === "No active unit assigned"
            ? "You don't have an active lease yet, so maintenance requests aren't available."
            : unitError}
        </p>
      )}

      {!loading && !unitError && showForm && (
        <div style={s.formBox}>
          <input
            style={s.input}
            placeholder="What's the issue? (e.g. Leaking kitchen faucet)"
            value={form.title}
            onChange={e => setForm({ ...form, title: e.target.value })}
          />
          <textarea
            style={{ ...s.input, minHeight: 70 }}
            placeholder="Any extra detail (optional)"
            value={form.description}
            onChange={e => setForm({ ...form, description: e.target.value })}
          />
          <select
            style={s.input}
            value={form.priority}
            onChange={e => setForm({ ...form, priority: e.target.value })}
          >
            <option value="low">Low — not urgent</option>
            <option value="normal">Normal</option>
            <option value="high">High</option>
            <option value="urgent">Urgent</option>
          </select>
          {formErr && <p style={s.errorText}>{formErr}</p>}
          <div style={s.formActions}>
            <button style={s.cancelBtn} onClick={() => setShowForm(false)}>Cancel</button>
            <button style={s.submitBtn} disabled={saving} onClick={handleSubmit}>
              {saving ? "Submitting…" : "Submit Request"}
            </button>
          </div>
        </div>
      )}

      {!loading && !unitError && (
        tickets.length === 0 ? (
          <div style={s.empty}>
            <p style={s.emptyIcon}>🛠</p>
            <p style={s.emptyText}>No maintenance requests yet</p>
          </div>
        ) : (
          <div style={s.list}>
            {tickets.map(t => {
              const st = STATUS_STYLES[t.status] || { bg: "#f1f5f9", color: "#475569", label: t.status };
              return (
                <div key={t.id} style={s.card}>
                  <div style={s.cardTop}>
                    <span style={s.cardTitle}>{t.title}</span>
                    <span style={{ ...s.pill, background: st.bg, color: st.color }}>{st.label}</span>
                  </div>
                  {t.description && <p style={s.cardDesc}>{t.description}</p>}
                  <p style={s.cardMeta}>Priority: {t.priority}</p>
                </div>
              );
            })}
          </div>
        )
      )}
    </div>
  );
}

const s = {
  page:      { padding: 32, fontFamily: "'DM Sans', sans-serif" },
  header:    { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 },
  title:     { margin: 0, fontSize: 20, fontWeight: 700, color: "#0f172a" },
  newBtn:    { background: "#6366f1", color: "#fff", border: "none", padding: "9px 16px", borderRadius: 8, cursor: "pointer", fontSize: 13, fontWeight: 600 },
  muted:     { color: "#64748b", fontSize: 14 },

  formBox:   { background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 10, padding: 16, marginBottom: 20, maxWidth: 420 },
  input:     { width: "100%", padding: "10px 12px", border: "1px solid #e2e8f0", borderRadius: 8, fontSize: 13, marginBottom: 12, outline: "none", boxSizing: "border-box", fontFamily: "inherit" },
  errorText: { color: "#ef4444", fontSize: 12, margin: "0 0 10px" },
  formActions:{ display: "flex", justifyContent: "flex-end", gap: 8 },
  cancelBtn: { background: "#f1f5f9", color: "#475569", border: "none", padding: "9px 16px", borderRadius: 8, cursor: "pointer", fontSize: 13, fontWeight: 600 },
  submitBtn: { background: "#6366f1", color: "#fff", border: "none", padding: "9px 16px", borderRadius: 8, cursor: "pointer", fontSize: 13, fontWeight: 600 },

  empty:     { textAlign: "center", padding: "60px 20px", color: "#94a3b8" },
  emptyIcon: { fontSize: 32, margin: 0 },
  emptyText: { fontSize: 14, fontWeight: 600, color: "#64748b", margin: "8px 0 0" },

  list:      { display: "flex", flexDirection: "column", gap: 10, maxWidth: 480 },
  card:      { background: "#fff", border: "1px solid #e2e8f0", borderRadius: 10, padding: 14 },
  cardTop:   { display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10 },
  cardTitle: { fontSize: 14, fontWeight: 600, color: "#0f172a" },
  cardDesc:  { margin: "6px 0 0", fontSize: 12, color: "#64748b" },
  cardMeta:  { margin: "8px 0 0", fontSize: 11, color: "#94a3b8", textTransform: "capitalize" },
  pill:      { fontSize: 10, fontWeight: 700, padding: "3px 9px", borderRadius: 20, flexShrink: 0 },
};

export default TenantMaintenance;