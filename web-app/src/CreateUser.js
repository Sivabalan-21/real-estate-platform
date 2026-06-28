import React, { useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";

function CreateUser() {
  const location = useLocation();
  const navigate = useNavigate();

  const query = new URLSearchParams(location.search);
  const forcedRole = query.get("role");   // 🔥 Admin comes from URL

  const currentRole = localStorage.getItem("role");
  const token = localStorage.getItem("token");

  const allowedRoles = {
    "Super Admin": ["Company Admin", "Admin", "Property Manager", "Tenant", "Owner", "Vendor"],
    "Company Admin": ["Admin"],
    "Admin": ["Property Manager", "Tenant", "Owner", "Vendor"],
    "Property Manager": ["Tenant", "Vendor", "Owner"]
  };

  // ✅ NEW: dynamic roles
  const roleOptions = allowedRoles[currentRole] || [];

  const [form, setForm] = useState({
    username: "",
    email: "",
    role: forcedRole || "",
    company_name: ""
  });

  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const createUser = async () => {
    setMessage("");
    setError("");

    if (!form.username || !form.email || !form.role) {
      setError("All fields are required");
      return;
    }

    if (currentRole === "Super Admin" && !form.company_name.trim()) {
      setError("Company name is required");
      return;
    }

    // 🔐 Frontend RBAC check
    if (!allowedRoles[currentRole]?.includes(form.role)) {
      setError("You are not allowed to create this role");
      return;
    }

    setLoading(true);

    try {
      const res = await fetch("http://187.127.180.107/users/create", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify(form)
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.detail || "Error creating user");
        return;
      }

      setMessage(`${form.role} created successfully`);

      setForm({
        username: "",
        email: "",
        role: forcedRole || "",
        company_name: ""
      });

      // 🔥 Smart redirect based on role
      setTimeout(() => {
        if (currentRole === "Property Manager") {
          navigate("/pm/users/view");
        } else if (currentRole === "Admin") {
          navigate("/admin/view");
        } else {
          navigate("/users/manage");
        }
      }, 1200);

    } catch {
      setError("Server error");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={styles.page}>
      <div style={styles.card}>
        <h2>Create User</h2>

        <input
          style={styles.input}
          placeholder="Username"
          value={form.username}
          onChange={(e) =>
            setForm({ ...form, username: e.target.value })
          }
        />

        <input
          style={styles.input}
          placeholder="Email"
          value={form.email}
          onChange={(e) =>
            setForm({ ...form, email: e.target.value })
          }
        />

        {/* ✅ UPDATED ROLE UI */}
        {forcedRole ? (
          <div style={styles.roleBox}>
            Role: <b>{form.role}</b>
          </div>
        ) : (
          <select
            style={styles.input}
            value={form.role}
            onChange={(e) =>
              setForm({ ...form, role: e.target.value })
            }
          >
            <option value="">Select Role</option>
            {roleOptions.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </select>
        )}

        {currentRole === "Super Admin" && (
          <input
            style={styles.input}
            placeholder="Company Name"
            value={form.company_name}
            onChange={(e) =>
              setForm({ ...form, company_name: e.target.value })
            }
          />
        )}

        <button
          style={styles.button}
          onClick={createUser}
          disabled={loading}
        >
          {loading ? "Creating..." : "Create User"}
        </button>

        {error && <p style={styles.error}>{error}</p>}
        {message && <p style={styles.success}>{message}</p>}
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
  card: {
    maxWidth: "400px",
    margin: "auto",
    background: "#fff",
    padding: "25px",
    borderRadius: "10px",
    boxShadow: "0 4px 10px rgba(0,0,0,0.05)"
  },
  input: {
    width: "100%",
    padding: "10px",
    marginBottom: "10px",
    border: "1px solid #ccc",
    borderRadius: "6px"
  },
  roleBox: {
    background: "#e0f2fe",
    padding: "10px",
    borderRadius: "6px",
    marginBottom: "10px"
  },
  button: {
    width: "100%",
    padding: "12px",
    background: "#2563eb",
    color: "#fff",
    border: "none",
    borderRadius: "6px"
  },
  error: {
    color: "red",
    marginTop: "10px"
  },
  success: {
    color: "green",
    marginTop: "10px"
  }
};

export default CreateUser;