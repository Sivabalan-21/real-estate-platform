import React, { useCallback, useEffect, useMemo, useState } from "react";

const API = "http://localhost:8000";

const VISIBILITY_OPTIONS = {
  Tenant: [{ value: "all", label: "Everyone" }],
  "Property Manager": [
    { value: "all", label: "Everyone" },
    { value: "owner_pm", label: "Owner + PM" },
    { value: "pm_vendor", label: "PM + Vendor" },
  ],
  Owner: [
    { value: "all", label: "Everyone" },
    { value: "owner_pm", label: "Owner + PM" },
  ],
  Vendor: [
    { value: "all", label: "Everyone" },
    { value: "pm_vendor", label: "PM + Vendor" },
  ],
};

function formatCommentDate(dateStr) {
  if (!dateStr) return "—";
  const date = new Date(dateStr);
  if (Number.isNaN(date.getTime())) return dateStr;
  return date.toLocaleString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function TicketComments({ ticketId, role, styles = {} }) {
  const token = localStorage.getItem("token");
  const options = useMemo(
    () => VISIBILITY_OPTIONS[role] || VISIBILITY_OPTIONS.Tenant,
    [role]
  );
  const [comments, setComments] = useState([]);
  const [body, setBody] = useState("");
  const [visibleTo, setVisibleTo] = useState(options[0].value);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const fetchComments = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const response = await fetch(`${API}/tickets/${ticketId}/comments`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await response.json();
      if (!response.ok) {
        setError(data.detail || "Could not load comments");
        return;
      }
      setComments(Array.isArray(data) ? data : []);
    } catch {
      setError("Server error. Please try again.");
    } finally {
      setLoading(false);
    }
  }, [ticketId, token]);

  useEffect(() => {
    setVisibleTo(options[0].value);
    fetchComments();
  }, [fetchComments, options]);

  const submitComment = async event => {
    event.preventDefault();
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
        setError(data.detail || "Could not send comment");
        return;
      }
      setBody("");
      setSuccess("Comment sent.");
      await fetchComments();
    } catch {
      setError("Server error. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div style={styles.section}>
      <p style={styles.sectionLabel}>Comments</p>
      <p style={styles.sectionSub}>
        {role === "Tenant" ? "Messages shared with your property team." : "Keep the ticket conversation in one place."}
      </p>

      {loading ? (
        <p style={styles.muted}>Loading comments…</p>
      ) : comments.length === 0 ? (
        <p style={styles.muted}>No comments yet.</p>
      ) : (
        <div style={styles.commentList}>
          {comments.map(comment => (
            <div key={comment.id} style={styles.commentCard}>
              <div style={styles.commentHeader}>
                <strong style={styles.commentAuthor}>{comment.author_username || "Unknown user"}</strong>
                <span style={styles.commentRole}>{comment.author_role}</span>
              </div>
              <p style={styles.commentBody}>{comment.body}</p>
              <div style={styles.commentFooter}>
                <span>{formatCommentDate(comment.created_at)}</span>
                {role !== "Tenant" && (
                  <span style={styles.visibilityBadge}>
                    {options.find(option => option.value === comment.visible_to)?.label || comment.visible_to}
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      <form onSubmit={submitComment} style={styles.commentForm}>
        <textarea
          style={styles.textarea}
          rows={3}
          value={body}
          onChange={event => setBody(event.target.value)}
          placeholder="Write a message…"
          disabled={submitting}
          aria-label="Write a message"
        />
        <div style={styles.commentFormActions}>
          {options.length > 1 && (
            <label style={styles.visibilityControl}>
              <span className={styles.srOnly}>Comment visibility</span>
              <select
                style={styles.visibilitySelect}
                value={visibleTo}
                onChange={event => setVisibleTo(event.target.value)}
                disabled={submitting}
                aria-label="Comment visibility"
              >
                {options.map(option => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </select>
            </label>
          )}
          <button type="submit" style={styles.sendButton} disabled={submitting || !body.trim()}>
            {submitting ? "Sending…" : "Send"}
          </button>
        </div>
      </form>

      {error && <p style={styles.errorText}>{error}</p>}
      {success && <p style={styles.successText}>{success}</p>}
    </div>
  );
}

export default TicketComments;
