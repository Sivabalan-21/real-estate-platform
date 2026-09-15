// Single source of truth for role hierarchy on the frontend.
// Must stay in sync with auth-backend/rbac.py's ROLE_HIERARCHY —
// if you change one, change the other.

export const ROLE_OPTIONS_BY_CURRENT_ROLE = {
  "Super Admin":    ["Company Admin", "Regional Manager", "Property Manager", "Tenant", "Owner", "Vendor"],
  "Company Admin":  ["Regional Manager", "Property Manager", "Owner", "Tenant"],
  "Regional Manager": ["Property Manager"],
  "Property Manager": ["Tenant", "Vendor"],
};

export const ROLE_META = {
  "Company Admin":     { color: "#7c3aed", bg: "#f3e8ff", icon: "◆" },
  "Regional Manager":  { color: "#6366f1", bg: "#ede9fe", icon: "🛡️" },
  "Property Manager":  { color: "#0ea5e9", bg: "#e0f2fe", icon: "🏢" },
  "Tenant":            { color: "#10b981", bg: "#d1fae5", icon: "🏠" },
  "Owner":             { color: "#f59e0b", bg: "#fef3c7", icon: "🏦" },
  "Vendor":            { color: "#64748b", bg: "#f1f5f9", icon: "🔧" },
};