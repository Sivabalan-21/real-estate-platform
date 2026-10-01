import { useCallback, useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import TicketComments from "./TicketComments";
import { ApiError, formatDateTime, formatMoney, statusStyle, vendorFetch } from "./vendorApi";

const MAX_PDF_BYTES = 10 * 1024 * 1024;

const STATUS_LABELS = {
  open: "Ticket created",
  pm_review: "PM review",
  quote_requested: "Quote requested",
  quote_received: "Quote received",
  pending_owner_approval: "Pending owner approval",
  approved: "Approved",
  in_progress: "In progress",
  completed: "Completed",
  closed: "Closed",
  rejected: "Rejected",
};

const labelFor = (st) => STATUS_LABELS[st] || (st || "").replace(/_/g, " ");

function VendorJobDetail() {
  const { id } = useParams();
  const navigate = useNavigate();

  const [job, setJob] = useState(null);
  const [loadError, setLoadError] = useState(null);   // {status, message}
  const [file, setFile] = useState(null);
  const [amount, setAmount] = useState("");
  const [formError, setFormError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [justSubmitted, setJustSubmitted] = useState(false);
  const [lightbox, setLightbox] = useState(null);
  const [invFile, setInvFile] = useState(null);
  const [invError, setInvError] = useState("");
  const [invSubmitting, setInvSubmitting] = useState(false);
  const [invDone, setInvDone] = useState(false);

  const load = useCallback(async () => {
    try {
      setJob(await vendorFetch(`/vendor/jobs/${encodeURIComponent(id)}`));
      setLoadError(null);
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) return;
      setLoadError({ status: e.status, message: e.message });
    }
  }, [id]);

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

  const submitQuote = async () => {
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
      await vendorFetch(`/vendor/jobs/${encodeURIComponent(id)}/quote`, { method: "POST", body: fd });
      setJustSubmitted(true);
      setFile(null);
      setAmount("");
      await load();
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) return;
      setFormError(e.message || "Could not upload your quote. Please try again.");
      // The job may have moved on (e.g. quote already submitted elsewhere).
      if (e instanceof ApiError && e.status === 400) load();
    } finally {
      setSubmitting(false);
    }
  };
  const onPickInvoice = (e) => {
    const f = e.target.files && e.target.files[0];
    setInvError("");
    setInvDone(false);
    if (!f) { setInvFile(null); return; }
    const isPdf = f.type === "application/pdf" || f.name.toLowerCase().endsWith(".pdf");
    if (!isPdf) { setInvFile(null); setInvError("Please choose a PDF file."); return; }
    if (f.size > MAX_PDF_BYTES) { setInvFile(null); setInvError("File too large (max 10MB)"); return; }
    setInvFile(f);
  };

  const submitInvoice = async () => {
    setInvError("");
    if (!invFile) { setInvError("Please attach your invoice as a PDF."); return; }
    const fd = new FormData();
    fd.append("file", invFile);
    setInvSubmitting(true);
    try {
      await vendorFetch(`/vendor/jobs/${encodeURIComponent(id)}/invoice`, { method: "POST", body: fd });
      setInvFile(null);
      setInvDone(true);
      await load();
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) return;
      setInvError(e.message || "Could not upload your invoice. Please try again.");
    } finally {
      setInvSubmitting(false);
    }
  };
  if (loadError) {
    const gone = loadError.status === 404;
    return (
      <div style={s.page}>
        <button type="button" style={s.back} onClick={() => navigate("/vendor/dashboard")}>← My Jobs</button>
        <div style={s.errorBox} role="alert">
          <strong>{gone ? "Job not found" : "Couldn't load this job"}</strong>
          <p style={{ margin: "6px 0 0" }}>
            {gone ? "It may have been reassigned, or the link is wrong." : loadError.message}
          </p>
          {!gone && <button type="button" style={s.linkBtn} onClick={load}>Try again</button>}
        </div>
      </div>
    );
  }
  if (!job) return <div style={s.page}><p style={s.muted}>Loading…</p></div>;

  const st = statusStyle(job.status);
  const place = [job.property_name, job.property_address].filter(Boolean).join(" — ");
  const telHref = job.pm && job.pm.phone ? `tel:${job.pm.phone.replace(/[^\d+]/g, "")}` : null;

  return (
    <div style={s.page}>
      <button type="button" style={s.back} onClick={() => navigate("/vendor/dashboard")}>← My Jobs</button>

      <div style={s.card}>
        <div style={s.titleRow}>
          <h2 style={s.h2}>{job.job_title}</h2>
          <span style={{ ...s.pill, background: st.bg, color: st.fg }}>{job.status_label}</span>
        </div>
        {place && <p style={s.line}>📍 {place}</p>}
        <p style={s.line}>
          {job.category && <>Category: <b>{job.category}</b></>}
          {job.priority && <> &nbsp;·&nbsp; Priority: <b style={job.priority === "urgent" ? { color: "#b91c1c" } : undefined}>{job.priority}</b></>}
        </p>
        {job.description && <p style={s.desc}>{job.description}</p>}
      </div>
      {(job.can_submit_invoice || (job.invoices || []).length > 0) && (
        <div style={s.card}>
          <h3 style={s.h3}>Upload Final Invoice</h3>

          {job.can_submit_invoice && (
            <>
              <label style={{ ...s.drop, ...(invFile ? s.dropHas : null) }}>
                <input type="file" accept="application/pdf,.pdf" onChange={onPickInvoice} style={s.fileInput} aria-label="Invoice PDF" />
                {invFile ? (
                  <>
                    <strong>{invFile.name}</strong>
                    <span style={s.muted}>{(invFile.size / 1024 / 1024).toFixed(2)} MB, click to change</span>
                  </>
                ) : (
                  <>
                    <strong>Choose invoice PDF</strong>
                    <span style={s.muted}>PDF only, up to 10 MB</span>
                  </>
                )}
              </label>
              <button
                type="button"
                onClick={submitInvoice}
                disabled={invSubmitting || !invFile}
                style={{ marginTop: 10, padding: "9px 16px", border: "none", borderRadius: 8, background: "#4f46e5", color: "#fff", fontWeight: 600, cursor: invSubmitting || !invFile ? "not-allowed" : "pointer", opacity: invSubmitting || !invFile ? 0.6 : 1 }}
              >
                {invSubmitting ? "Uploading…" : "Submit invoice"}
              </button>
              {invError && <p style={{ color: "#b91c1c", fontSize: 13 }}>{invError}</p>}
            </>
          )}

          {(invDone || (job.invoices || []).length > 0) && (
            <p style={{ color: "#166534", fontSize: 13 }}>
              Invoice submitted. Your payment will be processed by the property manager.
            </p>
          )}

          {(job.invoices || []).length > 0 && (
            <div style={{ marginTop: 12 }}>
              <p style={s.muted}>Your submitted invoices</p>
              {job.invoices.map((inv) => (
                <p key={inv.id} style={{ margin: "4px 0", fontSize: 13 }}>
                  <a href={inv.url} target="_blank" rel="noreferrer">{inv.filename}</a>
                  <span style={s.muted}> · {formatDateTime(inv.uploaded_at)}{inv.size_kb ? ` · ${inv.size_kb} KB` : ""}</span>
                </p>
              ))}
            </div>
          )}
        </div>
      )}
      {job.can_submit_quote && (
        <div style={{ ...s.card, borderColor: "#fcd34d", background: "#fffbeb" }}>
          <h3 style={s.h3}>Upload your quote</h3>
          <label style={{ ...s.drop, ...(file ? s.dropHas : null) }}>
            <input type="file" accept="application/pdf,.pdf" onChange={onPick} style={s.fileInput} aria-label="Quote PDF" />
            {file ? (
              <>
                <strong>📄 {file.name}</strong>
                <span style={s.muted}>{(file.size / 1024 / 1024).toFixed(2)} MB — click to change</span>
              </>
            ) : (
              <>
                <strong>📎 Choose quote PDF</strong>
                <span style={s.muted}>PDF only, up to 10 MB</span>
              </>
            )}
          </label>

          <label style={s.label} htmlFor="vj-amount">Quote amount (optional)</label>
          <input id="vj-amount" style={s.input} type="text" inputMode="decimal" placeholder="e.g. 4500"
                 value={amount} onChange={(e) => setAmount(e.target.value)} />

          {formError && <p style={s.err} role="alert">{formError}</p>}
          <button type="button" style={{ ...s.primary, opacity: submitting || !file ? 0.6 : 1 }}
                  onClick={submitQuote} disabled={submitting || !file}>
            {submitting ? "Uploading…" : "Submit quote"}
          </button>
        </div>
      )}

      {justSubmitted && !job.can_submit_quote && (
        <div style={{ ...s.card, background: "#f0fdf4", borderColor: "#86efac" }} role="status">
          <strong>✅ Quote submitted.</strong>
          <p style={{ ...s.muted, margin: "6px 0 0" }}>The property manager has been notified and will review it.</p>
        </div>
      )}

      {job.quotes && job.quotes.length > 0 && (
        <div style={s.card}>
          <h3 style={s.h3}>Your submitted quote{job.quotes.length > 1 ? "s" : ""}</h3>
          {job.quote_amount != null && <p style={s.line}>Amount: <b>{formatMoney(job.quote_amount)}</b></p>}
          {job.quotes.map((q) => (
            <p key={q.id} style={s.line}>
              <a href={q.url} target="_blank" rel="noopener noreferrer" style={s.link}>📄 {q.filename}</a>
              <span style={s.muted}> · {formatDateTime(q.uploaded_at)}</span>
            </p>
          ))}
        </div>
      )}

      {job.photos && job.photos.length > 0 && (
        <div style={s.card}>
          <h3 style={s.h3}>Photos ({job.photos.length})</h3>
          <div style={s.gallery}>
            {job.photos.map((p) => (
              <button key={p.id} type="button" style={s.thumb} onClick={() => setLightbox(p.url)} aria-label={`Open photo ${p.filename}`}>
                <img src={p.url} alt={p.filename} style={s.thumbImg} loading="lazy" />
              </button>
            ))}
          </div>
        </div>
      )}

      {job.pm && job.pm.name && (
        <div style={s.card}>
          <h3 style={s.h3}>Property manager</h3>
          <div style={s.pmRow}>
            <div>
              <div style={{ fontWeight: 700, color: "#0f172a" }}>{job.pm.name}</div>
              {job.pm.phone && <div style={s.muted}>{job.pm.phone}</div>}
            </div>
            {telHref && <a href={telHref} style={s.callBtn}>📞 Call</a>}
          </div>
        </div>
      )}

      <div style={s.card}>
        <TicketComments ticketId={job.id} role="Vendor" styles={commentsStyles} />
      </div>

      {job.timeline && job.timeline.length > 0 && (
        <div style={s.card}>
          <h3 style={s.h3}>Progress</h3>
          <ol style={s.timeline}>
            {job.timeline.map((t, i) => (
              <li key={`${t.status}-${i}`} style={s.tlItem}>
                <b>{labelFor(t.status)}</b> <span style={s.muted}>· {formatDateTime(t.at)}</span>
              </li>
            ))}
          </ol>
        </div>
      )}

      {lightbox && (
        <div style={s.lightbox} onClick={() => setLightbox(null)} role="dialog" aria-modal="true">
          <button type="button" style={s.close} onClick={() => setLightbox(null)} aria-label="Close">×</button>
          <img src={lightbox} alt="Job" style={s.lightboxImg} onClick={(e) => e.stopPropagation()} />
        </div>
      )}
    </div>
  );
}

const commentsStyles = {
  section: {}, sectionLabel: { margin: 0, fontSize: 17, fontWeight: 700, color: "#0f172a" },
  sectionSub: { color: "#64748b", fontSize: 13 }, muted: { color: "#64748b", fontSize: 13 },
  commentList: { display: "grid", gap: 10 }, commentCard: { border: "1px solid #e2e8f0", borderRadius: 10, padding: 12 },
  commentHeader: { display: "flex", gap: 8 }, commentAuthor: { color: "#0f172a" }, commentRole: { color: "#64748b", fontSize: 12 },
  commentBody: { color: "#334155", whiteSpace: "pre-wrap" }, commentFooter: { display: "flex", justifyContent: "space-between", color: "#64748b", fontSize: 12 },
  visibilityBadge: { color: "#4f46e5" }, commentForm: { marginTop: 16 },
  textarea: { width: "100%", boxSizing: "border-box", padding: 10, border: "1px solid #cbd5e1", borderRadius: 8 },
  commentFormActions: { display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 8 },
  visibilitySelect: { padding: 8, borderRadius: 8, border: "1px solid #cbd5e1" },
  sendButton: { background: "#4f46e5", color: "#fff", border: 0, borderRadius: 8, padding: "8px 16px", fontWeight: 700, cursor: "pointer" },
  errorText: { color: "#dc2626", fontSize: 13 }, successText: { color: "#059669", fontSize: 13 },
};

const s = {
  page: { padding: 32, maxWidth: 820, fontFamily: "'DM Sans', sans-serif", color: "#334155" },
  back: { border: 0, background: "transparent", color: "#4f46e5", cursor: "pointer", padding: 0, marginBottom: 16, fontWeight: 700, font: "inherit" },
  card: { background: "#fff", border: "1px solid #e5e7eb", borderRadius: 12, padding: 18, marginBottom: 16, boxShadow: "0 1px 2px rgba(15,23,42,.04)" },
  titleRow: { display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, flexWrap: "wrap" },
  h2: { margin: 0, color: "#0f172a", fontSize: 22 },
  h3: { margin: "0 0 12px", color: "#0f172a", fontSize: 16 },
  pill: { borderRadius: 999, padding: "4px 12px", fontSize: 12, fontWeight: 700, whiteSpace: "nowrap" },
  line: { margin: "8px 0 0", fontSize: 14 },
  desc: { margin: "14px 0 0", lineHeight: 1.6, whiteSpace: "pre-wrap", wordBreak: "break-word" },
  muted: { color: "#64748b", fontSize: 13 },
  drop: { position: "relative", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 4, minHeight: 90, padding: 14, border: "2px dashed #94a3b8", borderRadius: 12, background: "#fff", textAlign: "center", cursor: "pointer", boxSizing: "border-box" },
  dropHas: { borderStyle: "solid", borderColor: "#16a34a", background: "#f0fdf4" },
  fileInput: { position: "absolute", width: 1, height: 1, opacity: 0, overflow: "hidden" },
  label: { display: "block", fontSize: 14, fontWeight: 600, margin: "14px 0 6px" },
  input: { width: "100%", padding: "10px 12px", border: "1px solid #cbd5e1", borderRadius: 8, fontSize: 15, boxSizing: "border-box", background: "#fff" },
  err: { color: "#b91c1c", fontSize: 14, margin: "10px 0 0" },
  primary: { marginTop: 16, background: "#4f46e5", color: "#fff", border: 0, borderRadius: 8, padding: "11px 20px", fontWeight: 700, fontSize: 15, cursor: "pointer" },
  link: { color: "#4f46e5", fontWeight: 600, textDecoration: "none" },
  gallery: { display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))", gap: 8 },
  thumb: { padding: 0, border: 0, background: "#e2e8f0", borderRadius: 8, overflow: "hidden", aspectRatio: "1 / 1", cursor: "pointer" },
  thumbImg: { width: "100%", height: "100%", objectFit: "cover", display: "block" },
  pmRow: { display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" },
  callBtn: { background: "#16a34a", color: "#fff", borderRadius: 8, padding: "9px 16px", fontWeight: 700, textDecoration: "none", fontSize: 14 },
  timeline: { margin: 0, paddingLeft: 18, display: "grid", gap: 6, fontSize: 14 },
  tlItem: { color: "#334155" },
  errorBox: { background: "#fef2f2", border: "1px solid #fecaca", color: "#991b1b", borderRadius: 10, padding: "14px 16px", fontSize: 14 },
  linkBtn: { border: 0, background: "transparent", color: "#4f46e5", fontWeight: 700, cursor: "pointer", padding: "8px 0 0", font: "inherit" },
  lightbox: { position: "fixed", inset: 0, background: "rgba(15,23,42,.92)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 50, padding: 16 },
  lightboxImg: { maxWidth: "100%", maxHeight: "100%", borderRadius: 8 },
  close: { position: "absolute", top: 12, right: 12, width: 44, height: 44, borderRadius: 22, border: 0, background: "#fff", fontSize: 22, cursor: "pointer" },
};

export default VendorJobDetail;
