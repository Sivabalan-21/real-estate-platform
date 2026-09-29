import { useState, useEffect } from "react";

// copy these two lines from how PMTicketDetail.js does it
const API = process.env.REACT_APP_API_URL || "http://localhost:8000";
const getToken = () => localStorage.getItem("token");

function VendorDashboard() {
  const username = localStorage.getItem("username") || "Vendor";
  const [jobs, setJobs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    fetch(`${API}/vendor/jobs`, {
      headers: { Authorization: `Bearer ${getToken()}` },
    })
      .then((res) => {
        if (!res.ok) throw new Error(`Error ${res.status}`);
        return res.json();
      })
      .then(setJobs)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div style={{ padding: 32 }}>
      <h2 style={{ margin: 0, color: "#0f172a" }}>Welcome, {username}</h2>
      <p style={{ color: "#64748b" }}>Your assigned jobs</p>

      {loading && <p>Loading...</p>}
      {error && <p style={{ color: "#dc2626" }}>{error}</p>}
      {!loading && !error && jobs.length === 0 && <p>No jobs assigned yet.</p>}

      {jobs.map((j) => (
        <div
          key={j.id}
          style={{
            border: "1px solid #e5e7eb",
            borderRadius: 8,
            padding: 12,
            marginBottom: 8,
            background: "#fff",
          }}
        >
          <b>{j.title}</b>
          <p style={{ margin: "4px 0" }}>{j.description}</p>
          <small>{j.status.replace("_", " ")}</small>
        </div>
      ))}
    </div>
  );
}

export default VendorDashboard; 