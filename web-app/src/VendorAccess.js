import { useState, useEffect, useCallback } from "react";
import { useParams } from "react-router-dom";

const API = process.env.REACT_APP_API_URL || "http://localhost:8000";
const MAX_PDF_BYTES = 10 * 1024 * 1024;

// Server sends detail as either a string or {code, message}.
function parseDetail(body, fallback) {
  const d = body && body.detail;
  if (!d) return { code: "error", message: fallback };
  if (typeof d === "string") return { code: "error", message: d };
  return { code: d.code || "error", message: d.message || fallback };
}

const STATUS_LABELS = {
  quote_requested: "Quote requested",
  quote_received: "Quote received",
  pending_owner_approval: "Under review",
  approved: "Approved",
  in_progress: "In progress",
};

const css = `
.vp-page{min-height:100vh;background:#f1f5f9;padding:16px;padding-top:max(16px,env(safe-area-inset-top));padding-bottom:max(24px,env(safe-area-inset-bottom));box-sizing:border-box;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;color:#0f172a}
.vp-wrap{max-width:640px;margin:0 auto}
.vp-brand{font-size:13px;font-weight:600;color:#64748b;letter-spacing:.04em;text-transform:uppercase;margin:4px 0 12px}
.vp-card{background:#fff;border:1px solid #e2e8f0;border-radius:12px;padding:16px;margin-bottom:14px}
.vp-h1{font-size:20px;line-height:1.3;margin:0 0 6px}
.vp-h2{font-size:16px;margin:0 0 10px}
.vp-muted{color:#64748b;font-size:14px;margin:0 0 4px}
.vp-desc{font-size:15px;line-height:1.5;margin:10px 0 0;white-space:pre-wrap;word-break:break-word}
.vp-pill{display:inline-block;padding:3px 10px;border-radius:999px;background:#e0f2fe;color:#075985;font-size:12px;font-weight:600;margin-top:8px}
.vp-gallery{display:grid;grid-template-columns:repeat(2,1fr);gap:8px}
.vp-thumb{padding:0;border:0;background:#e2e8f0;border-radius:8px;overflow:hidden;aspect-ratio:1/1;cursor:pointer}
.vp-thumb img{width:100%;height:100%;object-fit:cover;display:block}
.vp-lightbox{position:fixed;inset:0;background:rgba(15,23,42,.92);display:flex;align-items:center;justify-content:center;z-index:50;padding:16px}
.vp-lightbox img{max-width:100%;max-height:100%;border-radius:8px}
.vp-close{position:absolute;top:max(12px,env(safe-area-inset-top));right:12px;width:44px;height:44px;border-radius:22px;border:0;background:#fff;font-size:22px;cursor:pointer}
.vp-pm{display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap}
.vp-btn{display:flex;align-items:center;justify-content:center;width:100%;min-height:48px;padding:12px 16px;border:0;border-radius:10px;background:#0f172a;color:#fff;font-size:16px;font-weight:600;cursor:pointer;text-decoration:none;box-sizing:border-box}
.vp-btn[disabled]{opacity:.55;cursor:not-allowed}
.vp-btn-call{width:auto;background:#16a34a}
.vp-label{display:block;font-size:14px;font-weight:600;margin:14px 0 6px}
.vp-input{width:100%;min-height:48px;padding:10px 12px;border:1px solid #cbd5e1;border-radius:10px;font-size:16px;box-sizing:border-box;background:#fff}
.vp-file{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:4px;min-height:96px;padding:14px;border:2px dashed #94a3b8;border-radius:12px;background:#f8fafc;text-align:center;cursor:pointer;box-sizing:border-box}
.vp-file.has{border-style:solid;border-color:#16a34a;background:#f0fdf4}
.vp-file input{position:absolute;width:1px;height:1px;opacity:0;overflow:hidden}
.vp-err{color:#b91c1c;font-size:14px;margin:10px 0 0}
.vp-ok{background:#f0fdf4;border-color:#86efac}
.vp-center{text-align:center;padding:32px 20px}
.vp-icon{font-size:40px;margin-bottom:8px}
@media (min-width:520px){.vp-page{padding:32px}.vp-gallery{grid-template-columns:repeat(3,1fr)}.vp-h1{font-size:24px}.vp-btn{width:auto;min-width:200px}}
`;

function Shell({ children }) {
  return (
    <div className="vp-page">
      <style>{css}</style>
      <div className="vp-wrap">
        <div className="vp-brand">PropOS &middot; Vendor portal</div>
        {children}
      </div>
    </div>
  );
}

function Notice({ icon, title, message }) {
  return (
    <Shell>
      <div className="vp-card vp-center">
        <div className="vp-icon">{icon}</div>
        <h1 className="vp-h1">{title}</h1>
        <p className="vp-muted">{message}</p>
      </div>
    </Shell>
  );
}

function VendorAccess() {
  const { token } = useParams();
  const [job, setJob] = useState(null);
  const [fatal, setFatal] = useState(null); // {code, message}
  const [file, setFile] = useState(null);
  const [amount, setAmount] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [formError, setFormError] = useState("");
  const [lightbox, setLightbox] = useState(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`${API}/vendor-access/${encodeURIComponent(token)}`);
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setFatal(parseDetail(body, "This link is not valid. Contact your property manager."));
        return;
      }
      setJob(body);
    } catch {
      setFatal({ code: "network", message: "Could not reach the server. Check your connection and try again." });
    }
  }, [token]);

  useEffect(() => { load(); }, [load]);

  const onPick = (e) => {
    const f = e.target.files && e.target.files[0];
    setFormError("");
    if (!f) { setFile(null); return; }
    const isPdf = f.type === "application/pdf" || f.name.toLowerCase().endsWith(".pdf");
    if (!isPdf) { setFile(null); setFormError("Please choose a PDF file."); return; }
    if (f.size > MAX_PDF_BYTES) { setFile(null); setFormError("File is too large (max 10 MB)."); return; }
    setFile(f);
  };

  const submit = async () => {
    setFormError("");
    if (!file) { setFormError("Please attach your quote as a PDF."); return; }
    if (amount.trim()) {
      const n = parseFloat(amount.replace(/,/g, ""));
      if (!(n > 0)) { setFormError("Enter a valid amount, or leave it blank."); return; }
    }
    const fd = new FormData();
    fd.append("file", file);
    if (amount.trim()) fd.append("quote_amount", amount.trim());

    setSubmitting(true);
    try {
      const res = await fetch(`${API}/vendor-access/${encodeURIComponent(token)}/upload`, {
        method: "POST",
        body: fd,
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        const d = parseDetail(body, "Could not upload your quote. Please try again.");
        if (res.status === 410 || res.status === 404) { setFatal(d); return; }
        throw new Error(d.message);
      }
      setDone(true);
      setFile(null);
      load();
    } catch (e) {
      setFormError(e.message || "Could not upload your quote. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  if (fatal) {
    if (fatal.code === "job_completed")
      return <Notice icon="✅" title="Job already completed" message="This job is already completed." />;
    if (fatal.code === "job_closed")
      return <Notice icon="ℹ️" title="Job no longer active" message={fatal.message} />;
    if (fatal.code === "network")
      return <Notice icon="📡" title="Connection problem" message={fatal.message} />;
    return <Notice icon="⏰" title="Link unavailable" message={fatal.code === "expired" ? "This link has expired. Contact your property manager." : fatal.message} />;
  }
  if (!job) return <Shell><div className="vp-card vp-center"><p className="vp-muted">Loading…</p></div></Shell>;

  const submitted = done || job.status === "quote_received";
  const canQuote = job.can_submit_quote && !done;
  const placeLine = [job.property_name, job.property_address].filter(Boolean).join(" — ");

  return (
    <Shell>
      <p className="vp-muted" style={{ margin: "0 0 8px" }}>Hi {job.vendor_name},</p>

      <div className="vp-card">
        <h1 className="vp-h1">{job.job_title}</h1>
        {placeLine && <p className="vp-muted">📍 {placeLine}</p>}
        {job.category && <p className="vp-muted">Category: {job.category}</p>}
        <span className="vp-pill">{STATUS_LABELS[job.status] || job.status.replace(/_/g, " ")}</span>
        {job.description && <p className="vp-desc">{job.description}</p>}
      </div>

      {job.photos && job.photos.length > 0 && (
        <div className="vp-card">
          <h2 className="vp-h2">Photos ({job.photos.length})</h2>
          <div className="vp-gallery">
            {job.photos.map((p) => (
              <button key={p.id} type="button" className="vp-thumb" onClick={() => setLightbox(p.url)}
                      aria-label={`Open photo ${p.filename}`}>
                <img src={p.url} alt={p.filename} loading="lazy" />
              </button>
            ))}
          </div>
        </div>
      )}

      {job.pm && job.pm.name && (
        <div className="vp-card">
          <h2 className="vp-h2">Property manager</h2>
          <div className="vp-pm">
            <div>
              <div style={{ fontWeight: 600 }}>{job.pm.name}</div>
              {job.pm.phone && <div className="vp-muted">{job.pm.phone}</div>}
            </div>
            {job.pm.phone && (
              <a className="vp-btn vp-btn-call" href={`tel:${job.pm.phone.replace(/[^\d+]/g, "")}`}>📞 Call</a>
            )}
          </div>
        </div>
      )}

      {canQuote && (
        <div className="vp-card">
          <h2 className="vp-h2">Upload your quote</h2>

          <label className={`vp-file${file ? " has" : ""}`} style={{ position: "relative" }}>
            <input type="file" accept="application/pdf,.pdf" onChange={onPick} />
            {file ? (
              <>
                <strong>📄 {file.name}</strong>
                <span className="vp-muted">{(file.size / 1024 / 1024).toFixed(2)} MB — tap to change</span>
              </>
            ) : (
              <>
                <strong>📎 Choose quote PDF</strong>
                <span className="vp-muted">PDF only, up to 10 MB</span>
              </>
            )}
          </label>

          <label className="vp-label" htmlFor="vp-amount">Quote amount (optional)</label>
          <input id="vp-amount" className="vp-input" type="text" inputMode="decimal"
                 value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="e.g. 4500" />

          {formError && <p className="vp-err" role="alert">{formError}</p>}

          <div style={{ marginTop: 16 }}>
            <button className="vp-btn" onClick={submit} disabled={submitting || !file}>
              {submitting ? "Uploading…" : "Submit quote"}
            </button>
          </div>
        </div>
      )}

      {submitted && (
        <div className="vp-card vp-ok">
          <strong>✅ Quote submitted.</strong>
          <p className="vp-muted" style={{ marginTop: 6 }}>
            Thank you — the property manager has been notified and will review it.
          </p>
        </div>
      )}

      {lightbox && (
        <div className="vp-lightbox" onClick={() => setLightbox(null)} role="dialog" aria-modal="true">
          <button className="vp-close" onClick={() => setLightbox(null)} aria-label="Close">×</button>
          <img src={lightbox} alt="Ticket" onClick={(e) => e.stopPropagation()} />
        </div>
      )}
    </Shell>
  );
}

export default VendorAccess;
