import React, { useEffect, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";

const API = "http://194.164.149.22/api";

export default function PMDashboard() {
  const navigate   = useNavigate();
  const token      = localStorage.getItem("token");
  const username   = localStorage.getItem("username");

  const [properties, setProperties] = useState([]);
  const [loading,    setLoading]    = useState(true);
  const [toast,      setToast]      = useState(null);

  const showToast = (msg, type = "success") => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3500);
  };

  const fetchProperties = useCallback(async () => {
    try {
      const res = await fetch(`${API}/properties`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.status === 401) { navigate("/"); return; }
      const data = await res.json();
      setProperties(Array.isArray(data) ? data : []);
    } catch {
      showToast("Failed to load properties", "error");
    } finally {
      setLoading(false);
    }
  }, [token, navigate]);

  useEffect(() => { fetchProperties(); }, [fetchProperties]);

  return (
    <div style={s.page}>
      <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&display=swap" rel="stylesheet" />

      {toast && (
        <div style={{ ...s.toast, background: toast.type === "error" ? "#ef4444" : "#10b981" }}>
          {toast.msg}
        </div>
      )}

      <div style={s.header}>
        <div>
          <h2 style={s.pageTitle}>My Properties</h2>
          <p style={s.pageSub}>Welcome back, {username} — {properties.length} properties assigned to you</p>
        </div>
      </div>

      {loading ? (
        <div style={s.empty}>Loading your properties…</div>
      ) : properties.length === 0 ? (
        <div style={s.emptyCard}>
          <p style={s.emptyIcon}>🏢</p>
          <p style={s.emptyTitle}>No properties assigned</p>
          <p style={s.emptySub}>You have no properties assigned yet. Contact your administrator.</p>
        </div>
      ) : (
        <div style={s.grid}>
          {properties.map(p => (
            <div key={p.id} style={s.card}>
              <div style={s.cardHeader}>
                <div>
                  <h3 style={s.cardTitle}>{p.name}</h3>
                  <p style={s.cardAddress}>{p.address || "No address provided"}</p>
                </div>
                <span style={{
                  ...s.statusBadge,
                  background: p.status === "active" ? "#d1fae5" : "#fee2e2",
                  color: p.status === "active" ? "#065f46" : "#991b1b"
                }}>
                  {p.status}
                </span>
              </div>

              {p.description && <p style={s.cardDesc}>{p.description}</p>}

              {p.dimensions?.length > 0 && (
                <div style={s.dimSection}>
                  <p style={s.sectionLabel}>Dimensions</p>
                  <div style={s.dimGrid}>
                    {p.dimensions.map(d => (
                      <div key={d.id} style={s.dimChip}>
                        <span style={s.dimName}>{d.name}</span>
                        <span style={s.dimValue}>{d.value} {d.unit || ""}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div style={s.statsRow}>
                <div style={s.statBox}>
                  <span style={s.statNum}>{p.total_units}</span>
                  <span style={s.statLabel}>Total Units</span>
                </div>
                <div style={s.statBox}>
                  <span style={s.statNum}>{p.dimensions?.length || 0}</span>
                  <span style={s.statLabel}>Dimensions</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

const s = {
  page:        { padding: 32, background: "#f8fafc", minHeight: "100vh", fontFamily: "'DM Sans', sans-serif" },
  header:      { marginBottom: 24 },
  pageTitle:   { margin: 0, fontSize: 24, fontWeight: 700, color: "#0f172a" },
  pageSub:     { margin: "4px 0 0", fontSize: 13, color: "#64748b" },
  empty:       { textAlign: "center", color: "#94a3b8", padding: 40, fontSize: 14 },
  emptyCard:   { background: "#fff", borderRadius: 12, border: "1px solid #e2e8f0", padding: "60px 20px", textAlign: "center" },
  emptyIcon:   { fontSize: 40, margin: "0 0 12px" },
  emptyTitle:  { fontSize: 16, fontWeight: 700, color: "#0f172a", margin: "0 0 6px" },
  emptySub:    { fontSize: 13, color: "#64748b", margin: 0 },
  grid:        { display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(340px, 1fr))", gap: 20 },
  card:        { background: "#fff", borderRadius: 12, border: "1px solid #e2e8f0", padding: 20, boxShadow: "0 1px 4px rgba(0,0,0,.04)" },
  cardHeader:  { display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 8 },
  cardTitle:   { margin: 0, fontSize: 16, fontWeight: 700, color: "#0f172a" },
  cardAddress: { margin: "2px 0 0", fontSize: 12, color: "#64748b" },
  cardDesc:    { fontSize: 13, color: "#475569", margin: "8px 0", lineHeight: 1.5 },
  statusBadge: { padding: "3px 10px", borderRadius: 20, fontSize: 11, fontWeight: 600, flexShrink: 0 },
  dimSection:  { marginTop: 12 },
  sectionLabel:{ fontSize: 11, fontWeight: 600, color: "#94a3b8", textTransform: "uppercase", letterSpacing: 0.5, margin: "0 0 6px" },
  dimGrid:     { display: "flex", flexWrap: "wrap", gap: 6 },
  dimChip:     { background: "#f1f5f9", borderRadius: 6, padding: "4px 10px", fontSize: 12, display: "flex", gap: 6, alignItems: "center" },
  dimName:     { color: "#475569", fontWeight: 600 },
  dimValue:    { color: "#6366f1", fontWeight: 700 },
  statsRow:    { display: "flex", gap: 12, marginTop: 14, paddingTop: 12, borderTop: "1px solid #f1f5f9" },
  statBox:     { flex: 1, background: "#f8fafc", borderRadius: 8, padding: "10px 14px", textAlign: "center" },
  statNum:     { display: "block", fontSize: 20, fontWeight: 700, color: "#6366f1" },
  statLabel:   { display: "block", fontSize: 11, color: "#64748b", marginTop: 2 },
  toast:       { position: "fixed", top: 20, right: 20, color: "#fff", padding: "12px 20px", borderRadius: 8, fontSize: 13, fontWeight: 600, zIndex: 9999, boxShadow: "0 4px 12px rgba(0,0,0,.15)" },
};