import React from "react";
  import { BrowserRouter as Router, Routes, Route } from "react-router-dom";

  import Login from "./Login";
  import ResetPassword from "./ResetPassword";

  import Layout from "./Layout";
  import Dashboard from "./Dashboard";       // Super Admin Dashboard
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
  import CreateUser from "./CreateUser";
  import CompanyPortal from "./CompanyPortal";
  import CompanySettings from "./CompanySettings";

  import OwnerLayout from "./OwnerLayout";
  import OwnerDashboard from "./OwnerDashboard";
  import OwnerProperties from "./OwnerProperties";
  import OwnerPropertyDetail from "./OwnerPropertyDetail";
  import OwnerApprovals from "./OwnerApprovals";
  import OwnerReports from "./OwnerReports";

  import TenantLayout from "./TenantLayout";
  import TenantDashboard from "./TenantDashboard";
  import TenantMaintenance from "./TenantMaintenance";
  import TenantPayments from "./TenantPayments";

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

          {/* ── SUPER ADMIN ──────────────────────────────────── */}
          <Route element={<Layout />}>
            <Route path="/dashboard"             element={<Dashboard />} />
            <Route path="/users/manage"          element={<ViewUsers />} />
          </Route>

          {/* ── ADMIN ────────────────────────────────────────── */}
<Route path="/admin"                   element={<AdminLayout />}>
  <Route path="dashboard"              element={<AdminDashboard />} />
  <Route path="users"                  element={<AdminUsers />} />
  <Route path="settings"               element={<CompanySettings />} />
</Route>

          {/* ── PROPERTY MANAGER ─────────────────────────────── */}
          <Route path="/pm"                      element={<PMLayout />}>
            <Route path="dashboard"              element={<PMDashboard />} />
            <Route path="create"                 element={<PMCreate />} />
            <Route path="properties" element={<PropertyManagement />} />
            <Route path="manage"                 element={<PMUserManagement />} />
            <Route path="users/create"           element={<CreateUser />} />
            <Route path="users/view"             element={<ViewUsers />} />
          </Route>

          {/* ── OWNER ────────────────────────────────────────── */}
          <Route path="/owner"                   element={<OwnerLayout />}>
            <Route path="dashboard"              element={<OwnerDashboard />} />
            <Route path="properties"             element={<OwnerProperties />} />
            <Route path="properties/:id"         element={<OwnerPropertyDetail />} />
            <Route path="approvals"              element={<OwnerApprovals />} />
            <Route path="reports"                element={<OwnerReports />} />
          </Route>

          {/* ── TENANT ───────────────────────────────────────── */}
          <Route path="/tenant"                  element={<TenantLayout />}>
            <Route path="dashboard"              element={<TenantDashboard />} />
            <Route path="maintenance"            element={<TenantMaintenance />} />
            <Route path="maintenance/new"        element={<TenantMaintenance autoOpen />} />
            <Route path="payments"               element={<TenantPayments />} />
          </Route>

        </Routes>
      </Router>
    );
  }

  export default App;