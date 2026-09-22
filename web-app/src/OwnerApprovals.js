import React, { useEffect, useState, useCallback, useRef } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import TicketComments from "./TicketComments";

const API = "http://localhost:8000";

const CATEGORY_ICONS = {
  Plumbing: "💧", Electrical: "⚡", HVAC: "❄️", Roof: "🏠",
  Drywall: "🧱", Pest: "🐛", Appliance: "🔌", Other: "🔧",
};

function formatDate(dateStr) {
  if (!dateStr) return "—";
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return dateStr;
  return d.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}

// Confirms an approve/reject decision, with an optional note that becomes
// the TicketHistory audit row — same pattern as PMTicketDetail's transition
// modal, so owners and PMs get a consistent way to leave a paper trail.
function DecisionModal({ decision, submitting, error, onCancel, onConfirm }) {
  const [note, setNote] = useState("");
  const isReject = decision.to === "rejected";

  return (
    <div style={s.modalOverlay} onClick={submitting ? undefined : onCancel}>
      <div style={s.modalCard} onClick={e => e.stopPropagation()}>
        <p style={s.modalTitle}>{isReject ? "Reject this request?" : "Approve this request?"}</p>
        <p style={s.modalSub}>
          Ticket: <strong>{decision.ticket.title}</strong> · {decision.ticket.property_name || "—"}
          {decision.ticket.unit_number ? ` · Unit ${decision.ticket.unit_number}` : ""}
        </p>
        <label style={s.modalLabel}>{isReject ? "Reason (optional but recommended)" : "Add note (optional)"}</label>
        <textarea
          style={s.textarea}
          rows={3}
          value={note}
          onChange={e => setNote(e.target.value)}
          placeholder={isReject ? "e.g. Quote is over budget, ask vendor to revise…" : "e.g. Approved, go ahead and schedule the work…"}
          disabled={submitting}
          autoFocus
        />
        {error && <p style={s.errorText}>{error}</p>}
        <div style={s.modalActions}>
          <button style={s.modalCancelBtn} onClick={onCancel} disabled={submitting}>
            Cancel
          </button>
          <button
            style={isReject ? s.modalRejectBtn : s.modalApproveBtn}
            onClick={() => onConfirm(note)}
            disabled={submitting}
          >
            {submitting ? "Saving…" : isReject ? "Reject" : "Approve"}
          </button>
        </div>
      </div>
    </div>
  );
}

function OwnerApprovals() {
  const navigate = useNavigate();
  const location = useLocation();
  const token = localStorage.getItem("token");

  // Set when we arrive here from a specific ticket row (e.g. OwnerTickets'
  // "Review" link) so we can scroll to and highlight just that card instead
  // of leaving the owner to hunt for it in the list.
  const focusTicketId = location.state?.ticketId || null;
  const focusedCardRef = useRef(null);

  const [tickets, setTickets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // { ticket, to: "approved" | "rejected" } while a decision is being
  // confirmed, else null.
  const [pendingDecision, setPendingDecision] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [decisionError, setDecisionError] = useState("");

  const fetchPending = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch(`${API}/owner/tickets?status=pending_owner_approval`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.detail || "Could not load approvals");
        return;
      }
      setTickets(data.tickets || []);
    } catch {
      setError("Server error. Please try again.");
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => { fetchPending(); }, [fetchPending]);

  // Once the focused ticket's card is actually in the DOM, scroll it into
  // view. Runs after every ticket-list update, not just on mount, since the
  // fetch resolves asynchronously after the navigation state is already set.
  useEffect(() => {
    if (focusTicketId && focusedCardRef.current) {
      focusedCardRef.current.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }, [focusTicketId, tickets]);

  const confirmDecision = async (note) => {
    if (!pendingDecision) return;
    setSubmitting(true);
    setDecisionError("");
    try {
      const res = await fetch(`${API}/tickets/${pendingDecision.ticket.id}/transition`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ new_status: pendingDecision.to, note: note || null }),
      });
      const data = await res.json();
      if (res.ok) {
        // Decided tickets leave the pending-approval list immediately.
        setTickets(prev => prev.filter(t => t.id !== pendingDecision.ticket.id));
        setPendingDecision(null);
      } else {
        setDecisionError(data.detail || "Could not record this decision");
      }
    } catch {
      setDecisionError("Server error. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div style={s.page}>
      <div style={s.header}>
        <h1 style={s.title}>Approvals</h1>
        <p style={s.subtitle}>Maintenance spend requests awaiting your approval.</p>
      </div>

      {error && <p style={s.errorText}>{error}</p>}

      {loading ? (
        <p style={s.muted}>Loading…</p>
      ) : tickets.length === 0 ? (
        <div style={s.emptyState}>
          <p style={s.emptyIcon}>✅</p>
          <p style={s.emptyTitle}>Nothing waiting on you</p>
          <p style={s.emptySub}>Tickets that need your sign-off before work proceeds will show up here.</p>
        </div>
      ) : (
        <div style={s.list}>
          {tickets.map(t => {
            const isFocused = t.id === focusTicketId;
            return (
            <div
              key={t.id}
              ref={isFocused ? focusedCardRef : null}
              style={{ ...s.card, ...(isFocused ? s.cardFocused : {}) }}
            >
              <div style={s.cardTop}>
                <span style={s.categoryIcon}>{CATEGORY_ICONS[t.category] || "🛠"}</span>
                <div style={s.cardTopText}>
                  <p style={s.cardTitle}>{t.title}</p>
                  <p style={s.cardRef}>
                    {t.property_name || "—"}{t.unit_number ? ` · Unit ${t.unit_number}` : ""} · {t.category || "—"}
                  </p>
                </div>
                <button
                  style={s.viewLink}
                  onClick={() => navigate(`/owner/tickets`, { state: { propertyId: t.property_id, status: "active" } })}
                >
                  View in Tickets →
                </button>
              </div>

              {t.description && <p style={s.description}>{t.description}</p>}

              <div style={s.metaRow}>
                <span style={s.metaItem}><strong>PM:</strong> {t.assigned_pm_name || t.assigned_pm || "Unassigned"}</span>
                <span style={s.metaItem}><strong>Submitted:</strong> {formatDate(t.created_at)}</span>
                <span style={s.metaItem}><strong>Quote:</strong> {t.quote_amount != null ? t.quote_amount : "Not provided yet"}</span>
              </div>

              <TicketComments ticketId={t.id} role="Owner" styles={s} />

              <div style={s.actionRow}>
                <button
                  style={s.approveBtn}
                  onClick={() => { setDecisionError(""); setPendingDecision({ ticket: t, to: "approved" }); }}
                >
                  Approve
                </button>
                <button
                  style={s.rejectBtn}
                  onClick={() => { setDecisionError(""); setPendingDecision({ ticket: t, to: "rejected" }); }}
                >
                  Reject
                </button>
              </div>
            </div>
            );
          })}
        </div>
      )}

      {pendingDecision && (
        <DecisionModal
          decision={pendingDecision}
          submitting={submitting}
          error={decisionError}
          onCancel={() => { if (!submitting) { setPendingDecision(null); setDecisionError(""); } }}
          onConfirm={confirmDecision}
        />
      )}
    </div>
  );
}

const s = {
  page:      { padding: 28, fontFamily: "'DM Sans', sans-serif", maxWidth: 800, margin: "0 auto" },
  header:    { marginBottom: 20 },
  title:     { margin: 0, fontSize: 22, fontWeight: 700, color: "#0f172a" },
  subtitle:  { margin: "4px 0 0", fontSize: 13, color: "#64748b" },

  errorText: { color: "#ef4444", fontSize: 13, marginBottom: 16 },
  muted:     { color: "#64748b", fontSize: 14 },

  emptyState: { textAlign: "center", padding: "60px 20px", background: "#fff", border: "1px solid #e2e8f0", borderRadius: 14 },
  emptyIcon:  { fontSize: 32, margin: 0 },
  emptyTitle: { fontSize: 15, fontWeight: 700, color: "#0f172a", margin: "8px 0 4px" },
  emptySub:   { fontSize: 13, color: "#64748b", margin: 0 },

  list: { display: "flex", flexDirection: "column", gap: 14 },
  card: { background: "#fff", border: "1px solid #e2e8f0", borderRadius: 14, padding: 20, transition: "box-shadow 0.2s, border-color 0.2s" },
  cardFocused: { border: "1px solid #6366f1", boxShadow: "0 0 0 3px #e0e7ff" },

  cardTop:     { display: "flex", alignItems: "flex-start", gap: 12 },
  categoryIcon:{ fontSize: 24 },
  cardTopText: { flex: 1 },
  cardTitle:   { margin: 0, fontSize: 15, fontWeight: 700, color: "#0f172a" },
  cardRef:     { margin: "2px 0 0", fontSize: 12, color: "#94a3b8" },
  viewLink:    { background: "none", border: "none", color: "#6366f1", fontSize: 12, fontWeight: 600, cursor: "pointer", padding: 0, whiteSpace: "nowrap" },

  description: { fontSize: 13, color: "#334155", lineHeight: 1.5, margin: "12px 0 0" },

  metaRow:  { display: "flex", gap: 18, flexWrap: "wrap", marginTop: 14, paddingTop: 14, borderTop: "1px solid #f1f5f9" },
  metaItem: { fontSize: 12, color: "#64748b" },
  section: { marginTop: 16, paddingTop: 14, borderTop: "1px solid #f1f5f9" },
  sectionLabel: { fontSize: 12, color: "#0f172a", fontWeight: 700, margin: "0 0 4px" },
  sectionSub: { fontSize: 12, color: "#94a3b8", margin: "0 0 10px" },
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

  actionRow:  { display: "flex", gap: 10, marginTop: 16 },
  approveBtn: { background: "#059669", border: "none", color: "#fff", padding: "9px 18px", borderRadius: 8, cursor: "pointer", fontSize: 13, fontWeight: 600 },
  rejectBtn:  { background: "#fff", border: "1px solid #fecaca", color: "#b91c1c", padding: "9px 18px", borderRadius: 8, cursor: "pointer", fontSize: 13, fontWeight: 600 },

  modalOverlay: {
    position: "fixed", top: 0, left: 0, right: 0, bottom: 0,
    background: "rgba(15, 23, 42, 0.45)", display: "flex",
    alignItems: "center", justifyContent: "center", padding: 20, zIndex: 50,
  },
  modalCard: {
    background: "#fff", borderRadius: 14, padding: 22, maxWidth: 420, width: "100%",
    boxShadow: "0 20px 40px rgba(15, 23, 42, 0.25)",
  },
  modalTitle: { margin: 0, fontSize: 16, fontWeight: 700, color: "#0f172a" },
  modalSub:   { fontSize: 13, color: "#64748b", margin: "6px 0 14px" },
  modalLabel: { fontSize: 12, color: "#0f172a", fontWeight: 700, display: "block", marginBottom: 6 },
  textarea:   { width: "100%", boxSizing: "border-box", padding: "10px 12px", borderRadius: 8, border: "1px solid #e2e8f0", fontSize: 13, fontFamily: "inherit", resize: "vertical" },
  modalActions:   { display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 14 },
  modalCancelBtn: { background: "#f1f5f9", color: "#475569", border: "none", padding: "9px 16px", borderRadius: 8, cursor: "pointer", fontSize: 13, fontWeight: 600 },
  modalApproveBtn:{ background: "#059669", border: "none", color: "#fff", padding: "9px 16px", borderRadius: 8, cursor: "pointer", fontSize: 13, fontWeight: 600 },
  modalRejectBtn: { background: "#dc2626", border: "none", color: "#fff", padding: "9px 16px", borderRadius: 8, cursor: "pointer", fontSize: 13, fontWeight: 600 },
};

export default OwnerApprovals;