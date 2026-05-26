import React, { useEffect, useState } from "react";

function DeleteManager() {
  const [data, setData] = useState([]);
  const [search, setSearch] = useState("");
  const token = localStorage.getItem("token");

  const fetchManagers = async () => {
    try {
      const res = await fetch("http://localhost:8000/users", {
        headers: {
          Authorization: `Bearer ${token}`
        }
      });

      const result = await res.json();

      const managers = result.filter(
        (u) => u.role === "Property Manager"
      );

      setData(Array.isArray(managers) ? managers : []);
    } catch (err) {
      console.error(err);
      setData([]);
    }
  };

  // eslint-disable-next-line
  useEffect(() => {
    fetchManagers();
  }, []);

  const handleDelete = async (userId) => {
    if (!window.confirm("Delete this manager?")) return;

    await fetch(`http://localhost:8000/users/delete/${userId}`, {
      method: "DELETE",
      headers: {
        Authorization: `Bearer ${token}`
      }
    });

    fetchManagers();
  };

  const filtered = data.filter(
    (m) =>
      m.username.toLowerCase().includes(search.toLowerCase()) ||
      m.email.toLowerCase().includes(search.toLowerCase()) ||
      m.user_id.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div style={styles.page}>
      <h2 style={styles.title}>Delete Manager</h2>

      <div style={styles.searchBar}>
        <input
          style={styles.input}
          placeholder="Search by username, email or ID"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <button style={styles.searchBtn}>Search</button>
      </div>

      <div style={styles.wrapper}>
        <div style={styles.card}>
          <table style={styles.table}>
            <thead>
              <tr>
                <th style={{ ...styles.th, width: "20%" }}>Username</th>
                <th style={{ ...styles.th, width: "30%" }}>Email</th>
                <th style={{ ...styles.th, width: "20%" }}>Manager ID</th>
                <th style={{ ...styles.th, width: "15%" }}>Units</th>
                <th style={{ ...styles.th, width: "15%" }}>Action</th>
              </tr>
            </thead>

            <tbody>
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan="5" style={styles.empty}>
                    No managers found
                  </td>
                </tr>
              ) : (
                filtered.map((m) => (
                  <tr key={m.user_id}>
                    <td style={styles.td}>{m.username}</td>

                    {/* ✅ FIXED EMAIL OVERFLOW */}
                    <td style={styles.td} title={m.email}>
                      {m.email}
                    </td>

                    <td style={styles.td}>{m.user_id}</td>

                    <td style={styles.td}>{m.max_units ?? 0}</td>

                    <td style={styles.td}>
                      <button
                        style={styles.deleteBtn}
                        onClick={() => handleDelete(m.user_id)}
                      >
                        Delete
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

const styles = {
  page: {
    padding: "40px",
    background: "#f5f7fa",
    minHeight: "100vh",
    fontFamily: "Segoe UI"
  },

  title: {
    marginBottom: "20px"
  },

  searchBar: {
    display: "flex",
    gap: "10px",
    marginBottom: "20px"
  },

  input: {
    flex: 1,
    padding: "10px",
    borderRadius: "6px",
    border: "1px solid #ccc"
  },

  searchBtn: {
    background: "#2563eb",
    color: "#fff",
    border: "none",
    padding: "10px 16px",
    borderRadius: "6px"
  },

  wrapper: {
    maxWidth: "1000px",
    margin: "0 auto"
  },

  card: {
    background: "#fff",
    borderRadius: "12px",
    border: "1px solid #e5e7eb",
    boxShadow: "0 2px 10px rgba(0,0,0,0.05)",
    overflow: "hidden"
  },

  table: {
    width: "100%",
    borderCollapse: "collapse",
    tableLayout: "fixed" // ✅ KEY FIX
  },

  th: {
    padding: "14px",
    textAlign: "center",
    fontWeight: "600",
    borderBottom: "1px solid #eee"
  },

  td: {
    padding: "14px",
    textAlign: "center",
    borderBottom: "1px solid #f0f0f0",
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap"
  },

  deleteBtn: {
    background: "#ef4444",
    color: "#fff",
    border: "none",
    padding: "6px 12px",
    borderRadius: "6px",
    cursor: "pointer"
  },

  empty: {
    textAlign: "center",
    padding: "20px",
    color: "#777"
  }
};

export default DeleteManager;