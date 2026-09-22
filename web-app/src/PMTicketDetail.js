import React, { useEffect, useState, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import TicketComments from "./TicketComments";

const API = "http://localhost:8000";

const STATUS_STYLES = {
  open: { bg: "#fee2e2", color: "#991b1b", label: "Open" },
  pm_review: { bg: "#fef3c7", color: "#92400e", label: "PM Review" },
  quote_requested: { bg: "#dbeafe", color: "#1e40af", label: "Quote Requested" },
  quote_received: { bg: "#e0e7ff", color: "#3730a3", label: "Quote Received" },
  pending_owner_approval: { bg: "#ede9fe", color: "#5b21b6", label: "Pending Owner Approval" },
  approved: { bg: "#dcfce7", color: "#166534", label: "Approved" },
  in_progress: { bg: "#fef3c7", color: "#92400e", label: "In Progress" },
  completed: { bg: "#cffafe", color: "#155e75", label: "Completed" },
  closed: { bg: "#d1fae5", color: "#065f46", label: "Closed" },
  rejected: { bg: "#fee2e2", color: "#991b1b", label: "Rejected" },
  in_review: { bg: "#fef3c7", color: "#92400e", label: "PM Review" },
  scheduled: { bg: "#dbeafe", color: "#1e40af", label: "Quote Requested" },
};

// Read-only 9-step overview of the Day 24 lifecycle. Mirrors the tenant
// view's StatusStepper (MaintenanceDetail.js) so PMs and tenants see the
// same shape. "rejected" is terminal and shown parked at the Owner
// Approval step, same as the tenant view.
const STEPS = ["Open", "PM Review", "Quote Requested", "Quote Received", "Owner Approval", "Approved", "In Progress", "Completed", "Closed"];
const STATUS_TO_STEP = {
  open: 0, pm_review: 1, quote_requested: 2, quote_received: 3,
  pending_owner_approval: 4, approved: 5, in_progress: 6, completed: 7,
  closed: 8, rejected: 4, in_review: 1, scheduled: 2,
};
const ACTIVE_PRIORITY_STATUSES = new Set([
  "open", "pm_review", "quote_requested", "quote_received",
  "pending_owner_approval", "approved", "in_progress", "completed",
]);

// Human-readable PM actions, one per legal forward transition out of the
// current status. Deliberately does NOT include quote_requested ->
// quote_received: that move is driven by the (separate) vendor-quote
// feature calling transition_ticket() directly, not by a PM button here.
// The server (ticket_states.py ALLOWED_TRANSITIONS) remains authoritative;
// this list only decides which buttons a PM is offered.
const TICKET_ACTIONS = {
  open: [{ to: "pm_review", label: "Start Review" }],
  pm_review: [{ to: "quote_requested", label: "Request Quote from Vendor" }],
  quote_received: [{ to: "pending_owner_approval", label: "Submit to Owner for Approval" }],
  approved: [{ to: "in_progress", label: "Begin Work" }],
  in_progress: [{ to: "completed", label: "Mark Completed" }],
  completed: [{ to: "closed", label: "Close Ticket" }],
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

function StatusStepper({ status }) {
  const currentIndex = STATUS_TO_STEP[status] ?? 0;
  const isDone = status === "closed" || status === "rejected";

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

// Confirms one transition, with an optional note that becomes the
// TicketHistory audit row (this.note is what a PM would point to in a
// dispute, per the task's "Big Picture" rationale).
function TransitionModal({ action, submitting, error, onCancel, onConfirm }) {
  const [note, setNote] = useState("");

  return (
    <div style={s.modalOverlay} onClick={submitting ? undefined : onCancel}>
      <div style={s.modalCard} onClick={e => e.stopPropagation()}>
        <p style={s.modalTitle}>{action.label}</p>
        <p style={s.modalSub}>
          This moves the ticket to <strong>{STATUS_STYLES[action.to]?.label || action.to}</strong>.
        </p>
        <label style={s.modalLabel}>Add note (optional)</label>
        <textarea
          style={s.textarea}
          rows={3}
          value={note}
          onChange={e => setNote(e.target.value)}
          placeholder="e.g. Tenant confirmed issue still present…"
          disabled={submitting}
          autoFocus
        />
        {error && <p style={s.errorText}>{error}</p>}
        <div style={s.modalActions}>
          <button style={s.modalCancelBtn} onClick={onCancel} disabled={submitting}>
            Cancel
          </button>
          <button style={s.modalConfirmBtn} onClick={() => onConfirm(note)} disabled={submitting}>
            {submitting ? "Saving…" : "Confirm"}
          </button>
        </div>
      </div>
    </div>
  );
}

function AttachmentDeleteModal({ attachment, submitting, error, onCancel, onConfirm }) {
  return (
    <div style={s.modalOverlay} onClick={submitting ? undefined : onCancel}>
      <div style={s.modalCard} onClick={e => e.stopPropagation()}>
        <p style={s.modalTitle}>Delete this attachment?</p>
        <p style={s.modalSub}>
          <strong>{attachment.filename}</strong>
        </p>
        <p style={s.modalSub}>This document will be permanently removed.</p>
        {error && <p style={s.errorText}>{error}</p>}
        <div style={s.modalActions}>
          <button style={s.modalCancelBtn} onClick={onCancel} disabled={submitting}>
            Cancel
          </button>
          <button style={s.modalConfirmBtn} onClick={onConfirm} disabled={submitting}>
            {submitting ? "Deleting…" : "Delete"}
          </button>
        </div>
      </div>
    </div>
  );
}

function PMTicketDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const token = localStorage.getItem("token");

  const [ticket, setTicket] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // Which action is currently open in the confirm modal (or null).
  const [pendingAction, setPendingAction] = useState(null);
  const [transitioning, setTransitioning] = useState(false);
  const [transitionError, setTransitionError] = useState("");

  const [noteDraft, setNoteDraft] = useState("");
  const [savingNote, setSavingNote] = useState(false);
  const [noteSaved, setNoteSaved] = useState(false);
  const [noteError, setNoteError] = useState("");

  const [vendors, setVendors] = useState([]);
  const [vendorSelection, setVendorSelection] = useState("");
  const [vendorSaving, setVendorSaving] = useState(false);
  const [vendorError, setVendorError] = useState("");
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState("");
  const [attachmentToDelete, setAttachmentToDelete] = useState(null);
  const [deletingAttachmentId, setDeletingAttachmentId] = useState(null);
  const [deleteError, setDeleteError] = useState("");
  const [deleteSuccess, setDeleteSuccess] = useState("");
  const [prioritySaving, setPrioritySaving] = useState(false);
  const [priorityError, setPriorityError] = useState("");

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
      setNoteDraft(data.pm_notes || "");
      setVendorSelection(data.assigned_vendor_id || "");
    } catch {
      setError("Server error. Please try again.");
    } finally {
      setLoading(false);
    }
  }, [id, token]);

  useEffect(() => { fetchTicket(); }, [fetchTicket]);

  useEffect(() => {
    fetch(`${API}/vendors`, { headers: { Authorization: `Bearer ${token}` } })
      .then(res => res.ok ? res.json() : [])
      .then(data => setVendors(Array.isArray(data) ? data : []))
      .catch(() => setVendors([]));
  }, [token]);

  const confirmTransition = async (note) => {
    if (!pendingAction) return;
    setTransitioning(true);
    setTransitionError("");
    try {
      const res = await fetch(`${API}/tickets/${id}/transition`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ new_status: pendingAction.to, note: note || null }),
      });
      const data = await res.json();
      if (res.ok) {
        setTicket(data);
        setPendingAction(null);
      } else {
        setTransitionError(data.detail || "Could not update status");
      }
    } catch {
      setTransitionError("Server error. Please try again.");
    } finally {
      setTransitioning(false);
    }
  };

  const saveNote = async () => {
    setSavingNote(true);
    setNoteSaved(false);
    setNoteError("");
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
      } else {
        setNoteError(data.detail || "Could not save note");
      }
    } catch {
      setNoteError("Server error. Please try again.");
    } finally {
      setSavingNote(false);
    }
  };

  const saveVendor = async () => {
    setVendorSaving(true);
    setVendorError("");
    try {
      const res = await fetch(`${API}/tickets/${id}/assign-vendor`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ vendor_id: vendorSelection || null }),
      });
      const data = await res.json();
      if (!res.ok) {
        setVendorError(data.detail || "Could not assign vendor");
        return;
      }
      setTicket(data);
    } catch {
      setVendorError("Server error. Please try again.");
    } finally {
      setVendorSaving(false);
    }
  };

  const toggleUrgent = async () => {
    setPrioritySaving(true);
    setPriorityError("");
    try {
      const res = await fetch(`${API}/pm/tickets/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ priority: ticket.priority === "urgent" ? "normal" : "urgent" }),
      });
      const data = await res.json();
      if (res.ok) {
        setTicket(data);
      } else {
        setPriorityError(data.detail || "Could not update priority");
      }
    } catch {
      setPriorityError("Server error. Please try again.");
    } finally {
      setPrioritySaving(false);
    }
  };

  const uploadDocument = async event => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    setUploading(true);
    setUploadError("");
    try {
      const form = new FormData();
      form.append("files", file);
      form.append("attachment_type", "pm_note");
      const res = await fetch(`${API}/tickets/${id}/attachments`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: form,
      });
      const data = await res.json();
      if (!res.ok) {
        setUploadError(data.detail || "Could not upload document");
        return;
      }
      setTicket(current => ({ ...current, attachments: [...(current.attachments || []), ...data] }));
    } catch {
      setUploadError("Server error. Please try again.");
    } finally {
      setUploading(false);
    }
  };

  const deleteAttachment = async attachment => {
    setDeletingAttachmentId(attachment.id);
    setDeleteError("");
    setDeleteSuccess("");
    try {
      const res = await fetch(`${API}/tickets/${id}/attachments/${attachment.id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (!res.ok) {
        setDeleteError(data.detail || "Could not delete attachment");
        return;
      }
      setTicket(current => ({
        ...current,
        attachments: (current.attachments || []).filter(item => item.id !== attachment.id),
      }));
      setDeleteSuccess("Attachment deleted.");
      setAttachmentToDelete(null);
    } catch {
      setDeleteError("Server error. Please try again.");
    } finally {
      setDeletingAttachmentId(null);
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
  const actions = TICKET_ACTIONS[ticket.status] || [];
  const history = ticket.history || [];
  const canChangePriority = ACTIVE_PRIORITY_STATUSES.has(ticket.status);

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

        <StatusStepper status={ticket.status} />

        {ticket.description && <p style={s.description}>{ticket.description}</p>}

        <div style={s.metaGrid}>
          <div>
            <p style={s.metaLabel}>Priority</p>
            <div style={s.priorityRow}>
              <p style={s.metaValue}>{ticket.priority === "urgent" ? "🚨 Urgent" : ticket.priority || "Normal"}</p>
              {canChangePriority && (
                <button
                  type="button"
                  aria-label={ticket.priority === "urgent" ? "Remove urgent priority" : "Mark ticket urgent"}
                  style={ticket.priority === "urgent" ? s.urgentToggleActive : s.urgentToggle}
                  onClick={toggleUrgent}
                  disabled={prioritySaving}
                >
                  {ticket.priority === "urgent" ? "Urgent" : "Mark urgent"}
                </button>
              )}
            </div>
            {priorityError && <p style={s.errorText}>{priorityError}</p>}
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

        <div style={s.metadataPanel}>
          <p style={s.sectionLabel}>Ticket Details</p>
          <div style={s.detailGrid}>
            <div><p style={s.metaLabel}>Unit address</p><p style={s.metaValue}>{ticket.unit_address || "—"}</p></div>
            <div><p style={s.metaLabel}>Tenant</p><p style={s.metaValue}>{ticket.tenant?.full_name || ticket.tenant?.username || "—"}</p></div>
            <div><p style={s.metaLabel}>Tenant email</p><p style={s.metaValue}>{ticket.tenant?.email || "—"}</p></div>
            <div><p style={s.metaLabel}>Property</p><p style={s.metaValue}>{ticket.property_name || "—"}</p></div>
            <div><p style={s.metaLabel}>Assigned PM</p><p style={s.metaValue}>{ticket.assigned_pm_name || ticket.assigned_pm || "—"}</p></div>
            <div><p style={s.metaLabel}>Created</p><p style={s.metaValue}>{formatDateTime(ticket.created_at)}</p></div>
            <div><p style={s.metaLabel}>Last updated</p><p style={s.metaValue}>{formatDateTime(ticket.updated_at)}</p></div>
            {ticket.sla_target && <div><p style={s.metaLabel}>SLA target</p><p style={s.urgentText}>{ticket.sla_target}</p></div>}
          </div>
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

        <div style={s.section}>
          <div style={s.sectionHeader}>
            <p style={s.sectionLabel}>Attachments</p>
            <label style={s.uploadBtn}>
              {uploading ? "Uploading…" : "Upload Document"}
              <input type="file" accept="application/pdf,image/jpeg,image/png,image/webp,image/gif" onChange={uploadDocument} disabled={uploading} style={s.hiddenInput} />
            </label>
          </div>
          {uploadError && <p style={s.errorText}>{uploadError}</p>}
          {deleteError && <p style={s.errorText}>{deleteError}</p>}
          {deleteSuccess && <p style={s.savedHint}>{deleteSuccess}</p>}
          {ticket.attachments?.length ? (
            <div style={s.attachmentList}>
              {ticket.attachments.map(a => (
                <div key={a.id} style={s.attachmentRow}>
                  <span style={s.typeBadge}>{a.type === "pm_note" ? "PM note" : a.type || "Document"}</span>
                  <a href={a.url} target="_blank" rel="noreferrer" style={s.attachmentLink} aria-label={`Open ${a.filename}`}>
                    {a.filename}
                  </a>
                  <span style={s.attachmentDate}>{a.uploaded_at ? formatDateTime(a.uploaded_at) : "—"}</span>
                  <button
                    type="button"
                    style={s.deleteAttachmentBtn}
                    onClick={() => { setDeleteError(""); setDeleteSuccess(""); setAttachmentToDelete(a); }}
                    disabled={Boolean(deletingAttachmentId)}
                    aria-label={`Delete ${a.filename}`}
                  >
                    Delete
                  </button>
                </div>
              ))}
            </div>
          ) : <p style={s.muted}>No attachments yet.</p>}
        </div>

        <div style={s.section}>
          <p style={s.sectionLabel}>Assign Vendor</p>
          {ticket.assigned_vendor_id && <p style={s.assignedVendor}>Currently assigned: {ticket.assigned_vendor?.name || ticket.assigned_vendor_id}</p>}
          {vendors.length === 0 ? <p style={s.muted}>No vendors yet</p> : (
            <div style={s.vendorRow}>
              <select style={s.vendorSelect} value={vendorSelection} onChange={e => setVendorSelection(e.target.value)}>
                <option value="">Select a vendor</option>
                {vendors.map(v => <option key={v.id} value={v.id}>{v.name || v.full_name || v.id}</option>)}
              </select>
              <button style={s.saveNoteBtn} onClick={saveVendor} disabled={vendorSaving}>{vendorSaving ? "Saving…" : "Save Vendor"}</button>
            </div>
          )}
          {vendorError && <p style={s.errorText}>{vendorError}</p>}
        </div>

        {/* Contextual actions — replaces the generic status dropdown */}
        <div style={s.section}>
          <p style={s.sectionLabel}>Actions</p>
          {actions.length > 0 ? (
            <div style={s.actionRow}>
              {actions.map(action => (
                <button
                  key={action.to}
                  style={s.actionBtn}
                  onClick={() => { setTransitionError(""); setPendingAction(action); }}
                >
                  {action.label}
                </button>
              ))}
            </div>
          ) : ticket.status === "quote_requested" ? (
            <p style={s.muted}>Waiting on the vendor quote before this can move forward.</p>
          ) : ticket.status === "pending_owner_approval" ? (
            <p style={s.muted}>Waiting on the owner's decision.</p>
          ) : (
            <p style={s.muted}>This ticket has no further PM action available.</p>
          )}
          {transitionError && !pendingAction && <p style={s.errorText}>{transitionError}</p>}
        </div>

        <TicketComments ticketId={ticket.id} role="Property Manager" styles={s} />

        {/* Legacy pm_notes editor retained for backward compatibility */}
        <div style={s.section}>
          <p style={s.sectionLabel}>Add Note</p>
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
          {noteError && <p style={s.errorText}>{noteError}</p>}
        </div>

        {/* Ticket history timeline */}
        <div style={s.section}>
          <p style={s.sectionLabel}>History</p>
          {history.length > 0 ? (
            <div style={s.historyList}>
              {[...history].reverse().map((h, i) => {
                const toSt = STATUS_STYLES[h.to_status] || { label: h.to_status };
                return (
                  <div key={h.id ?? i} style={s.historyRow}>
                    <span style={s.historyDot} />
                    <div>
                      <p style={s.historyText}>
                        {formatDateTime(h.created_at)} · {h.changed_by || "System"} moved to{" "}
                        <strong>{toSt.label}</strong>
                        {h.note ? `: ${h.note}` : ""}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <p style={s.muted}>No transitions yet.</p>
          )}
        </div>
      </div>

      {pendingAction && (
        <TransitionModal
          action={pendingAction}
          submitting={transitioning}
          error={transitionError}
          onCancel={() => { if (!transitioning) { setPendingAction(null); setTransitionError(""); } }}
          onConfirm={confirmTransition}
        />
      )}
      {attachmentToDelete && (
        <AttachmentDeleteModal
          attachment={attachmentToDelete}
          submitting={Boolean(deletingAttachmentId)}
          error={deleteError}
          onCancel={() => { if (!deletingAttachmentId) setAttachmentToDelete(null); }}
          onConfirm={() => deleteAttachment(attachmentToDelete)}
        />
      )}
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
  priorityRow: { display: "flex", alignItems: "center", gap: 8 },
  urgentToggle: { border: "1px solid #fecaca", background: "#fff", color: "#b91c1c", borderRadius: 6, padding: "4px 7px", fontSize: 10, fontWeight: 700, cursor: "pointer" },
  urgentToggleActive: { border: "1px solid #dc2626", background: "#dc2626", color: "#fff", borderRadius: 6, padding: "4px 7px", fontSize: 10, fontWeight: 700, cursor: "pointer" },
  urgentText: { fontSize: 13, color: "#b91c1c", fontWeight: 700, margin: "2px 0 0" },

  section:      { marginTop: 18, paddingTop: 16, borderTop: "1px solid #f1f5f9" },
  metadataPanel: { marginTop: 18, padding: 14, background: "#f8fafc", borderRadius: 10 },
  detailGrid: { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(135px, 1fr))", gap: 12, marginTop: 10 },
  sectionLabel: { fontSize: 12, color: "#0f172a", fontWeight: 700, margin: "0 0 4px" },
  sectionSub:   { fontSize: 12, color: "#94a3b8", margin: "0 0 10px" },
  sectionHeader: { display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10 },

  tenantCard: { background: "#f8fafc", borderRadius: 10, padding: "12px 14px" },
  tenantName: { margin: 0, fontSize: 14, fontWeight: 700, color: "#0f172a" },
  tenantLink: { fontSize: 13, color: "#6366f1", fontWeight: 600, textDecoration: "none" },
  tenantMeta: { margin: "2px 0 0", fontSize: 13, color: "#64748b" },

  photoRow:  { display: "flex", gap: 10, flexWrap: "wrap" },
  photoThumb:{ width: 80, height: 80, borderRadius: 10, objectFit: "cover", border: "1px solid #e2e8f0" },
  attachmentList: { display: "flex", flexDirection: "column", gap: 8, marginTop: 8 },
  attachmentRow: { display: "flex", alignItems: "center", gap: 8, padding: "8px 10px", background: "#f8fafc", borderRadius: 8 },
  typeBadge: { fontSize: 10, fontWeight: 700, color: "#475569", background: "#e2e8f0", borderRadius: 5, padding: "3px 6px" },
  attachmentLink: { color: "#4f46e5", fontSize: 13, fontWeight: 600, textDecoration: "none", flex: 1, overflow: "hidden", textOverflow: "ellipsis" },
  attachmentDate: { color: "#94a3b8", fontSize: 11 },
  deleteAttachmentBtn: { background: "none", border: "none", color: "#64748b", padding: "4px 2px", cursor: "pointer", fontSize: 11, fontWeight: 600 },
  uploadBtn: { background: "#6366f1", border: "none", color: "#fff", padding: "8px 11px", borderRadius: 7, cursor: "pointer", fontSize: 11, fontWeight: 700 },
  hiddenInput: { display: "none" },

  actionRow: { display: "flex", gap: 10, flexWrap: "wrap" },
  actionBtn: { background: "#6366f1", border: "none", color: "#fff", padding: "10px 16px", borderRadius: 8, cursor: "pointer", fontSize: 13, fontWeight: 600 },

  textarea:    { width: "100%", boxSizing: "border-box", padding: "10px 12px", borderRadius: 8, border: "1px solid #e2e8f0", fontSize: 13, fontFamily: "inherit", resize: "vertical" },
  noteActions: { display: "flex", alignItems: "center", gap: 12, marginTop: 10 },
  saveNoteBtn: { background: "#6366f1", border: "none", color: "#fff", padding: "9px 16px", borderRadius: 8, cursor: "pointer", fontSize: 13, fontWeight: 600 },
  savedHint:   { fontSize: 12, color: "#059669", fontWeight: 600 },
  vendorRow: { display: "flex", gap: 8, alignItems: "center" },
  vendorSelect: { flex: 1, padding: "9px 10px", borderRadius: 8, border: "1px solid #e2e8f0", fontSize: 13, fontFamily: "inherit", background: "#fff" },
  assignedVendor: { margin: "0 0 8px", fontSize: 12, color: "#475569" },

  historyList:  { marginTop: 4, display: "flex", flexDirection: "column", gap: 12 },
  historyRow:   { display: "flex", gap: 10, alignItems: "flex-start" },
  historyDot:   { width: 8, height: 8, borderRadius: "50%", background: "#a5b4fc", marginTop: 6, flexShrink: 0 },
  historyText:  { fontSize: 13, color: "#334155", margin: 0, lineHeight: 1.5 },
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

  modalOverlay: {
    position: "fixed", top: 0, left: 0, right: 0, bottom: 0,
    background: "rgba(15, 23, 42, 0.45)", display: "flex",
    alignItems: "center", justifyContent: "center", padding: 20, zIndex: 50,
  },
  modalCard: {
    background: "#fff", borderRadius: 14, padding: 22, maxWidth: 400, width: "100%",
    boxShadow: "0 20px 40px rgba(15, 23, 42, 0.25)",
  },
  modalTitle: { margin: 0, fontSize: 16, fontWeight: 700, color: "#0f172a" },
  modalSub:   { fontSize: 13, color: "#64748b", margin: "6px 0 14px" },
  modalLabel: { fontSize: 12, color: "#0f172a", fontWeight: 700, display: "block", marginBottom: 6 },
  modalActions: { display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 14 },
  modalCancelBtn: { background: "#f1f5f9", color: "#475569", border: "none", padding: "9px 16px", borderRadius: 8, cursor: "pointer", fontSize: 13, fontWeight: 600 },
  modalConfirmBtn: { background: "#6366f1", border: "none", color: "#fff", padding: "9px 16px", borderRadius: 8, cursor: "pointer", fontSize: 13, fontWeight: 600 },
};

export default PMTicketDetail;