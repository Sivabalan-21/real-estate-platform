import React, { useCallback, useEffect, useState } from "react";

function PMUserManagement() {
  const [users, setUsers] = useState([]);
  const token = localStorage.getItem("token");

  const fetchUsers = useCallback(async () => {
    try {
      const res = await fetch("http://187.127.180.107/users", {
        headers: { Authorization: `Bearer ${token}` }
      });

      const data = await res.json();

      // 🔥 ONLY SHOW PM CREATED USERS
      const username = localStorage.getItem("username");

      const filtered = data.filter(
        (u) => u.created_by === username
      );

      setUsers(filtered);
    } catch (err) {
      console.error(err);
    }
  }, [token]);

  useEffect(() => {
    fetchUsers();
  }, [fetchUsers]);

  const handleDelete = async (userId) => {
    if (!window.confirm("Delete this user?")) return;

    await fetch(`http://194.164.149.22/api/users/delete/${userId}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` }
    });

    fetchUsers();
  };

  return (
    <div style={styles.page}>
      <h2 style={styles.title}>User Management</h2>



      <div style={styles.container}>
        {users.length === 0 ? (
          <p>No users found</p>
        ) : (
          users.map((u) => (
            <div key={u.user_id} style={styles.card}>
              <div style={styles.header}>
                <span style={styles.name}>{u.username}</span>
                <span style={styles.role}>{u.role}</span>
              </div>

              <p style={styles.email}>{u.email}</p>
              <p style={styles.meta}>
                Created By: {u.created_by} ({u.created_by_role || "PM"})
              </p>

              <div style={styles.actions}>
                <button
                  style={styles.deleteBtn}
                  onClick={() => handleDelete(u.user_id)}
                >
                  Delete
                </button>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

const styles = {
  page: {
    padding: "40px",
    background: "#f4f6f9",
    minHeight: "100vh"
  },

  title: {
    marginBottom: "20px",
    fontSize: "22px",
    fontWeight: "600"
  },

  createBtn: {
    marginBottom: "20px",
    padding: "10px 18px",
    background: "#2563eb",
    color: "#fff",
    border: "none",
    borderRadius: "6px",
    cursor: "pointer"
  },

  container: {
    display: "flex",
    flexDirection: "column",
    gap: "20px"
  },

  card: {
    background: "#fff",
    borderRadius: "12px",
    padding: "20px",
    border: "1px solid #e5e7eb",
    boxShadow: "0 4px 12px rgba(0,0,0,0.05)"
  },

  header: {
    display: "flex",
    justifyContent: "space-between",
    marginBottom: "10px"
  },

  name: {
    fontSize: "18px",
    fontWeight: "600"
  },

  role: {
    fontSize: "13px",
    background: "#e0e7ff",
    color: "#3730a3",
    padding: "4px 10px",
    borderRadius: "20px"
  },

  email: {
    margin: "5px 0",
    color: "#555"
  },

  meta: {
    fontSize: "13px",
    color: "#777"
  },

  actions: {
    marginTop: "15px",
    display: "flex",
    justifyContent: "flex-end"
  },

  deleteBtn: {
    background: "#ef4444",
    color: "#fff",
    border: "none",
    padding: "6px 14px",
    borderRadius: "6px",
    cursor: "pointer"
  }
};

export default PMUserManagement;