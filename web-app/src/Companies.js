import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { apiGet, endSession, formatDate, initials } from "./superAdminShared";

const PAGE_SIZE = 10;

const SORTS = {
  "name-asc":   { label: "Name A → Z",          fn: (a, b) => collator.compare(a.name || "", b.name || "") },
  "name-desc":  { label: "Name Z → A",          fn: (a, b) => collator.compare(b.name || "", a.name || "") },
  "newest":     { label: "Newest",              fn: (a, b) => time(b) - time(a) },
  "oldest":     { label: "Oldest",              fn: (a, b) => time(a) - time(b) },
  "users-desc": { label: "User Count High → Low", fn: (a, b) => (b.user_count || 0) - (a.user_count || 0) },
  "users-asc":  { label: "User Count Low → High", fn: (a, b) => (a.user_count || 0) - (b.user_count || 0) },
};
const collator = new Intl.Collator(undefined, { sensitivity: "base", numeric: true });
const time = (c) => (c.created_at ? new Date(c.created_at).getTime() : 0);

function Companies() {
  const navigate = useNavigate();
  const token = sessionStorage.getItem("token");

  const [companies, setCompanies] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState("name-asc");
  const [page, setPage] = useState(1);

  const fetchCompanies = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await apiGet("/companies", token, { scope: "all" });
      if (res.status === 401) { endSession(navigate); return; }
      if (res.status === 403) { setError("You are not authorized to view companies."); return; }
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
    const list = q
      ? companies.filter(c =>
          c.name?.toLowerCase().includes(q) ||
          c.company_code?.toLowerCase().includes(q) ||
          c.slug?.toLowerCase().includes(q))
      : companies;
    return [...list].sort(SORTS[sort].fn);
  }, [companies, search, sort]);

  useEffect(() => { setPage(1); }, [search, sort]);

  const pages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, pages);
  const start = (safePage - 1) * PAGE_SIZE;
  const rows = filtered.slice(start, start + PAGE_SIZE);

  const open = (c) => navigate(`/users/manage?company_id=${encodeURIComponent(c.id)}`);

  return (
    <div style={s.page}>
      <div style={s.header}>
        <div>
          <h1 style={s.pageTitle}>Companies</h1>
          <p style={s.pageSub}>Manage all companies in the system. Click a company to view and manage its users.</p>
        </div>
        <div style={{ display: "flex", gap: 10 }}>
          <button style={s.secondaryBtn} onClick={fetchCompanies} disabled={loading}>Refresh</button>
          {/* Companies are created when a Company Admin is invited, so this
              opens the existing invite flow pre-set to that role. */}
          <button style={s.primaryBtn} onClick={() => navigate("/users/manage?invite=company-admin")}>
            + Add Company
          </button>
        </div>
      </div>

      <div style={s.filters}>
        <div style={s.searchWrap}>
          <span style={s.searchIcon}>⌕</span>
          <input
            style={s.searchInput}
            placeholder="Search companies by name, code, slug..."
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
        <div>
          <label style={s.label}>Sort By</label>
          <select style={s.select} value={sort} onChange={e => setSort(e.target.value)}>
            {Object.entries(SORTS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
          </select>
        </div>
      </div>

      <div style={s.tableWrap}>
        {loading ? (
          <div style={s.empty}>Loading companies…</div>
        ) : error ? (
          <div style={{ ...s.empty, color: "#ef4444" }}>
            {error} <button style={s.linkBtn} onClick={fetchCompanies}>Retry</button>
          </div>
        ) : filtered.length === 0 ? (
          <div style={s.empty}>{companies.length === 0 ? "No companies found" : "No companies match your search"}</div>
        ) : (
          <table style={s.table}>
            <thead>
              <tr style={s.thead}>
                <th style={s.th}>#</th>
                <th style={s.th}>Company Name</th>
                <th style={s.th}>Company Code</th>
                <th style={s.th}>Slug</th>
                <th style={{ ...s.th, textAlign: "right" }}>Users</th>
                <th style={s.th}>Created On</th>
                <th style={{ ...s.th, textAlign: "right" }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((c, i) => (
                <tr
                  key={c.id} style={s.tr} tabIndex={0}
                  onClick={() => open(c)}
                  onKeyDown={e => { if (e.key === "Enter") open(c); }}
                  title={`View users of ${c.name}`}
                >
                  <td style={{ ...s.td, color: "#94a3b8" }}>{start + i + 1}</td>
                  <td style={s.td}>
                    <div style={s.nameCell}>
                      <div style={s.avatar}>{initials(c.name)}</div>
                      <span style={s.name}>{c.name}</span>
                    </div>
                  </td>
                  <td style={s.td}>{c.company_code ? <span style={s.codeChip}>{c.company_code}</span> : "—"}</td>
                  <td style={{ ...s.td, ...s.mono }}>{c.slug || "—"}</td>
                  <td style={{ ...s.td, textAlign: "right" }}>
                    <span style={c.user_count ? s.count : s.countZero}>{c.user_count}</span>
                  </td>
                  <td style={s.td}>{formatDate(c.created_at)}</td>
                  <td style={{ ...s.td, textAlign: "right", color: "#94a3b8", fontSize: 20 }}>›</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {!loading && !error && filtered.length > 0 && (
        <div style={s.footer}>
          <span style={s.footerText}>
            Showing {start + 1} to {start + rows.length} of {filtered.length} {filtered.length === 1 ? "company" : "companies"}
          </span>
          {pages > 1 && (
            <div style={s.pager}>
              <button style={s.pageBtn} disabled={safePage === 1} onClick={() => setPage(safePage - 1)}>‹</button>
              {Array.from({ length: pages }, (_, i) => i + 1).map(n => (
                <button key={n} style={{ ...s.pageBtn, ...(n === safePage ? s.pageBtnActive : {}) }} onClick={() => setPage(n)}>{n}</button>
              ))}
              <button style={s.pageBtn} disabled={safePage === pages} onClick={() => setPage(safePage + 1)}>›</button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

const s = {
  page:         { padding: 32, background: "#f8fafc", minHeight: "100vh", fontFamily: "'DM Sans', sans-serif", margin: -20 },
  header:       { display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 24, gap: 12, flexWrap: "wrap" },
  pageTitle:    { margin: 0, fontSize: 24, fontWeight: 700, color: "#0f172a" },
  pageSub:      { margin: "4px 0 0", fontSize: 13, color: "#64748b" },
  primaryBtn:   { background: "#6366f1", color: "#fff", border: "none", padding: "9px 18px", borderRadius: 8, cursor: "pointer", fontWeight: 600, fontSize: 13 },
  secondaryBtn: { background: "#fff", color: "#475569", border: "1px solid #e2e8f0", padding: "9px 18px", borderRadius: 8, cursor: "pointer", fontWeight: 600, fontSize: 13 },
  filters:      { display: "flex", gap: 16, marginBottom: 20, flexWrap: "wrap", alignItems: "flex-end" },
  searchWrap:   { position: "relative", flex: "1 1 280px", minWidth: 220 },
  searchIcon:   { position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", color: "#94a3b8", fontSize: 18 },
  searchInput:  { width: "100%", padding: "10px 12px 10px 36px", border: "1px solid #e2e8f0", borderRadius: 8, fontSize: 13, outline: "none", boxSizing: "border-box", background: "#fff" },
  label:        { display: "block", fontSize: 11.5, color: "#64748b", marginBottom: 4, fontWeight: 600 },
  select:       { padding: "10px 12px", border: "1px solid #e2e8f0", borderRadius: 8, fontSize: 13, background: "#fff", minWidth: 190 },
  tableWrap:    { background: "#fff", borderRadius: 12, boxShadow: "0 1px 4px rgba(15,23,42,.07)", overflowX: "auto" },
  table:        { width: "100%", borderCollapse: "collapse", minWidth: 720 },
  thead:        { background: "#f8fafc" },
  th:           { padding: "12px 16px", fontSize: 12, fontWeight: 600, color: "#64748b", textAlign: "left", textTransform: "uppercase", letterSpacing: .5 },
  tr:           { borderTop: "1px solid #f1f5f9", cursor: "pointer" },
  td:           { padding: "14px 16px", verticalAlign: "middle", fontSize: 13 },
  nameCell:     { display: "flex", alignItems: "center", gap: 10 },
  avatar:       { width: 34, height: 34, borderRadius: 8, background: "#4f46e5", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700, fontSize: 12, flexShrink: 0 },
  name:         { fontWeight: 600, color: "#0f172a" },
  codeChip:     { display: "inline-block", padding: "2px 8px", borderRadius: 4, background: "#f1f5f9", color: "#334155", fontFamily: "monospace", fontSize: 12, fontWeight: 700, border: "1px solid #e2e8f0" },
  mono:         { color: "#64748b", fontFamily: "monospace", fontSize: 12 },
  count:        { fontWeight: 700, color: "#0f172a", fontVariantNumeric: "tabular-nums" },
  countZero:    { fontWeight: 600, color: "#94a3b8" },
  empty:        { padding: 40, textAlign: "center", color: "#94a3b8", fontSize: 14 },
  linkBtn:      { background: "none", border: "none", color: "#6366f1", cursor: "pointer", fontWeight: 600, fontSize: 14, textDecoration: "underline" },
  footer:       { display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 14, flexWrap: "wrap", gap: 8 },
  footerText:   { fontSize: 12.5, color: "#64748b" },
  pager:        { display: "flex", gap: 6 },
  pageBtn:      { minWidth: 32, height: 32, border: "1px solid #e2e8f0", background: "#fff", borderRadius: 6, cursor: "pointer", fontSize: 13 },
  pageBtnActive:{ background: "#6366f1", color: "#fff", borderColor: "#6366f1" },
};

export default Companies;
