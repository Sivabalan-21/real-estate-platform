import React, { useEffect, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";

const API = "http://187.127.180.107";

const CATEGORIES = [
  { value: "Plumbing",   label: "Plumbing",   icon: "💧" },
  { value: "Electrical", label: "Electrical", icon: "⚡" },
  { value: "HVAC",       label: "HVAC",       icon: "❄️" },
  { value: "Roof",       label: "Roof",       icon: "🏠" },
  { value: "Pest",       label: "Pest",       icon: "🐛" },
  { value: "Other",      label: "Other",      icon: "🔧" },
];

const MAX_PHOTOS = 3;

function MaintenanceNew() {
  const navigate = useNavigate();
  const token = localStorage.getItem("token");

  const [unit, setUnit] = useState(null);
  const [unitError, setUnitError] = useState("");
  const [loadingUnit, setLoadingUnit] = useState(true);

  const [category, setCategory] = useState("");
  const [description, setDescription] = useState("");
  const [priority, setPriority] = useState("normal"); // "normal" | "urgent"
  const [photos, setPhotos] = useState([]); // [{ file, previewUrl }]

  const [submitting, setSubmitting] = useState(false);
  const [formErr, setFormErr] = useState("");
  const [categoryErr, setCategoryErr] = useState(false);

  // A tenant with a burst pipe at 10pm shouldn't have to hunt for their own
  // unit/property IDs — we resolve them silently from /units/me.
  const fetchUnit = useCallback(async () => {
    setLoadingUnit(true);
    try {
      const res = await fetch(`${API}/units/me`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (!res.ok) {
        setUnitError(data.detail || "Could not load your unit");
        return;
      }
      setUnit(data);
      setUnitError("");
    } catch {
      setUnitError("Server error. Please try again.");
    } finally {
      setLoadingUnit(false);
    }
  }, [token]);

  useEffect(() => { fetchUnit(); }, [fetchUnit]);

  // Revoke object URLs on unmount so we don't leak memory.
  useEffect(() => {
    return () => photos.forEach(p => URL.revokeObjectURL(p.previewUrl));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handlePhotoSelect = (e) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;

    const room = MAX_PHOTOS - photos.length;
    if (room <= 0) {
      setFormErr(`You can attach up to ${MAX_PHOTOS} photos`);
      e.target.value = "";
      return;
    }
    const toAdd = files.slice(0, room);
    if (files.length > room) setFormErr(`Only added ${room} photo(s) — max ${MAX_PHOTOS} total`);
    else setFormErr("");

    setPhotos(prev => [
      ...prev,
      ...toAdd.map(file => ({ file, previewUrl: URL.createObjectURL(file) })),
    ]);
    e.target.value = ""; // allow re-selecting the same file later if removed
  };

  const removePhoto = (idx) => {
    setPhotos(prev => {
      const next = [...prev];
      URL.revokeObjectURL(next[idx].previewUrl);
      next.splice(idx, 1);
      return next;
    });
  };

  const handleSubmit = async () => {
    if (!category) { setCategoryErr(true); setFormErr("Please choose a category"); return; }
    if (!unit) { setFormErr("Could not determine your unit. Please refresh and try again."); return; }

    setSubmitting(true);
    setFormErr("");
    try {
      const res = await fetch(`${API}/tickets`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          property_id: unit.property_id,
          unit_id: unit.id,
          category,
          description: description.trim() || null,
          priority,
        }),
      });
      const ticket = await res.json();
      if (!res.ok) {
        setFormErr(ticket.detail || "Failed to submit request. Please try again.");
        setSubmitting(false);
        return;
      }

      // Photos upload after the ticket exists, since attachments hang off
      // the ticket ID. A failure here shouldn't block the redirect — the
      // ticket itself was already created successfully.
      if (photos.length > 0) {
        const form = new FormData();
        photos.forEach(p => form.append("files", p.file));
        try {
          await fetch(`${API}/tickets/${ticket.id}/attachments`, {
            method: "POST",
            headers: { Authorization: `Bearer ${token}` },
            body: form,
          });
        } catch {
          // Non-fatal — ticket detail page will just show no photos yet.
        }
      }

      navigate(`/tenant/maintenance/${ticket.id}`, {
        state: { justSubmitted: true, ticketRef: ticket.id.slice(-6).toUpperCase() },
      });
    } catch {
      setFormErr("Server error. Please try again.");
      setSubmitting(false);
    }
  };

  if (loadingUnit) {
    return <div style={s.page}><p style={s.muted}>Loading…</p></div>;
  }

  if (unitError) {
    return (
      <div style={s.page}>
        <p style={s.muted}>
          {unitError === "No active unit assigned"
            ? "You don't have an active lease yet, so maintenance requests aren't available."
            : unitError}
        </p>
      </div>
    );
  }

  return (
    <div style={s.page}>
      <h2 style={s.title}>Report a Problem</h2>
      <p style={s.subtitle}>Tell us what's wrong — your Property Manager will be notified right away.</p>

      <div style={s.section}>
        <label style={s.label}>Category</label>
        <div style={s.tileGrid}>
          {CATEGORIES.map(c => {
            const selected = category === c.value;
            return (
              <button
                key={c.value}
                type="button"
                style={{ ...s.tile, ...(selected ? s.tileSelected : {}) }}
                onClick={() => { setCategory(c.value); setCategoryErr(false); }}
              >
                <span style={s.tileIcon}>{c.icon}</span>
                <span style={s.tileLabel}>{c.label}</span>
              </button>
            );
          })}
        </div>
        {categoryErr && <p style={s.errorText}>Please choose a category</p>}
      </div>

      <div style={s.section}>
        <label style={s.label}>Description</label>
        <textarea
          style={s.textarea}
          placeholder="Describe the issue in as much detail as you can…"
          value={description}
          onChange={e => setDescription(e.target.value)}
        />
      </div>

      <div style={s.section}>
        <label style={s.label}>Priority</label>
        <div style={s.priorityToggle}>
          <button
            type="button"
            style={{ ...s.priorityBtn, ...(priority === "normal" ? s.priorityBtnActive : {}) }}
            onClick={() => setPriority("normal")}
          >
            Normal
          </button>
          <button
            type="button"
            style={{ ...s.priorityBtn, ...(priority === "urgent" ? s.priorityBtnActiveUrgent : {}) }}
            onClick={() => setPriority("urgent")}
          >
            🚨 Urgent
          </button>
        </div>
      </div>

      <div style={s.section}>
        <label style={s.label}>Photos <span style={s.labelHint}>(optional, up to {MAX_PHOTOS})</span></label>
        <div style={s.photoRow}>
          {photos.map((p, idx) => (
            <div key={idx} style={s.photoThumbWrap}>
              <img src={p.previewUrl} alt={`Attachment ${idx + 1}`} style={s.photoThumb} />
              <button type="button" style={s.photoRemoveBtn} onClick={() => removePhoto(idx)}>×</button>
            </div>
          ))}
          {photos.length < MAX_PHOTOS && (
            <label style={s.photoAddTile}>
              <span style={{ fontSize: 22 }}>+</span>
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp,image/gif"
                multiple
                style={{ display: "none" }}
                onChange={handlePhotoSelect}
              />
            </label>
          )}
        </div>
      </div>

      {formErr && <p style={s.errorText}>{formErr}</p>}

      <div style={s.actions}>
        <button style={s.cancelBtn} onClick={() => navigate(-1)}>Cancel</button>
        <button style={s.submitBtn} disabled={submitting} onClick={handleSubmit}>
          {submitting ? "Submitting…" : "Submit Request"}
        </button>
      </div>
    </div>
  );
}

const s = {
  page:      { padding: 24, maxWidth: 520, margin: "0 auto", fontFamily: "'DM Sans', sans-serif" },
  title:     { margin: "0 0 4px", fontSize: 20, fontWeight: 700, color: "#0f172a" },
  subtitle:  { margin: "0 0 24px", fontSize: 13, color: "#64748b" },
  muted:     { color: "#64748b", fontSize: 14 },

  section:   { marginBottom: 22 },
  label:     { display: "block", fontSize: 13, fontWeight: 600, color: "#334155", marginBottom: 10 },
  labelHint: { fontWeight: 400, color: "#94a3b8" },

  tileGrid:  { display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10 },
  tile:      {
    display: "flex", flexDirection: "column", alignItems: "center", gap: 6,
    padding: "16px 8px", borderRadius: 12, border: "2px solid #e2e8f0",
    background: "#fff", cursor: "pointer", fontFamily: "inherit",
  },
  tileSelected: { border: "2px solid #6366f1", background: "#eef2ff" },
  tileIcon:  { fontSize: 26 },
  tileLabel: { fontSize: 12, fontWeight: 600, color: "#334155" },

  textarea:  {
    width: "100%", minHeight: 100, padding: "12px 14px", border: "1px solid #e2e8f0",
    borderRadius: 10, fontSize: 14, outline: "none", boxSizing: "border-box",
    fontFamily: "inherit", resize: "vertical",
  },

  priorityToggle: { display: "flex", gap: 8 },
  priorityBtn: {
    flex: 1, padding: "12px 0", borderRadius: 10, border: "2px solid #e2e8f0",
    background: "#fff", color: "#334155", fontWeight: 600, fontSize: 13, cursor: "pointer",
    fontFamily: "inherit",
  },
  priorityBtnActive:      { border: "2px solid #6366f1", background: "#eef2ff", color: "#4338ca" },
  priorityBtnActiveUrgent:{ border: "2px solid #ef4444", background: "#fef2f2", color: "#b91c1c" },

  photoRow:  { display: "flex", gap: 10, flexWrap: "wrap" },
  photoThumbWrap: { position: "relative", width: 72, height: 72 },
  photoThumb: { width: 72, height: 72, borderRadius: 10, objectFit: "cover", border: "1px solid #e2e8f0" },
  photoRemoveBtn: {
    position: "absolute", top: -6, right: -6, width: 20, height: 20, borderRadius: "50%",
    background: "#0f172a", color: "#fff", border: "none", fontSize: 13, lineHeight: 1, cursor: "pointer",
  },
  photoAddTile: {
    width: 72, height: 72, borderRadius: 10, border: "2px dashed #cbd5e1",
    display: "flex", alignItems: "center", justifyContent: "center",
    color: "#94a3b8", cursor: "pointer", boxSizing: "border-box",
  },

  errorText: { color: "#ef4444", fontSize: 12, margin: "8px 0 0" },

  actions:   { display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 8, marginBottom: 32 },
  cancelBtn: { background: "#f1f5f9", color: "#475569", border: "none", padding: "12px 20px", borderRadius: 10, cursor: "pointer", fontSize: 14, fontWeight: 600 },
  submitBtn: { background: "#6366f1", color: "#fff", border: "none", padding: "12px 24px", borderRadius: 10, cursor: "pointer", fontSize: 14, fontWeight: 600 },
};

export default MaintenanceNew;