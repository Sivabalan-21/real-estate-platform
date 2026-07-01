import React, { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";

function ResetPassword() {
  const { token } = useParams();
  const navigate = useNavigate();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [message, setMessage] = useState({ text: "", type: "" });
  const [loading, setLoading] = useState(false);
  const [companySlug, setCompanySlug] = useState("");
  const [showPass, setShowPass] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  useEffect(() => {
    fetch(`http://194.164.149.22/api/auth/validate-token/${token}`)
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
    if (!password) { setMessage({ text: "Please enter a password", type: "error" }); return; }
    if (password.length < 8) { setMessage({ text: "Password must be at least 8 characters", type: "error" }); return; }
    if (password !== confirmPassword) { setMessage({ text: "Passwords do not match", type: "error" }); return; }

    setLoading(true);
    try {
      const res = await fetch("http://194.164.149.22/api/auth/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, new_password: password })
      });
      if (res.ok) {
        setMessage({ text: "Password updated successfully! Redirecting…", type: "success" });
        setTimeout(() => {
          navigate(companySlug ? `/portal/${companySlug}` : "/");
        }, 2000);
      } else {
        const data = await res.json();
        setMessage({ text: data.detail || "Failed to update password", type: "error" });
      }
    } catch {
      setMessage({ text: "Server error. Please try again.", type: "error" });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={s.page}>
      <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&display=swap" rel="stylesheet" />

      {/* Left Panel */}
      <div style={s.leftPanel}>
        <div style={s.circles}>
          <div style={s.circle1} /><div style={s.circle2} /><div style={s.circle3} />
        </div>
        <div style={s.leftContent}>
          <div style={s.badge}>
            <span>🏢</span>
            <span style={s.badgeText}>PropOS</span>
          </div>
          <div style={s.leftBottom}>
            <h1 style={s.leftTitle}>Secure your<br />account</h1>
            <p style={s.leftSub}>Set a strong password to protect your workspace and keep your data safe.</p>
          </div>
        </div>
      </div>

      {/* Right Panel */}
      <div style={s.rightPanel}>
        <div style={s.formWrap}>
          <div style={s.iconWrap}>🔐</div>
          <h2 style={s.title}>Set New Password</h2>
          <p style={s.sub}>Create a strong password for your account</p>

          {/* Username */}
          <div style={s.field}>
            <label style={s.label}>Username</label>
            <div style={s.inputWrap}>
              <span style={s.inputIcon}>👤</span>
              <input value={username || "Loading…"} disabled style={{ ...s.input, background: "#f8fafc", color: "#94a3b8" }} />
            </div>
          </div>

          {/* New Password */}
          <div style={s.field}>
            <label style={s.label}>New Password</label>
            <div style={s.inputWrap}>
              <span style={s.inputIcon}>🔒</span>
              <input
                type={showPass ? "text" : "password"}
                placeholder="Min. 8 characters"
                value={password}
                onChange={e => { setPassword(e.target.value); setMessage({ text: "", type: "" }); }}
                style={{ ...s.input, paddingRight: 40 }}
              />
              <button type="button" style={s.eyeBtn} onClick={() => setShowPass(p => !p)}>
                {showPass ? "🙈" : "👁"}
              </button>
            </div>
          </div>

          {/* Confirm Password */}
          <div style={s.field}>
            <label style={s.label}>Confirm Password</label>
            <div style={s.inputWrap}>
              <span style={s.inputIcon}>🔒</span>
              <input
                type={showConfirm ? "text" : "password"}
                placeholder="Re-enter your password"
                value={confirmPassword}
                onChange={e => { setConfirmPassword(e.target.value); setMessage({ text: "", type: "" }); }}
                style={{ ...s.input, paddingRight: 40 }}
                onKeyDown={e => e.key === "Enter" && handleSubmit()}
              />
              <button type="button" style={s.eyeBtn} onClick={() => setShowConfirm(p => !p)}>
                {showConfirm ? "🙈" : "👁"}
              </button>
            </div>
          </div>

          {/* Password strength hint */}
          {password && (
            <div style={s.strengthWrap}>
              <div style={{ ...s.strengthBar, background: password.length >= 12 ? "#10b981" : password.length >= 8 ? "#f59e0b" : "#ef4444", width: password.length >= 12 ? "100%" : password.length >= 8 ? "60%" : "30%" }} />
              <span style={s.strengthText}>{password.length >= 12 ? "Strong" : password.length >= 8 ? "Medium" : "Weak"}</span>
            </div>
          )}

          {/* Message */}
          {message.text && (
            <div style={{ ...s.message, background: message.type === "success" ? "#d1fae5" : "#fee2e2", color: message.type === "success" ? "#065f46" : "#991b1b" }}>
              {message.type === "success" ? "✅" : "⚠️"} {message.text}
            </div>
          )}

          <button style={{ ...s.btn, opacity: loading ? 0.7 : 1 }} onClick={handleSubmit} disabled={loading}>
            {loading ? "Updating…" : "Update Password →"}
          </button>
        </div>
      </div>
    </div>
  );
}

const s = {
  page:        { display: "flex", height: "100vh", fontFamily: "'DM Sans', system-ui, sans-serif" },
  leftPanel:   { width: "42%", background: "#0f9688", position: "relative", overflow: "hidden", display: "flex", flexDirection: "column", padding: "2.5rem 2rem" },
  circles:     { position: "absolute", inset: 0, pointerEvents: "none" },
  circle1:     { position: "absolute", width: 300, height: 300, borderRadius: "50%", background: "rgba(255,255,255,0.06)", top: -80, right: -80 },
  circle2:     { position: "absolute", width: 200, height: 200, borderRadius: "50%", background: "rgba(255,255,255,0.06)", bottom: 60, left: -60 },
  circle3:     { position: "absolute", width: 120, height: 120, borderRadius: "50%", background: "rgba(255,255,255,0.08)", top: "45%", right: 40 },
  leftContent: { position: "relative", zIndex: 1, display: "flex", flexDirection: "column", height: "100%", justifyContent: "space-between" },
  badge:       { display: "inline-flex", alignItems: "center", gap: 8, background: "rgba(255,255,255,0.15)", borderRadius: 10, padding: "6px 14px", width: "fit-content" },
  badgeText:   { color: "#fff", fontWeight: 700, fontSize: 15 },
  leftBottom:  { marginTop: "auto" },
  leftTitle:   { color: "#fff", fontSize: 36, fontWeight: 800, margin: "0 0 12px", lineHeight: 1.2 },
  leftSub:     { color: "rgba(255,255,255,0.75)", fontSize: 14, lineHeight: 1.6, margin: 0 },
  rightPanel:  { flex: 1, background: "#fff", display: "flex", alignItems: "center", justifyContent: "center", padding: "2rem" },
  formWrap:    { width: "100%", maxWidth: 400 },
  iconWrap:    { fontSize: 36, marginBottom: 16 },
  title:       { margin: "0 0 6px", fontSize: 26, fontWeight: 800, color: "#0f172a" },
  sub:         { margin: "0 0 28px", fontSize: 13, color: "#64748b" },
  field:       { marginBottom: 18 },
  label:       { display: "block", fontSize: 12, fontWeight: 600, color: "#475569", marginBottom: 6, textTransform: "uppercase", letterSpacing: 0.5 },
  inputWrap:   { position: "relative" },
  inputIcon:   { position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", fontSize: 14 },
  input:       { width: "100%", padding: "11px 12px 11px 36px", border: "1px solid #e2e8f0", borderRadius: 8, fontSize: 13, outline: "none", boxSizing: "border-box" },
  eyeBtn:      { position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)", background: "none", border: "none", cursor: "pointer", fontSize: 14 },
  strengthWrap:{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16, marginTop: -10 },
  strengthBar: { height: 4, borderRadius: 4, transition: "all 0.3s" },
  strengthText:{ fontSize: 11, color: "#64748b", fontWeight: 600 },
  message:     { padding: "10px 14px", borderRadius: 8, fontSize: 13, marginBottom: 16, fontWeight: 500 },
  btn:         { width: "100%", padding: "13px", background: "#0f9688", color: "#fff", border: "none", borderRadius: 8, fontSize: 14, fontWeight: 700, cursor: "pointer" },
};

export default ResetPassword;