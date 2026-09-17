import React, { useEffect, useState, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";

const API = "http://localhost:8000";

const occupancyColor = (pct) => {
  if (pct >= 100) return "#10b981";
  if (pct >= 60) return "#0ea5e9";
  if (pct >= 30) return "#f59e0b";
  return "#ef4444";
};

function OwnerPropertyDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const token = localStorage.getItem("token");

  const [property, setProperty] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // No single-property GET endpoint exists yet for the owner role — /owner/portfolio
  // already returns every property with the exact stats this page needs, so we
  // reuse it and pick out the one we want rather than adding a new backend route.
  const fetchProperty = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch(`${API}/owner/portfolio`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.detail || "Could not load this property");
        return;
      }
      const match = (Array.isArray(data) ? data : []).find(p => p.id === id);
      if (!match) {
        setError("Property not found");
        return;
      }
      setProperty(match);
    } catch {
      setError("Server error. Please try again.");
    } finally {
      setLoading(false);
    }
  }, [id, token]);

  useEffect(() => { fetchProperty(); }, [fetchProperty]);

  if (loading) return <div style={s.page}><p style={s.muted}>Loading…</p></div>;

  if (error || !property) {
    return (
      <div style={s.page}>
        <button style={s.back} onClick={() => navigate("/owner/properties")}>← Back to properties</button>
        <p style={s.errorText}>{error || "Property not found"}</p>
      </div>
    );
  }

  const pct = property.total_units > 0 ? Math.round((property.occupied_count / property.total_units) * 100) : 0;

  return (
    <div style={s.page}>
      <button style={s.back} onClick={() => navigate("/owner/properties")}>← Back to properties</button>

      <div style={s.card}>
        <div style={s.cardHeader}>
          <div>
            <h1 style={s.title}>{property.name}</h1>
            <p style={s.address}>{property.address || "No address provided"}</p>
          </div>
          {property.open_ticket_count > 0 && (
            <span style={s.ticketBadge}>{property.open_ticket_count} open ticket{property.open_ticket_count !== 1 ? "s" : ""}</span>
          )}
        </div>

        <div style={s.occupancyRow}>
          <span style={s.occupancyLabel}>Occupancy</span>
          <span style={s.occupancyPct}>{pct}%</span>
        </div>
        <div style={s.barTrack}>
          <div style={{ ...s.barFill, width: `${pct}%`, background: occupancyColor(pct) }} />
        </div>

        <div style={s.statsGrid}>
          <div style={s.statBox}>
            <p style={s.statValue}>{property.total_units}</p>
            <p style={s.statLabel}>Total Units</p>
          </div>
          <div style={s.statBox}>
            <p style={s.statValue}>{property.occupied_count}</p>
            <p style={s.statLabel}>Occupied</p>
          </div>
          <div style={s.statBox}>
            <p style={s.statValue}>{property.vacant_count}</p>
            <p style={s.statLabel}>Vacant</p>
          </div>
          <div style={s.statBox}>
            <p style={s.statValue}>{property.maintenance_count}</p>
            <p style={s.statLabel}>Maintenance</p>
          </div>
        </div>

        <button
          style={s.ticketsBtn}
          onClick={() => navigate("/owner/tickets", { state: { propertyId: property.id } })}
        >
          View tickets for this property →
        </button>
      </div>
    </div>
  );
}

const s = {
  page:      { padding: 40, fontFamily: "'DM Sans', sans-serif", maxWidth: 640, margin: "0 auto" },
  back:      { background: "none", border: "none", color: "#6366f1", fontSize: 13, fontWeight: 600, cursor: "pointer", padding: 0, marginBottom: 20 },
  muted:     { color: "#64748b", fontSize: 14 },
  errorText: { color: "#ef4444", fontSize: 13 },

  card:       { background: "#fff", borderRadius: 12, padding: 24, boxShadow: "0 1px 4px rgba(0,0,0,.06)" },
  cardHeader: { display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 20 },
  title:      { margin: 0, fontSize: 20, fontWeight: 700, color: "#0f172a" },
  address:    { margin: "4px 0 0", fontSize: 13, color: "#94a3b8" },
  ticketBadge:{ background: "#fef2f2", color: "#b91c1c", border: "1px solid #fecaca", fontSize: 11, fontWeight: 700, padding: "4px 10px", borderRadius: 20, flexShrink: 0, whiteSpace: "nowrap" },

  occupancyRow:  { display: "flex", justifyContent: "space-between", marginBottom: 6 },
  occupancyLabel:{ fontSize: 11, color: "#64748b", fontWeight: 600, textTransform: "uppercase", letterSpacing: 0.3 },
  occupancyPct:  { fontSize: 12, color: "#0f172a", fontWeight: 700 },
  barTrack:      { height: 8, background: "#f1f5f9", borderRadius: 4, overflow: "hidden", marginBottom: 24 },
  barFill:       { height: "100%", borderRadius: 4 },

  statsGrid: { display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12, marginBottom: 24 },
  statBox:   { textAlign: "center", background: "#f8fafc", borderRadius: 10, padding: "14px 8px" },
  statValue: { margin: 0, fontSize: 20, fontWeight: 700, color: "#0f172a" },
  statLabel: { margin: "2px 0 0", fontSize: 11, color: "#64748b" },

  ticketsBtn: { width: "100%", background: "#6366f1", border: "none", color: "#fff", padding: "12px 16px", borderRadius: 8, cursor: "pointer", fontSize: 13, fontWeight: 600 },
};

export default OwnerPropertyDetail;