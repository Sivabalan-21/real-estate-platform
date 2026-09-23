import React, { useEffect, useState, useCallback } from "react";
import { useParams, useLocation, useNavigate } from "react-router-dom";
import TicketComments from "./TicketComments";
import AttachmentList from "./AttachmentList";

const API = "http://localhost:8000";

const STATUS_STYLES = {
  open: { bg: "#fee2e2", color: "#991b1b", label: "Open" }, pm_review: { bg: "#fef3c7", color: "#92400e", label: "PM Review" },
  quote_requested: { bg: "#dbeafe", color: "#1e40af", label: "Quote Requested" }, quote_received: { bg: "#e0e7ff", color: "#3730a3", label: "Quote Received" },
  pending_owner_approval: { bg: "#ede9fe", color: "#5b21b6", label: "Pending Owner Approval" }, approved: { bg: "#dcfce7", color: "#166534", label: "Approved" },
  in_progress: { bg: "#fef3c7", color: "#92400e", label: "In Progress" }, completed: { bg: "#cffafe", color: "#155e75", label: "Completed" },
  closed: { bg: "#d1fae5", color: "#065f46", label: "Closed" }, rejected: { bg: "#fee2e2", color: "#991b1b", label: "Rejected" },
  in_review: { bg: "#fef3c7", color: "#92400e", label: "PM Review" }, scheduled: { bg: "#dbeafe", color: "#1e40af", label: "Quote Requested" },
};

const CATEGORY_ICONS = {
  Plumbing: "💧", Electrical: "⚡", HVAC: "❄️", Roof: "🏠",
  Drywall: "🧱", Pest: "🐛", Appliance: "🔌", Other: "🔧",
};

// Day 24 lifecycle. Rejected is terminal and is displayed at the approval
// stage; older M1 intermediates map to their nearest new-stage equivalents.
const STEPS = ["Open", "PM Review", "Quote Requested", "Quote Received", "Owner Approval", "Approved", "In Progress", "Completed", "Closed"];
const STATUS_TO_STEP = {
  open: 0, pm_review: 1, quote_requested: 2, quote_received: 3,
  pending_owner_approval: 4, approved: 5, in_progress: 6, completed: 7,
  closed: 8, rejected: 4, in_review: 1, scheduled: 2,
};

function formatDateTime(dateStr) {
  if (!dateStr) return "—";
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return dateStr;
  return d.toLocaleString("en-IN", { day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit" });
}

function StatusStepper({ status }) {
  const currentIndex = STATUS_TO_STEP[status] ?? 0;
  const isDone = status === "closed" || status === "rejected";

  return (
    <div className="ticket-stepper" style={s.stepper}>
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
              <div
                className="ticket-step-line"
                style={{ background: completed || current ? "#10b981" : "#e2e8f0" }}
              />
            )}
            <div className="ticket-step-item">
              <div style={dotStyle}>{completed ? "✓" : i + 1}</div>
              <span className={`ticket-step-label${current ? " ticket-step-label-current" : ""}`}>{label}</span>
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

        <TicketComments ticketId={ticket.id} role="Tenant" styles={s} />

        <div style={s.photosSection}>
          <p style={s.metaLabel}>Attachments</p>
          <AttachmentList attachments={ticket.attachments} />
        </div>

        {/* Real status-change feed, backed by ticket.history. Replaces the
            hardcoded "No updates yet" placeholder — full threaded PM
            comments are still Month 2, but the status log already existed
            server-side (record_ticket_history), so there's no reason to
            show tenants a static string when this data was one field away. */}
        <div style={s.updatesSection}>
          <p style={s.metaLabel}>Status updates</p>
          {ticket.history && ticket.history.length > 0 ? (
            <div style={s.historyList}>
              {[...ticket.history].reverse().map((h, i) => {
                const st = STATUS_STYLES[h.status] || { label: h.status };
                return (
                  <div key={i} style={s.historyRow}>
                    <span style={s.historyDot} />
                    <div>
                      <p style={s.historyText}>Status changed to <strong>{st.label}</strong></p>
                      <p style={s.historyTime}>{formatDateTime(h.changed_at)}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <p style={s.updatesPlaceholder}>No updates yet</p>
          )}
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

  section: { marginTop: 16, paddingTop: 12, borderTop: "1px solid #f1f5f9" },
  sectionSub: { fontSize: 12, color: "#94a3b8", margin: "0 0 10px" },
  photosSection: { marginTop: 16, paddingTop: 12, borderTop: "1px solid #f1f5f9" },
  photoRow:  { display: "flex", gap: 10, flexWrap: "wrap", marginTop: 8 },
  photoThumb:{ width: 72, height: 72, borderRadius: 10, objectFit: "cover", border: "1px solid #e2e8f0" },

  updatesSection: { marginTop: 16, paddingTop: 12, borderTop: "1px solid #f1f5f9" },
  updatesPlaceholder: { fontSize: 13, color: "#94a3b8", fontStyle: "italic", margin: "6px 0 0" },
  historyList:  { marginTop: 10, display: "flex", flexDirection: "column", gap: 12 },
  historyRow:   { display: "flex", gap: 10, alignItems: "flex-start" },
  historyDot:   { width: 8, height: 8, borderRadius: "50%", background: "#a5b4fc", marginTop: 6, flexShrink: 0 },
  historyText:  { fontSize: 13, color: "#334155", margin: 0 },
  historyTime:  { fontSize: 12, color: "#94a3b8", margin: "2px 0 0" },
  commentList: { display: "flex", flexDirection: "column", gap: 10, margin: "10px 0 14px" },
  commentCard: { background: "#f8fafc", borderRadius: 10, padding: "10px 12px" },
  commentHeader: { display: "flex", alignItems: "baseline", gap: 6, flexWrap: "wrap" },
  commentAuthor: { fontSize: 13, color: "#0f172a" },
  commentRole: { fontSize: 11, color: "#64748b" },
  commentBody: { margin: "7px 0", fontSize: 13, color: "#334155", lineHeight: 1.5, whiteSpace: "pre-wrap" },
  commentFooter: { display: "flex", justifyContent: "space-between", gap: 8, color: "#94a3b8", fontSize: 11 },
  visibilityBadge: { color: "#6366f1", fontWeight: 600 },
  commentForm: { marginTop: 10 },
  commentFormActions: { display: "flex", justifyContent: "flex-end", alignItems: "center", gap: 8, marginTop: 8 },
  visibilityControl: { flex: 1 },
  visibilitySelect: { width: "100%", boxSizing: "border-box", padding: "8px 10px", borderRadius: 7, border: "1px solid #e2e8f0", background: "#fff", color: "#334155", fontSize: 12 },
  sendButton: { background: "#6366f1", border: "none", color: "#fff", padding: "9px 16px", borderRadius: 8, cursor: "pointer", fontSize: 13, fontWeight: 600 },
  successText: { color: "#059669", fontSize: 12, fontWeight: 600, margin: "8px 0 0" },
  srOnly: { position: "absolute", width: 1, height: 1, padding: 0, margin: -1, overflow: "hidden", clip: "rect(0, 0, 0, 0)", whiteSpace: "nowrap", border: 0 },

  stepper:   { maxWidth: "100%", boxSizing: "border-box" },
  stepDotBase: {
    width: 26, height: 26, borderRadius: "50%", display: "flex", alignItems: "center",
    justifyContent: "center", fontSize: 11, fontWeight: 700, flexShrink: 0,
  },
  get stepDotDone() { return { ...this.stepDotBase, background: "#10b981", color: "#fff" }; },
  get stepDotCurrent() { return { ...this.stepDotBase, background: "#f59e0b", color: "#fff" }; },
  get stepDotUpcoming() { return { ...this.stepDotBase, background: "#e2e8f0", color: "#94a3b8" }; },
};

export default MaintenanceDetail;