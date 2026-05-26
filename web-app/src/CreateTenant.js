import React, { useState } from "react";

function CreateTenant() {
  const token = localStorage.getItem("token");

  const [form, setForm] = useState({
    username: "",
    email: "",
    property_name: "",
    unit_name: "",
    owner_name: "",
    base_rent: "",
    lease_start: ""
  });

  const handleChange = (key, value) => {
    setForm({ ...form, [key]: value });
  };

  const handleSubmit = async () => {
    const res = await fetch("http://localhost:8000/tenant/create", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify(form)
    });

    if (res.ok) {
      alert("Tenant created successfully");
    } else {
      alert("Error creating tenant");
    }
  };

  return (
    <div style={styles.page}>
      <div style={styles.card}>
        <h2>Add Tenant</h2>

        <h4>Basic Info</h4>
        <input style={styles.input} placeholder="Username"
          onChange={(e) => handleChange("username", e.target.value)} />

        <input style={styles.input} placeholder="Email"
          onChange={(e) => handleChange("email", e.target.value)} />

        <h4>Property Details</h4>
        <input style={styles.input} placeholder="Property Name"
          onChange={(e) => handleChange("property_name", e.target.value)} />

        <input style={styles.input} placeholder="Unit Name"
          onChange={(e) => handleChange("unit_name", e.target.value)} />

        <input style={styles.input} placeholder="Owner Name"
          onChange={(e) => handleChange("owner_name", e.target.value)} />

        <h4>Lease Details</h4>
        <input style={styles.input} type="number" placeholder="Base Rent"
          onChange={(e) => handleChange("base_rent", e.target.value)} />

        <input style={styles.input} type="date"
          onChange={(e) => handleChange("lease_start", e.target.value)} />

        <button style={styles.button} onClick={handleSubmit}>
          Create Tenant
        </button>
      </div>
    </div>
  );
}

const styles = {
  page: {
    padding: "40px",
    background: "#f5f7fa",
    minHeight: "100vh"
  },
  card: {
    maxWidth: "500px",
    margin: "auto",
    background: "#fff",
    padding: "25px",
    borderRadius: "10px",
    display: "flex",
    flexDirection: "column",
    gap: "10px"
  },
  input: {
    padding: "10px",
    border: "1px solid #ccc",
    borderRadius: "6px"
  },
  button: {
    padding: "12px",
    background: "#2563eb",
    color: "#fff",
    border: "none",
    borderRadius: "6px"
  }
};

export default CreateTenant;