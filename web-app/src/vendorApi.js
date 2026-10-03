// Shared helpers for the logged-in vendor pages (VendorDashboard, VendorJobDetail).
export const API = process.env.REACT_APP_API_URL || "http://localhost:8000";

export class ApiError extends Error {
  constructor(status, message, code) {
    super(message);
    this.status = status;
    this.code = code || "error";
  }
}

// Backend sends either "detail": "text" or "detail": {code, message}.
function readDetail(body, fallback) {
  const d = body && body.detail;
  if (!d) return { code: "error", message: fallback };
  if (typeof d === "string") return { code: "error", message: d };
  if (Array.isArray(d)) return { code: "error", message: d.map((x) => x.msg).join("; ") || fallback };
  return { code: d.code || "error", message: d.message || fallback };
}

export function signOut() {
  const slug = sessionStorage.getItem("company_slug");
  sessionStorage.clear();
  window.location.assign(slug ? `/portal/${slug}` : "/");
}

// Authenticated fetch. An expired/invalid session (401) signs the vendor out
// instead of leaving a page that silently shows stale or empty data.
export async function vendorFetch(path, options = {}) {
  const headers = { ...(options.headers || {}) };
  const token = sessionStorage.getItem("token");
  if (token) headers.Authorization = `Bearer ${token}`;

  let res;
  try {
    res = await fetch(`${API}${path}`, { ...options, headers });
  } catch {
    throw new ApiError(0, "Could not reach the server. Check your connection and try again.", "network");
  }

  let body = null;
  try {
    body = await res.json();
  } catch {
    /* empty or non-JSON body */
  }

  if (res.status === 401) {
    signOut();
    throw new ApiError(401, "Your session has expired. Please sign in again.", "unauthorized");
  }
  if (!res.ok) {
    const { code, message } = readDetail(body, `Request failed (${res.status})`);
    throw new ApiError(res.status, message, code);
  }
  return body;
}

// Server timestamps are naive UTC with no "Z"; without it the browser reads
// them as local time and everything looks hours old east of UTC.
export function parseServerTimestamp(value) {
  if (!value) return null;
  const s = typeof value === "string" && !/[zZ]|[+-]\d{2}:?\d{2}$/.test(value) ? `${value}Z` : value;
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d;
}

export function timeAgo(value) {
  const d = parseServerTimestamp(value);
  if (!d) return "";
  const sec = Math.max(0, Math.round((Date.now() - d.getTime()) / 1000));
  if (sec < 60) return "just now";
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min} min ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr} hr ago`;
  const day = Math.floor(hr / 24);
  if (day < 30) return `${day} day${day === 1 ? "" : "s"} ago`;
  return d.toLocaleDateString();
}

export function formatDateTime(value) {
  const d = parseServerTimestamp(value);
  return d ? d.toLocaleString([], { dateStyle: "medium", timeStyle: "short" }) : "";
}

export function formatMoney(n) {
  if (n === null || n === undefined) return "";
  return Number(n).toLocaleString(undefined, { maximumFractionDigits: 2 });
}

export const STATUS_STYLES = {
  quote_requested: { bg: "#fef3c7", fg: "#92400e" },
  quote_received: { bg: "#e0f2fe", fg: "#075985" },
  pending_owner_approval: { bg: "#ede9fe", fg: "#5b21b6" },
  approved: { bg: "#dcfce7", fg: "#166534" },
  in_progress: { bg: "#dbeafe", fg: "#1e40af" },
  completed: { bg: "#f1f5f9", fg: "#475569" },
  closed: { bg: "#f1f5f9", fg: "#475569" },
  rejected: { bg: "#fee2e2", fg: "#991b1b" },
};

export function statusStyle(status) {
  return STATUS_STYLES[status] || { bg: "#f1f5f9", fg: "#475569" };
}
