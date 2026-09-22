import React, { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import TicketComments from "./TicketComments";

const API = "http://localhost:8000";
const WORKFLOW = [
  ["open", "Open"],
  ["pm_review", "PM Review"],
  ["quote_requested", "Quote Requested"],
  ["quote_received", "Quote Received"],
  ["pending_owner_approval", "Owner Approval"],
  ["approved", "Approved"],
  ["in_progress", "In Progress"],
  ["completed", "Completed"],
  ["closed", "Closed"],
];
const STATUS_LABELS = Object.fromEntries(WORKFLOW);
STATUS_LABELS.rejected = "Rejected";

function dateValue(value) {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? value
    : date.toLocaleString("en-IN", { day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit" });
}

function OwnerTicketDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const token = localStorage.getItem("token");
  const [ticket, setTicket] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [decisionError, setDecisionError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    let active = true;
    setLoading(true);
    fetch(`${API}/tickets/${id}`, { headers: { Authorization: `Bearer ${token}` } })
      .then(async response => {
        const data = await response.json();
        if (!response.ok) throw new Error(data.detail || "Could not load ticket");
        if (active) setTicket(data);
      })
      .catch(err => active && setError(err.message))
      .finally(() => active && setLoading(false));
    return () => { active = false; };
  }, [id, token]);

  const workflowIndex = useMemo(() => WORKFLOW.findIndex(([status]) => status === ticket?.status), [ticket]);

  const decide = async nextStatus => {
    if (!ticket || !window.confirm(`${nextStatus === "approved" ? "Approve" : "Reject"} this ticket?`)) return;
    setSubmitting(true);
    setDecisionError("");
    try {
      const response = await fetch(`${API}/tickets/${ticket.id}/transition`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ new_status: nextStatus }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.detail || "Could not update ticket");
      setTicket(previous => ({ ...previous, ...data }));
    } catch (err) {
      setDecisionError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) return <div style={s.page}><p style={s.muted}>Loading ticket…</p></div>;
  if (error) return <div style={s.page}><p style={s.error}>{error}</p><button style={s.secondary} onClick={() => navigate("/owner/tickets")}>Back to tickets</button></div>;
  if (!ticket) return null;

  const tenant = ticket.tenant;
  const canDecide = ticket.status === "pending_owner_approval";

  return (
    <div style={s.page}>
      <button style={s.back} onClick={() => navigate("/owner/tickets")}>← Back to tickets</button>
      <div style={s.header}>
        <div>
          <p style={s.eyebrow}>Ticket #{ticket.id.slice(-6).toUpperCase()}</p>
          <h1 style={s.title}>{ticket.title || ticket.category || "Maintenance ticket"}</h1>
          <p style={s.subtitle}>{ticket.property_name || "—"}{ticket.unit_number ? ` · Unit ${ticket.unit_number}` : ""}</p>
        </div>
        <div style={s.headerStatus}>{STATUS_LABELS[ticket.status] || ticket.status}</div>
      </div>

      <section style={s.card}>
        <h2 style={s.cardTitle}>Workflow</h2>
        <div style={s.workflow}>
          {WORKFLOW.map(([status, label], index) => (
            <div key={status} style={s.step}>
              <span style={{ ...s.stepDot, ...(index <= workflowIndex ? s.stepActive : {}) }}>{index + 1}</span>
              <span style={s.stepLabel}>{label}</span>
            </div>
          ))}
        </div>
      </section>

      <div style={s.grid}>
        <section style={s.card}>
          <h2 style={s.cardTitle}>Ticket details</h2>
          <dl style={s.details}>
            <dt>Property</dt><dd>{ticket.property_name || "—"}</dd>
            <dt>Unit / address</dt><dd>{ticket.unit_number || ticket.unit_address || "—"}</dd>
            <dt>Category</dt><dd>{ticket.category || "—"}</dd>
            <dt>Priority</dt><dd>{ticket.priority || "normal"}{ticket.priority === "urgent" && <span style={s.urgent}>Urgent</span>}</dd>
            <dt>Created</dt><dd>{dateValue(ticket.created_at)}</dd>
            <dt>Last updated</dt><dd>{dateValue(ticket.updated_at || ticket.last_update_at)}</dd>
            <dt>Quote amount</dt><dd>{ticket.quote_amount != null ? ticket.quote_amount : "Not provided"}</dd>
          </dl>
          <h3 style={s.subheading}>Description</h3>
          <p style={s.description}>{ticket.description || "No description provided."}</p>
        </section>

        <section style={s.card}>
          <h2 style={s.cardTitle}>People</h2>
          <dl style={s.details}>
            <dt>Tenant</dt><dd>{tenant?.full_name || tenant?.username || "—"}</dd>
            <dt>Tenant contact</dt><dd>{tenant?.email || tenant?.phone || "—"}</dd>
            <dt>Property Manager</dt><dd>{ticket.assigned_pm_name || ticket.assigned_pm || "Unassigned"}</dd>
            <dt>Vendor</dt><dd>{ticket.assigned_vendor?.name || ticket.assigned_vendor_id || "Unassigned"}</dd>
          </dl>
          {canDecide && (
            <div style={s.actions}>
              <button style={s.approve} disabled={submitting} onClick={() => decide("approved")}>Approve</button>
              <button style={s.reject} disabled={submitting} onClick={() => decide("rejected")}>Reject</button>
            </div>
          )}
          {decisionError && <p style={s.error}>{decisionError}</p>}
        </section>
      </div>

      <section style={s.card}>
        <h2 style={s.cardTitle}>Attachments</h2>
        {ticket.attachments?.length ? ticket.attachments.map(attachment => (
          <a key={attachment.id} href={`${API}${attachment.url}`} target="_blank" rel="noreferrer" style={s.attachment}>
            <span>{attachment.filename}</span><span>{attachment.type} · {dateValue(attachment.uploaded_at)}</span>
          </a>
        )) : <p style={s.muted}>No attachments.</p>}
      </section>

      <section style={s.card}>
        <TicketComments ticketId={ticket.id} role="Owner" styles={commentsStyles} />
      </section>

      <section style={s.card}>
        <h2 style={s.cardTitle}>Ticket history</h2>
        {ticket.history?.length ? ticket.history.map(entry => (
          <div key={entry.id || `${entry.changed_at}-${entry.to_status}`} style={s.historyRow}>
            <strong>{STATUS_LABELS[entry.to_status] || entry.to_status}</strong>
            <span>{dateValue(entry.created_at || entry.changed_at)} · {entry.changed_by || "System"}</span>
            {entry.note && <p>{entry.note}</p>}
          </div>
        )) : <p style={s.muted}>No history available.</p>}
      </section>
    </div>
  );
}

const commentsStyles = {
  section: {}, sectionLabel: { margin: 0, fontSize: 18, fontWeight: 700, color: "#0f172a" },
  sectionSub: { color: "#64748b", fontSize: 13 }, muted: { color: "#64748b", fontSize: 13 },
  commentList: { display: "grid", gap: 10 }, commentCard: { border: "1px solid #e2e8f0", borderRadius: 10, padding: 12 },
  commentHeader: { display: "flex", gap: 8 }, commentAuthor: { color: "#0f172a" }, commentRole: { color: "#64748b", fontSize: 12 },
  commentBody: { color: "#334155", whiteSpace: "pre-wrap" }, commentFooter: { display: "flex", justifyContent: "space-between", color: "#64748b", fontSize: 12 },
  visibilityBadge: { color: "#4f46e5" }, commentForm: { marginTop: 16 }, textarea: { width: "100%", boxSizing: "border-box", padding: 10, border: "1px solid #cbd5e1", borderRadius: 8 },
  commentFormActions: { display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 8 }, visibilitySelect: { padding: 8, borderRadius: 8, border: "1px solid #cbd5e1" },
  sendButton: { background: "#4f46e5", color: "#fff", border: 0, borderRadius: 8, padding: "8px 16px", fontWeight: 700, cursor: "pointer" },
  errorText: { color: "#dc2626", fontSize: 13 }, successText: { color: "#059669", fontSize: 13 },
};

const s = {
  page: { maxWidth: 1100, margin: "0 auto", padding: 28, fontFamily: "'DM Sans', sans-serif", color: "#334155" },
  back: { border: 0, background: "transparent", color: "#4f46e5", cursor: "pointer", padding: 0, marginBottom: 18, fontWeight: 700 },
  header: { display: "flex", justifyContent: "space-between", gap: 20, alignItems: "flex-start", marginBottom: 20 },
  eyebrow: { margin: 0, color: "#64748b", fontSize: 12, fontFamily: "monospace" }, title: { margin: "5px 0", color: "#0f172a", fontSize: 24 },
  subtitle: { margin: 0, color: "#64748b" }, headerStatus: { background: "#eef2ff", color: "#3730a3", borderRadius: 20, padding: "8px 14px", fontWeight: 700, whiteSpace: "nowrap" },
  card: { background: "#fff", border: "1px solid #e2e8f0", borderRadius: 14, padding: 20, marginBottom: 18, boxShadow: "0 1px 2px rgba(15,23,42,.04)" },
  cardTitle: { margin: "0 0 16px", color: "#0f172a", fontSize: 17 }, subheading: { color: "#0f172a", fontSize: 14, margin: "20px 0 6px" },
  grid: { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: 18 },   details: { display: "grid", gridTemplateColumns: "minmax(120px, .8fr) 1.2fr", gap: "10px 14px", margin: 0 },
  description: { whiteSpace: "pre-wrap", lineHeight: 1.6, margin: 0 }, urgent: { marginLeft: 8, color: "#b91c1c", fontWeight: 700 },
  workflow: { display: "flex", gap: 10, overflowX: "auto", paddingBottom: 8 }, step: { minWidth: 90, display: "flex", flexDirection: "column", alignItems: "center", gap: 7, textAlign: "center" },
  stepDot: { width: 28, height: 28, borderRadius: "50%", display: "grid", placeItems: "center", background: "#e2e8f0", color: "#64748b", fontSize: 12, fontWeight: 700 }, stepActive: { background: "#4f46e5", color: "#fff" },
  stepLabel: { fontSize: 11, color: "#475569", whiteSpace: "normal", overflowWrap: "normal" }, actions: { display: "flex", gap: 10, marginTop: 20 },
  approve: { background: "#059669", color: "#fff", border: 0, borderRadius: 8, padding: "9px 16px", fontWeight: 700, cursor: "pointer" }, reject: { background: "#dc2626", color: "#fff", border: 0, borderRadius: 8, padding: "9px 16px", fontWeight: 700, cursor: "pointer" },
  secondary: { padding: "9px 14px", border: 0, borderRadius: 8, background: "#e2e8f0", cursor: "pointer" }, attachment: { display: "flex", justifyContent: "space-between", gap: 12, padding: "12px 0", borderBottom: "1px solid #f1f5f9", color: "#4f46e5", textDecoration: "none", fontSize: 13 },
  historyRow: { borderLeft: "3px solid #c7d2fe", padding: "3px 0 8px 12px", marginBottom: 10 }, error: { color: "#dc2626", fontSize: 13 }, muted: { color: "#64748b", fontSize: 13 },
};

export default OwnerTicketDetail;
