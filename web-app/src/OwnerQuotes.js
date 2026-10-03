import React, { useEffect, useState } from "react";
import { fetchAttachments, formatDateTime, QuoteVersions } from "./AttachmentTabs";

function OwnerQuotes({ ticketId }) {
  const token = sessionStorage.getItem("token");
  const [quotes, setQuotes] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    fetchAttachments(ticketId, token)
      .then(d => setQuotes(d.quotes || []))
      .catch(e => { setError(e.message); setQuotes([]); });
  }, [ticketId, token]);

  return (
    <div style={o.wrap}>
      <div style={o.tabBar}>
        <span style={o.tabActive}>Quotes <span style={o.count}>{quotes ? quotes.length : 0}</span></span>
      </div>

      {quotes === null ? (
        <p style={o.muted}>Loading…</p>
      ) : quotes.length === 0 ? (
        <p style={o.muted}>{error || "No quote attached yet — waiting for vendor"}</p>
      ) : (
        <>
          {quotes.map((q, i) => (
            <div key={q.id} style={o.row}>
              <div style={{ flex: 1 }}>
                <strong style={{ fontSize: 13 }}>{q.filename}</strong>
                <span style={o.badge}>v{q.version}{i === 0 ? " · latest" : ""}</span>
                <p style={o.meta}>{formatDateTime(q.uploaded_at)} · {q.size_kb} KB</p>
              </div>
              <a href={q.url} target="_blank" rel="noreferrer" style={o.viewBtn}>View Quote</a>
            </div>
          ))}
          {quotes.length > 1 && <QuoteVersions quotes={quotes} />}
        </>
      )}
    </div>
  );
}

const o = {
  wrap: { marginTop: 16, paddingTop: 14, borderTop: "1px solid #f1f5f9" },
  tabBar: { borderBottom: "1px solid #e2e8f0", marginBottom: 10 },
  tabActive: { display: "inline-block", borderBottom: "3px solid #6366f1", padding: "6px 12px", fontSize: 13, fontWeight: 700, color: "#4f46e5" },
  count: { background: "#e2e8f0", color: "#475569", borderRadius: 10, padding: "1px 7px", fontSize: 11, marginLeft: 4 },
  row: { display: "flex", alignItems: "center", gap: 10, padding: "9px 11px", background: "#f8fafc", borderRadius: 8, marginBottom: 8 },
  badge: { marginLeft: 8, fontSize: 10, fontWeight: 700, background: "#e0e7ff", color: "#3730a3", borderRadius: 5, padding: "2px 6px" },
  meta: { margin: "3px 0 0", fontSize: 11, color: "#94a3b8" },
  viewBtn: { background: "#6366f1", color: "#fff", textDecoration: "none", fontSize: 12, fontWeight: 600, padding: "7px 12px", borderRadius: 8 },
  muted: { color: "#64748b", fontSize: 13, fontStyle: "italic" },
};

export default OwnerQuotes;