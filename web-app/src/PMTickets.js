import React, { useEffect, useRef, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";

const API = "http://localhost:8000";
const LAST_VIEWED_PREFIX = "ticket_comments_last_viewed_";
const POLL_INTERVAL_MS = 5000;

const STATUS_STYLES = {
  open: { bg: "#fee2e2", color: "#991b1b", label: "Open" }, pm_review: { bg: "#fef3c7", color: "#92400e", label: "PM Review" },
  quote_requested: { bg: "#dbeafe", color: "#1e40af", label: "Quote Requested" }, quote_received: { bg: "#e0e7ff", color: "#3730a3", label: "Quote Received" },
  pending_owner_approval: { bg: "#ede9fe", color: "#5b21b6", label: "Pending Owner Approval" }, approved: { bg: "#dcfce7", color: "#166534", label: "Approved" },
  in_progress: { bg: "#fef3c7", color: "#92400e", label: "In Progress" }, completed: { bg: "#cffafe", color: "#155e75", label: "Completed" },
  closed: { bg: "#d1fae5", color: "#065f46", label: "Closed" }, rejected: { bg: "#fee2e2", color: "#991b1b", label: "Rejected" },
  in_review: { bg: "#fef3c7", color: "#92400e", label: "PM Review" }, scheduled: { bg: "#dbeafe", color: "#1e40af", label: "Quote Requested" },
};

function formatDate(dateStr) {
  if (!dateStr) return "—";
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return dateStr;
  return d.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}

function StatusPill({ status }) {
  const st = STATUS_STYLES[status] || { bg: "#f1f5f9", color: "#475569", label: status };
  return <span style={{ ...s.pill, background: st.bg, color: st.color }}>{st.label}</span>;
}

function commentTimestamp(value) {
  const parsed = typeof value === "number" ? value : new Date(value).getTime();
  if (!Number.isFinite(parsed)) return 0;
  return parsed < 100000000000 ? parsed * 1000 : parsed;
}

function getUnreadState(ticketId, comments, username, baselines) {
  const storedLastViewed = localStorage.getItem(`${LAST_VIEWED_PREFIX}${ticketId}`);
  const storedTimestamp = storedLastViewed ? commentTimestamp(Number(storedLastViewed)) : 0;

  const latestVisibleCommentAt = comments.reduce((latest, comment) => {
    if (comment.author_username === username) return latest;
    return Math.max(latest, commentTimestamp(comment.created_at));
  }, 0);

  const lastViewedAt = storedTimestamp || baselines[ticketId] || latestVisibleCommentAt;
  if (!storedTimestamp && !baselines[ticketId]) baselines[ticketId] = latestVisibleCommentAt;
  return latestVisibleCommentAt > lastViewedAt;
}

function PMTickets() {
  const navigate = useNavigate();
  const token = localStorage.getItem("token");
  const username = localStorage.getItem("username");

  const [tickets, setTickets] = useState([]);
  const [unreadTickets, setUnreadTickets] = useState({});
  const [properties, setProperties] = useState([]);
  const [statusFilter, setStatusFilter] = useState("");
  const [propertyFilter, setPropertyFilter] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const fetchingRef = useRef(false);
  const unreadBaselinesRef = useRef({});

  const fetchProperties = useCallback(async () => {
    try {
      const res = await fetch(`${API}/pm/properties`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) setProperties(await res.json());
    } catch {
      // Filter dropdown just stays empty on failure — not worth blocking
      // the whole page over.
    }
  }, [token]);

  const fetchTickets = useCallback(async ({ silent = false } = {}) => {
    if (fetchingRef.current) return;
    fetchingRef.current = true;
    if (!silent) setLoading(true);
    if (!silent) setError("");
    try {
      const params = new URLSearchParams();
      if (statusFilter) params.set("status", statusFilter);
      if (propertyFilter) params.set("property_id", propertyFilter);

      const res = await fetch(`${API}/pm/tickets?${params.toString()}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (!res.ok) {
        if (!silent) setError(data.detail || "Could not load tickets");
        return;
      }
      setTickets(data);

      const commentResults = await Promise.allSettled(
        data.map(async ticket => {
          const commentsResponse = await fetch(`${API}/tickets/${ticket.id}/comments`, {
            headers: { Authorization: `Bearer ${token}` },
          });
          const commentsData = await commentsResponse.json();
          if (!commentsResponse.ok) {
            throw new Error(commentsData.detail || "Could not load ticket messages");
          }
          return [ticket.id, getUnreadState(ticket.id, commentsData, username, unreadBaselinesRef.current)];
        })
      );
      setUnreadTickets(previous => {
        const next = {};
        data.forEach((ticket, index) => {
          const result = commentResults[index];
          next[ticket.id] = result.status === "fulfilled"
            ? result.value[1]
            : Boolean(previous[ticket.id]);
        });
        return next;
      });
    } catch {
      if (!silent) setError("Server error. Please try again.");
    } finally {
      fetchingRef.current = false;
      if (!silent) setLoading(false);
    }
  }, [token, username, statusFilter, propertyFilter]);

  useEffect(() => { fetchProperties(); }, [fetchProperties]);
  useEffect(() => {
    fetchTickets();
    const intervalId = window.setInterval(() => fetchTickets({ silent: true }), POLL_INTERVAL_MS);
    return () => window.clearInterval(intervalId);
  }, [fetchTickets]);

  return (
    <div style={s.page}>
      <div style={s.header}>
        <h1 style={s.title}>Maintenance Tickets</h1>
        <p style={s.subtitle}>Every open item across your properties, in one place.</p>
      </div>

      <div style={s.filters}>
        <div style={s.filterGroup}>
          <label style={s.filterLabel}>Status</label>
          <select style={s.select} value={statusFilter} onChange={e => setStatusFilter(e.target.value)}>
            <option value="">All active</option>
            <option value="open">Open</option>
            <option value="pm_review">PM Review</option>
            <option value="quote_requested">Quote Requested</option>
            <option value="quote_received">Quote Received</option>
            <option value="pending_owner_approval">Pending Owner Approval</option>
            <option value="approved">Approved</option>
            <option value="in_progress">In Progress</option>
            <option value="completed">Completed</option>
            <option value="closed">Closed</option>
            <option value="rejected">Rejected</option>
          </select>
        </div>

        <div style={s.filterGroup}>
          <label style={s.filterLabel}>Property</label>
          <select style={s.select} value={propertyFilter} onChange={e => setPropertyFilter(e.target.value)}>
            <option value="">All properties</option>
            {properties.map(p => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
        </div>
      </div>

      {error && <p style={s.errorText}>{error}</p>}

      {loading ? (
        <p style={s.muted}>Loading tickets…</p>
      ) : tickets.length === 0 ? (
        <div style={s.emptyState}>
          <p style={s.emptyIcon}>🛠️</p>
          <p style={s.emptyTitle}>No tickets match these filters</p>
          <p style={s.emptySub}>Try clearing a filter, or check back once a tenant submits a request.</p>
        </div>
      ) : (
        <div style={s.tableWrap}>
          <table style={s.table}>
            <thead>
              <tr>
                <th style={s.th}>#</th>
                <th style={s.th}>Unit</th>
                <th style={s.th}>Property</th>
                <th style={s.th}>Category</th>
                <th style={s.th}>Status</th>
                <th style={s.th}>Created</th>
                <th style={s.th}>Last Update</th>
              </tr>
            </thead>
            <tbody>
              {tickets.map(t => {
                const isUnread = unreadTickets[t.id];
                return (
                <tr key={t.id} style={s.tr} onClick={() => navigate(`/pm/tickets/${t.id}`)}>
                  <td style={s.td}>
                    <span>#{t.id.slice(-6).toUpperCase()}</span>
                    {isUnread ? (
                      <span style={s.unreadBadge} title="New message">
                        <span aria-hidden="true">●</span> New message
                      </span>
                    ) : null}
                  </td>
                  <td style={s.td}>{t.unit_number || "—"}</td>
                  <td style={s.td}>{t.property_name || "—"}</td>
                  <td style={s.td}>{t.category || "—"}</td>
                  <td style={s.td}>
                    <StatusPill status={t.status} />
                    {t.priority === "urgent" && <span style={s.urgentBadge}>Urgent</span>}
                  </td>
                  <td style={s.td}>{formatDate(t.created_at)}</td>
                  <td style={s.td}>{formatDate(t.last_update_at || t.updated_at)}</td>
                </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

const s = {
  page:      { padding: 28, fontFamily: "'DM Sans', sans-serif", maxWidth: 1100, margin: "0 auto" },
  header:    { marginBottom: 20 },
  title:     { margin: 0, fontSize: 22, fontWeight: 700, color: "#0f172a" },
  subtitle:  { margin: "4px 0 0", fontSize: 13, color: "#64748b" },

  filters:      { display: "flex", gap: 16, flexWrap: "wrap", marginBottom: 20 },
  filterGroup:  { display: "flex", flexDirection: "column", gap: 4, minWidth: 180 },
  filterLabel:  { fontSize: 11, fontWeight: 700, color: "#64748b", textTransform: "uppercase", letterSpacing: 0.4 },
  select:       { padding: "9px 12px", borderRadius: 8, border: "1px solid #e2e8f0", fontSize: 13, fontFamily: "inherit", background: "#fff", color: "#0f172a" },

  errorText: { color: "#ef4444", fontSize: 13, marginBottom: 16 },
  muted:     { color: "#64748b", fontSize: 14 },

  emptyState: { textAlign: "center", padding: "60px 20px", background: "#fff", border: "1px solid #e2e8f0", borderRadius: 14 },
  emptyIcon:  { fontSize: 32, margin: 0 },
  emptyTitle: { fontSize: 15, fontWeight: 700, color: "#0f172a", margin: "8px 0 4px" },
  emptySub:   { fontSize: 13, color: "#64748b", margin: 0 },

  tableWrap: { background: "#fff", border: "1px solid #e2e8f0", borderRadius: 14, overflow: "hidden" },
  table:     { width: "100%", borderCollapse: "collapse", fontSize: 13 },
  th:        { textAlign: "left", padding: "12px 16px", background: "#f8fafc", color: "#64748b", fontWeight: 700, fontSize: 11, textTransform: "uppercase", letterSpacing: 0.4, borderBottom: "1px solid #e2e8f0" },
  tr:        { cursor: "pointer", borderBottom: "1px solid #f1f5f9" },
  td:        { padding: "12px 16px", color: "#334155", fontWeight: 500 },

  pill:      { fontSize: 11, fontWeight: 700, padding: "4px 10px", borderRadius: 20, display: "inline-block" },
  urgentBadge: { marginLeft: 6, fontSize: 10, fontWeight: 800, padding: "4px 8px", borderRadius: 20, display: "inline-block", background: "#fee2e2", color: "#b91c1c" },
  unreadBadge: { marginLeft: 8, fontSize: 10, fontWeight: 700, padding: "3px 7px", borderRadius: 999, display: "inline-flex", alignItems: "center", gap: 4, background: "#eef2ff", color: "#4338ca", whiteSpace: "nowrap" },
};

export default PMTickets;
