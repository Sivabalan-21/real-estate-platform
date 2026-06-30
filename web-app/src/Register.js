import React, { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";

const FIELDS = [
  { key: "username",    label: "Username",         type: "text",     placeholder: "Choose a username",   required: true  },
  { key: "full_name",   label: "Full Name",         type: "text",     placeholder: "Your full name",      required: true  },
  { key: "phone",       label: "Phone Number",      type: "tel",      placeholder: "+1 (555) 000-0000",   required: false },
  { key: "password",    label: "Password",          type: "password", placeholder: "Min 8 characters",    required: true  },
  { key: "confirm_pwd", label: "Confirm Password",  type: "password", placeholder: "Repeat your password",required: true  },
];

const ROLE_META = {
  "Company Admin":    { color: "#7c3aed", bg: "#f3e8ff", icon: "◆"  },
  "Admin":            { color: "#6366f1", bg: "#ede9fe", icon: "🛡️" },
  "Property Manager": { color: "#0ea5e9", bg: "#e0f2fe", icon: "🏢" },
  "Tenant":           { color: "#10b981", bg: "#d1fae5", icon: "🏠" },
  "Vendor":           { color: "#f59e0b", bg: "#fef3c7", icon: "🔧" },
  "Owner":            { color: "#ec4899", bg: "#fce7f3", icon: "👑" },
};

function PasswordStrength({ pwd }) {
  const checks = [
    { label: "8+ characters",     pass: pwd.length >= 8            },
    { label: "Uppercase letter",  pass: /[A-Z]/.test(pwd)          },
    { label: "Number",            pass: /\d/.test(pwd)             },
    { label: "Special character", pass: /[^A-Za-z0-9]/.test(pwd)  },
  ];
  const score  = checks.filter(c => c.pass).length;
  const colors = ["#ef4444", "#f97316", "#eab308", "#10b981"];
  const labels = ["Weak", "Fair", "Good", "Strong"];
  if (!pwd) return null;
  return (
    <div style={ps.wrap}>
      <div style={ps.bar}>
        {[0,1,2,3].map(i => (
          <div key={i} style={{ ...ps.seg, background: i < score ? colors[score-1] : "#e2e8f0" }} />
        ))}
      </div>
      <span style={{ ...ps.label, color: colors[score-1] || "#64748b" }}>
        {score > 0 ? labels[score-1] : ""}
      </span>
      <div style={ps.checks}>
        {checks.map(c => (
          <span key={c.label} style={{ ...ps.check, color: c.pass ? "#10b981" : "#cbd5e1" }}>
            {c.pass ? "✓" : "○"} {c.label}
          </span>
        ))}
      </div>
    </div>
  );
}

function LogoPreview({ file }) {
  const [preview, setPreview] = useState(null);

  useEffect(() => {
    if (!file) { setPreview(null); return; }
    const url = URL.createObjectURL(file);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  if (!preview) return null;

  return (
    <div style={s.logoPreviewWrap}>
      <img src={preview} alt="Logo preview" style={s.logoPreview} />
      <span style={s.logoPreviewLabel}>Preview</span>
    </div>
  );
}

function Register() {
  const { token }  = useParams();
  const navigate   = useNavigate();

  const [invite,      setInvite]      = useState(null);
  const [linkError,   setLinkError]   = useState("");
  const [loading,     setLoading]     = useState(true);
  const [form,        setForm]        = useState({ username: "", full_name: "", phone: "", password: "", confirm_pwd: "" });
  const [errors,      setErrors]      = useState({});
  const [submitting,  setSubmitting]  = useState(false);
  const [done,        setDone]        = useState(false);
  const [companyName, setCompanyName] = useState("");
  const [portalSlug,  setPortalSlug]  = useState("");
  const [logo,        setLogo]        = useState(null);
  const [uploadStatus, setUploadStatus] = useState(""); // "uploading" | "done" | "failed" | ""

  useEffect(() => {
    fetch(`http://187.127.180.107/register/${token}`)
      .then(r => { if (!r.ok) throw new Error("Invalid or expired invite link"); return r.json(); })
      .then(data => setInvite(data))
      .catch(e  => setLinkError(e.message))
      .finally(() => setLoading(false));
  }, [token]);

  const set = (key, val) => {
    setForm(f  => ({ ...f,  [key]: val }));
    setErrors(e => ({ ...e, [key]: ""  }));
  };

  const validate = () => {
    const errs = {};
    FIELDS.forEach(f => {
      if (f.required && !form[f.key]?.trim()) errs[f.key] = `${f.label} is required`;
    });
    if (invite?.role === "Company Admin" && !companyName.trim()) errs.companyName = "Company name is required";
    if (form.password && form.password.length < 8) errs.password = "Password must be at least 8 characters";
    if (form.password && form.confirm_pwd && form.password !== form.confirm_pwd) errs.confirm_pwd = "Passwords do not match";
    return errs;
  };

  // After registration, auto-login to get a token, then upload the logo
  const uploadLogoAfterRegistration = async (username, password, slug) => {
    if (!logo) return;

    try {
      setUploadStatus("uploading");

      // Step 1: auto-login to get a JWT token
      const loginRes = await fetch("http://187.127.180.107/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password, role: "Company Admin", slug }),
      });

      if (!loginRes.ok) {
        console.error("Auto-login failed; skipping logo upload");
        setUploadStatus("failed");
        return;
      }

      const loginData = await loginRes.json();
      const authToken = loginData.access_token;

      // Step 2: upload the logo
      const formData = new FormData();
      formData.append("file", logo);

      const uploadRes = await fetch("http://187.127.180.107/company/upload-logo", {
        method: "POST",
        headers: { Authorization: `Bearer ${authToken}` },
        body: formData,
      });

      if (uploadRes.ok) {
        setUploadStatus("done");
      } else {
        setUploadStatus("failed");
      }
    } catch (err) {
      console.error("Logo upload error:", err);
      setUploadStatus("failed");
    }
  };

  const handleSubmit = async () => {
    const errs = validate();
    if (Object.keys(errs).length) { setErrors(errs); return; }

    setSubmitting(true);
    try {
      const res = await fetch(`http://187.127.180.107/complete-registration/${token}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          username:     form.username,
          full_name:    form.full_name,
          phone:        form.phone,
          password:     form.password,
          company_name: invite?.role === "Company Admin" ? companyName : undefined,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setErrors({ username: data.detail || "Registration failed" });
        return;
      }

      const slug = data.company_slug || "";
      setPortalSlug(slug);

      // If Company Admin and a logo was chosen, upload it now
      if (invite?.role === "Company Admin" && logo) {
        await uploadLogoAfterRegistration(form.username, form.password, slug);
      }

      setDone(true);

      setTimeout(() => {
        if (slug) {
          navigate(`/portal/${slug}`);
        } else {
          navigate("/");
        }
      }, 3000);

    } catch {
      setErrors({ username: "Server error. Please try again." });
    } finally {
      setSubmitting(false);
    }
  };

  // ── LOADING ───────────────────────────────────────────────────────────────
  if (loading) return (
    <div style={s.shell}>
      <div style={s.card}>
        <div style={s.loaderWrap}>
          <div style={s.spinner} />
          <p style={s.loaderText}>Validating invite link…</p>
        </div>
      </div>
    </div>
  );

  // ── INVALID LINK ──────────────────────────────────────────────────────────
  if (linkError) return (
    <div style={s.shell}>
      <div style={s.card}>
        <div style={s.errorState}>
          <span style={s.errorIcon}>⚠</span>
          <h3 style={s.errorTitle}>Invalid Invite Link</h3>
          <p style={s.errorDesc}>{linkError}</p>
          <button style={s.loginBtn} onClick={() => navigate("/")}>Go to Login</button>
        </div>
      </div>
    </div>
  );

  // ── SUCCESS ───────────────────────────────────────────────────────────────
  if (done) return (
    <div style={s.shell}>
      <div style={s.card}>
        <div style={s.successState}>
          <span style={s.successIcon}>✓</span>
          <h3 style={s.successTitle}>Registration Complete!</h3>
          <p style={s.successDesc}>
            Your account is ready.{" "}
            {portalSlug
              ? <>Redirecting to your company portal in a moment…</>
              : <>Redirecting to login in a moment…</>
            }
          </p>

          {/* Logo upload status */}
          {logo && (
            <div style={s.uploadStatusBox}>
              {uploadStatus === "uploading" && <p style={s.uploadMsg}>⏳ Uploading your logo…</p>}
              {uploadStatus === "done"      && <p style={{ ...s.uploadMsg, color: "#10b981" }}>✓ Logo uploaded successfully</p>}
              {uploadStatus === "failed"    && (
                <p style={{ ...s.uploadMsg, color: "#f59e0b" }}>
                  ⚠ Logo upload failed — you can re-upload it from Company Settings after logging in.
                </p>
              )}
            </div>
          )}

          {portalSlug && (
            <div style={s.portalHint}>
              <p style={s.portalLabel}>Your company portal URL</p>
              <code style={s.portalUrl}>
                194.164.149.22/portal/{portalSlug}
              </code>
              <p style={s.portalNote}>
                Share this link with your team so they can log in directly.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );

  const roleMeta = ROLE_META[invite?.role] || { color: "#64748b", bg: "#f1f5f9", icon: "•" };

  // ── FORM ──────────────────────────────────────────────────────────────────
  return (
    <div style={s.shell}>
      <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&display=swap" rel="stylesheet" />
      <div style={s.card}>
        <div style={s.brand}>
          <span style={s.brandIcon}>⬡</span>
          <span style={s.brandName}>PropOS</span>
        </div>

        <h2 style={s.title}>Complete Your Registration</h2>
        <p style={s.sub}>You've been invited to join the platform. Fill in your details below.</p>

        <div style={s.inviteInfo}>
          <div style={s.infoRow}>
            <span style={s.infoLabel}>Email</span>
            <span style={s.infoVal}>{invite?.email}</span>
          </div>
          <div style={s.infoRow}>
            <span style={s.infoLabel}>Assigned Role</span>
            <span style={{ ...s.roleBadge, background: roleMeta.bg, color: roleMeta.color }}>
              {roleMeta.icon} {invite?.role}
            </span>
          </div>
          {invite?.company_name && (
            <div style={{ ...s.infoRow, marginBottom: 0 }}>
              <span style={s.infoLabel}>Company</span>
              <span style={s.infoVal}>{invite.company_name}</span>
            </div>
          )}
        </div>

        <div style={s.fieldsGrid}>

          {/* Company Admin-only fields */}
          {invite?.role === "Company Admin" && (
            <div style={s.fieldFull}>
              {/* Company Name */}
              <label style={s.label}>Company Name <span style={s.req}>*</span></label>
              <input
                style={{ ...s.input, ...(errors.companyName ? s.inputErr : {}) }}
                type="text"
                placeholder="Enter your company name"
                value={companyName}
                onChange={e => { setCompanyName(e.target.value); setErrors(p => ({ ...p, companyName: "" })); }}
              />
              {errors.companyName && <p style={s.errMsg}>{errors.companyName}</p>}
              <p style={s.fieldHint}>
                This becomes your portal URL: <code>194.164.149.22/portal/your-company-name</code>
              </p>

              {/* Company Logo */}
              <label style={s.label}>Company Logo <span style={s.optional}>(optional)</span></label>
              <div style={s.logoUploadArea}>
                <label style={s.logoUploadLabel} htmlFor="logo-input">
                  {logo ? (
                    <>
                      <span style={s.logoFileName}>📎 {logo.name}</span>
                      <span style={s.logoChangeTip}>Click to change</span>
                    </>
                  ) : (
                    <>
                      <span style={s.logoUploadIcon}>🖼</span>
                      <span style={s.logoUploadText}>Click to upload logo</span>
                      <span style={s.logoUploadSub}>PNG, JPG, SVG · max 5 MB</span>
                    </>
                  )}
                </label>
                <input
                  id="logo-input"
                  type="file"
                  accept="image/*"
                  style={{ display: "none" }}
                  onChange={e => setLogo(e.target.files[0] || null)}
                />
              </div>
              <LogoPreview file={logo} />
              <p style={s.fieldHint}>
                Your logo will appear on the company portal login page. You can also upload or change it later from Company Settings.
              </p>
            </div>
          )}

          {FIELDS.map(f => (
            <div key={f.key} style={f.key === "password" || f.key === "confirm_pwd" ? s.fieldFull : s.field}>
              <label style={s.label}>
                {f.label}{f.required && <span style={s.req}> *</span>}
              </label>
              <input
                style={{ ...s.input, ...(errors[f.key] ? s.inputErr : {}) }}
                type={f.type}
                placeholder={f.placeholder}
                value={form[f.key]}
                onChange={e  => set(f.key, e.target.value)}
                onKeyDown={e => e.key === "Enter" && handleSubmit()}
              />
              {f.key === "password" && <PasswordStrength pwd={form.password} />}
              {errors[f.key] && <p style={s.errMsg}>{errors[f.key]}</p>}
            </div>
          ))}

        </div>

        <button style={s.submitBtn} onClick={handleSubmit} disabled={submitting}>
          {submitting ? "Creating Account…" : "Create My Account"}
        </button>
      </div>
    </div>
  );
}

const s = {
  shell:            { minHeight: "100vh", background: "#f1f5f9", display: "flex", alignItems: "center", justifyContent: "center", padding: 24, fontFamily: "'DM Sans', sans-serif" },
  card:             { background: "#fff", borderRadius: 16, padding: "36px 40px", width: "100%", maxWidth: 520, boxShadow: "0 4px 24px rgba(0,0,0,.08)" },
  brand:            { display: "flex", alignItems: "center", gap: 8, marginBottom: 28 },
  brandIcon:        { fontSize: 22, color: "#6366f1" },
  brandName:        { fontSize: 18, fontWeight: 700, color: "#0f172a", letterSpacing: 0.5 },
  title:            { margin: "0 0 6px", fontSize: 22, fontWeight: 700, color: "#0f172a" },
  sub:              { margin: "0 0 20px", fontSize: 13, color: "#64748b" },
  inviteInfo:       { background: "#f8fafc", borderRadius: 10, padding: "14px 16px", marginBottom: 24 },
  infoRow:          { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 },
  infoLabel:        { fontSize: 12, color: "#94a3b8", fontWeight: 600, textTransform: "uppercase", letterSpacing: 0.5 },
  infoVal:          { fontSize: 13, color: "#0f172a", fontWeight: 500 },
  roleBadge:        { padding: "3px 10px", borderRadius: 20, fontSize: 12, fontWeight: 600 },
  fieldsGrid:       { display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0 16px" },
  field:            {},
  fieldFull:        { gridColumn: "1 / -1" },
  label:            { display: "block", fontSize: 12, fontWeight: 600, color: "#475569", marginBottom: 5, textTransform: "uppercase", letterSpacing: 0.5 },
  optional:         { fontWeight: 400, color: "#94a3b8", textTransform: "none", letterSpacing: 0 },
  req:              { color: "#ef4444" },
  input:            { width: "100%", padding: "10px 12px", border: "1px solid #e2e8f0", borderRadius: 8, fontSize: 13, marginBottom: 4, outline: "none", boxSizing: "border-box" },
  inputErr:         { borderColor: "#ef4444" },
  errMsg:           { color: "#ef4444", fontSize: 11, margin: "0 0 12px" },
  fieldHint:        { fontSize: 11, color: "#94a3b8", margin: "2px 0 14px", lineHeight: 1.5 },
  submitBtn:        { width: "100%", padding: 13, background: "#6366f1", color: "#fff", border: "none", borderRadius: 10, fontSize: 14, fontWeight: 700, cursor: "pointer", marginTop: 8 },

  // Logo upload
  logoUploadArea:   { border: "2px dashed #e2e8f0", borderRadius: 10, marginBottom: 4, cursor: "pointer", transition: "border-color .2s" },
  logoUploadLabel:  { display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "20px 16px", cursor: "pointer", gap: 4 },
  logoUploadIcon:   { fontSize: 28, marginBottom: 4 },
  logoUploadText:   { fontSize: 13, fontWeight: 600, color: "#475569" },
  logoUploadSub:    { fontSize: 11, color: "#94a3b8" },
  logoFileName:     { fontSize: 13, fontWeight: 600, color: "#6366f1" },
  logoChangeTip:    { fontSize: 11, color: "#94a3b8" },
  logoPreviewWrap:  { display: "flex", alignItems: "center", gap: 10, margin: "8px 0 4px" },
  logoPreview:      { width: 56, height: 56, objectFit: "cover", borderRadius: 10, border: "1px solid #e2e8f0" },
  logoPreviewLabel: { fontSize: 11, color: "#94a3b8" },

  // Upload status on success screen
  uploadStatusBox:  { margin: "12px 0" },
  uploadMsg:        { fontSize: 13, color: "#64748b", margin: 0 },

  // Loader / error / success
  loaderWrap:       { textAlign: "center", padding: 40 },
  spinner:          { width: 36, height: 36, border: "3px solid #e2e8f0", borderTopColor: "#6366f1", borderRadius: "50%", animation: "spin 1s linear infinite", margin: "0 auto 16px" },
  loaderText:       { color: "#94a3b8", fontSize: 14 },
  errorState:       { textAlign: "center", padding: "30px 0" },
  errorIcon:        { fontSize: 40, color: "#f59e0b" },
  errorTitle:       { fontSize: 18, fontWeight: 700, color: "#0f172a", margin: "12px 0 8px" },
  errorDesc:        { color: "#64748b", fontSize: 13, marginBottom: 20 },
  loginBtn:         { background: "#6366f1", color: "#fff", border: "none", padding: "10px 24px", borderRadius: 8, cursor: "pointer", fontWeight: 600 },
  successState:     { textAlign: "center", padding: "30px 0" },
  successIcon:      { fontSize: 48, color: "#10b981" },
  successTitle:     { fontSize: 20, fontWeight: 700, color: "#0f172a", margin: "12px 0 8px" },
  successDesc:      { color: "#64748b", fontSize: 13, marginBottom: 20 },
  portalHint:       { background: "#f8fafc", borderRadius: 10, padding: "16px 20px", marginTop: 16, textAlign: "left" },
  portalLabel:      { fontSize: 11, fontWeight: 600, color: "#94a3b8", textTransform: "uppercase", letterSpacing: 0.5, margin: "0 0 8px" },
  portalUrl:        { display: "block", fontSize: 13, color: "#6366f1", fontFamily: "monospace", background: "#ede9fe", padding: "6px 10px", borderRadius: 6, marginBottom: 8, wordBreak: "break-all" },
  portalNote:       { fontSize: 12, color: "#94a3b8", margin: 0, lineHeight: 1.5 },
};

const ps = {
  wrap:   { marginBottom: 12 },
  bar:    { display: "flex", gap: 4, marginBottom: 4 },
  seg:    { height: 4, flex: 1, borderRadius: 2, transition: "background .2s" },
  label:  { fontSize: 11, fontWeight: 600 },
  checks: { display: "flex", flexWrap: "wrap", gap: "4px 12px", marginTop: 6 },
  check:  { fontSize: 11 },
};

export default Register;