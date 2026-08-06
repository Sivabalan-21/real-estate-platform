import React, { useEffect, useState } from "react";

function TenantDashboard() {
  const token = localStorage.getItem("token");
  const [unit, setUnit] = useState(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("http://187.127.180.107/units/me", {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(async (res) => {
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data.detail || "Could not load your unit");
        }
        return res.json();
      })
      .then(setUnit)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [token]);

  return (
    <div style={{ padding: 32 }}>
      <h2 style={{ marginBottom: 20 }}>My Home</h2>

      {loading && <p>Loading...</p>}

      {!loading && error && (
        <p style={{ color: "#64748b" }}>
          {error === "No active unit assigned"
            ? "You don't have an active lease yet. Your Property Manager will finish setting this up shortly."
            : error}
        </p>
      )}

      {!loading && unit && (
        <div
          style={{
            background: "#fff",
            border: "1px solid #e2e8f0",
            borderRadius: 10,
            padding: 20,
            maxWidth: 420,
          }}
        >
          <p style={{ margin: "0 0 8px", fontSize: 18, fontWeight: 700 }}>
            Unit {unit.unit_number}
          </p>
          <p style={{ margin: "0 0 4px", color: "#475569" }}>{unit.type}</p>
          <p style={{ margin: "0 0 4px", color: "#475569" }}>
            {unit.beds ?? "-"} bed · {unit.baths ?? "-"} bath
            {unit.sqft ? ` · ${unit.sqft} sqft` : ""}
          </p>
          <p style={{ margin: "8px 0 0", color: "#0f172a", fontWeight: 600 }}>
            Status: {unit.status}
          </p>
        </div>
      )}
    </div>
  );
}

export default TenantDashboard;