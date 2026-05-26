import React, { useState } from "react";

function CreateManager() {
  const [form, setForm] = useState({
    username: "",
    email: "",
    assigned_units: ""
  });

  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false); // 🔥 NEW

  const token = localStorage.getItem("token");

  const createManager = async () => {
    // 🔴 prevent multiple clicks
    if (loading) return;

    setMessage("");
    setError("");

    // 1. Validation
    if (!form.username || !form.email || !form.assigned_units) {
      setError("All fields are required");
      return;
    }

    if (parseInt(form.assigned_units) > 100) {
      setError("Cannot assign more than 100 units");
      return;
    }

    setLoading(true); // 🔥 START LOADING

    try {
      const normalizedEmail = form.email.toLowerCase().trim();

      const res = await fetch("http://localhost:8000/users/create", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          username: form.username,
          email: normalizedEmail,
          role: "Property Manager",
          units: parseInt(form.assigned_units) // ✅ ADD THIS

        })
      });

      const data = await res.json();

      if (!res.ok) {
        if (Array.isArray(data.detail)) {
          setError(data.detail[0].msg);
        } else {
          setError(data.detail || "Something went wrong");
        }
        return;
      }

      // ✅ SUCCESS
      setMessage("Manager created successfully");

      // 🔥 RESET FORM
      setForm({
        username: "",
        email: "",
        assigned_units: ""
      });

    } catch (err) {
      setError("Network error");
    } finally {
      setLoading(false); // 🔥 STOP LOADING
    }
  };

  return (
    <div style={styles.page}>
      <div style={styles.card}>
        <h2 style={styles.title}>Create Property Manager</h2>

        <div style={styles.inputGroup}>
          <label style={styles.label}>Username</label>
          <input
            style={styles.input}
            value={form.username}
            onChange={e => setForm({ ...form, username: e.target.value })}
          />
        </div>

        <div style={styles.inputGroup}>
          <label style={styles.label}>Email</label>
          <input
            style={styles.input}
            value={form.email}
            onChange={e => setForm({ ...form, email: e.target.value })}
          />
        </div>

        <div style={styles.inputGroup}>
          <label style={styles.label}>Units</label>
          <input
            style={styles.input}
            type="number"
            value={form.assigned_units}
            onChange={e =>
              setForm({ ...form, assigned_units: e.target.value })
            }
          />
        </div>

        {/* 🔥 BUTTON UPDATED */}
        <button
          style={{
            ...styles.button,
            opacity: loading ? 0.6 : 1,
            cursor: loading ? "not-allowed" : "pointer"
          }}
          onClick={createManager}
          disabled={loading}
        >
          {loading ? "Creating..." : "Create Manager"}
        </button>

        {error && <p style={styles.error}>{error}</p>}
        {message && <p style={styles.success}>{message}</p>}
      </div>
    </div>
  );
}

const styles = {
  page: {
    height: "100vh",
    display: "flex",
    justifyContent: "center",
    alignItems: "center",
    background: "#f4f6f9"
  },
  card: {
    width: "400px",
    padding: "30px",
    borderRadius: "12px",
    background: "#ffffff",
    boxShadow: "0 8px 25px rgba(0,0,0,0.1)",
    display: "flex",
    flexDirection: "column",
    gap: "18px"
  },
  title: {
    textAlign: "center",
    marginBottom: "10px"
  },
  inputGroup: {
    display: "flex",
    flexDirection: "column"
  },
  label: {
    marginBottom: "5px",
    fontSize: "14px",
    color: "#333"
  },
  input: {
    padding: "10px",
    borderRadius: "6px",
    border: "1px solid #ccc",
    fontSize: "14px"
  },
  button: {
    marginTop: "10px",
    padding: "12px",
    borderRadius: "6px",
    border: "none",
    background: "#2563eb",
    color: "#fff",
    fontWeight: "bold",
    transition: "0.2s"
  },
  error: {
    color: "red",
    textAlign: "center"
  },
  success: {
    color: "green",
    textAlign: "center"
  }
};

export default CreateManager;