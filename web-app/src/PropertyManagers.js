import React from "react";
import { useNavigate, Outlet } from "react-router-dom";

function PropertyManagers() {
  const navigate = useNavigate();

  return (
    <div style={styles.page}>
      <h2 style={styles.title}>Property Manager</h2>
      <p style={styles.subtitle}>
        Manage all property manager operations
      </p>

      <div style={styles.grid}>
        {/* CREATE */}
        <div
          style={styles.card}
          onClick={() => navigate("/admin/property-managers/create")}
        >
          <h3>Create Manager</h3>
          <p>Add a new property manager</p>
        </div>

        {/* VIEW */}
        <div
          style={styles.card}
          onClick={() => navigate("/admin/property-managers/view")}
        >
          <h3>View Managers</h3>
          <p>View all property managers</p>
        </div>

        {/* DELETE */}
        <div
          style={styles.card}
          onClick={() => navigate("/admin/property-managers/delete")}
        >
          <h3>Delete Manager</h3>
          <p>Remove a manager from system</p>
        </div>
      </div>

      {/* 🔥 THIS IS THE MAIN FIX */}
      <div style={{ marginTop: "30px" }}>
        <Outlet />
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
  title: {
    marginBottom: "5px"
  },
  subtitle: {
    color: "#666",
    marginBottom: "30px"
  },
  grid: {
    display: "flex",
    gap: "20px",
    justifyContent: "center"
  },
  card: {
    background: "#fff",
    padding: "30px",
    borderRadius: "12px",
    cursor: "pointer",
    width: "250px",
    textAlign: "center",
    boxShadow: "0 4px 12px rgba(0,0,0,0.05)"
  }
};

export default PropertyManagers;