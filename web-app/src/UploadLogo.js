import React, { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";

export default function UploadLogo() {
  const { token }  = useParams();
  const navigate   = useNavigate();

  const [file,       setFile]       = useState(null);
  const [uploading,  setUploading]  = useState(false);
  const [done,       setDone]       = useState(false);
  const [error,      setError]      = useState("");
  const [validating, setValidating] = useState(true);
  const [invalid,    setInvalid]    = useState(false);

  // Validate token on load
  useEffect(() => {
    fetch(`http://194.164.149.22/api/company/validate-logo-token/${token}`)
      .then(r => {
        if (!r.ok) throw new Error();
        setValidating(false);
      })
      .catch(() => {
        setInvalid(true);
        setValidating(false);
      });
  }, [token]);

  const handleUpload = async () => {
    if (!file) { setError("Please select an image file."); return; }
    setUploading(true);
    setError("");
    const formData = new FormData();
    formData.append("file", file);
    try {
      const res  = await fetch(`http://194.164.149.22/api/company/upload-logo-by-token/${token}`, {
        method: "POST",
        body:   formData,
      });
      const data = await res.json();
      if (!res.ok) { setError(data.detail || "Upload failed."); return; }
      setDone(true);
    } catch {
      setError("Server error. Please try again.");
    } finally {
      setUploading(false);
    }
  };

  if (validating) return (
    <div style={s.page}>
      <div style={s.card}>
        <div style={s.spinner} />
        <p style={s.sub}>Validating link…</p>
      </div>
    </div>
  );

  if (invalid) return (
    <div style={s.page}>
      <div style={s.card}>
        <div style={s.iconWrap}>❌</div>
        <h2 style={s.title}>Link Expired or Invalid</h2>
        <p style={s.sub}>This logo upload link is no longer valid. Please ask your administrator to send a new one.</p>
      </div>
    </div>
  );

  if (done) return (
    <div style={s.page}>
      <div style={s.card}>
        <div style={s.iconWrap}>✅</div>
        <h2 style={s.title}>Logo Uploaded!</h2>
        <p style={s.sub}>Your company logo has been uploaded successfully. It will appear on your company portal.</p>
      </div>
    </div>
  );

  return (
    <div style={s.page}>
      <div style={s.card}>
        <div style={s.iconWrap}>🏢</div>
        <h2 style={s.title}>Upload Company Logo</h2>
        <p style={s.sub}>Choose an image file to set as your company logo. It will appear on your company login portal.</p>

        <div style={s.uploadBox}>
          <input
            type="file"
            accept="image/*"
            onChange={e => { setFile(e.target.files[0]); setError(""); }}
            style={s.fileInput}
          />
          {file && (
            <div style={s.preview}>
              <img
                src={URL.createObjectURL(file)}
                alt="preview"
                style={s.previewImg}
              />
              <p style={s.fileName}>{file.name}</p>
            </div>
          )}
        </div>

        {error && <p style={s.error}>⚠ {error}</p>}

        <button
          style={{ ...s.btn, opacity: uploading || !file ? 0.6 : 1 }}
          onClick={handleUpload}
          disabled={uploading || !file}
        >
          {uploading ? "Uploading…" : "Upload Logo"}
        </button>
      </div>
    </div>
  );
}

const s = {
  page:       { minHeight: "100vh", background: "#f1f5f9", display: "flex", alignItems: "center", justifyContent: "center", padding: 24, fontFamily: "'DM Sans', system-ui, sans-serif" },
  card:       { background: "#fff", borderRadius: 16, border: "1px solid #e2e8f0", padding: "2.5rem 2rem", maxWidth: 420, width: "100%", textAlign: "center", boxShadow: "0 4px 24px rgba(0,0,0,.08)" },
  iconWrap:   { fontSize: 40, marginBottom: 16 },
  title:      { fontSize: 20, fontWeight: 700, color: "#0f172a", margin: "0 0 8px" },
  sub:        { fontSize: 14, color: "#64748b", margin: "0 0 24px", lineHeight: 1.6 },
  uploadBox:  { border: "2px dashed #e2e8f0", borderRadius: 10, padding: 20, marginBottom: 16, background: "#f8fafc" },
  fileInput:  { fontSize: 13, width: "100%", cursor: "pointer" },
  preview:    { marginTop: 16 },
  previewImg: { width: 80, height: 80, objectFit: "cover", borderRadius: 10, border: "1px solid #e2e8f0" },
  fileName:   { fontSize: 12, color: "#64748b", marginTop: 6 },
  error:      { color: "#ef4444", fontSize: 13, marginBottom: 12 },
  btn:        { background: "#6366f1", color: "#fff", border: "none", padding: "11px 28px", borderRadius: 10, cursor: "pointer", fontWeight: 700, fontSize: 14, width: "100%" },
  spinner:    { width: 32, height: 32, border: "3px solid #e2e8f0", borderTopColor: "#6366f1", borderRadius: "50%", animation: "spin 0.8s linear infinite", margin: "0 auto 16px" },
};