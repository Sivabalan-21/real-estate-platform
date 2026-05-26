import React, { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";

function ResetPassword() {
  const { token } = useParams();
  const navigate = useNavigate();

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [companySlug, setCompanySlug] = useState("");

  // 🔥 OPTIONAL: fetch username (if backend supports)
  useEffect(() => {
    fetch(`http://localhost:8000/auth/validate-token/${token}`)
      .then(res => res.json())
      .then(data => {
        if (data.username) {
          setUsername(data.username);
          setCompanySlug(data.company_slug || "");
        }
      })
      .catch(() => {});
  }, [token]);

  const handleSubmit = async () => {
    if (!password) {
      setMessage("Enter password");
      return;
    }

    setLoading(true);

    try {
      const res = await fetch("http://localhost:8000/auth/reset-password", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          token: token,
          new_password: password
        })
      });
      if (res.ok) {
        setMessage("Password updated successfully");

        setTimeout(() => {
          if (companySlug) {
            navigate(`/portal/${companySlug}`);  // ← change this
        } else {
            navigate("/");
        }
    }, 1500);}


    } catch {
      setMessage("Server error");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={styles.page}>
      <div style={styles.card}>
        <h2>Set Your Password</h2>

        {/* 🔥 Username display */}
        <div style={styles.field}>
          <label>Username</label>
          <input
            value={username || "Loading..."}
            disabled
            style={styles.input}
          />
        </div>

        {/* 🔥 Password input */}
        <div style={styles.field}>
          <label>New Password</label>
          <input
            type="password"
            placeholder="Enter new password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            style={styles.input}
          />
        </div>

        <button
          style={styles.button}
          onClick={handleSubmit}
          disabled={loading}
        >
          {loading ? "Updating..." : "Update Password"}
        </button>

        {message && <p style={styles.message}>{message}</p>}
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
    background: "#f5f7fa"
  },
  card: {
    width: "350px",
    padding: "30px",
    background: "#fff",
    borderRadius: "10px",
    boxShadow: "0 5px 20px rgba(0,0,0,0.1)"
  },
  field: {
    marginBottom: "15px"
  },
  input: {
    width: "100%",
    padding: "10px",
    borderRadius: "6px",
    border: "1px solid #ccc"
  },
  button: {
    width: "100%",
    padding: "12px",
    background: "#2563eb",
    color: "#fff",
    border: "none",
    borderRadius: "6px"
  },
  message: {
    marginTop: "10px",
    textAlign: "center"
  }
};

export default ResetPassword;