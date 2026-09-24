import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";

const API = "http://localhost:8000";
const LAST_VIEWED_PREFIX = "ticket_comments_last_viewed_";
const POLL_INTERVAL_MS = 5000;

const VISIBILITY_OPTIONS = {
  Tenant: [{ value: "all", label: "All Parties" }],
  "Property Manager": [
    { value: "all", label: "All Parties" },
    { value: "owner_pm", label: "Owner + PM" },
    { value: "pm_vendor", label: "PM + Vendor" },
  ],
  Owner: [
    { value: "all", label: "All Parties" },
    { value: "owner_pm", label: "Owner + PM" },
  ],
  Vendor: [
    { value: "all", label: "All Parties" },
    { value: "pm_vendor", label: "PM + Vendor" },
  ],
};

const VISIBILITY_LABELS = {
  all: "All Parties",
  owner_pm: "Owner + PM",
  pm_vendor: "PM + Vendor",
};

const SCOPE_STYLES = {
  all: { background: "#ffffff", border: "#e2e8f0" },
  owner_pm: { background: "#eff6ff", border: "#bfdbfe" },
  pm_vendor: { background: "#f0fdf4", border: "#bbf7d0" },
};

// See PMTickets.js: backend created_at strings are naive UTC with no "Z", so
// `new Date(str)` parses them as local time and they look hours old in any
// timezone ahead of UTC. Append "Z" so they're read as UTC.
function parseServerTimestamp(value) {
  if (typeof value === "string" && !/[zZ]|[+-]\d{2}:?\d{2}$/.test(value)) {
    return new Date(`${value}Z`).getTime();
  }
  return new Date(value).getTime();
}

function formatCommentDate(dateStr) {
  if (!dateStr) return "—";
  const timestamp = parseServerTimestamp(dateStr);
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return dateStr;
  return date.toLocaleString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function defaultStyles() {
  return {
    section: {},
    sectionLabel: { margin: 0, color: "#0f172a", fontSize: 17, fontWeight: 700 },
    sectionSub: { margin: "4px 0 14px", color: "#64748b", fontSize: 13 },
    muted: { color: "#64748b", fontSize: 13 },
    commentList: { display: "flex", flexDirection: "column", gap: 10, margin: "12px 0 16px" },
    commentCard: { border: "1px solid #e2e8f0", borderRadius: 12, padding: 12 },
    commentHeader: { display: "flex", alignItems: "flex-start", gap: 10 },
    avatar: { width: 30, height: 30, borderRadius: "50%", display: "grid", placeItems: "center", flexShrink: 0, background: "#e0e7ff", color: "#3730a3", fontSize: 13, fontWeight: 700 },
    commentHeaderText: { minWidth: 0, flex: 1 },
    commentAuthor: { color: "#0f172a", fontSize: 13 },
    unreadAuthor: { fontWeight: 800 },
    commentRole: { display: "inline-block", marginLeft: 7, padding: "2px 7px", borderRadius: 999, background: "#f1f5f9", color: "#475569", fontSize: 10, fontWeight: 700 },
    commentMeta: { display: "flex", flexWrap: "wrap", alignItems: "center", gap: 8, marginTop: 3, color: "#64748b", fontSize: 11 },
    commentBody: { margin: "10px 0 0 40px", color: "#334155", fontSize: 13, lineHeight: 1.55, whiteSpace: "pre-wrap", overflowWrap: "anywhere" },
    visibilityBadge: { padding: "2px 7px", borderRadius: 999, background: "#ffffffb8", border: "1px solid #cbd5e1", color: "#475569", fontWeight: 600 },
    commentForm: { marginTop: 12 },
    textarea: { width: "100%", boxSizing: "border-box", resize: "vertical", padding: 10, border: "1px solid #cbd5e1", borderRadius: 9, font: "inherit", color: "#334155" },
    commentFormActions: { display: "flex", flexWrap: "wrap", justifyContent: "flex-end", alignItems: "center", gap: 8, marginTop: 8 },
    visibilityControl: { flex: "1 1 180px" },
    visibilitySelect: { width: "100%", boxSizing: "border-box", padding: "8px 10px", borderRadius: 8, border: "1px solid #cbd5e1", background: "#fff", color: "#334155", font: "inherit", fontSize: 12 },
    sendButton: { background: "#6366f1", border: "none", color: "#fff", padding: "9px 16px", borderRadius: 8, cursor: "pointer", fontSize: 13, fontWeight: 700 },
    errorText: { color: "#dc2626", fontSize: 12, margin: "8px 0 0" },
    successText: { color: "#059669", fontSize: 12, fontWeight: 600, margin: "8px 0 0" },
    deleteButton: { border: "none", background: "transparent", color: "#64748b", padding: 0, cursor: "pointer", font: "inherit", fontSize: 11, fontWeight: 700 },
    srOnly: { position: "absolute", width: 1, height: 1, padding: 0, margin: -1, overflow: "hidden", clip: "rect(0, 0, 0, 0)", whiteSpace: "nowrap", border: 0 },
  };
}

function TicketComments({ ticketId, role, styles = {} }) {
  const token = localStorage.getItem("token");
  const currentUsername = localStorage.getItem("username");
  const ui = useMemo(() => ({ ...defaultStyles(), ...styles }), [styles]);
  const options = useMemo(
    () => VISIBILITY_OPTIONS[role] || VISIBILITY_OPTIONS.Tenant,
    [role]
  );
  const canSend = role !== "Tenant";
  const lastViewedKey = `${LAST_VIEWED_PREFIX}${ticketId}`;
  const [comments, setComments] = useState([]);
  const [body, setBody] = useState("");
  const [visibleTo, setVisibleTo] = useState("all");
  const [lastViewedAt] = useState(() => {
    const stored = localStorage.getItem(lastViewedKey);
    return stored ? Number(stored) : null;
  });
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [deletingId, setDeletingId] = useState(null);
  const fetchingRef = useRef(false);

  const fetchComments = useCallback(async ({ initial = false } = {}) => {
    if (fetchingRef.current) return;
    fetchingRef.current = true;
    if (initial) setLoading(true);
    if (initial) setError("");
    try {
      const response = await fetch(`${API}/tickets/${ticketId}/comments`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await response.json();
      if (!response.ok) {
        if (initial) setError(data.detail || "Could not load messages.");
        return;
      }
      setComments(Array.isArray(data) ? data : []);
      if (initial) localStorage.setItem(lastViewedKey, String(Date.now()));
    } catch {
      if (initial) setError("Could not load messages.");
    } finally {
      fetchingRef.current = false;
      if (initial) setLoading(false);
    }
  }, [lastViewedKey, ticketId, token]);

  useEffect(() => {
    setVisibleTo("all");
    fetchComments({ initial: true });
    const intervalId = window.setInterval(() => fetchComments(), POLL_INTERVAL_MS);
    return () => window.clearInterval(intervalId);
  }, [fetchComments]);

  const submitComment = async event => {
    event.preventDefault();
    if (!canSend) return;
    if (!body.trim()) {
      setError("Write a message before sending.");
      return;
    }

    setSubmitting(true);
    setError("");
    setSuccess("");
    try {
      const response = await fetch(`${API}/tickets/${ticketId}/comments`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ body: body.trim(), visible_to: visibleTo }),
      });
      const data = await response.json();
      if (!response.ok) {
        setError(data.detail || "Could not send message.");
        return;
      }
      setBody("");
      setSuccess("Message sent.");
      setComments(previous => [...previous, data]);
    } catch {
      setError("Could not send message. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  const deleteComment = async comment => {
    if (!window.confirm("Delete this message?")) return;
    setDeletingId(comment.id);
    setError("");
    setSuccess("");
    try {
      const response = await fetch(`${API}/tickets/${ticketId}/comments/${comment.id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${localStorage.getItem("token")}` },
      });
      const data = await response.json();
      if (!response.ok) {
        setError(data.detail || "Could not delete message.");
        return;
      }
      setSuccess("Message deleted.");
    } catch {
      setError("Could not delete message. Please try again.");
    } finally {
      setDeletingId(null);
    }
  };

  const heading = role === "Tenant" ? "Updates from your PM" : "Comments / Messages";
  const description = role === "Tenant"
    ? "Messages shared with you by your property team."
    : "Keep the ticket conversation in one place.";

  return (
    <div style={ui.section}>
      <p style={ui.sectionLabel}>{heading}</p>
      <p style={ui.sectionSub}>{description}</p>

      {loading ? (
        <p style={ui.muted}>Loading messages…</p>
      ) : comments.length === 0 ? (
        <p style={ui.muted}>No messages yet.</p>
      ) : (
        <div style={ui.commentList}>
          {comments.map(comment => {
            const scopeStyle = SCOPE_STYLES[comment.visible_to] || SCOPE_STYLES.all;
            const author = comment.author_display_name || comment.author_username || "Unknown user";
            const unread = Number.isFinite(lastViewedAt)
              && comment.author_username !== currentUsername
              && parseServerTimestamp(comment.created_at) > lastViewedAt;
            return (
              <article
                key={comment.id}
                style={{ ...ui.commentCard, background: scopeStyle.background, borderColor: scopeStyle.border }}
              >
                <div style={{ ...ui.commentHeader, alignItems: "flex-start" }}>
                  <span style={ui.avatar} aria-hidden="true">{author.charAt(0).toUpperCase()}</span>
                  <div style={ui.commentHeaderText}>
                    <div style={{ display: "flex", alignItems: "center", flexWrap: "wrap", columnGap: 8, rowGap: 4, minWidth: 0 }}>
                      <strong style={{ ...ui.commentAuthor, ...(unread ? ui.unreadAuthor : {}), overflowWrap: "anywhere" }}>{author}</strong>
                      <span style={{ ...ui.commentRole, marginLeft: 0, flexShrink: 0 }}>{comment.author_role || "User"}</span>
                    </div>
                    <div style={ui.commentMeta}>
                      <time dateTime={comment.created_at}>{formatCommentDate(comment.created_at)}</time>
                      {role !== "Tenant" && (
                        <span style={ui.visibilityBadge}>{VISIBILITY_LABELS[comment.visible_to] || comment.visible_to}</span>
                      )}
                      {comment.author_username === currentUsername && (
                        <button
                          type="button"
                          style={ui.deleteButton}
                          onClick={() => deleteComment(comment)}
                          disabled={deletingId === comment.id}
                        >
                          {deletingId === comment.id ? "Deleting…" : "Delete"}
                        </button>
                      )}
                    </div>
                  </div>
                </div>
                <p style={ui.commentBody}>{comment.body}</p>
              </article>
            );
          })}
        </div>
      )}

      {canSend && (
        <form onSubmit={submitComment} style={ui.commentForm}>
          <textarea
            style={ui.textarea}
            rows={3}
            value={body}
            onChange={event => setBody(event.target.value)}
            placeholder="Write a message…"
            disabled={submitting}
            aria-label="Write a message"
          />
          <div style={ui.commentFormActions}>
            <label style={ui.visibilityControl}>
              <span style={ui.srOnly}>Message visibility</span>
              <select
                style={ui.visibilitySelect}
                value={visibleTo}
                onChange={event => setVisibleTo(event.target.value)}
                disabled={submitting}
                aria-label="Message visibility"
              >
                {options.map(option => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </select>
            </label>
            <button type="submit" style={ui.sendButton} disabled={submitting || !body.trim()}>
              {submitting ? "Sending…" : "Send"}
            </button>
          </div>
        </form>
      )}

      {error && <p style={ui.errorText}>{error}</p>}
      {success && <p style={ui.successText}>{success}</p>}
    </div>
  );
}

export default TicketComments;