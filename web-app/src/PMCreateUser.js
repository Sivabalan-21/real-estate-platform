import React from "react";
import { useNavigate } from "react-router-dom";

function PMCreateUser() {
  const navigate = useNavigate();

  return (
    <div style={styles.page}>
      <h2>Create User</h2>

      <div style={styles.grid}>
        <div
          style={styles.card}
          onClick={() => navigate("/pm/users/create/tenant")}
        >
          <h3>Create Tenant</h3>
          <p>Assign tenant to a unit</p>
        </div>

        {/* Later we add Vendor / Owner here */}
      </div>
    </div>
  );
}

const styles = {
  page: {
    padding: "40px",
    background: "#f5f7fa",
    minHeight: "100vh"
  },
  grid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(250px, 1fr))",
    gap: "20px",
    marginTop: "20px"
  },
  card: {
    background: "#fff",
    padding: "25px",
    borderRadius: "12px",
    cursor: "pointer",
    border: "1px solid #e5e7eb",
    boxShadow: "0 4px 10px rgba(0,0,0,0.05)"
  }
};

export default PMCreateUser;