import React, { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom'; 
import './Login.css';

function Login() {
  const [formData, setFormData] = useState({
    username: '',
    password: '',
    role: 'Super Admin'
  });

  const [status, setStatus] = useState({ message: '', type: '' });
  const navigate = useNavigate();
  const location = useLocation();

  // Set by RequireRole when someone opens a protected link (e.g. the ticket
  // link in an email) while signed out. Only same-site paths are accepted.
  const rawFrom = location.state?.from;
  const returnTo =
    typeof rawFrom === 'string' && rawFrom.startsWith('/') && !rawFrom.startsWith('//')
      ? rawFrom
      : null;

  const handleChange = (event) => {
    setFormData({
      ...formData,
      [event.target.name]: event.target.value.trim()
    });
  };

  const handleSubmit = async (event) => {
    event.preventDefault();

    setStatus({ message: 'Logging in...', type: 'success' });

    try {
      const response = await fetch("http://localhost:8000/auth/login", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify(formData)
      });

      const data = await response.json();

      if (data.access_token) {
        const payload = JSON.parse(atob(data.access_token.split('.')[1]));

      // 🔥 CLEAR OLD DATA FIRST
        sessionStorage.clear();

      // 🔥 SET NEW SESSION DATA
        sessionStorage.setItem("token", data.access_token);
        sessionStorage.setItem("role", payload.role);
        sessionStorage.setItem("username", payload.sub);
        sessionStorage.setItem("display_name", data.full_name || payload.sub);
        sessionStorage.setItem("company_name", data.company_name || "");
        sessionStorage.setItem("company_slug", data.company_slug || "");
        sessionStorage.setItem("status", data.status || "active");

        setStatus({ message: 'Login successful', type: 'success' });

        setTimeout(() => {
          const role = payload.role;

          // Came here from a protected link: go back to it. If this role
          // isn't allowed there, RequireRole sends them to their own home.
          if (returnTo) {
            navigate(returnTo, { replace: true });
            return;
          }

          if (role === "Super Admin") {
            navigate("/dashboard"); // your current super admin dashboard
          } 
          else if (role === "Company Admin") {
            navigate("/admin/dashboard");
          }
          else if (role === "Regional Manager") {
            navigate("/admin/dashboard");
          } 
          else if (role === "Property Manager") {
            navigate("/pm/dashboard");
          } 
          else if (role === "Tenant") {
            navigate("/tenant/dashboard");
          } 
          else if (role === "Owner") {
            navigate("/owner/dashboard");
          } 
          else if (role === "Vendor") {
            navigate("/vendor/dashboard");
          } 
          else {
            navigate("/");
          }

        }, 800);

      } else {
        setStatus({ message: 'Invalid credentials', type: 'error' });
      }

    } catch (error) {
      console.error(error);
      setStatus({ message: 'Server error', type: 'error' });
    }
  };

  return (
    <div className="login-page-container">
      <div className="login-card">
        
        <div className="login-header">
          <div style={{
  width: "70px",
  height: "70px",
  background: "#2563eb",
  borderRadius: "16px",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  margin: "0 auto 16px",
  color: "#ffffff",
  fontWeight: "600",
  fontSize: "16px",
  letterSpacing: "0.5px"
}}>
  Logo
</div>
          
          <h2>Property Portal</h2>
          <p>Sign in to manage your real estate</p>
        </div>

        <form onSubmit={handleSubmit}>
          
          <div className="input-group">
            <label>Username</label>
            <input 
              type="text" 
              name="username" 
              className="input-field"
              value={formData.username} 
              onChange={handleChange} 
              required 
            />
          </div>

          <div className="input-group">
            <label>Password</label>
            <input 
              type="password" 
              name="password" 
              className="input-field"
              value={formData.password} 
              onChange={handleChange} 
              required 
            />
          </div>

          <div className="input-group">
            <label>Account Role</label>
            <select 
              name="role" 
              className="input-field"
              value={formData.role} 
              onChange={handleChange}
            >
              <option value="Super Admin">Super Admin</option>
              <option value="Company Admin">Company Admin</option>
              <option value="Regional Manager">Regional Manager</option>
              <option value="Property Manager">Property Manager</option>
              <option value="Tenant">Tenant</option>
              <option value="Owner">Owner</option>
              <option value="Vendor">Vendor</option>
            </select>
          </div>

          <button type="submit" className="submit-btn">
            Sign In
          </button>
        </form>

        {status.message && (
          <div className={`status-message ${status.type === 'error' ? 'status-error' : 'status-success'}`}>
            {status.message}
          </div>
        )}
      </div>
    </div>
  );
}

export default Login;