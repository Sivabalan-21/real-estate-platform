import React from "react";
import { BrowserRouter as Router, Routes, Route, Navigate, useLocation } from "react-router-dom";

import Login from "./Login";
import RateTicket from "./RateTicket";
import ResetPassword from "./ResetPassword";

import Layout from "./Layout";
import Dashboard from "./Dashboard";       // Super Admin Dashboard
import Companies from "./Companies";         // Super Admin Company Management
import ViewUsers from "./ViewUsers";       // Super Admin User Management (Create / Edit / Delete)
import Register from "./Register";         // Invite-based self-registration

import AdminDashboard from "./AdminDashboard";
import AdminLayout from "./AdminLayout";
import AdminUsers from "./AdminUsers";

import PMDashboard from "./PMDashboard";
import PMLayout from "./PMLayout";
import PropertyManagement from "./PropertyManagement";
import PMUserManagement from "./PMUserManagement";
import PMCreate from "./PMCreate";
import PMTickets from "./PMTickets";
import PMTicketDetail from "./PMTicketDetail";
import CreateUser from "./CreateUser";
import CompanyPortal from "./CompanyPortal";
import UploadLogo from "./UploadLogo";
import CompanySettings from "./CompanySettings";

import OwnerLayout from "./OwnerLayout";
import OwnerDashboard from "./OwnerDashboard";
import OwnerProperties from "./OwnerProperties";
import OwnerPropertyDetail from "./OwnerPropertyDetail";
import OwnerApprovals from "./OwnerApprovals";
import OwnerReports from "./OwnerReports";
import OwnerTickets from "./OwnerTickets";
import OwnerTicketDetail from "./OwnerTicketDetail";

import TenantLayout from "./TenantLayout";
import TenantDashboard from "./TenantDashboard";
import TenantMaintenance from "./TenantMaintenance";
import MaintenanceNew from "./MaintenanceNew";
import MaintenanceDetail from "./MaintenanceDetail";
import TenantPayments from "./TenantPayments";


import VendorLayout from "./VendorLayout";
import VendorDashboard from "./VendorDashboard";
import VendorJobDetail from "./VendorJobDetail";
import VendorDirectory from './VendorDirectory';
import VendorAccess from "./VendorAccess";

// Blocks access to a role-specific route group before it renders, instead
// of letting the page mount and show an empty/wrong state to the wrong
// role. Redirects to the person's own dashboard rather than a dead end.
//
// When nobody is signed in, the page they were trying to open is passed to
// the login screen (state.from) so that, after signing in, they land back on
// it -- e.g. the ticket link in a "ticket closed" email.
function RequireRole({ allowed, children }) {
  const role = sessionStorage.getItem("role");
  const location = useLocation();

  if (!role) {
    return (
      <Navigate
        to="/"
        replace
        state={{ from: `${location.pathname}${location.search}` }}
      />
    );
  }

  if (!allowed.includes(role)) {
    const home = {
      "Super Admin": "/dashboard",
      "Company Admin": "/admin/dashboard",
      "Regional Manager": "/admin/dashboard",
      "Property Manager": "/pm/dashboard",
      "Owner": "/owner/dashboard",
      "Tenant": "/tenant/dashboard",
    }[role] || "/";

    return <Navigate to={home} replace />;
  }

  return children;
}

function App() {
  return (
    <Router>
      <Routes>
        
        <Route path="/portal/:slug" element={<CompanyPortal />} />
        {/* ── AUTH ─────────────────────────────────────────── */}
        <Route path="/"                        element={<Login />} />
        <Route path="/reset-password/:token"   element={<ResetPassword />} />

        {/* ── REGISTRATION (invite link, no auth needed) ───── */}
        <Route path="/register/:token"         element={<Register />} />
        <Route path="/upload-logo/:token" element={<UploadLogo />} />
        <Route path="/vendor-access/:token"    element={<VendorAccess />} />
        <Route path="/rate/:token"             element={<RateTicket />} />
        {/* Alias per spec (/vendor/:token). Static /vendor/dashboard etc. still win. */}
        <Route path="/vendor/:token"           element={<VendorAccess />} />

        {/* ── SUPER ADMIN ──────────────────────────────────── */}
        <Route element={<Layout />}>
          <Route path="/dashboard"             element={<Dashboard />} />
          <Route path="/companies/manage"      element={<RequireRole allowed={["Super Admin"]}><Companies /></RequireRole>} />
          <Route path="/users/manage"          element={<ViewUsers />} />
        </Route>

        {/* ── ADMIN ────────────────────────────────────────── */}
        <Route path="/admin" element={<RequireRole allowed={["Company Admin", "Regional Manager", "Super Admin"]}><AdminLayout /></RequireRole>}>
          <Route path="dashboard"              element={<AdminDashboard />} />
          <Route path="users"                  element={<AdminUsers />} />
          <Route path="settings"               element={<CompanySettings />} />
        </Route>

        {/* ── PROPERTY MANAGER ─────────────────────────────── */}
        <Route path="/pm" element={<RequireRole allowed={["Property Manager"]}><PMLayout /></RequireRole>}>
          <Route path="dashboard"              element={<PMDashboard />} />
          <Route path="create"                 element={<PMCreate />} />
          <Route path="properties" element={<PropertyManagement />} />
          <Route path="manage"                 element={<PMUserManagement />} />
          <Route path="users/create"           element={<CreateUser />} />
          <Route path="users/view"             element={<ViewUsers />} />
          <Route path="tickets"                element={<PMTickets />} />
          <Route path="tickets/:id"            element={<PMTicketDetail />} />
          <Route path="vendors"                element={<VendorDirectory />} />
        </Route>

        {/* ── OWNER ────────────────────────────────────────── */}
        <Route path="/owner" element={<RequireRole allowed={["Owner"]}><OwnerLayout /></RequireRole>}>
          <Route path="dashboard"              element={<OwnerDashboard />} />
          <Route path="properties"             element={<OwnerProperties />} />
          <Route path="properties/:id"         element={<OwnerPropertyDetail />} />
          <Route path="tickets"                element={<OwnerTickets />} />
          <Route path="tickets/:id"             element={<OwnerTicketDetail />} />
          <Route path="approvals"              element={<OwnerApprovals />} />
          <Route path="approvals/:id"          element={<OwnerApprovals />} />
          <Route path="reports"                element={<OwnerReports />} />
        </Route>

        {/* ── TENANT ───────────────────────────────────────── */}
        <Route path="/tenant" element={<RequireRole allowed={["Tenant"]}><TenantLayout /></RequireRole>}>
          <Route path="dashboard"              element={<TenantDashboard />} />
          <Route path="maintenance"            element={<TenantMaintenance />} />
          <Route path="maintenance/new"        element={<MaintenanceNew />} />
          <Route path="maintenance/:id"        element={<MaintenanceDetail />} />
          <Route path="payments"               element={<TenantPayments />} />
        </Route>

        <Route path="/vendor" element={<RequireRole allowed={["Vendor"]}><VendorLayout /></RequireRole>}>
          <Route path="dashboard" element={<VendorDashboard />} />
          <Route path="jobs/:id" element={<VendorJobDetail />} />
          <Route path="directory" element={<VendorDirectory />} />
        </Route>

      </Routes>
    </Router>
  );
}

export default App;