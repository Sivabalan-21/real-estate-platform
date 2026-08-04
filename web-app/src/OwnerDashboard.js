import React from "react";

function OwnerDashboard() {
  return (
    <div style={s.page}>
      <h1 style={s.title}>Owner Dashboard — coming soon</h1>
      <p style={s.subtitle}>
        Portfolio overview, occupancy, and income summaries will live here.
      </p>
    </div>
  );
}

const s = {
  page:     { padding: 40, fontFamily: "'DM Sans', sans-serif" },
  title:    { margin: 0, fontSize: 22, fontWeight: 700, color: "#0f172a" },
  subtitle: { marginTop: 8, fontSize: 14, color: "#64748b" },
};

export default OwnerDashboard;