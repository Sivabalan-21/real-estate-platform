import React, { useEffect, useState, useCallback } from "react";
import { useParams, useLocation, useNavigate } from "react-router-dom";

const API = "http://187.127.180.107";

const STATUS_STYLES = {
  open:        { bg: "#fee2e2", color: "#991b1b", label: "Open" },
  in_progress: { bg: "#fef3c7", color: "#92400e", label: "In progress" },
  closed:      { bg: "#d1fae5", color: "#065f46", label: "Closed" },
};

const CATEGORY_ICONS = {
  Plumbing: "💧", Electrical: "⚡", HVAC: "❄️", Roof: "🏠",
  Drywall: "🧱", Pest: "🐛", Appliance: "🔌", Other: "🔧",
};

// Day 16: 5-stage visual stepper laid over the current 3-value `status`
// column (open/in_progress/closed). 'In Review' and 'Scheduled' aren't
// reachable yet — the backend only ever produces open/in_progress/closed
// until Day 24 formalizes richer transitions — but the stepper is built to
// support them once that lands, so this file won't need to change again.
const STEPS = ["Submitted", "In Review", "Scheduled", "In Progress", "Done"];
const STATUS_TO_STEP = { open: 0, in_progress: 3, closed: 4 };

function formatDateTime(dateStr) {
  if (!dateStr) return "—";
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return dateStr;
  return d.toLocaleString("en-IN", { day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit" });
}

function StatusStepper({ status }) {
  const currentIndex = STATUS_TO_STEP[status] ?? 0;
  const isDone = status === "closed";

  return (
    <div style={s.stepper}>
      {STEPS.map((label, i) => {
        const completed = isDone || i < currentIndex;
        const current = !isDone && i === currentIndex;
        const dotStyle = completed
          ? s.stepDotDone
          : current
          ? s.stepDotCurrent
          : s.stepDotUpcoming;
        return (
          <React.Fragment key={label}>
            {i > 0 && (
              <div style={{ ...s.stepLine, background: completed || current ? "#10b981" : "#e2e8f0" }} />
            )}
            <div style={s.stepItem}>
              <div style={dotStyle}>{completed ? "✓" : i + 1}</div>
              <span style={{ ...s.stepLabel, ...(current ? s.stepLabelCurrent : {}) }}>{label}</span>
            </div>
          </React.Fragment>
        );
      })}
    </div>
  );
}

function MaintenanceDetail() {
  const { id } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const token = localStorage.getItem("token");

  const [ticket, setTicket] = useState(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  const justSubmitted = location.state?.justSubmitted;
  const ticketRef = location.state?.ticketRef || (ticket ? ticket.id.slice(-6).toUpperCase() : "");

  const fetchTicket = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API}/tickets/${id}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.detail || "Could not load this request");
        return;
      }
      setTicket(data);
      setError("");
    } catch {
      setError("Server error. Please try again.");
    } finally {
      setLoading(false);
    }
  }, [id, token]);

  useEffect(() => { fetchTicket(); }, [fetchTicket]);

  if (loading) return <div style={s.page}><p style={s.muted}>Loading…</p></div>;

  if (error) {
    return (
      <div style={s.page}>
        <p style={s.errorText}>{error}</p>
        <button style={s.backBtn} onClick={() => navigate("/tenant/maintenance")}>← Back to requests</button>
      </div>
    );
  }

  if (!ticket) return null;

  const st = STATUS_STYLES[ticket.status] || { bg: "#f1f5f9", color: "#475569", label: ticket.status };

  return (
    <div style={s.page}>
      {justSubmitted && (
        <div style={s.confirmBanner}>
          ✅ Ticket #{ticketRef} submitted. Your PM has been notified.
        </div>
      )}

      <button style={s.backLink} onClick={() => navigate("/tenant/maintenance")}>← All requests</button>

      <div style={s.card}>
        <div style={s.cardTop}>
          <div style={s.cardTopLeft}>
            <span style={s.categoryIcon}>{CATEGORY_ICONS[ticket.category] || "🛠"}</span>
            <div>
              <p style={s.cardTitle}>{ticket.category || ticket.title}</p>
              <p style={s.cardRef}>Ticket #{ticket.id.slice(-6).toUpperCase()}</p>
            </div>
          </div>
          <span style={{ ...s.pill, background: st.bg, color: st.color }}>{st.label}</span>
        </div>

        <StatusStepper status={ticket.status} />

        {ticket.description && <p style={s.description}>{ticket.description}</p>}

        <div style={s.metaRow}>
          <span style={s.metaLabel}>Priority</span>
          <span style={s.metaValue}>{ticket.priority === "urgent" ? "🚨 Urgent" : "Normal"}</span>
        </div>
        <div style={s.metaRow}>
          <span style={s.metaLabel}>Submitted</span>
          <span style={s.metaValue}>{formatDateTime(ticket.created_at)}</span>
        </div>
        {ticket.closed_at && (
          <div style={s.metaRow}>
            <span style={s.metaLabel}>Closed</span>
            <span style={s.metaValue}>{formatDateTime(ticket.closed_at)}</span>
          </div>
        )}

        {ticket.attachments && ticket.attachments.length > 0 && (
          <div style={s.photosSection}>
            <p style={s.metaLabel}>Photos</p>
            <div style={s.photoRow}>
              {ticket.attachments.map(a => (
                <a key={a.id} href={a.url} target="_blank" rel="noreferrer">
                  <img src={a.url} alt={a.filename} style={s.photoThumb} />
                </a>
              ))}
            </div>
          </div>
        )}

        {/* Comments/notes system is Month 2 — this section exists now so the
            tenant sees, from day one, that PM communication happens here
            rather than by text message. */}
        <div style={s.updatesSection}>
          <p style={s.metaLabel}>Updates from your PM</p>
          <p style={s.updatesPlaceholder}>No updates yet</p>
        </div>
      </div>
    </div>
  );
}

const s = {
  page:      { padding: 24, maxWidth: 520, margin: "0 auto", fontFamily: "'DM Sans', sans-serif" },
  muted:     { color: "#64748b", fontSize: 14 },
  errorText: { color: "#ef4444", fontSize: 13, marginBottom: 16 },
  backLink:  { background: "none", border: "none", color: "#6366f1", fontSize: 13, fontWeight: 600, cursor: "pointer", padding: 0, marginBottom: 16 },
  backBtn:   { background: "#f1f5f9", color: "#475569", border: "none", padding: "9px 16px", borderRadius: 8, cursor: "pointer", fontSize: 13, fontWeight: 600 },

  confirmBanner: {
    background: "#ecfdf5", border: "1px solid #a7f3d0", color: "#065f46",
    borderRadius: 10, padding: "12px 16px", fontSize: 13, fontWeight: 600, marginBottom: 16,
  },

  card:      { background: "#fff", border: "1px solid #e2e8f0", borderRadius: 14, padding: 20 },
  cardTop:   { display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, marginBottom: 12 },
  cardTopLeft: { display: "flex", gap: 12, alignItems: "flex-start" },
  categoryIcon: { fontSize: 28 },
  cardTitle: { margin: 0, fontSize: 16, fontWeight: 700, color: "#0f172a" },
  cardRef:   { margin: "2px 0 0", fontSize: 12, color: "#94a3b8" },
  pill:      { fontSize: 11, fontWeight: 700, padding: "4px 10px", borderRadius: 20, flexShrink: 0 },

  description: { fontSize: 14, color: "#334155", lineHeight: 1.5, margin: "0 0 16px" },

  metaRow:   { display: "flex", justifyContent: "space-between", padding: "8px 0", borderTop: "1px solid #f1f5f9" },
  metaLabel: { fontSize: 12, color: "#94a3b8", fontWeight: 600 },
  metaValue: { fontSize: 13, color: "#334155", fontWeight: 600 },

  photosSection: { marginTop: 16, paddingTop: 12, borderTop: "1px solid #f1f5f9" },
  photoRow:  { display: "flex", gap: 10, flexWrap: "wrap", marginTop: 8 },
  photoThumb:{ width: 72, height: 72, borderRadius: 10, objectFit: "cover", border: "1px solid #e2e8f0" },

  updatesSection: { marginTop: 16, paddingTop: 12, borderTop: "1px solid #f1f5f9" },
  updatesPlaceholder: { fontSize: 13, color: "#94a3b8", fontStyle: "italic", margin: "6px 0 0" },

  stepper:   { display: "flex", alignItems: "flex-start", margin: "16px 0 20px" },
  stepItem:  { display: "flex", flexDirection: "column", alignItems: "center", width: 60, flexShrink: 0 },
  stepLine:  { height: 2, flex: 1, marginTop: 13, minWidth: 8 },
  stepLabel: { fontSize: 9, color: "#94a3b8", marginTop: 6, textAlign: "center", lineHeight: 1.2, fontWeight: 600 },
  stepLabelCurrent: { color: "#92400e" },
  stepDotBase: {
    width: 26, height: 26, borderRadius: "50%", display: "flex", alignItems: "center",
    justifyContent: "center", fontSize: 11, fontWeight: 700, flexShrink: 0,
  },
  get stepDotDone() { return { ...this.stepDotBase, background: "#10b981", color: "#fff" }; },
  get stepDotCurrent() { return { ...this.stepDotBase, background: "#f59e0b", color: "#fff" }; },
  get stepDotUpcoming() { return { ...this.stepDotBase, background: "#e2e8f0", color: "#94a3b8" }; },
};

export default MaintenanceDetail;