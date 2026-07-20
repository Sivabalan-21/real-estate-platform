import React, { useEffect, useState } from "react";

const API = "https://194.164.149.22/api";

function AdminProperties() {
  const token = localStorage.getItem("token");
  const [properties, setProperties] = useState([]);
  const [dimensionTypes, setDimensionTypes] = useState([]);
  const [pms, setPms] = useState([]);

  const [form, setForm] = useState({
    name: "",
    address: "",
    description: "",
    total_units: "",
    assign_to: "",
  });
  const [dimensions, setDimensions] = useState([]);
  const [newDim, setNewDim] = useState({ dimension_type_id: "", name: "", unit: "", value: "" });

  const headers = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };

  const loadProperties = () => {
    fetch(`${API}/properties`, { headers })
      .then((r) => r.json())
      .then(setProperties)
      .catch(() => {});
  };

  const loadDimensionTypes = () => {
    fetch(`${API}/dimension-types`, { headers })
      .then((r) => r.json())
      .then(setDimensionTypes)
      .catch(() => {});
  };

  const loadPMs = () => {
    fetch(`${API}/users`, { headers })
      .then((r) => r.json())
      .then((users) => setPms(users.filter((u) => u.role === "Property Manager")))
      .catch(() => {});
  };

  useEffect(() => {
    loadProperties();
    loadDimensionTypes();
    loadPMs();
  }, []);

  const addDimensionRow = () => {
    if (!newDim.value || (!newDim.dimension_type_id && !newDim.name)) return;
    setDimensions([...dimensions, newDim]);
    setNewDim({ dimension_type_id: "", name: "", unit: "", value: "" });
  };

  const removeDimensionRow = (idx) => {
    setDimensions(dimensions.filter((_, i) => i !== idx));
  };

  const submitProperty = async () => {
    if (!form.name) return alert("Property name is required");

    const payload = {
      name: form.name,
      address: form.address || null,
      description: form.description || null,
      total_units: form.total_units ? parseInt(form.total_units, 10) : 0,
      dimensions,
      assign_to: form.assign_to || null,
    };

    const res = await fetch(`${API}/properties`, {
      method: "POST",
      headers,
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      alert(err.detail || "Failed to create property");
      return;
    }

    setForm({ name: "", address: "", description: "", total_units: "", assign_to: "" });
    setDimensions([]);
    loadProperties();
    loadDimensionTypes();
  };

  const deleteProperty = async (id) => {
    if (!window.confirm("Delete this property?")) return;
    await fetch(`${API}/properties/${id}`, { method: "DELETE", headers });
    loadProperties();
  };

  return (
    <div>
      <h2>Property Management</h2>

      <div style={styles.card}>
        <h3>Add Property</h3>
        <input
          style={styles.input}
          placeholder="Property name"
          value={form.name}
          onChange={(e) => setForm({ ...form, name: e.target.value })}
        />
        <input
          style={styles.input}
          placeholder="Address"
          value={form.address}
          onChange={(e) => setForm({ ...form, address: e.target.value })}
        />
        <input
          style={styles.input}
          placeholder="Description"
          value={form.description}
          onChange={(e) => setForm({ ...form, description: e.target.value })}
        />
        <input
          style={styles.input}
          placeholder="Total units"
          type="number"
          value={form.total_units}
          onChange={(e) => setForm({ ...form, total_units: e.target.value })}
        />

        <h4>Dimensions</h4>
        {dimensions.map((d, i) => (
          <div key={i} style={styles.dimRow}>
            <span>{d.name || dimensionTypes.find((t) => t.id === d.dimension_type_id)?.name} = {d.value} {d.unit || ""}</span>
            <button onClick={() => removeDimensionRow(i)}>✕</button>
          </div>
        ))}

        <div style={styles.dimRow}>
          <select
            value={newDim.dimension_type_id}
            onChange={(e) => setNewDim({ ...newDim, dimension_type_id: e.target.value, name: "" })}
          >
            <option value="">-- new dimension --</option>
            {dimensionTypes.map((t) => (
              <option key={t.id} value={t.id}>{t.name} {t.unit ? `(${t.unit})` : ""}</option>
            ))}
          </select>
          {!newDim.dimension_type_id && (
            <>
              <input
                placeholder="New dimension name"
                value={newDim.name}
                onChange={(e) => setNewDim({ ...newDim, name: e.target.value })}
              />
              <input
                placeholder="Unit (optional)"
                value={newDim.unit}
                onChange={(e) => setNewDim({ ...newDim, unit: e.target.value })}
              />
            </>
          )}
          <input
            placeholder="Value"
            value={newDim.value}
            onChange={(e) => setNewDim({ ...newDim, value: e.target.value })}
          />
          <button onClick={addDimensionRow}>+ Add</button>
        </div>

        <h4>Assign to PM (optional)</h4>
        <select value={form.assign_to} onChange={(e) => setForm({ ...form, assign_to: e.target.value })}>
          <option value="">-- unassigned --</option>
          {pms.map((pm) => (
            <option key={pm.username} value={pm.username}>{pm.username}</option>
          ))}
        </select>

        <button style={styles.submitBtn} onClick={submitProperty}>Save Property</button>
      </div>

      <h3>Properties</h3>
      {properties.map((p) => (
        <div key={p.id} style={styles.card}>
          <strong>{p.name}</strong> — {p.address}
          <p>{p.description}</p>
          <ul>
            {p.dimensions.map((d) => (
              <li key={d.id}>{d.name}: {d.value} {d.unit || ""}</li>
            ))}
          </ul>
          <p>Assigned to: {p.assigned_pms.length ? p.assigned_pms.join(", ") : "Unassigned"}</p>
          <button onClick={() => deleteProperty(p.id)}>Delete</button>
        </div>
      ))}
    </div>
  );
}

const styles = {
  card: {
    background: "#fff",
    border: "1px solid #e5e7eb",
    borderRadius: "8px",
    padding: "16px",
    marginBottom: "16px",
  },
  input: {
    display: "block",
    width: "100%",
    marginBottom: "8px",
    padding: "8px",
    borderRadius: "6px",
    border: "1px solid #ccc",
  },
  dimRow: {
    display: "flex",
    gap: "8px",
    alignItems: "center",
    marginBottom: "8px",
  },
  submitBtn: {
    marginTop: "12px",
    padding: "10px 16px",
    background: "#1e293b",
    color: "#fff",
    border: "none",
    borderRadius: "6px",
    cursor: "pointer",
  },
};

export default AdminProperties;