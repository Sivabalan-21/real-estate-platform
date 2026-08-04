import React from "react";

function OwnerProperties() {
  return (
    <div style={s.page}>
      <h1 style={s.title}>Owner Properties — coming soon</h1>
      <p style={s.subtitle}>
        Your owned properties, with occupancy and financial rollups, will live here.
      </p>
    </div>
  );
}

const s = {
  page:     { padding: 40, fontFamily: "'DM Sans', sans-serif" },
  title:    { margin: 0, fontSize: 22, fontWeight: 700, color: "#0f172a" },
  subtitle: { marginTop: 8, fontSize: 14, color: "#64748b" },
};

export default OwnerProperties;