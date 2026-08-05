import React, { useEffect, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";

const API = "http://194.164.149.22/api";

function OwnerDashboard() {
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
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.detail || "Failed to load portfolio");
        setProperties([]);
        return;
      }
      setProperties(Array.isArray(data) ? data : []);
    } catch {
      setError("Server error. Please try again.");
      setProperties([]);
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    fetchPortfolio();
  }, [fetchPortfolio]);

  const totalProperties = properties.length;
  const totalUnits = properties.reduce((sum, p) => sum + p.total_units, 0);
  const totalOccupied = properties.reduce((sum, p) => sum + p.occupied_count, 0);
  const totalVacant = properties.reduce((sum, p) => sum + p.vacant_count, 0);
  const totalOpenTickets = properties.reduce((sum, p) => sum + p.open_ticket_count, 0);
  const occupiedPct = totalUnits > 0 ? Math.round((totalOccupied / totalUnits) * 100) : 0;

  const occupancyColor = (pct) => {
    if (pct >= 100) return "#10b981";
    if (pct >= 60) return "#0ea5e9";
    if (pct >= 30) return "#f59e0b";
    return "#ef4444";
  };

  return (
    <div style={s.page}>
      <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&display=swap" rel="stylesheet" />
      <style>{`@keyframes shimmer { 0% { background-position: -200px 0; } 100% { background-position: 200px 0; } }`}</style>

      <h1 style={s.title}>Owner Dashboard</h1>
      <p style={s.subtitle}>Portfolio overview across all properties</p>

      {error && <p style={s.errorMsg}>{error}</p>}

      {loading ? (
        <SkeletonState />
      ) : totalProperties === 0 ? (
        <div style={s.emptyState}>
          <span style={s.emptyIcon}>🏢</span>
          <p style={s.emptyText}>No properties assigned yet</p>
        </div>
      ) : (
        <>
          <section style={s.kpiRow}>
            <KpiCard icon="🏢" label="Total Properties" value={totalProperties} color="#6366f1" />
            <KpiCard icon="🚪" label="Total Units" value={totalUnits} color="#0ea5e9" />
            <KpiCard icon="✅" label="Occupied" value={`${totalOccupied} (${occupiedPct}%)`} color="#10b981" />
            <KpiCard icon="🔲" label="Vacant" value={totalVacant} color="#f59e0b" />
            <KpiCard
              icon="🛠️"
              label="Open Tickets"
              value={totalOpenTickets}
              color={totalOpenTickets > 0 ? "#ef4444" : "#94a3b8"}
            />
          </section>

          <section style={s.grid}>
            {properties.map(p => {
              const pct = p.total_units > 0 ? Math.round((p.occupied_count / p.total_units) * 100) : 0;
              return (
                <div
                  key={p.id}
                  style={s.card}
                  onClick={() => navigate(`/owner/properties/${p.id}`)}
                >
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
                        <span>{p.maintenance_count} maintenance</span>
                      </>
                    )}
                  </div>
                </div>
              );
            })}
          </section>
        </>
      )}
    </div>
  );
}

function KpiCard({ icon, label, value, color }) {
  return (
    <div style={{ ...s.kpiCard, borderTop: `3px solid ${color}` }}>
      <span style={s.kpiIcon}>{icon}</span>
      <div>
        <p style={s.kpiValue}>{value}</p>
        <p style={s.kpiLabel}>{label}</p>
      </div>
    </div>
  );
}

function SkeletonState() {
  return (
    <>
      <section style={s.kpiRow}>
        {[0, 1, 2, 3, 4].map(i => <div key={i} style={s.skeletonKpi} />)}
      </section>
      <section style={s.grid}>
        {[0, 1, 2].map(i => (
          <div key={i} style={s.card}>
            <div style={{ ...s.skeletonBar, width: "60%", height: 18, marginBottom: 10 }} />
            <div style={{ ...s.skeletonBar, width: "80%", height: 12, marginBottom: 20 }} />
            <div style={{ ...s.skeletonBar, width: "100%", height: 8, marginBottom: 16 }} />
            <div style={{ ...s.skeletonBar, width: "70%", height: 12 }} />
          </div>
        ))}
      </section>
    </>
  );
}

const shimmerBg = {
  backgroundImage: "linear-gradient(90deg, #e2e8f0 0px, #f1f5f9 40px, #e2e8f0 80px)",
  backgroundSize: "200px 100%",
  animation: "shimmer 1.4s infinite linear",
};

const s = {
  page:          { padding: 40, fontFamily: "'DM Sans', sans-serif" },
  title:         { margin: 0, fontSize: 22, fontWeight: 700, color: "#0f172a" },
  subtitle:      { margin: "6px 0 28px", fontSize: 14, color: "#64748b" },
  errorMsg:      { color: "#ef4444", fontSize: 13, marginBottom: 16 },

  emptyState:    { display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "80px 20px", color: "#94a3b8" },
  emptyIcon:     { fontSize: 40, marginBottom: 12 },
  emptyText:     { fontSize: 15, fontWeight: 600, color: "#64748b", margin: 0 },

  kpiRow:        { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 16, marginBottom: 32 },
  kpiCard:       { background: "#fff", borderRadius: 10, padding: "18px 20px", display: "flex", alignItems: "center", gap: 14, boxShadow: "0 1px 4px rgba(0,0,0,.06)" },
  kpiIcon:       { fontSize: 24 },
  kpiValue:      { margin: 0, fontSize: 22, fontWeight: 700, color: "#0f172a" },
  kpiLabel:      { margin: "2px 0 0", fontSize: 12, color: "#64748b" },
  skeletonKpi:   { height: 76, borderRadius: 10, ...shimmerBg },

  grid:          { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 18 },
  card:          { background: "#fff", borderRadius: 12, padding: 20, boxShadow: "0 1px 4px rgba(0,0,0,.06)", cursor: "pointer", transition: "box-shadow .15s" },
  cardHeader:    { display: "flex", justifyContent: "space-between", alignItems: "flex-start" },
  cardName:      { margin: 0, fontSize: 16, fontWeight: 700, color: "#0f172a" },
  cardAddress:   { margin: "4px 0 16px", fontSize: 12, color: "#94a3b8" },
  ticketBadge:   { background: "#ef4444", color: "#fff", fontSize: 11, fontWeight: 700, padding: "2px 9px", borderRadius: 20, flexShrink: 0 },

  occupancyRow:  { display: "flex", justifyContent: "space-between", marginBottom: 6 },
  occupancyLabel:{ fontSize: 11, color: "#64748b", fontWeight: 600, textTransform: "uppercase", letterSpacing: 0.3 },
  occupancyPct:  { fontSize: 12, color: "#0f172a", fontWeight: 700 },
  barTrack:      { height: 8, background: "#f1f5f9", borderRadius: 4, overflow: "hidden", marginBottom: 16 },
  barFill:       { height: "100%", borderRadius: 4, transition: "width .4s ease" },

  cardStats:     { display: "flex", flexWrap: "wrap", gap: 6, fontSize: 12, color: "#64748b" },
  dot:           { color: "#cbd5e1" },

  skeletonBar:   { borderRadius: 6, ...shimmerBg },
};

export default OwnerDashboard;