import React from "react";

function OwnerReports() {
  return (
    <div style={s.page}>
      <h1 style={s.title}>Reports — coming soon</h1>
      <p style={s.subtitle}>
        Portfolio-level financial and occupancy reports will live here.
      </p>
    </div>
  );
}

const s = {
  page:     { padding: 40, fontFamily: "'DM Sans', sans-serif" },
  title:    { margin: 0, fontSize: 22, fontWeight: 700, color: "#0f172a" },
  subtitle: { marginTop: 8, fontSize: 14, color: "#64748b" },
};

export default OwnerReports;