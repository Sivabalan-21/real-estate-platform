import React, { useEffect, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";

const API = "http://187.127.180.107";

const STATUS_STYLES = {
  open:        { bg: "#fee2e2", color: "#991b1b", label: "Open" },
  in_progress: { bg: "#fef3c7", color: "#92400e", label: "In progress" },
  closed:      { bg: "#d1fae5", color: "#065f46", label: "Closed" },
};

const CATEGORY_ICONS = {
  Plumbing: "💧", Electrical: "⚡", HVAC: "❄️", Roof: "🏠",
  Drywall: "🧱", Pest: "🐛", Appliance: "🔌", Other: "🔧",
};

// Note: as of Day 15, "+ New Request" and the empty-state CTA both send the
// tenant to the dedicated /tenant/maintenance/new page (icon-tile category
// picker + photo upload) instead of opening an inline form on this page.
function TenantMaintenance() {
  const navigate = useNavigate();
  const token = localStorage.getItem("token");

  const [unit, setUnit] = useState(null);
  const [unitError, setUnitError] = useState("");
  const [tickets, setTickets] = useState([]);
  const [loading, setLoading] = useState(true);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    try {
      const unitRes = await fetch(`${API}/units/me`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const unitData = await unitRes.json();
      if (!unitRes.ok) {
        setUnitError(unitData.detail || "Could not load your unit");
        setLoading(false);
        return;
      }
      setUnit(unitData);
      setUnitError("");

      // Day 14's richer, company-scoped route — returns category/priority/
      // status for every ticket on the property.
      const ticketsRes = await fetch(
        `${API}/properties/${unitData.property_id}/tickets`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      const ticketsData = await ticketsRes.json();
      if (ticketsRes.ok) {
        // A tenant only sees tickets tied to their own unit (or unassigned
        // ones raised on the property before a unit was picked).
        setTickets(
          Array.isArray(ticketsData)
            ? ticketsData.filter(t => !t.unit_id || t.unit_id === unitData.id)
            : []
        );
      }
    } catch {
      setUnitError("Server error. Please try again.");
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  return (
    <div style={s.page}>
      <div style={s.header}>
        <h2 style={s.title}>Maintenance</h2>
        {unit && (
          <button style={s.newBtn} onClick={() => navigate("/tenant/maintenance/new")}>
            + New Request
          </button>
        )}
      </div>

      {loading && <p style={s.muted}>Loading…</p>}

      {!loading && unitError && (
        <p style={s.muted}>
          {unitError === "No active unit assigned"
            ? "You don't have an active lease yet, so maintenance requests aren't available."
            : unitError}
        </p>
      )}

      {!loading && !unitError && (
        tickets.length === 0 ? (
          <div style={s.empty}>
            <p style={s.emptyIcon}>🛠</p>
            <p style={s.emptyText}>No maintenance requests yet</p>
            <button style={s.newBtnOutline} onClick={() => navigate("/tenant/maintenance/new")}>
              + Report a Problem
            </button>
          </div>
        ) : (
          <div style={s.list}>
            {tickets.map(t => {
              const st = STATUS_STYLES[t.status] || { bg: "#f1f5f9", color: "#475569", label: t.status };
              return (
                <button
                  key={t.id}
                  style={s.card}
                  onClick={() => navigate(`/tenant/maintenance/${t.id}`)}
                >
                  <span style={s.cardIcon}>{CATEGORY_ICONS[t.category] || "🛠"}</span>
                  <div style={s.cardBody}>
                    <div style={s.cardTop}>
                      <span style={s.cardTitle}>{t.category || t.title}</span>
                      <span style={{ ...s.pill, background: st.bg, color: st.color }}>{st.label}</span>
                    </div>
                    {t.description && <p style={s.cardDesc}>{t.description}</p>}
                  </div>
                </button>
              );
            })}
          </div>
        )
      )}
    </div>
  );
}

const s = {
  page:      { padding: 32, fontFamily: "'DM Sans', sans-serif" },
  header:    { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 },
  title:     { margin: 0, fontSize: 20, fontWeight: 700, color: "#0f172a" },
  newBtn:    { background: "#6366f1", color: "#fff", border: "none", padding: "9px 16px", borderRadius: 8, cursor: "pointer", fontSize: 13, fontWeight: 600 },
  newBtnOutline: { background: "#fff", color: "#6366f1", border: "1px solid #6366f1", padding: "9px 16px", borderRadius: 8, cursor: "pointer", fontSize: 13, fontWeight: 600, marginTop: 12 },
  muted:     { color: "#64748b", fontSize: 14 },

  empty:     { textAlign: "center", padding: "60px 20px", color: "#94a3b8" },
  emptyIcon: { fontSize: 32, margin: 0 },
  emptyText: { fontSize: 14, fontWeight: 600, color: "#64748b", margin: "8px 0 0" },

  list:      { display: "flex", flexDirection: "column", gap: 10, maxWidth: 480 },
  card:      {
    display: "flex", gap: 12, textAlign: "left", background: "#fff", border: "1px solid #e2e8f0",
    borderRadius: 10, padding: 14, cursor: "pointer", fontFamily: "inherit", width: "100%", boxSizing: "border-box",
  },
  cardIcon:  { fontSize: 22, flexShrink: 0 },
  cardBody:  { flex: 1, minWidth: 0 },
  cardTop:   { display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10 },
  cardTitle: { fontSize: 14, fontWeight: 600, color: "#0f172a" },
  cardDesc:  { margin: "6px 0 0", fontSize: 12, color: "#64748b", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" },
  pill:      { fontSize: 10, fontWeight: 700, padding: "3px 9px", borderRadius: 20, flexShrink: 0 },
};

export default TenantMaintenance;