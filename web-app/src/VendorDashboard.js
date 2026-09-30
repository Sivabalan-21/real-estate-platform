import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ApiError, formatMoney, statusStyle, timeAgo, vendorFetch } from "./vendorApi";

// Which section of the dashboard a ticket status belongs to.
const NEEDS_ACTION = ["quote_requested"];
const FINISHED = ["completed", "closed", "rejected"];

const EMPTY_COPY = {
  no_vendor_profile: {
    title: "Your account isn't linked to a vendor profile yet",
    body: "Ask your property manager to add you in the Vendor Directory using the same email you signed in with. Your jobs will appear here as soon as that's done.",
  },
  vendor_inactive: {
    title: "Your vendor profile is inactive",
    body: "Contact your property manager to have it reactivated.",
  },
  none: {
    title: "No jobs assigned yet",
    body: "When a property manager assigns you a job it will show up here.",
  },
};

function JobCard({ job, onOpen }) {
  const st = statusStyle(job.status);
  const place = [job.property_name, job.unit_number && `Unit ${job.unit_number}`].filter(Boolean).join(" · ");
  const urgent = job.priority === "urgent" || job.priority === "high";
  return (
    <button type="button" style={s.card} onClick={() => onOpen(job.id)} aria-label={`Open job: ${job.job_title}`}>
      <div style={s.cardTop}>
        <span style={s.cardTitle}>{job.job_title}</span>
        <span style={{ ...s.pill, background: st.bg, color: st.fg }}>{job.status_label}</span>
      </div>
      {job.description && <p style={s.cardDesc}>{job.description}</p>}
      <div style={s.cardMeta}>
        {place && <span>📍 {place}</span>}
        {urgent && <span style={s.urgent}>{job.priority.toUpperCase()}</span>}
        {job.quote_amount != null && <span>Quote: {formatMoney(job.quote_amount)}</span>}
        <span style={{ marginLeft: "auto" }}>Updated {timeAgo(job.updated_at || job.created_at)}</span>
      </div>
      {job.can_submit_quote && <div style={s.cta}>Upload your quote →</div>}
    </button>
  );
}

function Section({ title, count, jobs, onOpen, accent }) {
  if (jobs.length === 0) return null;
  return (
    <section style={{ marginBottom: 28 }}>
      <h3 style={{ ...s.sectionTitle, ...(accent ? { color: "#92400e" } : {}) }}>
        {title} <span style={s.count}>{count}</span>
      </h3>
      <div style={s.list}>
        {jobs.map((j) => <JobCard key={j.id} job={j} onOpen={onOpen} />)}
      </div>
    </section>
  );
}

function VendorDashboard() {
  const navigate = useNavigate();
  const displayName = localStorage.getItem("display_name") || localStorage.getItem("username") || "Vendor";

  const [data, setData] = useState(null);      // {vendor, jobs, reason}
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    try {
      const body = await vendorFetch("/vendor/jobs");
      setData(body);
      setError("");
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) return; // already signing out
      setError(e.message || "Could not load your jobs.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  // Jobs are assigned by someone else while this tab sits open, so refetch
  // whenever the vendor comes back to it.
  useEffect(() => {
    const onVisible = () => { if (document.visibilityState === "visible") load(true); };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onVisible);
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onVisible);
    };
  }, [load]);

  const open = (id) => navigate(`/vendor/jobs/${id}`);

  const jobs = (data && data.jobs) || [];
  const action = jobs.filter((j) => NEEDS_ACTION.includes(j.status));
  const finished = jobs.filter((j) => FINISHED.includes(j.status));
  const active = jobs.filter((j) => !NEEDS_ACTION.includes(j.status) && !FINISHED.includes(j.status));

  return (
    <div style={s.page}>
      <div style={s.header}>
        <div>
          <h2 style={s.h2}>Welcome, {(data && data.vendor && data.vendor.name) || displayName}</h2>
          <p style={s.sub}>Your assigned jobs</p>
        </div>
        <button type="button" style={s.refresh} onClick={() => load(true)} disabled={refreshing}>
          {refreshing ? "Refreshing…" : "↻ Refresh"}
        </button>
      </div>

      {loading && <p style={s.muted}>Loading your jobs…</p>}

      {error && (
        <div style={s.errorBox} role="alert">
          <strong>Couldn't load your jobs.</strong> {error}{" "}
          <button type="button" style={s.linkBtn} onClick={() => load(true)}>Try again</button>
        </div>
      )}

      {!loading && !error && data && jobs.length === 0 && (
        <div style={s.empty}>
          <div style={{ fontSize: 34 }}>📭</div>
          <h3 style={{ margin: "8px 0 6px", color: "#0f172a" }}>{(EMPTY_COPY[data.reason] || EMPTY_COPY.none).title}</h3>
          <p style={{ ...s.muted, margin: 0 }}>{(EMPTY_COPY[data.reason] || EMPTY_COPY.none).body}</p>
        </div>
      )}

      {!error && (
        <>
          <Section title="Needs your quote" count={action.length} jobs={action} onOpen={open} accent />
          <Section title="In progress" count={active.length} jobs={active} onOpen={open} />
          <Section title="Completed" count={finished.length} jobs={finished} onOpen={open} />
        </>
      )}
    </div>
  );
}

const s = {
  page: { padding: 32, maxWidth: 900, fontFamily: "'DM Sans', sans-serif", color: "#334155" },
  header: { display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 16, marginBottom: 24 },
  h2: { margin: 0, color: "#0f172a" },
  sub: { margin: "4px 0 0", color: "#64748b" },
  muted: { color: "#64748b", fontSize: 14 },
  refresh: { border: "1px solid #cbd5e1", background: "#fff", color: "#334155", borderRadius: 8, padding: "8px 14px", fontSize: 13, fontWeight: 600, cursor: "pointer" },
  sectionTitle: { margin: "0 0 10px", fontSize: 13, letterSpacing: ".06em", textTransform: "uppercase", color: "#475569" },
  count: { background: "#e2e8f0", color: "#334155", borderRadius: 999, padding: "1px 8px", fontSize: 12, marginLeft: 6 },
  list: { display: "grid", gap: 10 },
  card: { textAlign: "left", width: "100%", background: "#fff", border: "1px solid #e5e7eb", borderRadius: 12, padding: 16, cursor: "pointer", font: "inherit", color: "inherit", boxShadow: "0 1px 2px rgba(15,23,42,.04)" },
  cardTop: { display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12 },
  cardTitle: { fontWeight: 700, color: "#0f172a", fontSize: 16 },
  pill: { borderRadius: 999, padding: "3px 10px", fontSize: 12, fontWeight: 700, whiteSpace: "nowrap" },
  cardDesc: { margin: "8px 0 0", fontSize: 14, color: "#475569", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" },
  cardMeta: { display: "flex", flexWrap: "wrap", gap: 14, marginTop: 10, fontSize: 12, color: "#64748b", alignItems: "center" },
  urgent: { color: "#b91c1c", fontWeight: 700 },
  cta: { marginTop: 10, color: "#4f46e5", fontWeight: 700, fontSize: 13 },
  empty: { textAlign: "center", background: "#fff", border: "1px dashed #cbd5e1", borderRadius: 12, padding: "36px 24px" },
  errorBox: { background: "#fef2f2", border: "1px solid #fecaca", color: "#991b1b", borderRadius: 10, padding: "12px 14px", fontSize: 14 },
  linkBtn: { border: 0, background: "transparent", color: "#4f46e5", fontWeight: 700, cursor: "pointer", padding: 0, font: "inherit" },
};

export default VendorDashboard;
