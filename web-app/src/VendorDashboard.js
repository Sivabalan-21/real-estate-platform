import React from "react";

function VendorDashboard() {
  const username = localStorage.getItem("username") || "Vendor";
  return (
    <div style={{ padding: 32 }}>
      <h2 style={{ margin: 0, color: "#0f172a" }}>Welcome, {username}</h2>
      <p style={{ color: "#64748b" }}>Your assigned jobs will appear here.</p>
    </div>
  );
}

export default VendorDashboard;