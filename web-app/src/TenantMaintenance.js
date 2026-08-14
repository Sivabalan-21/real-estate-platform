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

function formatDate(dateStr) {
  if (!dateStr) return "";
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString("en-IN", { day: "numeric", month: "short" });
}

// Note: as of Day 15, "+ New Request" and the empty-state CTA both send the
// tenant to the dedicated /tenant/maintenance/new page (icon-tile category
// picker + photo upload) instead of opening an inline form on this page.
// As of Day 16, the ticket list itself comes from the self-scoped
// GET /tenant/tickets (only tickets this tenant personally submitted) rather
// than the property-wide route filtered client-side.
function TenantMaintenance() {
  const navigate = useNavigate();
  const token = localStorage.getItem("token");

  const [hasUnit, setHasUnit] = useState(false);
  const [unitError, setUnitError] = useState("");
  const [tickets, setTickets] = useState([]);
  const [loading, setLoading] = useState(true);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    try {
      // /units/me is only used here to gate "+ New Request" on having an
      // active lease and to show a friendly message when there isn't one —
      // the ticket list itself no longer depends on it.
      const unitRes = await fetch(`${API}/units/me`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const unitData = await unitRes.json();
      if (!unitRes.ok) {
        setUnitError(unitData.detail || "Could not load your unit");
        setLoading(false);
        return;
      }
      setHasUnit(true);
      setUnitError("");

      const ticketsRes = await fetch(`${API}/tenant/tickets`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const ticketsData = await ticketsRes.json();
      if (ticketsRes.ok) setTickets(Array.isArray(ticketsData) ? ticketsData : []);
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
        {hasUnit && (
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
                    <p style={s.cardDate}>{formatDate(t.created_at)}</p>
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
  cardDesc:  {
    margin: "6px 0 0", fontSize: 12, color: "#64748b", lineHeight: 1.4,
    display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden",
  },
  cardDate:  { margin: "6px 0 0", fontSize: 11, color: "#94a3b8" },
  pill:      { fontSize: 10, fontWeight: 700, padding: "3px 9px", borderRadius: 20, flexShrink: 0 },
};

export default TenantMaintenance;