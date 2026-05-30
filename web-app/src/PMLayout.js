import React from "react";
import { Outlet, useNavigate } from "react-router-dom";

function PMLayout() {
  const navigate = useNavigate();
  const username = localStorage.getItem("username");

  const logout = () => {
    const slug = localStorage.getItem("company_slug");
    localStorage.clear();
    navigate(slug ? `/portal/${slug}` : "/");
  };

  return (
    <div style={styles.container}>

      {/* SIDEBAR */}
      <div style={styles.sidebar}>
        <h2 style={styles.logo}>PM Panel</h2>

        <button style={styles.navBtn} onClick={() => navigate("/pm/dashboard")}>
          Dashboard
        </button>

        <button style={styles.navBtn} onClick={() => navigate("/pm/create")}>
          Create
        </button>

        <button style={styles.navBtn} onClick={() => navigate("/pm/manage")}>
          User Management
        </button>
      </div>

      {/* MAIN */}
      <div style={styles.main}>
        
        {/* HEADER */}
        <div style={styles.header}>
          <span>Welcome, {username}</span>
          <button style={styles.logout} onClick={logout}>
            Logout
          </button>
        </div>

        {/* PAGE CONTENT */}
        <div style={styles.content}>
          <Outlet />
        </div>

      </div>
    </div>
  );
}

const styles = {
  container: {
    display: "flex",
    minHeight: "100vh",
    fontFamily: "Segoe UI"
  },

  sidebar: {
    width: "220px",
    background: "#1e293b",
    color: "#fff",
    padding: "20px",
    display: "flex",
    flexDirection: "column",
    gap: "15px"
  },

  logo: {
    marginBottom: "20px"
  },

  navBtn: {
    padding: "10px",
    border: "none",
    borderRadius: "6px",
    background: "#334155",
    color: "#fff",
    cursor: "pointer",
    textAlign: "left"
  },

  main: {
    flex: 1,
    background: "#f5f7fa"
  },

  header: {
    display: "flex",
    justifyContent: "space-between",
    padding: "15px 20px",
    background: "#fff",
    borderBottom: "1px solid #e5e7eb"
  },

  content: {
    padding: "30px"
  },

  logout: {
    background: "#ef4444",
    color: "#fff",
    border: "none",
    padding: "6px 12px",
    borderRadius: "6px",
    cursor: "pointer"
  }
};

export default PMLayout;