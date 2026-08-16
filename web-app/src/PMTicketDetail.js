import React, { useEffect, useState, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";

const API = "http://187.127.180.107";

const STATUS_STYLES = {
  open:        { bg: "#fee2e2", color: "#991b1b", label: "Open" },
  in_progress: { bg: "#fef3c7", color: "#92400e", label: "In Progress" },
  closed:      { bg: "#d1fae5", color: "#065f46", label: "Closed" },
};

const CATEGORY_ICONS = {
  Plumbing: "💧", Electrical: "⚡", HVAC: "❄️", Roof: "🏠",
  Drywall: "🧱", Pest: "🐛", Appliance: "🔌", Other: "🔧",
};

function formatDateTime(dateStr) {
  if (!dateStr) return "—";
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return dateStr;
  return d.toLocaleString("en-IN", { day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit" });
}

function PMTicketDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const token = localStorage.getItem("token");

  const [ticket, setTicket] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [statusDraft, setStatusDraft] = useState("");
  const [savingStatus, setSavingStatus] = useState(false);

  const [noteDraft, setNoteDraft] = useState("");
  const [savingNote, setSavingNote] = useState(false);
  const [noteSaved, setNoteSaved] = useState(false);

  const fetchTicket = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch(`${API}/pm/tickets/${id}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.detail || "Could not load this ticket");
        return;
      }
      setTicket(data);
      setStatusDraft(data.status);
      setNoteDraft(data.pm_notes || "");
    } catch {
      setError("Server error. Please try again.");
    } finally {
      setLoading(false);
    }
  }, [id, token]);

  useEffect(() => { fetchTicket(); }, [fetchTicket]);

  const saveStatus = async (newStatus) => {
    setStatusDraft(newStatus);
    setSavingStatus(true);
    try {
      const res = await fetch(`${API}/pm/tickets/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ status: newStatus }),
      });
      const data = await res.json();
      if (res.ok) setTicket(data);
    } finally {
      setSavingStatus(false);
    }
  };

  const saveNote = async () => {
    setSavingNote(true);
    setNoteSaved(false);
    try {
      const res = await fetch(`${API}/pm/tickets/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ pm_notes: noteDraft }),
      });
      const data = await res.json();
      if (res.ok) {
        setTicket(data);
        setNoteSaved(true);
        setTimeout(() => setNoteSaved(false), 2000);
      }
    } finally {
      setSavingNote(false);
    }
  };

  if (loading) return <div style={s.page}><p style={s.muted}>Loading…</p></div>;

  if (error) {
    return (
      <div style={s.page}>
        <p style={s.errorText}>{error}</p>
        <button style={s.backBtn} onClick={() => navigate("/pm/tickets")}>← Back to tickets</button>
      </div>
    );
  }

  if (!ticket) return null;

  const st = STATUS_STYLES[ticket.status] || { bg: "#f1f5f9", color: "#475569", label: ticket.status };

  return (
    <div style={s.page}>
      <button style={s.backLink} onClick={() => navigate("/pm/tickets")}>← All tickets</button>

      <div style={s.card}>
        <div style={s.cardTop}>
          <div style={s.cardTopLeft}>
            <span style={s.categoryIcon}>{CATEGORY_ICONS[ticket.category] || "🛠"}</span>
            <div>
              <p style={s.cardTitle}>{ticket.title}</p>
              <p style={s.cardRef}>
                Ticket #{ticket.id.slice(-6).toUpperCase()} · {ticket.property_name || "—"}
                {ticket.unit_number ? ` · Unit ${ticket.unit_number}` : ""}
              </p>
            </div>
          </div>
          <span style={{ ...s.pill, background: st.bg, color: st.color }}>{st.label}</span>
        </div>

        {ticket.description && <p style={s.description}>{ticket.description}</p>}

        <div style={s.metaGrid}>
          <div>
            <p style={s.metaLabel}>Priority</p>
            <p style={s.metaValue}>{ticket.priority === "urgent" ? "🚨 Urgent" : ticket.priority || "Normal"}</p>
          </div>
          <div>
            <p style={s.metaLabel}>Submitted</p>
            <p style={s.metaValue}>{formatDateTime(ticket.created_at)}</p>
          </div>
          <div>
            <p style={s.metaLabel}>Last Update</p>
            <p style={s.metaValue}>{formatDateTime(ticket.updated_at)}</p>
          </div>
          {ticket.closed_at && (
            <div>
              <p style={s.metaLabel}>Closed</p>
              <p style={s.metaValue}>{formatDateTime(ticket.closed_at)}</p>
            </div>
          )}
        </div>

        {/* Tenant info */}
        <div style={s.section}>
          <p style={s.sectionLabel}>Tenant</p>
          {ticket.tenant ? (
            <div style={s.tenantCard}>
              <p style={s.tenantName}>{ticket.tenant.full_name || ticket.tenant.username}</p>
              {ticket.tenant.email && (
                <a href={`mailto:${ticket.tenant.email}`} style={s.tenantLink}>{ticket.tenant.email}</a>
              )}
              {ticket.tenant.phone && <p style={s.tenantMeta}>{ticket.tenant.phone}</p>}
            </div>
          ) : (
            <p style={s.muted}>No tenant on record for this ticket.</p>
          )}
        </div>

        {/* Photos */}
        {ticket.attachments && ticket.attachments.length > 0 && (
          <div style={s.section}>
            <p style={s.sectionLabel}>Photos</p>
            <div style={s.photoRow}>
              {ticket.attachments.map(a => (
                <a key={a.id} href={a.url} target="_blank" rel="noreferrer">
                  <img src={a.url} alt={a.filename} style={s.photoThumb} />
                </a>
              ))}
            </div>
          </div>
        )}

        {/* Status update */}
        <div style={s.section}>
          <p style={s.sectionLabel}>Update Status</p>
          <select
            style={s.select}
            value={statusDraft}
            disabled={savingStatus}
            onChange={e => saveStatus(e.target.value)}
          >
            <option value="open">Open</option>
            <option value="in_progress">In Progress</option>
            <option value="closed">Closed</option>
          </select>
          {savingStatus && <span style={s.savingHint}>Saving…</span>}
        </div>

        {/* Internal note */}
        <div style={s.section}>
          <p style={s.sectionLabel}>Add Internal Note</p>
          <p style={s.sectionSub}>Visible to your team only — not shown to the tenant.</p>
          <textarea
            style={s.textarea}
            rows={4}
            value={noteDraft}
            onChange={e => setNoteDraft(e.target.value)}
            placeholder="e.g. Called tenant, scheduling plumber for Thursday…"
          />
          <div style={s.noteActions}>
            <button style={s.saveNoteBtn} onClick={saveNote} disabled={savingNote}>
              {savingNote ? "Saving…" : "Save Note"}
            </button>
            {noteSaved && <span style={s.savedHint}>✓ Saved</span>}
          </div>
        </div>
      </div>
    </div>
  );
}

const s = {
  page:      { padding: 24, maxWidth: 640, margin: "0 auto", fontFamily: "'DM Sans', sans-serif" },
  muted:     { color: "#64748b", fontSize: 14 },
  errorText: { color: "#ef4444", fontSize: 13, marginBottom: 16 },
  backLink:  { background: "none", border: "none", color: "#6366f1", fontSize: 13, fontWeight: 600, cursor: "pointer", padding: 0, marginBottom: 16 },
  backBtn:   { background: "#f1f5f9", color: "#475569", border: "none", padding: "9px 16px", borderRadius: 8, cursor: "pointer", fontSize: 13, fontWeight: 600 },

  card:      { background: "#fff", border: "1px solid #e2e8f0", borderRadius: 14, padding: 24 },
  cardTop:   { display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, marginBottom: 12 },
  cardTopLeft: { display: "flex", gap: 12, alignItems: "flex-start" },
  categoryIcon: { fontSize: 28 },
  cardTitle: { margin: 0, fontSize: 17, fontWeight: 700, color: "#0f172a" },
  cardRef:   { margin: "2px 0 0", fontSize: 12, color: "#94a3b8" },
  pill:      { fontSize: 11, fontWeight: 700, padding: "4px 10px", borderRadius: 20, flexShrink: 0 },

  description: { fontSize: 14, color: "#334155", lineHeight: 1.5, margin: "0 0 16px" },

  metaGrid:  { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))", gap: 12, padding: "12px 0", borderTop: "1px solid #f1f5f9", borderBottom: "1px solid #f1f5f9", marginBottom: 4 },
  metaLabel: { fontSize: 11, color: "#94a3b8", fontWeight: 700, margin: 0, textTransform: "uppercase", letterSpacing: 0.3 },
  metaValue: { fontSize: 13, color: "#334155", fontWeight: 600, margin: "2px 0 0" },

  section:      { marginTop: 18, paddingTop: 16, borderTop: "1px solid #f1f5f9" },
  sectionLabel: { fontSize: 12, color: "#0f172a", fontWeight: 700, margin: "0 0 4px" },
  sectionSub:   { fontSize: 12, color: "#94a3b8", margin: "0 0 10px" },

  tenantCard: { background: "#f8fafc", borderRadius: 10, padding: "12px 14px" },
  tenantName: { margin: 0, fontSize: 14, fontWeight: 700, color: "#0f172a" },
  tenantLink: { fontSize: 13, color: "#6366f1", fontWeight: 600, textDecoration: "none" },
  tenantMeta: { margin: "2px 0 0", fontSize: 13, color: "#64748b" },

  photoRow:  { display: "flex", gap: 10, flexWrap: "wrap" },
  photoThumb:{ width: 80, height: 80, borderRadius: 10, objectFit: "cover", border: "1px solid #e2e8f0" },

  select:      { padding: "9px 12px", borderRadius: 8, border: "1px solid #e2e8f0", fontSize: 13, fontFamily: "inherit", background: "#fff", color: "#0f172a" },
  savingHint:  { fontSize: 12, color: "#94a3b8", marginLeft: 10 },

  textarea:    { width: "100%", boxSizing: "border-box", padding: "10px 12px", borderRadius: 8, border: "1px solid #e2e8f0", fontSize: 13, fontFamily: "inherit", resize: "vertical" },
  noteActions: { display: "flex", alignItems: "center", gap: 12, marginTop: 10 },
  saveNoteBtn: { background: "#6366f1", border: "none", color: "#fff", padding: "9px 16px", borderRadius: 8, cursor: "pointer", fontSize: 13, fontWeight: 600 },
  savedHint:   { fontSize: 12, color: "#059669", fontWeight: 600 },
};

export default PMTicketDetail;