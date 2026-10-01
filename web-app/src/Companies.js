import React, { useEffect, useState, useMemo, useCallback } from "react";
import { useNavigate } from "react-router-dom";

const API = process.env.REACT_APP_API_URL || "http://localhost:8000";

// ─── MAIN COMPONENT ──────────────────────────────────────────────────────────
function Companies() {
  const navigate = useNavigate();
  const token = localStorage.getItem("token");

  const [companies, setCompanies] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");

  const fetchCompanies = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch(`${API}/companies?scope=all`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.status === 401) { navigate("/"); return; }
      if (res.status === 403) {
        setError("You are not authorized to view companies.");
        return;
      }
      if (!res.ok) throw new Error();
      const data = await res.json();
      setCompanies(Array.isArray(data) ? data : []);
    } catch {
      setError("Failed to load companies.");
    } finally {
      setLoading(false);
    }
  }, [token, navigate]);

  useEffect(() => { fetchCompanies(); }, [fetchCompanies]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return companies;
    return companies.filter(c =>
      c.name?.toLowerCase().includes(q) ||
      c.company_code?.toLowerCase().includes(q) ||
      c.slug?.toLowerCase().includes(q)
    );
  }, [companies, search]);

  const totalUsers = companies.reduce((sum, c) => sum + (c.user_count || 0), 0);

  return (
    <div style={s.page}>
      <div style={s.header}>
        <div>
          <h1 style={s.pageTitle}>Company Management</h1>
          <p style={s.pageSub}>
            {loading
              ? "Loading…"
              : `${companies.length} ${companies.length === 1 ? "company" : "companies"} · ${totalUsers} ${totalUsers === 1 ? "user" : "users"}`}
          </p>
        </div>
        <button style={s.secondaryBtn} onClick={fetchCompanies} disabled={loading}>
          Refresh
        </button>
      </div>

      <div style={s.filters}>
        <div style={s.searchWrap}>
          <span style={s.searchIcon}>⌕</span>
          <input
            style={s.searchInput}
            placeholder="Search by name, code or slug…"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
      </div>

      <div style={s.tableWrap}>
        {loading ? (
          <div style={s.empty}>Loading companies…</div>
        ) : error ? (
          <div style={{ ...s.empty, color: "#ef4444" }}>
            {error}{" "}
            <button style={s.linkBtn} onClick={fetchCompanies}>Retry</button>
          </div>
        ) : filtered.length === 0 ? (
          <div style={s.empty}>
            {companies.length === 0 ? "No companies found" : "No companies match your search"}
          </div>
        ) : (
          <table style={s.table}>
            <thead>
              <tr style={s.thead}>
                <th style={s.th}>Company Name</th>
                <th style={s.th}>Company Code</th>
                <th style={s.th}>Slug</th>
                <th style={{ ...s.th, textAlign: "right" }}>User Count</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(c => (
                <tr key={c.id} style={s.tr}>
                  <td style={s.td}>
                    <div style={s.nameCell}>
                      <div style={s.avatar}>{(c.name || "?")[0].toUpperCase()}</div>
                      <span style={s.name}>{c.name}</span>
                    </div>
                  </td>
                  <td style={s.td}>
                    {c.company_code
                      ? <span style={s.codeChip}>{c.company_code}</span>
                      : <span style={{ color: "#94a3b8" }}>—</span>}
                  </td>
                  <td style={s.td}>
                    {c.slug
                      ? <span style={s.slug}>{c.slug}</span>
                      : <span style={{ color: "#94a3b8" }}>—</span>}
                  </td>
                  <td style={{ ...s.td, textAlign: "right" }}>
                    <span style={c.user_count ? s.count : s.countZero}>{c.user_count}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

// Same tokens as ViewUsers.js so both pages look like one product.
const s = {
  page:         { padding: "32px", background: "#f8fafc", minHeight: "100vh", fontFamily: "'DM Sans', sans-serif" },
  header:       { display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 24, gap: 12, flexWrap: "wrap" },
  pageTitle:    { margin: 0, fontSize: 24, fontWeight: 700, color: "#0f172a" },
  pageSub:      { margin: "4px 0 0", fontSize: 13, color: "#64748b" },
  secondaryBtn: { background: "#fff", color: "#475569", border: "1px solid #e2e8f0", padding: "9px 18px", borderRadius: 8, cursor: "pointer", fontWeight: 600, fontSize: 13 },
  filters:      { display: "flex", gap: 12, marginBottom: 20, flexWrap: "wrap", alignItems: "center" },
  searchWrap:   { position: "relative", flex: "0 1 280px", minWidth: 200 },
  searchIcon:   { position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", color: "#94a3b8", fontSize: 18 },
  searchInput:  { width: "100%", padding: "9px 12px 9px 36px", border: "1px solid #e2e8f0", borderRadius: 8, fontSize: 13, outline: "none", boxSizing: "border-box" },
  tableWrap:    { background: "#fff", borderRadius: 12, boxShadow: "0 1px 4px rgba(0,0,0,.06)", overflowX: "auto" },
  table:        { width: "100%", borderCollapse: "collapse", minWidth: 560 },
  thead:        { background: "#f8fafc" },
  th:           { padding: "12px 16px", fontSize: 12, fontWeight: 600, color: "#64748b", textAlign: "left", textTransform: "uppercase", letterSpacing: .5 },
  tr:           { borderTop: "1px solid #f1f5f9" },
  td:           { padding: "14px 16px", verticalAlign: "middle", fontSize: 13 },
  nameCell:     { display: "flex", alignItems: "center", gap: 10 },
  avatar:       { width: 34, height: 34, borderRadius: "50%", background: "#ede9fe", color: "#6366f1", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700, fontSize: 14, flexShrink: 0 },
  name:         { fontWeight: 600, color: "#0f172a" },
  codeChip:     { display: "inline-block", padding: "2px 8px", borderRadius: 4, background: "#f1f5f9", color: "#334155", fontFamily: "monospace", fontSize: 12, fontWeight: 700, letterSpacing: 0.5, border: "1px solid #e2e8f0" },
  slug:         { color: "#64748b", fontFamily: "monospace", fontSize: 12 },
  count:        { fontWeight: 700, color: "#0f172a", fontVariantNumeric: "tabular-nums" },
  countZero:    { fontWeight: 600, color: "#94a3b8", fontVariantNumeric: "tabular-nums" },
  empty:        { padding: 40, textAlign: "center", color: "#94a3b8", fontSize: 14 },
  linkBtn:      { background: "none", border: "none", color: "#6366f1", cursor: "pointer", fontWeight: 600, fontSize: 14, textDecoration: "underline" },
};

export default Companies;
