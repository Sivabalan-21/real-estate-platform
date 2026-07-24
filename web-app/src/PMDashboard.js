import React, { useEffect, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";

const API = "http://194.164.149.22/api";

function PMDashboard() {
  const navigate = useNavigate();
  const token = localStorage.getItem("token");
  const username = localStorage.getItem("username");

  const [properties, setProperties] = useState([]);
  const [me, setMe] = useState(null);
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    try {
      const [propsRes, meRes] = await Promise.all([
        fetch(`${API}/properties`, { headers: { Authorization: `Bearer ${token}` } }),
        fetch(`${API}/users/me`, { headers: { Authorization: `Bearer ${token}` } }),
      ]);
      const propsData = await propsRes.json();
      const meData = await meRes.json();
      setProperties(Array.isArray(propsData) ? propsData : []);
      setMe(meData);
    } catch {
      // silent — page still renders with zeros
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const totalUnits = properties.reduce((sum, p) => sum + (p.total_units || 0), 0);
  const activeCount = properties.filter(p => p.status === "active").length;
  const maxUnits = me?.max_units || 0;
  const usedUnits = me?.used_units || 0;
  const remaining = maxUnits - usedUnits;
  const usagePct = maxUnits > 0 ? Math.min(100, Math.round((usedUnits / maxUnits) * 100)) : 0;

  return (
    <div style={s.page}>
      <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&display=swap" rel="stylesheet" />

      <div style={s.header}>
        <div>
          <h2 style={s.pageTitle}>Welcome back, {username}</h2>
          <p style={s.pageSub}>Here's an overview of your portfolio</p>
        </div>
        <button style={s.primaryBtn} onClick={() => navigate("/pm/properties")}>
          Manage Properties →
        </button>
      </div>

      {loading ? (
        <div style={s.empty}>Loading dashboard…</div>
      ) : (
        <>
          {/* STAT CARDS */}
          <div style={s.statGrid}>
            <div style={s.statCard}>
              <p style={s.statLabel}>Properties Managed</p>
              <p style={s.statValue}>{properties.length}</p>
            </div>
            <div style={s.statCard}>
              <p style={s.statLabel}>Active Properties</p>
              <p style={s.statValue}>{activeCount}</p>
            </div>
            <div style={s.statCard}>
              <p style={s.statLabel}>Total Units Deployed</p>
              <p style={s.statValue}>{totalUnits}</p>
            </div>
            <div style={s.statCard}>
              <p style={s.statLabel}>Unit Quota Remaining</p>
              <p style={s.statValue}>{remaining} <span style={s.statOf}>/ {maxUnits}</span></p>
              <div style={s.progressTrack}>
                <div style={{ ...s.progressFill, width: `${usagePct}%` }} />
              </div>
            </div>
          </div>

          {maxUnits === 0 && (
            <div style={s.noticeCard}>
              <strong>No unit quota allocated yet.</strong> Contact your Admin to set a unit
              allocation before creating properties with units.
            </div>
          )}

          {/* RECENT PROPERTIES */}
          <h3 style={s.sectionTitle}>Recent Properties</h3>
          {properties.length === 0 ? (
            <div style={s.emptyCard}>
              <p style={s.emptyIcon}>🏢</p>
              <p style={s.emptyTitle}>No properties yet</p>
              <p style={s.emptySub}>Head to Properties to create your first one.</p>
            </div>
          ) : (
            <div style={s.grid}>
              {properties.slice(0, 3).map(p => (
                <div key={p.id} style={s.card}>
                  <div style={s.cardHeader}>
                    <h4 style={s.cardTitle}>{p.name}</h4>
                    <span style={{ ...s.statusBadge, background: p.status === "active" ? "#d1fae5" : "#fee2e2", color: p.status === "active" ? "#065f46" : "#991b1b" }}>
                      {p.status}
                    </span>
                  </div>
                  <p style={s.cardAddress}>{p.address || "No address provided"}</p>
                  <div style={s.cardFooter}>
                    <span>{p.total_units} unit(s)</span>
                    <span>{p.dimensions?.length || 0} dimension(s)</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}

const s = {
  page:        { padding: 32, background: "#f8fafc", minHeight: "100vh", fontFamily: "'DM Sans', sans-serif" },
  header:      { display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 28 },
  pageTitle:   { margin: 0, fontSize: 24, fontWeight: 700, color: "#0f172a" },
  pageSub:     { margin: "4px 0 0", fontSize: 13, color: "#64748b" },
  primaryBtn:  { background: "#6366f1", color: "#fff", border: "none", padding: "10px 20px", borderRadius: 8, cursor: "pointer", fontWeight: 600, fontSize: 14 },
  empty:       { textAlign: "center", color: "#94a3b8", padding: 40, fontSize: 14 },

  statGrid:    { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 16, marginBottom: 28 },
  statCard:    { background: "#fff", borderRadius: 12, border: "1px solid #e2e8f0", padding: 18, boxShadow: "0 1px 4px rgba(0,0,0,.04)" },
  statLabel:   { margin: 0, fontSize: 12, color: "#64748b", fontWeight: 600 },
  statValue:   { margin: "6px 0 0", fontSize: 26, fontWeight: 700, color: "#0f172a" },
  statOf:      { fontSize: 14, fontWeight: 500, color: "#94a3b8" },
  progressTrack:{ marginTop: 10, height: 6, borderRadius: 4, background: "#f1f5f9", overflow: "hidden" },
  progressFill: { height: "100%", background: "#6366f1", borderRadius: 4, transition: "width .3s ease" },

  noticeCard:  { background: "#fffbeb", border: "1px solid #fde68a", color: "#92400e", padding: "12px 16px", borderRadius: 8, fontSize: 13, marginBottom: 28 },

  sectionTitle:{ fontSize: 16, fontWeight: 700, color: "#0f172a", margin: "0 0 14px" },
  emptyCard:   { background: "#fff", borderRadius: 12, border: "1px solid #e2e8f0", padding: "48px 20px", textAlign: "center" },
  emptyIcon:   { fontSize: 32, margin: "0 0 10px" },
  emptyTitle:  { fontSize: 15, fontWeight: 700, color: "#0f172a", margin: "0 0 4px" },
  emptySub:    { fontSize: 13, color: "#64748b", margin: 0 },

  grid:        { display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: 16 },
  card:        { background: "#fff", borderRadius: 12, border: "1px solid #e2e8f0", padding: 18, boxShadow: "0 1px 4px rgba(0,0,0,.04)" },
  cardHeader:  { display: "flex", justifyContent: "space-between", alignItems: "flex-start" },
  cardTitle:   { margin: 0, fontSize: 15, fontWeight: 700, color: "#0f172a" },
  cardAddress: { margin: "4px 0 12px", fontSize: 12, color: "#64748b" },
  statusBadge: { padding: "3px 10px", borderRadius: 20, fontSize: 11, fontWeight: 600, flexShrink: 0 },
  cardFooter:  { display: "flex", justifyContent: "space-between", fontSize: 12, color: "#475569", paddingTop: 10, borderTop: "1px solid #f1f5f9" },
};

export default PMDashboard;