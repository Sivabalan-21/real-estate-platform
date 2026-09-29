import { useState, useEffect } from "react";
import { useParams } from "react-router-dom";

const API = process.env.REACT_APP_API_URL || "http://localhost:8000"; // same value as before

function VendorAccess() {
  const { token } = useParams();
  const [job, setJob] = useState(null);
  const [error, setError] = useState("");
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [formError, setFormError] = useState("");

  const load = () =>
    fetch(`${API}/vendor-access/${token}`)
      .then((r) => {
        if (!r.ok) throw new Error("This link is invalid or has expired");
        return r.json();
      })
      .then(setJob)
      .catch((e) => setError(e.message));

  useEffect(() => { load(); }, [token]);

  const submitQuote = async () => {
    setFormError("");
    const value = parseFloat(amount);
    if (!value || value <= 0) {
      setFormError("Enter a valid amount");
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch(`${API}/vendor-access/${token}/quote`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amount: value, note }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.detail || "Could not submit quote");
      }
      setDone(true);
      load();
    } catch (e) {
      setFormError(e.message);
    } finally {
      setSubmitting(false);
    }
  };

  if (error) return <div style={{ padding: 32, color: "#dc2626" }}>{error}</div>;
  if (!job) return <div style={{ padding: 32 }}>Loading...</div>;

  const canQuote = job.status === "quote_requested" && !done;
  const box = { border: "1px solid #e5e7eb", borderRadius: 8, padding: 16, background: "#fff", marginBottom: 16 };
  const input = { width: "100%", padding: 8, border: "1px solid #cbd5e1", borderRadius: 6, marginTop: 4, boxSizing: "border-box" };

  return (
    <div style={{ padding: 32, maxWidth: 600, margin: "0 auto" }}>
      <h2 style={{ color: "#0f172a" }}>Hi {job.vendor_name}</h2>

      <div style={box}>
        <b>{job.title}</b>
        <p>{job.description}</p>
        <small>Status: {job.status.replace(/_/g, " ")}</small>
      </div>

      {canQuote && (
        <div style={box}>
          <b>Submit your quote</b>
          <div style={{ marginTop: 12 }}>
            <label>Amount (INR)</label>
            <input style={input} type="number" min="0" value={amount}
                   onChange={(e) => setAmount(e.target.value)} placeholder="e.g. 4500" />
          </div>
          <div style={{ marginTop: 12 }}>
            <label>Note (optional)</label>
            <textarea style={input} rows={3} value={note}
                      onChange={(e) => setNote(e.target.value)}
                      placeholder="Materials, time estimate, etc." />
          </div>
          {formError && <p style={{ color: "#dc2626" }}>{formError}</p>}
          <button onClick={submitQuote} disabled={submitting}
                  style={{ marginTop: 12, padding: "10px 20px", background: "#0f172a", color: "#fff", border: 0, borderRadius: 6, cursor: "pointer" }}>
            {submitting ? "Submitting..." : "Submit quote"}
          </button>
        </div>
      )}

      {(done || job.status === "quote_received") && (
        <div style={{ ...box, background: "#f0fdf4", borderColor: "#86efac" }}>
          Quote submitted. The property manager will review it.
        </div>
      )}
    </div>
  );
}

export default VendorAccess;