import React, { useCallback, useEffect, useMemo, useState } from "react";
import VendorModal from "./VendorModal";

const API = "http://localhost:8000";
const TABS = ["All", "Plumbing", "Electrical", "HVAC", "Roofing", "General"];

function Stars({ value }) {
  const filled = Math.round(value);
  return (
    <span style={{ color: "#f59e0b", letterSpacing: 1 }} aria-hidden="true">
      {"★".repeat(filled)}
      <span style={{ color: "#cbd5e1" }}>{"★".repeat(5 - filled)}</span>
    </span>
  );
}

// e.g. "★★★★☆ 4.2 ★ (8 jobs)"  |  "(No ratings yet)"
function Rating({ vendor }) {
  if (vendor.avg_rating === null || vendor.avg_rating === undefined) {
    return <span style={{ color: "#94a3b8", fontSize: 13 }}>(No ratings yet)</span>;
  }
  const jobs = vendor.total_jobs ?? 0;
  return (
    <span style={{ fontSize: 13, whiteSpace: "nowrap" }}>
      <Stars value={vendor.avg_rating} />{" "}
      {Number(vendor.avg_rating).toFixed(1)} ★ ({jobs} {jobs === 1 ? "job" : "jobs"})
    </span>
  );
}

function VendorDirectory() {
  const token = sessionStorage.getItem("token");

  const [vendors, setVendors] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [tab, setTab] = useState("All");
  const [search, setSearch] = useState("");
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState(null);

  const fetchVendors = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      // GET /vendors defaults to is_active=true, so deactivated vendors
      // are already excluded server-side.
      const res = await fetch(`${API}/vendors`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.detail || "Could not load vendors");
        return;
      }
      setVendors(data);
    } catch {
      setError("Could not reach the server");
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    fetchVendors();
  }, [fetchVendors]);

  // Filtering is client-side on purpose: tab taps and typing feel instant
  // mid-call, and the vendor list per company is small.
  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    return vendors.filter(
      (v) =>
        (tab === "All" || v.category === tab) &&
        (!q || (v.name || "").toLowerCase().includes(q))
    );
  }, [vendors, tab, search]);

  const openAdd = () => { setEditing(null); setModalOpen(true); };
  const openEdit = (v) => { setEditing(v); setModalOpen(true); };

  // Update the list in place — no page reload.
  const handleSaved = (saved) => {
    setVendors((prev) => {
      const exists = prev.some((v) => v.id === saved.id);
      const next = exists ? prev.map((v) => (v.id === saved.id ? saved : v)) : [...prev, saved];
      return next.sort((a, b) => a.name.localeCompare(b.name));
    });
    setModalOpen(false);
    setEditing(null);
  };

  const deactivate = async (v) => {
    if (!window.confirm(`Deactivate ${v.name}? They won't appear in ticket assignment.`)) return;
    try {
      // DELETE /vendors/:id is a soft delete — it sets is_active=False.
      const res = await fetch(`${API}/vendors/${v.id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        alert(data.detail || "Could not deactivate vendor");
        return;
      }
      setVendors((prev) => prev.filter((x) => x.id !== v.id));
    } catch {
      alert("Could not reach the server");
    }
  };

  return (
    <div style={s.page}>
      <div style={s.header}>
        <div>
          <h1 style={s.h1}>Vendor Directory</h1>
          <p style={s.sub}>Find and call a vendor fast.</p>
        </div>
        <button style={s.addBtn} onClick={openAdd}>+ Add Vendor</button>
      </div>

      {/* Category tabs */}
      <div style={s.tabs}>
        {TABS.map((t) => (
          <button
            key={t}
            style={{ ...s.tab, ...(tab === t ? s.tabActive : {}) }}
            onClick={() => setTab(t)}
          >
            {t}
          </button>
        ))}
      </div>

      <input
        style={s.search}
        type="search"
        placeholder="Search vendors by name…"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
      />

      {loading && <p style={s.muted}>Loading vendors…</p>}
      {error && <p style={s.error}>{error}</p>}

      {!loading && !error && (
        <div style={s.card}>
          <div style={{ overflowX: "auto" }}>
            <table style={s.table}>
              <thead>
                <tr>
                  {["Name", "Category", "Phone", "Rating", "Status", "Actions"].map((h) => (
                    <th key={h} style={s.th}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {visible.length === 0 && (
                  <tr>
                    <td colSpan={6} style={{ ...s.td, textAlign: "center", color: "#94a3b8" }}>
                      No vendors found.
                    </td>
                  </tr>
                )}
                {visible.map((v) => (
                  <tr key={v.id}>
                    <td style={{ ...s.td, fontWeight: 600 }}>{v.name}</td>
                    <td style={s.td}>{v.category}</td>
                    <td style={s.td}>
                      {v.phone ? (
                        <a href={`tel:${v.phone}`} style={s.tel}>📞 {v.phone}</a>
                      ) : "—"}
                    </td>
                    <td style={s.td}><Rating vendor={v} /></td>
                    <td style={s.td}>
                      <span style={v.is_active ? s.pillOn : s.pillOff}>
                        {v.is_active ? "Active" : "Inactive"}
                      </span>
                    </td>
                    <td style={{ ...s.td, whiteSpace: "nowrap" }}>
                      {v.phone && (
                        <a href={`tel:${v.phone}`} style={s.callBtn}>Call Now</a>
                      )}
                      <button style={s.btn} onClick={() => openEdit(v)}>Edit</button>
                      <button style={{ ...s.btn, ...s.btnDanger }} onClick={() => deactivate(v)}>
                        Deactivate
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {modalOpen && (
        <VendorModal
          vendor={editing}
          onClose={() => { setModalOpen(false); setEditing(null); }}
          onSaved={handleSaved}
        />
      )}
    </div>
  );
}

const s = {
  page: { padding: "32px 36px", fontFamily: "'DM Sans', sans-serif" },
  header: { display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 20 },
  h1: { margin: 0, fontSize: 24, fontWeight: 700, color: "#0f172a" },
  sub: { margin: "4px 0 0", fontSize: 14, color: "#64748b" },
  addBtn: { background: "#6366f1", color: "#fff", border: "none", borderRadius: 8, padding: "10px 18px", fontSize: 14, fontWeight: 600, cursor: "pointer" },
  tabs: { display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 14 },
  tab: { padding: "8px 16px", borderRadius: 20, border: "1px solid #cbd5e1", background: "#fff", color: "#475569", fontSize: 14, fontWeight: 500, cursor: "pointer" },
  tabActive: { background: "#0f172a", color: "#fff", borderColor: "#0f172a" },
  search: { width: "100%", maxWidth: 360, boxSizing: "border-box", padding: "9px 12px", border: "1px solid #cbd5e1", borderRadius: 8, fontSize: 14, marginBottom: 16, fontFamily: "inherit" },
  card: { background: "#fff", borderRadius: 12, border: "1px solid #e2e8f0" },
  table: { width: "100%", borderCollapse: "collapse" },
  th: { textAlign: "left", padding: "12px 16px", fontSize: 12, fontWeight: 600, color: "#64748b", textTransform: "uppercase", letterSpacing: 0.5, borderBottom: "1px solid #e2e8f0", background: "#f8fafc" },
  td: { padding: "12px 16px", fontSize: 14, color: "#1e293b", borderBottom: "1px solid #f1f5f9", verticalAlign: "middle" },
  tel: { color: "#4f46e5", textDecoration: "none", fontWeight: 500 },
  callBtn: { display: "inline-block", marginRight: 6, padding: "5px 12px", borderRadius: 6, background: "#16a34a", color: "#fff", fontSize: 13, fontWeight: 600, textDecoration: "none" },
  btn: { marginRight: 6, padding: "5px 12px", borderRadius: 6, border: "1px solid #cbd5e1", background: "#fff", color: "#334155", fontSize: 13, cursor: "pointer" },
  btnDanger: { color: "#b91c1c", borderColor: "#fecaca" },
  pillOn: { background: "#dcfce7", color: "#166534", padding: "3px 10px", borderRadius: 10, fontSize: 12, fontWeight: 600 },
  pillOff: { background: "#fee2e2", color: "#991b1b", padding: "3px 10px", borderRadius: 10, fontSize: 12, fontWeight: 600 },
  muted: { color: "#94a3b8" },
  error: { color: "#b91c1c" },
};

export default VendorDirectory;