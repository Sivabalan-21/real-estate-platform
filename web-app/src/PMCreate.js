import React from "react";
import { useNavigate } from "react-router-dom";

function PMCreate() {
  const navigate = useNavigate();

  return (
    <div>
      <h2>Create Users</h2>

      <div style={styles.grid}>
        
        <div
          style={styles.card}
          onClick={() => navigate("/pm/users/create?role=Tenant")}
        >
          <h3>Tenant</h3>
        </div>

        <div
          style={styles.card}
          onClick={() => navigate("/pm/users/create?role=Vendor")}
        >
          <h3>Vendor</h3>
        </div>

        <div
          style={styles.card}
          onClick={() => navigate("/pm/users/create?role=Owner")}
        >
          <h3>Owner</h3>
        </div>

      </div>
    </div>
  );
}

const styles = {
  grid: {
    display: "grid",
    gridTemplateColumns: "repeat(3, 1fr)",
    gap: "20px",
    marginTop: "20px"
  },
  card: {
    background: "#fff",
    padding: "20px",
    borderRadius: "10px",
    cursor: "pointer",
    boxShadow: "0 4px 10px rgba(0,0,0,0.05)"
  }
};

export default PMCreate;