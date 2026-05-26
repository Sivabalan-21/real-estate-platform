import React, { useEffect, useState } from "react";

function ViewManagers() {
  const [data, setData] = useState([]);
  const token = localStorage.getItem("token");

  useEffect(() => {
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

    fetchManagers();
  }, [token]);

  // ✅ SAFE UNITS (fallback)
  const getUnits = (m) => m.max_units ?? 0;

  const getStatus = (units) => {
    if (units >= 100) return "Full";
    if (units > 70) return "Almost Full";
    return "Available";
  };

  const getStatusStyle = (units) => {
    if (units >= 100) return { color: "red", fontWeight: "600" };
    if (units > 70) return { color: "orange", fontWeight: "600" };
    return { color: "green", fontWeight: "600" };
  };

  return (
    <div style={styles.page}>
      <h2 style={styles.title}>Property Managers</h2>

      <div style={styles.wrapper}>
        <div style={styles.card}>
          <table style={styles.table}>
            <thead>
              <tr>
                <th style={{ ...styles.th, width: "20%" }}>Username</th>
                <th style={{ ...styles.th, width: "30%" }}>Email</th>
                <th style={{ ...styles.th, width: "20%" }}>Manager ID</th>
                <th style={{ ...styles.th, width: "15%" }}>Units</th>
                <th style={{ ...styles.th, width: "15%" }}>Status</th>
              </tr>
            </thead>

            <tbody>
              {data.length === 0 ? (
                <tr>
                  <td colSpan="5" style={styles.empty}>
                    No managers found
                  </td>
                </tr>
              ) : (
                data.map((m) => {
                  const units = getUnits(m);

                  return (
                    <tr key={m.user_id}>
                      <td style={styles.td}>{m.username}</td>

                      {/* ✅ FIXED EMAIL OVERFLOW */}
                      <td style={styles.td} title={m.email}>
                        {m.email}
                      </td>

                      <td style={styles.td}>{m.user_id}</td>

                      <td style={styles.td}>{units}</td>

                      <td
                        style={{
                          ...styles.td,
                          ...getStatusStyle(units)
                        }}
                      >
                        {getStatus(units)}
                      </td>
                    </tr>
                  );
                })
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
    tableLayout: "fixed" // ✅ alignment fix
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

  empty: {
    textAlign: "center",
    padding: "20px",
    color: "#777"
  }
};

export default ViewManagers;