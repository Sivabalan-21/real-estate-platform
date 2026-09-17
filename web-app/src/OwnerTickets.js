import React, { useEffect, useState, useCallback } from "react";
import { useLocation } from "react-router-dom";

const API = "http://localhost:8000";

const STATUS_STYLES = {
  open:                    { bg: "#fee2e2", color: "#991b1b", label: "Open" },
  pm_review:               { bg: "#fef3c7", color: "#92400e", label: "PM Review" },
  quote_requested:         { bg: "#dbeafe", color: "#1e40af", label: "Quote Requested" },
  quote_received:          { bg: "#e0e7ff", color: "#3730a3", label: "Quote Received" },
  in_progress:             { bg: "#fef3c7", color: "#92400e", label: "In Progress" },
  closed:                  { bg: "#d1fae5", color: "#065f46", label: "Closed" },
  pending_owner_approval:  { bg: "#ede9fe", color: "#5b21b6", label: "Pending Approval" },
  approved:                { bg: "#dcfce7", color: "#166534", label: "Approved" },
  completed:               { bg: "#cffafe", color: "#155e75", label: "Completed" },
  rejected:                { bg: "#fee2e2", color: "#991b1b", label: "Rejected" },
  in_review:               { bg: "#fef3c7", color: "#92400e", label: "PM Review" },
  scheduled:               { bg: "#dbeafe", color: "#1e40af", label: "Quote Requested" },
};

const CATEGORIES = ["Plumbing", "Electrical", "HVAC", "Roof", "Drywall", "Pest", "Appliance", "Other"];

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

function OwnerTickets() {
  const token = localStorage.getItem("token");
  const location = useLocation();

  const [tickets, setTickets] = useState([]);
  const [openCount, setOpenCount] = useState(0);
  const [pendingApprovalCount, setPendingApprovalCount] = useState(0);
  const [properties, setProperties] = useState([]);
  const [statusFilter, setStatusFilter] = useState("");
  // Preset from OwnerPropertyDetail's "View tickets for this property" link
  // (passed via navigate state) so that click actually lands filtered,
  // rather than on the full unfiltered list.
  const [propertyFilter, setPropertyFilter] = useState(location.state?.propertyId || "");
  const [categoryFilter, setCategoryFilter] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // /owner/portfolio already returns every property in the owner's company
  // (id + name), which is all the filter dropdown needs — no separate
  // /owner/properties endpoint required.
  const fetchProperties = useCallback(async () => {
    try {
      const res = await fetch(`${API}/owner/portfolio`, {
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
      if (categoryFilter) params.set("category", categoryFilter);

      const res = await fetch(`${API}/owner/tickets?${params.toString()}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.detail || "Could not load tickets");
        return;
      }
      setTickets(data.tickets || []);
      setOpenCount(data.open_count || 0);
      setPendingApprovalCount(data.pending_approval_count || 0);
    } catch {
      setError("Server error. Please try again.");
    } finally {
      setLoading(false);
    }
  }, [token, statusFilter, propertyFilter, categoryFilter]);

  useEffect(() => { fetchProperties(); }, [fetchProperties]);
  useEffect(() => { fetchTickets(); }, [fetchTickets]);

  return (
    <div style={s.page}>
      <div style={s.header}>
        <h1 style={s.title}>Tickets</h1>
        <p style={s.subtitle}>Open maintenance tickets across every property you own.</p>
      </div>

      <div style={s.banner}>
        <span style={s.bannerStrong}>{openCount}</span> tickets open
        <span style={s.bannerDot}>·</span>
        <span style={s.bannerStrong}>{pendingApprovalCount}</span> pending your approval
      </div>

      <div style={s.filters}>
        <div style={s.filterGroup}>
          <label style={s.filterLabel}>Status</label>
          <select style={s.select} value={statusFilter} onChange={e => setStatusFilter(e.target.value)}>
            <option value="">Open + In Progress (default)</option>
            <option value="open">Open</option>
            <option value="pm_review">PM Review</option>
            <option value="quote_requested">Quote Requested</option>
            <option value="quote_received">Quote Received</option>
            <option value="in_progress">In Progress</option>
            <option value="pending_owner_approval">Pending Approval</option>
            <option value="approved">Approved</option>
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

        <div style={s.filterGroup}>
          <label style={s.filterLabel}>Category</label>
          <select style={s.select} value={categoryFilter} onChange={e => setCategoryFilter(e.target.value)}>
            <option value="">All categories</option>
            {CATEGORIES.map(c => (
              <option key={c} value={c}>{c}</option>
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
          <p style={s.emptySub}>Try clearing a filter, or check back once a new ticket is raised.</p>
        </div>
      ) : (
        <div style={s.tableWrap}>
          <table style={s.table}>
            <thead>
              <tr>
                <th style={s.th}>Property</th>
                <th style={s.th}>Unit</th>
                <th style={s.th}>Category</th>
                <th style={s.th}>Status</th>
                <th style={s.th}>PM Assigned</th>
                <th style={s.th}>Created</th>
                <th style={s.th}>Quote Amount</th>
              </tr>
            </thead>
            <tbody>
              {tickets.map(t => (
                <tr key={t.id} style={s.tr}>
                  <td style={s.td}>{t.property_name || "—"}</td>
                  <td style={s.td}>{t.unit_number || "—"}</td>
                  <td style={s.td}>{t.category || "—"}</td>
                  <td style={s.td}>
                    <StatusPill status={t.status} />
                    {t.approval_required && (
                      <span style={s.approvalBadge}>Approval Required</span>
                    )}
                  </td>
                  <td style={s.td}>{t.assigned_pm_name || t.assigned_pm || "Unassigned"}</td>
                  <td style={s.td}>{formatDate(t.created_at)}</td>
                  <td style={s.td}>{t.quote_amount != null ? t.quote_amount : "—"}</td>
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

  banner:       { background: "#eef2ff", border: "1px solid #c7d2fe", borderRadius: 10, padding: "10px 16px", fontSize: 13, color: "#3730a3", marginBottom: 20 },
  bannerStrong: { fontWeight: 700 },
  bannerDot:    { margin: "0 8px", color: "#a5b4fc" },

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
  tr:        { borderBottom: "1px solid #f1f5f9" },
  td:        { padding: "12px 16px", color: "#334155", fontWeight: 500 },

  pill:          { fontSize: 11, fontWeight: 700, padding: "4px 10px", borderRadius: 20, display: "inline-block" },
  approvalBadge: { marginLeft: 8, fontSize: 10, fontWeight: 700, padding: "3px 8px", borderRadius: 20, display: "inline-block", background: "#fef2f2", color: "#b91c1c", border: "1px solid #fecaca" },
};

export default OwnerTickets;