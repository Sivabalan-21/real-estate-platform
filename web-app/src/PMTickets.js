import React, { useEffect, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";

const API = "http://187.127.180.107";

const STATUS_STYLES = {
  open:        { bg: "#fee2e2", color: "#991b1b", label: "Open" },
  in_review:   { bg: "#fef3c7", color: "#92400e", label: "In Review" },
  scheduled:   { bg: "#dbeafe", color: "#1e40af", label: "Scheduled" },
  in_progress: { bg: "#fef3c7", color: "#92400e", label: "In Progress" },
  closed:      { bg: "#d1fae5", color: "#065f46", label: "Closed" },
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

function PMTickets() {
  const navigate = useNavigate();
  const token = localStorage.getItem("token");

  const [tickets, setTickets] = useState([]);
  const [properties, setProperties] = useState([]);
  const [statusFilter, setStatusFilter] = useState("");
  const [propertyFilter, setPropertyFilter] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

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

  const fetchTickets = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams();
      if (statusFilter) params.set("status", statusFilter);
      if (propertyFilter) params.set("property_id", propertyFilter);

      const res = await fetch(`${API}/pm/tickets?${params.toString()}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.detail || "Could not load tickets");
        return;
      }
      setTickets(data);
    } catch {
      setError("Server error. Please try again.");
    } finally {
      setLoading(false);
    }
  }, [token, statusFilter, propertyFilter]);

  useEffect(() => { fetchProperties(); }, [fetchProperties]);
  useEffect(() => { fetchTickets(); }, [fetchTickets]);

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
            <option value="">All statuses</option>
            <option value="open">Open</option>
            <option value="in_review">In Review</option>
            <option value="scheduled">Scheduled</option>
            <option value="in_progress">In Progress</option>
            <option value="closed">Closed</option>
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
              {tickets.map(t => (
                <tr key={t.id} style={s.tr} onClick={() => navigate(`/pm/tickets/${t.id}`)}>
                  <td style={s.td}>#{t.id.slice(-6).toUpperCase()}</td>
                  <td style={s.td}>{t.unit_number || "—"}</td>
                  <td style={s.td}>{t.property_name || "—"}</td>
                  <td style={s.td}>{t.category || "—"}</td>
                  <td style={s.td}><StatusPill status={t.status} /></td>
                  <td style={s.td}>{formatDate(t.created_at)}</td>
                  <td style={s.td}>{formatDate(t.last_update_at || t.updated_at)}</td>
                </tr>
              ))}
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
};

export default PMTickets;