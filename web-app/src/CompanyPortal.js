import React, { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";

const PALETTE = [
  "#6366f1","#0ea5e9","#10b981","#f59e0b",
  "#ec4899","#8b5cf6","#14b8a6","#ef4444",
];

function colorForName(name = "") {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
  return PALETTE[Math.abs(hash) % PALETTE.length];
}

function initials(name = "") {
  return name.split(/\s+/).slice(0, 2).map(w => w[0]?.toUpperCase() ?? "").join("");
}

export default function CompanyPortal() {
  const { slug }  = useParams();
  const navigate  = useNavigate();

  const [portal,        setPortal]        = useState(null);
  const [portalErr,     setPortalErr]     = useState("");
  const [portalLoading, setPortalLoading] = useState(true);

  const [username,   setUsername]   = useState("");
  const [password,   setPassword]   = useState("");
  const [role,       setRole]       = useState("Company Admin");
  const [showPass,   setShowPass]   = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [loginErr,   setLoginErr]   = useState("");

  useEffect(() => {
    fetch(`http://194.164.149.22/api/portal/${slug}`)
      .then(r => { if (!r.ok) throw new Error(); return r.json(); })
      .then(d  => { setPortal(d); setPortalLoading(false); })
      .catch(() => { setPortalErr(true); setPortalLoading(false); });
  }, [slug]);

  const handleLogin = async e => {
    e.preventDefault();
    if (!username.trim() || !password) { setLoginErr("Please fill in all fields."); return; }
    setSubmitting(true);
    setLoginErr("");
    try {
      const res  = await fetch("http://194.164.149.22/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: username.trim(), password, role, slug }),
      });
      const data = await res.json();
      if (!res.ok) { setLoginErr(data.detail || "Invalid credentials"); return; }

      const payload = JSON.parse(atob(data.access_token.split(".")[1]));
      localStorage.clear();
      localStorage.setItem("token",        data.access_token);
      localStorage.setItem("role",         payload.role);
      localStorage.setItem("username",     payload.sub);
      localStorage.setItem("company_name", data.company_name || "");
      localStorage.setItem("company_code", data.company_code || "");
      localStorage.setItem("company_slug", data.company_slug || slug);
      localStorage.setItem("status",       data.status);

      const r = payload.role;
      if      (r === "Company Admin")    navigate("/admin/dashboard");
      else if (r === "Admin")            navigate("/admin/dashboard");
      else if (r === "Property Manager") navigate("/pm/dashboard");
      else if (r === "Tenant")           navigate("/tenant/dashboard");
      else if (r === "Owner")            navigate("/owner/dashboard");
      else if (r === "Vendor")           navigate("/vendor/dashboard");
      else                               navigate("/");
    } catch {
      setLoginErr("Server error. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  if (portalLoading) return (
    <div style={s.page}>
      <div style={s.loadCard}>
        <div style={s.spinner} />
        <p style={s.hint}>Loading workspace…</p>
      </div>
    </div>
  );

  if (portalErr) return (
    <div style={s.page}>
      <div style={s.loadCard}>
        <p style={s.notFoundTitle}>Portal not found</p>
        <p style={s.hint}>No company is registered at this URL.</p>
        <button style={s.linkBtn} onClick={() => navigate("/")}>Go to main login</button>
      </div>
    </div>
  );

  const accent = colorForName(portal.company_name);
  const ini    = initials(portal.company_name);

  return (
    <div style={s.page}>
      <div style={s.card}>

        {/* Left brand panel */}
        <div style={{ ...s.brand, background: accent }}>
          <div style={s.circle1} />
          <div style={s.circle2} />
          <div style={s.circle3} />

          <div style={s.brandTop}>
            <div style={s.propOSBadge}>
              <span style={s.propOSIcon}>🏢</span>
              <span style={s.propOSLabel}>PropOS</span>
            </div>

            <div style={s.companyLogoWrap}>
              {portal.logo
                ? <img src={portal.logo} alt="logo" style={s.companyLogoImg} />
                : <span style={s.companyLogoText}>{ini}</span>
              }
            </div>

            <h2 style={s.brandTitle}>Welcome to<br />{portal.company_name}</h2>
            <p style={s.brandSub}>Your property management workspace. Sign in to continue.</p>
          </div>
        </div>

        {/* Right form panel */}
        <div style={s.formPanel}>
          <div style={s.formInner}>
            <h3 style={s.formTitle}>Sign in</h3>
            <p style={s.formSub}>Enter your credentials to access your workspace.</p>

            <form onSubmit={handleLogin} style={s.form}>

              <div style={s.field}>
                <label style={s.label}>Username</label>
                <div style={s.inputWrap}>
                  <span style={s.inputIcon}>👤</span>
                  <input
                    style={s.input}
                    type="text"
                    placeholder="your_username"
                    value={username}
                    onChange={e => { setUsername(e.target.value); setLoginErr(""); }}
                    autoFocus
                  />
                </div>
              </div>

              <div style={s.field}>
                <label style={s.label}>Password</label>
                <div style={s.inputWrap}>
                  <span style={s.inputIcon}>🔒</span>
                  <input
                    style={{ ...s.input, paddingRight: 36 }}
                    type={showPass ? "text" : "password"}
                    placeholder="••••••••"
                    value={password}
                    onChange={e => { setPassword(e.target.value); setLoginErr(""); }}
                  />
                  <button type="button" style={s.eyeBtn} onClick={() => setShowPass(p => !p)} tabIndex={-1}>
                    {showPass ? "🙈" : "👁"}
                  </button>
                </div>
              </div>

              <div style={s.field}>
                <label style={s.label}>Role</label>
                <div style={s.inputWrap}>
                  <span style={s.inputIcon}>💼</span>
                  <select
                    style={{ ...s.input, paddingLeft: 34 }}
                    value={role}
                    onChange={e => setRole(e.target.value)}
                  >
                    <option value="Company Admin">Company Admin</option>
                    <option value="Admin">Admin</option>
                    <option value="Property Manager">Property Manager</option>
                    <option value="Tenant">Tenant</option>
                    <option value="Owner">Owner</option>
                    <option value="Vendor">Vendor</option>
                  </select>
                </div>
              </div>

              {loginErr && <div style={s.errorBox}>{loginErr}</div>}

              <button
                type="submit"
                style={{ ...s.submitBtn, background: accent, opacity: submitting ? 0.7 : 1 }}
                disabled={submitting}
              >
                {submitting ? "Signing in…" : "Sign in →"}
              </button>

            </form>

            <p style={s.footer}>
              Not your company?{" "}
              <span style={{ ...s.footerLink, color: accent }} onClick={() => navigate("/")}>
                Main login
              </span>
            </p>
          </div>
        </div>

      </div>
    </div>
  );
}

const s = {
  page: { height: "100vh", background: "#f1f5f9", display: "flex", fontFamily: "'DM Sans', system-ui, sans-serif" },
  card: { width: "100%", display: "flex", borderRadius: 0, overflow: "hidden" },
  brand: { width: "42%", padding: "2.5rem 2rem", display: "flex", flexDirection: "column", justifyContent: "space-between", position: "relative", overflow: "hidden" },
  circle1:        { position: "absolute", width: 220, height: 220, borderRadius: "50%", border: "1px solid rgba(255,255,255,0.12)", top: -70, right: -70 },
  circle2:        { position: "absolute", width: 150, height: 150, borderRadius: "50%", border: "1px solid rgba(255,255,255,0.08)", top: -20, right: -20 },
  circle3:        { position: "absolute", width: 190, height: 190, borderRadius: "50%", border: "1px solid rgba(255,255,255,0.08)", bottom: -60, left: -60 },
  brandTop:       { position: "relative", zIndex: 1 },
  propOSBadge:    { display: "flex", alignItems: "center", gap: 6, marginBottom: "2.5rem" },
  propOSIcon:     { fontSize: 16 },
  propOSLabel:    { color: "rgba(255,255,255,0.9)", fontSize: 13, fontWeight: 600 },
  companyLogoWrap:{ width: 56, height: 56, borderRadius: 12, background: "rgba(255,255,255,0.15)", border: "1px solid rgba(255,255,255,0.2)", display: "flex", alignItems: "center", justifyContent: "center", marginBottom: "1rem", overflow: "hidden" },
  companyLogoImg: { width: "100%", height: "100%", objectFit: "cover" },
  companyLogoText:{ color: "#fff", fontSize: 18, fontWeight: 700 },
  brandTitle:     { color: "#fff", fontSize: 22, fontWeight: 700, margin: "0 0 8px", lineHeight: 1.3 },
  brandSub:       { color: "rgba(255,255,255,0.65)", fontSize: 13, margin: 0, lineHeight: 1.6 },
  brandBottom:    { position: "relative", zIndex: 1, display: "flex", flexDirection: "column", gap: 10 },
  trustRow:       { display: "flex", alignItems: "center", gap: 8 },
  trustIcon:      { fontSize: 13 },
  trustText:      { color: "rgba(255,255,255,0.65)", fontSize: 12 },
  formPanel: { flex: 1, background: "#fff", display: "flex", alignItems: "center", justifyContent: "center", padding: "2.5rem 2rem" },
  formInner:      { width: "100%", maxWidth: 300 },
  formTitle:      { fontSize: 20, fontWeight: 700, color: "#0f172a", margin: "0 0 4px" },
  formSub:        { fontSize: 13, color: "#94a3b8", margin: "0 0 1.75rem" },
  form:           { display: "flex", flexDirection: "column", gap: 14 },
  field:          {},
  label:          { display: "block", fontSize: 11, fontWeight: 600, color: "#64748b", marginBottom: 5, textTransform: "uppercase", letterSpacing: 0.5 },
  inputWrap:      { display: "flex", alignItems: "center", gap: 8, border: "1px solid #e2e8f0", borderRadius: 10, padding: "0 12px", background: "#f8fafc", position: "relative" },
  inputIcon:      { fontSize: 13, flexShrink: 0 },
  input:          { flex: 1, border: "none", background: "transparent", outline: "none", padding: "10px 0", fontSize: 13, color: "#0f172a", width: "100%", appearance: "none" },
  eyeBtn:         { background: "none", border: "none", cursor: "pointer", fontSize: 13, padding: 0, lineHeight: 1, position: "absolute", right: 12 },
  errorBox:       { background: "#fef2f2", border: "1px solid #fecaca", color: "#dc2626", borderRadius: 8, padding: "10px 14px", fontSize: 13 },
  submitBtn:      { width: "100%", color: "#fff", border: "none", padding: 12, borderRadius: 10, cursor: "pointer", fontWeight: 700, fontSize: 14, marginTop: 4, transition: "opacity .15s", letterSpacing: 0.2 },
  footer:         { marginTop: "1.25rem", textAlign: "center", fontSize: 12, color: "#94a3b8" },
  footerLink:     { cursor: "pointer", fontWeight: 600 },
  loadCard:       { background: "#fff", borderRadius: 16, border: "1px solid #e2e8f0", padding: "3rem 2.5rem", textAlign: "center", boxShadow: "0 2px 16px rgba(0,0,0,.06)" },
  spinner:        { width: 32, height: 32, border: "3px solid #e2e8f0", borderTopColor: "#6366f1", borderRadius: "50%", animation: "spin 0.8s linear infinite", margin: "0 auto 12px" },
  hint:           { color: "#94a3b8", fontSize: 13, margin: 0 },
  notFoundTitle:  { fontSize: 16, fontWeight: 700, color: "#0f172a", margin: "0 0 6px" },
  linkBtn:        { marginTop: 14, background: "none", border: "1px solid #e2e8f0", color: "#64748b", padding: "8px 18px", borderRadius: 8, cursor: "pointer", fontSize: 13 },
};