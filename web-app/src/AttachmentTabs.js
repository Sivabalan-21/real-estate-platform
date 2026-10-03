import React, { useEffect, useState, useCallback } from "react";

const API = "http://localhost:8000";

const TABS = [
  { key: "photos", label: "Photos" },
  { key: "quotes", label: "Quotes" },
  { key: "invoices", label: "Invoices" },
  { key: "pm_notes", label: "Documents" },
];

const ROLE_LABEL = { tenant: "Tenant", vendor: "Vendor", pm: "PM", owner: "Owner", admin: "Admin" };

export function formatDateTime(dateStr) {
  if (!dateStr) return "—";
  const normalized =
    typeof dateStr === "string" && !/[zZ]|[+-]\d{2}:?\d{2}$/.test(dateStr) ? `${dateStr}Z` : dateStr;
  const d = new Date(normalized);
  if (Number.isNaN(d.getTime())) return dateStr;
  return d.toLocaleString("en-IN", { day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit" });
}

export async function fetchAttachments(ticketId, token) {
  const res = await fetch(`${API}/tickets/${ticketId}/attachments`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.detail || "Could not load attachments");
  return data;
}

export function QuoteVersions({ quotes }) {
  const sorted = [...quotes].sort((a, b) => b.version - a.version);
  const [leftId, setLeftId] = useState(sorted[1]?.id);
  const [rightId, setRightId] = useState(sorted[0]?.id);
  const left = sorted.find(q => q.id === leftId);
  const right = sorted.find(q => q.id === rightId);

  const select = (value, onChange) => (
    <select style={st.select} value={value} onChange={e => onChange(e.target.value)}>
      {sorted.map(q => (
        <option key={q.id} value={q.id}>v{q.version} · {formatDateTime(q.uploaded_at)}</option>
      ))}
    </select>
  );

  const col = q => q && (
    <div style={st.compareCol}>
      <strong style={{ fontSize: 13 }}>Version {q.version}</strong>
      <p style={st.meta}>{q.filename}</p>
      <p style={st.meta}>Uploaded {formatDateTime(q.uploaded_at)}</p>
      <p style={st.meta}>{q.size_kb} KB</p>
      <a href={q.url} target="_blank" rel="noreferrer" style={st.link}>Open PDF ↗</a>
    </div>
  );

  return (
    <div style={st.compare}>
      <p style={st.compareTitle}>Compare quote versions</p>
      <div style={st.compareSelects}>
        {select(leftId, setLeftId)}
        {select(rightId, setRightId)}
      </div>
      <div style={st.compareGrid}>{col(left)}{col(right)}</div>
    </div>
  );
}

function AttachmentTabs({ ticketId, refreshKey = 0, jumpTo, onRequestDelete }) {
  const token = sessionStorage.getItem("token");
  const [data, setData] = useState({ photos: [], quotes: [], invoices: [], pm_notes: [] });
  const [active, setActive] = useState("photos");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    try {
      setError("");
      setData(await fetchAttachments(ticketId, token));
    } catch (e) {
      setError(e.message || "Server error. Please try again.");
    } finally {
      setLoading(false);
    }
  }, [ticketId, token]);

  useEffect(() => { load(); }, [load, refreshKey]);

  useEffect(() => { if (jumpTo) setActive(jumpTo.tab); }, [jumpTo]);

  if (loading) return <p style={st.muted}>Loading attachments…</p>;

  const items = data[active] || [];

  return (
    <div>
      <div style={st.tabBar} role="tablist">
        {TABS.map(t => (
          <button
            key={t.key}
            role="tab"
            aria-selected={active === t.key}
            style={active === t.key ? st.tabActive : st.tab}
            onClick={() => setActive(t.key)}
          >
            {t.label} <span style={st.count}>{data[t.key].length}</span>
          </button>
        ))}
      </div>

      {error && <p style={st.error}>{error}</p>}

      {items.length === 0 ? (
        <p style={st.muted}>No files in this section yet.</p>
      ) : (
        <div style={st.list}>
          {items.map(f => (
            <div key={f.id} style={st.row}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <a href={f.url} target="_blank" rel="noreferrer" style={st.link}>{f.filename}</a>
                {active === "quotes" && <span style={st.badge}>v{f.version}</span>}
                {f.uploaded_by_role && (
                  <span style={st.badgeGrey}>{ROLE_LABEL[f.uploaded_by_role] || f.uploaded_by_role}</span>
                )}
                <p style={st.meta}>{formatDateTime(f.uploaded_at)} · {f.size_kb} KB</p>
              </div>
              <a href={f.url} download={f.filename} style={st.smallBtn}>Download</a>
              {onRequestDelete && (
                <button style={st.deleteBtn} onClick={() => onRequestDelete(f)}>Delete</button>
              )}
            </div>
          ))}
        </div>
      )}

      {active === "quotes" && data.quotes.length > 1 && <QuoteVersions quotes={data.quotes} />}
    </div>
  );
}

const st = {
  tabBar: { display: "flex", gap: 4, borderBottom: "1px solid #e2e8f0", marginBottom: 12, flexWrap: "wrap" },
  tab: { background: "none", border: "none", borderBottom: "3px solid transparent", padding: "8px 12px", fontSize: 13, color: "#64748b", cursor: "pointer", fontWeight: 600 },
  tabActive: { background: "none", border: "none", borderBottom: "3px solid #6366f1", padding: "8px 12px", fontSize: 13, color: "#4f46e5", cursor: "pointer", fontWeight: 700 },
  count: { background: "#e2e8f0", color: "#475569", borderRadius: 10, padding: "1px 7px", fontSize: 11, marginLeft: 4 },
  list: { display: "flex", flexDirection: "column", gap: 8 },
  row: { display: "flex", alignItems: "center", gap: 10, padding: "9px 11px", background: "#f8fafc", borderRadius: 8 },
  link: { color: "#4f46e5", fontSize: 13, fontWeight: 600, textDecoration: "none" },
  meta: { margin: "3px 0 0", fontSize: 11, color: "#94a3b8" },
  badge: { marginLeft: 8, fontSize: 10, fontWeight: 700, background: "#e0e7ff", color: "#3730a3", borderRadius: 5, padding: "2px 6px" },
  badgeGrey: { marginLeft: 6, fontSize: 10, fontWeight: 700, background: "#e2e8f0", color: "#475569", borderRadius: 5, padding: "2px 6px" },
  smallBtn: { fontSize: 11, fontWeight: 600, color: "#475569", textDecoration: "none", border: "1px solid #e2e8f0", borderRadius: 6, padding: "4px 8px", background: "#fff" },
  deleteBtn: { background: "none", border: "none", color: "#64748b", fontSize: 11, fontWeight: 600, cursor: "pointer" },
  muted: { color: "#64748b", fontSize: 13 },
  error: { color: "#ef4444", fontSize: 13 },
  compare: { marginTop: 16, padding: 12, border: "1px solid #e2e8f0", borderRadius: 10 },
  compareTitle: { margin: "0 0 8px", fontSize: 12, fontWeight: 700, color: "#0f172a" },
  compareSelects: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 10 },
  select: { padding: "7px 8px", borderRadius: 7, border: "1px solid #e2e8f0", fontSize: 12, background: "#fff" },
  compareGrid: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 },
  compareCol: { background: "#f8fafc", borderRadius: 8, padding: 10 },
};

export default AttachmentTabs;