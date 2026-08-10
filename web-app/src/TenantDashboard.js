import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";

const API = "http://187.127.180.107";

function useIsMobile(breakpoint = 640) {
  const [isMobile, setIsMobile] = useState(
    typeof window !== "undefined" ? window.innerWidth < breakpoint : false
  );
  useEffect(() => {
    const onResize = () => setIsMobile(window.innerWidth < breakpoint);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [breakpoint]);
  return isMobile;
}

function formatDate(dateStr) {
  if (!dateStr) return "—";
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return dateStr;
  return d.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}

function formatRent(amount) {
  if (amount === null || amount === undefined) return "—";
  return `₹${Number(amount).toLocaleString("en-IN")}`;
}

function TenantDashboard() {
  const navigate = useNavigate();
  const token = localStorage.getItem("token");
  const isMobile = useIsMobile();

  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    fetch(`${API}/tenant/me`, { headers: { Authorization: `Bearer ${token}` } })
      .then(async (res) => {
        const body = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(body.detail || "Could not load your home");
        return body;
      })
      .then((body) => { if (!cancelled) setData(body); })
      .catch((e) => { if (!cancelled) setError(e.message); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [token]);

  const daysToExpiry = data?.lease?.days_to_expiry;
  const showRenewalBanner = typeof daysToExpiry === "number" && daysToExpiry >= 0 && daysToExpiry <= 60;

  return (
    <div style={s.page}>
      <h2 style={s.title}>My Home</h2>

      {loading && <p style={s.muted}>Loading…</p>}

      {!loading && error && (
        <p style={s.muted}>
          {error === "No active unit assigned"
            ? "You don't have an active lease yet. Your Property Manager will finish setting this up shortly."
            : error}
        </p>
      )}

      {!loading && !error && data && (
        <>
          {showRenewalBanner && (
            <div style={s.banner}>
              <span style={s.bannerIcon}>⚠️</span>
              <span>
                Your lease ends in <strong>{daysToExpiry} day{daysToExpiry === 1 ? "" : "s"}</strong>.
                Contact your PM to discuss renewal.
              </span>
            </div>
          )}

          <div style={{ ...s.grid, gridTemplateColumns: isMobile ? "1fr" : "repeat(2, 1fr)" }}>
            {/* My Home */}
            <div style={s.card}>
              <p style={s.cardLabel}>My Home</p>
              <p style={s.cardHeading}>Unit {data.unit.unit_number}</p>
              <p style={s.cardSub}>{data.unit.property_name}</p>
              {data.unit.address && <p style={s.cardSub}>{data.unit.address}</p>}
              <div style={s.tagRow}>
                <span style={s.tag}>{data.unit.type}</span>
                {data.unit.beds != null && <span style={s.tag}>{data.unit.beds} bed</span>}
                {data.unit.baths != null && <span style={s.tag}>{data.unit.baths} bath</span>}
                {data.unit.sqft != null && <span style={s.tag}>{data.unit.sqft} sqft</span>}
              </div>
            </div>

            {/* My Lease */}
            <div style={s.card}>
              <div style={s.cardTopRow}>
                <p style={s.cardLabel}>My Lease</p>
                {typeof daysToExpiry === "number" && (
                  <span style={{ ...s.expiryBadge, ...(daysToExpiry <= 60 ? s.expiryBadgeWarn : s.expiryBadgeOk) }}>
                    {daysToExpiry >= 0 ? `${daysToExpiry}d left` : "Expired"}
                  </span>
                )}
              </div>
              <p style={s.cardHeading}>{formatRent(data.lease.monthly_rent)}<span style={s.cardHeadingUnit}>/month</span></p>
              <div style={s.leaseRow}>
                <div>
                  <p style={s.leaseLabel}>Start Date</p>
                  <p style={s.leaseValue}>{formatDate(data.lease.start_date)}</p>
                </div>
                <div>
                  <p style={s.leaseLabel}>End Date</p>
                  <p style={s.leaseValue}>{formatDate(data.lease.end_date)}</p>
                </div>
              </div>
            </div>

            {/* My Property Manager */}
            <div style={s.card}>
              <p style={s.cardLabel}>My Property Manager</p>
              {data.property_manager ? (
                <>
                  <p style={s.cardHeading}>{data.property_manager.pm_name}</p>
                  {data.property_manager.pm_email && (
                    <a href={`mailto:${data.property_manager.pm_email}`} style={s.mailLink}>
                      {data.property_manager.pm_email}
                    </a>
                  )}
                </>
              ) : (
                <p style={s.cardSub}>No property manager assigned yet.</p>
              )}
            </div>
          </div>

          {/* Quick actions */}
          <div style={{ ...s.actionsRow, flexDirection: isMobile ? "column" : "row" }}>
            <button style={s.primaryBtn} onClick={() => navigate("/tenant/maintenance/new")}>
              🛠 Report a Problem
            </button>
            <button style={s.secondaryBtn} onClick={() => navigate("/tenant/payments")}>
              💳 View Payments
            </button>
          </div>
        </>
      )}
    </div>
  );
}

const s = {
  page:   { padding: 24, fontFamily: "'DM Sans', sans-serif", maxWidth: 900, boxSizing: "border-box" },
  title:  { margin: "0 0 20px", fontSize: 20, fontWeight: 700, color: "#0f172a" },
  muted:  { color: "#64748b", fontSize: 14 },

  banner: {
    display: "flex", alignItems: "flex-start", gap: 10,
    background: "#fef3c7", border: "1px solid #fde68a", color: "#92400e",
    borderRadius: 10, padding: "12px 16px", marginBottom: 20, fontSize: 13, lineHeight: 1.5,
  },
  bannerIcon: { flexShrink: 0 },

  grid: { display: "grid", gap: 16, marginBottom: 20 },

  card: { background: "#fff", border: "1px solid #e2e8f0", borderRadius: 12, padding: 20, boxSizing: "border-box" },
  cardTopRow: { display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 10 },
  cardLabel: { margin: "0 0 8px", fontSize: 11, fontWeight: 700, letterSpacing: "0.05em", textTransform: "uppercase", color: "#94a3b8" },
  cardHeading: { margin: "0 0 4px", fontSize: 20, fontWeight: 700, color: "#0f172a" },
  cardHeadingUnit: { fontSize: 13, fontWeight: 500, color: "#94a3b8", marginLeft: 4 },
  cardSub: { margin: "0 0 2px", fontSize: 13, color: "#64748b" },

  tagRow: { display: "flex", flexWrap: "wrap", gap: 6, marginTop: 12 },
  tag: { background: "#f1f5f9", color: "#475569", fontSize: 11, fontWeight: 600, padding: "4px 10px", borderRadius: 20 },

  leaseRow: { display: "flex", gap: 24, marginTop: 12 },
  leaseLabel: { margin: "0 0 2px", fontSize: 11, color: "#94a3b8", fontWeight: 600, textTransform: "uppercase" },
  leaseValue: { margin: 0, fontSize: 13, fontWeight: 600, color: "#334155" },

  expiryBadge: { fontSize: 10, fontWeight: 700, padding: "3px 9px", borderRadius: 20, flexShrink: 0 },
  expiryBadgeWarn: { background: "#fee2e2", color: "#991b1b" },
  expiryBadgeOk: { background: "#d1fae5", color: "#065f46" },

  mailLink: { fontSize: 13, color: "#6366f1", fontWeight: 600, textDecoration: "none" },

  actionsRow: { display: "flex", gap: 12, width: "100%" },
  primaryBtn: { flex: 1, background: "#6366f1", color: "#fff", border: "none", padding: "13px 20px", borderRadius: 10, cursor: "pointer", fontSize: 14, fontWeight: 600 },
  secondaryBtn: { flex: 1, background: "#f1f5f9", color: "#334155", border: "none", padding: "13px 20px", borderRadius: 10, cursor: "pointer", fontSize: 14, fontWeight: 600 },
};

export default TenantDashboard;