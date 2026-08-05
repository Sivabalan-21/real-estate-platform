import React from "react";
import { useParams, useNavigate } from "react-router-dom";

function OwnerPropertyDetail() {
  const { id } = useParams();
  const navigate = useNavigate();

  return (
    <div style={s.page}>
      <button style={s.back} onClick={() => navigate("/owner/dashboard")}>← Back to dashboard</button>
      <h1 style={s.title}>Property detail — coming soon</h1>
      <p style={s.subtitle}>
        Full property drill-down (units, leases, financials) for property {id} will live here.
      </p>
    </div>
  );
}

const s = {
  page:     { padding: 40, fontFamily: "'DM Sans', sans-serif" },
  back:     { background: "none", border: "none", color: "#6366f1", fontSize: 13, fontWeight: 600, cursor: "pointer", padding: 0, marginBottom: 20 },
  title:    { margin: 0, fontSize: 22, fontWeight: 700, color: "#0f172a" },
  subtitle: { marginTop: 8, fontSize: 14, color: "#64748b" },
};

export default OwnerPropertyDetail;