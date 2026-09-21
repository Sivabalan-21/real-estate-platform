import React, { useEffect, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";

const API = "http://localhost:8000";

const occupancyColor = (pct) => {
  if (pct >= 100) return "#10b981";
  if (pct >= 60) return "#0ea5e9";
  if (pct >= 30) return "#f59e0b";
  return "#ef4444";
};

function OwnerProperties() {
  const navigate = useNavigate();
  const token = localStorage.getItem("token");

  const [properties, setProperties] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const fetchPortfolio = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch(`${API}/owner/portfolio`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.detail || "Could not load properties");
        return;
      }
      setProperties(Array.isArray(data) ? data : []);
    } catch {
      setError("Server error. Please try again.");
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => { fetchPortfolio(); }, [fetchPortfolio]);

  return (
    <div style={s.page}>
      <div style={s.header}>
        <h1 style={s.title}>Properties</h1>
        <p style={s.subtitle}>Every property in your portfolio.</p>
      </div>

      {error && <p style={s.errorText}>{error}</p>}

      {loading ? (
        <p style={s.muted}>Loading…</p>
      ) : properties.length === 0 ? (
        <div style={s.emptyState}>
          <span style={s.emptyIcon}>🏢</span>
          <p style={s.emptyText}>No properties yet</p>
        </div>
      ) : (
        <div style={s.grid}>
          {properties.map(p => {
            const pct = p.total_units > 0 ? Math.round((p.occupied_count / p.total_units) * 100) : 0;
            return (
              <div key={p.id} style={s.card} onClick={() => navigate(`/owner/properties/${p.id}`)}>
                <div style={s.cardHeader}>
                  <h3 style={s.cardName}>{p.name}</h3>
                  {p.open_ticket_count > 0 && (
                    <span style={s.ticketBadge}>{p.open_ticket_count}</span>
                  )}
                </div>
                <p style={s.cardAddress}>{p.address || "No address provided"}</p>

                <div style={s.occupancyRow}>
                  <span style={s.occupancyLabel}>Occupancy</span>
                  <span style={s.occupancyPct}>{pct}%</span>
                </div>
                <div style={s.barTrack}>
                  <div style={{ ...s.barFill, width: `${pct}%`, background: occupancyColor(pct) }} />
                </div>

                <div style={s.cardStats}>
                  <span>{p.total_units} unit{p.total_units !== 1 ? "s" : ""}</span>
                  <span style={s.dot}>•</span>
                  <span>{p.occupied_count} occupied</span>
                  <span style={s.dot}>•</span>
                  <span>{p.vacant_count} vacant</span>
                  {p.maintenance_count > 0 && (
                    <>
                      <span style={s.dot}>•</span>
                      <span>{p.maintenance_count} under repair</span>
                    </>
                  )}
                </div>
              </div>
            );
          })}
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

  errorText: { color: "#ef4444", fontSize: 13, marginBottom: 16 },
  muted:     { color: "#64748b", fontSize: 14 },

  emptyState: { display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "80px 20px", color: "#94a3b8" },
  emptyIcon:  { fontSize: 40, marginBottom: 12 },
  emptyText:  { fontSize: 15, fontWeight: 600, color: "#64748b", margin: 0 },

  grid:       { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 18 },
  card:       { background: "#fff", borderRadius: 12, padding: 20, boxShadow: "0 1px 4px rgba(0,0,0,.06)", cursor: "pointer" },
  cardHeader: { display: "flex", justifyContent: "space-between", alignItems: "flex-start" },
  cardName:   { margin: 0, fontSize: 16, fontWeight: 700, color: "#0f172a" },
  cardAddress:{ margin: "4px 0 16px", fontSize: 12, color: "#94a3b8" },
  ticketBadge:{ background: "#ef4444", color: "#fff", fontSize: 11, fontWeight: 700, padding: "2px 9px", borderRadius: 20, flexShrink: 0 },

  occupancyRow:  { display: "flex", justifyContent: "space-between", marginBottom: 6 },
  occupancyLabel:{ fontSize: 11, color: "#64748b", fontWeight: 600, textTransform: "uppercase", letterSpacing: 0.3 },
  occupancyPct:  { fontSize: 12, color: "#0f172a", fontWeight: 700 },
  barTrack:      { height: 8, background: "#f1f5f9", borderRadius: 4, overflow: "hidden", marginBottom: 16 },
  barFill:       { height: "100%", borderRadius: 4 },

  cardStats: { display: "flex", flexWrap: "wrap", gap: 6, fontSize: 12, color: "#64748b" },
  dot:       { color: "#cbd5e1" },
};

export default OwnerProperties;