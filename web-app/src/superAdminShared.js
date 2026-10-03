// Small helpers shared by the Super Admin pages (Dashboard, Companies,
// ViewUsers). Kept dependency-free so the pages stay consistent.
import { useEffect, useState } from "react";

export const API = process.env.REACT_APP_API_URL || "http://localhost:8000";

// Same order as the mockup and as the backend's role_counts.
export const DASHBOARD_ROLES = [
  { key: "Company Admin",    label: "Company Admins",    color: "#7c3aed", icon: "◆"  },
  { key: "Regional Manager", label: "Regional Managers", color: "#6366f1", icon: "🛡️" },
  { key: "Property Manager", label: "Property Managers", color: "#0ea5e9", icon: "🏢" },
  { key: "Tenant",           label: "Tenants",           color: "#10b981", icon: "🏠" },
  { key: "Vendor",           label: "Vendors",           color: "#f59e0b", icon: "🔧" },
  { key: "Owner",            label: "Owners",            color: "#ec4899", icon: "👑" },
];

export function apiGet(path, token, params) {
  const url = new URL(`${API}${path}`);
  Object.entries(params || {}).forEach(([k, v]) => {
    if (v !== undefined && v !== null && v !== "") url.searchParams.set(k, v);
  });
  return fetch(url.toString(), { headers: { Authorization: `Bearer ${token}` } });
}

// Expired / invalid JWT: same behaviour the other pages use — clear the
// session and go back to the login screen.
export function endSession(navigate) {
  sessionStorage.clear();
  navigate("/");
}

// The API returns naive UTC timestamps ("2026-01-10T08:00:00"); mark them as
// UTC so the browser converts to the viewer's local date correctly.
export function formatDate(value) {
  if (!value) return "—";
  const str = String(value);
  const hasZone = /(Z|[+-]\d\d:?\d\d)$/.test(str);
  const d = new Date(hasZone ? str : `${str}Z`);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-US", { month: "short", day: "2-digit", year: "numeric" });
}

export function initials(name) {
  const parts = String(name || "?").trim().split(/[\s_-]+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
}

export function useDebounced(value, delay = 300) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return debounced;
}
