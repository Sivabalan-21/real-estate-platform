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
    fetch(`http://localhost:8000/portal/${slug}`)
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
      const res  = await fetch("http://localhost:8000/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: username.trim(), password, role , slug }),
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
      localStorage.setItem("status", data.status);
      
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

  // ── Loading ───────────────────────────────────────────────────────────────
  if (portalLoading) return (
    <div style={s.page}>
      <div style={s.card}>
        <div style={s.center}>
          <div style={s.spinner} />
          <p style={s.hint}>Loading…</p>
        </div>
      </div>
    </div>
  );

  // ── 404 ───────────────────────────────────────────────────────────────────
  if (portalErr) return (
    <div style={s.page}>
      <div style={s.card}>
        <div style={s.center}>
          <p style={s.notFoundTitle}>Portal not found</p>
          <p style={s.hint}>No company is registered at this URL.</p>
          <button style={s.linkBtn} onClick={() => navigate("/")}>Go to main login</button>
        </div>
      </div>
    </div>
  );

  const accent = colorForName(portal.company_name);
  const ini    = initials(portal.company_name);

  // ── Main ──────────────────────────────────────────────────────────────────
  return (
    <div style={s.page}>
      <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&display=swap" rel="stylesheet" />

      <div style={s.card}>

        {/* Logo + company name */}
        <div style={s.top}>
          <div style={{ ...s.logo, background: accent + "18", color: accent }}>
            {
  portal.logo ? (
    <img
      src={portal.logo}
      alt="logo"
      style={{
        width: "100%",
        height: "100%",
        objectFit: "cover",
        borderRadius: 16
      }}
    />
  ) : (
    ini
  )
}
          </div>
          <p style={s.companyName}>{portal.company_name}</p>
          <p style={s.welcomeText}>Sign in to your workspace</p>
        </div>

        <div style={s.divider} />

        {/* Form */}
        <form onSubmit={handleLogin} style={s.form}>

          <div style={s.field}>
            <label style={s.label}>Username</label>
            <input
              style={s.input}
              type="text"
              placeholder="your_username"
              value={username}
              onChange={e => { setUsername(e.target.value); setLoginErr(""); }}
              autoFocus
            />
          </div>

          <div style={s.field}>
            <label style={s.label}>Password</label>
            <div style={s.passWrap}>
              <input
                style={{ ...s.input, paddingRight: 40 }}
                type={showPass ? "text" : "password"}
                placeholder="••••••••"
                value={password}
                onChange={e => { setPassword(e.target.value); setLoginErr(""); }}
              />
              <button
                type="button"
                style={s.eyeBtn}
                onClick={() => setShowPass(p => !p)}
                tabIndex={-1}
              >
                {showPass ? "🙈" : "👁"}
              </button>
            </div>
          </div>

          <div style={s.field}>
            <label style={s.label}>Role</label>
            <select
              style={s.input}
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

          {loginErr && (
            <div style={s.errorBox}>{loginErr}</div>
          )}

          <button
            type="submit"
            style={{
              ...s.submitBtn,
              background: accent,
              opacity: submitting ? 0.7 : 1,
            }}
            disabled={submitting}
          >
            {submitting ? "Signing in…" : "Sign in"}
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
  );
}

const s = {
  page:         { minHeight: "100vh", background: "#f8fafc", display: "flex", alignItems: "center", justifyContent: "center", padding: 24, fontFamily: "'DM Sans', sans-serif" },
  card:         { width: "100%", maxWidth: 400, background: "#fff", borderRadius: 20, border: "1px solid #e2e8f0", padding: "40px 36px", boxShadow: "0 2px 16px rgba(0,0,0,.06)" },
  top:          { textAlign: "center", marginBottom: 24 },
  logo:         { width: 64, height: 64, borderRadius: 16, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 22, fontWeight: 700, margin: "0 auto 14px" },
  companyName:  { margin: "0 0 6px", fontSize: 18, fontWeight: 700, color: "#0f172a" },
  welcomeText:  { margin: 0, fontSize: 13, color: "#94a3b8" },
  divider:      { borderTop: "1px solid #f1f5f9", margin: "20px 0" },
  form:         { display: "flex", flexDirection: "column", gap: 14 },
  field:        {},
  label:        { display: "block", fontSize: 12, fontWeight: 600, color: "#64748b", marginBottom: 6, textTransform: "uppercase", letterSpacing: 0.4 },
  input:        { width: "100%", padding: "11px 14px", border: "1px solid #e2e8f0", borderRadius: 10, fontSize: 14, outline: "none", boxSizing: "border-box", color: "#0f172a", background: "#fff", appearance: "none" },
  passWrap:     { position: "relative" },
  eyeBtn:       { position: "absolute", right: 12, top: "50%", transform: "translateY(-50%)", background: "none", border: "none", cursor: "pointer", fontSize: 15, padding: 0, lineHeight: 1 },
  errorBox:     { background: "#fef2f2", border: "1px solid #fecaca", color: "#dc2626", borderRadius: 8, padding: "10px 14px", fontSize: 13 },
  submitBtn:    { width: "100%", color: "#fff", border: "none", padding: 13, borderRadius: 10, cursor: "pointer", fontWeight: 700, fontSize: 15, marginTop: 4, transition: "opacity .15s" },
  footer:       { marginTop: 20, textAlign: "center", fontSize: 13, color: "#94a3b8" },
  footerLink:   { cursor: "pointer", fontWeight: 600 },
  center:       { textAlign: "center", padding: "24px 0" },
  spinner:      { width: 32, height: 32, border: "3px solid #e2e8f0", borderTopColor: "#6366f1", borderRadius: "50%", animation: "spin 0.8s linear infinite", margin: "0 auto 12px" },
  hint:         { color: "#94a3b8", fontSize: 13, margin: 0 },
  notFoundTitle:{ fontSize: 16, fontWeight: 700, color: "#0f172a", margin: "0 0 6px" },
  linkBtn:      { marginTop: 14, background: "none", border: "1px solid #e2e8f0", color: "#64748b", padding: "8px 18px", borderRadius: 8, cursor: "pointer", fontSize: 13 },
};