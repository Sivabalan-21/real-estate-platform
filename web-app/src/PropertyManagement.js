import React, { useEffect, useState, useCallback, useRef } from "react";
import { useNavigate } from "react-router-dom";

const API = "http://194.164.149.22/api";

// Status pill colours for individual units
const UNIT_STATUS_STYLES = {
  vacant:      { bg: "#d1fae5", color: "#065f46", label: "Vacant" },
  occupied:    { bg: "#dbeafe", color: "#1e40af", label: "Occupied" },
  maintenance: { bg: "#fef3c7", color: "#92400e", label: "Maintenance" },
};

const UNIT_TYPE_OPTIONS = ["Studio", "1BHK", "2BHK", "3BHK", "4BHK", "Penthouse", "Other"];

export default function PropertyManagement() {
  const navigate = useNavigate();
  const token    = localStorage.getItem("token");
  const role     = localStorage.getItem("role");
  const isPM     = role === "Property Manager";
  const canManage = ["Admin", "Company Admin", "Super Admin", "Property Manager"].includes(role);

  const [properties,  setProperties]  = useState([]);
  const [me,          setMe]          = useState(null); // current user profile (for quota display)
  const [loading,     setLoading]     = useState(true);
  const [showCreate,  setShowCreate]  = useState(false);
  const [editProp,    setEditProp]    = useState(null);
  const [toast,       setToast]       = useState(null);
  const [deleteTarget,setDeleteTarget]= useState(null);
  const [deleting,    setDeleting]    = useState(false);

  // Unit list (Day 4)
  const [expandedId,    setExpandedId]    = useState(null);       // property id currently expanded
  const [unitsMap,      setUnitsMap]      = useState({});         // { [propertyId]: units[] }
  const [unitsLoading,  setUnitsLoading]  = useState({});         // { [propertyId]: boolean }
  const [addUnitTarget, setAddUnitTarget] = useState(null);       // property object for the Add Unit modal
  const fetchingUnitsRef = useRef(new Set());                     // guards against duplicate in-flight GETs

  // Add/Edit Unit form state (Day 5)
  const [unitForm, setUnitForm] = useState({
    unit_number: "", type: "", beds: "", baths: "", sqft: "", floor: "", rent: "", status: "vacant"
  });
  const [unitSaving, setUnitSaving] = useState(false);
  const [unitFormErr, setUnitFormErr] = useState("");
  const [editUnitTarget, setEditUnitTarget] = useState(null); // { property, unit } when editing

  // Lease state (Day 7)
  const [expandedUnitId, setExpandedUnitId] = useState(null);  // which unit row shows the lease panel
  const [leaseMap, setLeaseMap] = useState({});                // { [unitId]: lease | null }
  const [leaseHistoryMap, setLeaseHistoryMap] = useState({});  // { [propertyId]: leases[] }
  const [leaseLoading, setLeaseLoading] = useState({});        // { [unitId]: boolean }
  const [leaseModalUnit, setLeaseModalUnit] = useState(null);  // { property, unit } for Create Lease modal
  const [leaseForm, setLeaseForm] = useState({
    tenant_username: "", start_date: "", end_date: "", monthly_rent: "", escalation_pct: "", renewal_flag: false
  });
  const [leaseSaving, setLeaseSaving] = useState(false);
  const [leaseFormErr, setLeaseFormErr] = useState("");
  const [terminateTarget, setTerminateTarget] = useState(null); // lease object pending termination confirm
  const [terminating, setTerminating] = useState(false);
  const [historyOpenFor, setHistoryOpenFor] = useState(null);   // unit id whose history section is expanded

  // Photo state (Day 8)
  const [photosMap, setPhotosMap] = useState({});        // { [unitId]: photo[] }
  const [photosLoading, setPhotosLoading] = useState({}); // { [unitId]: boolean }
  const [photoUploading, setPhotoUploading] = useState({}); // { [unitId]: boolean }
  const [photoUploadErr, setPhotoUploadErr] = useState({}); // { [unitId]: string }
  const [lightboxPhoto, setLightboxPhoto] = useState(null); // { url, filename } for the open lightbox
  const [deletePhotoTarget, setDeletePhotoTarget] = useState(null); // { unitId, photo } pending delete confirm
  const [deletingPhoto, setDeletingPhoto] = useState(false);
  const fileInputRefs = useRef({}); // { [unitId]: <input type=file> DOM node }, one hidden input per unit row

  // Create form state
  const [form, setForm] = useState({
    name: "", address: "", description: "", total_units: "", status: "active"
  });
  const [dimensions, setDimensions] = useState([{ name: "", unit: "", value: "" }]);
  const [saving, setSaving] = useState(false);
  const [formErr, setFormErr] = useState("");

  const showToast = (msg, type = "success") => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3500);
  };

  const fetchProperties = useCallback(async () => {
    try {
      const res = await fetch(`${API}/properties`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.status === 401) { navigate("/"); return; }
      const data = await res.json();
      setProperties(Array.isArray(data) ? data : []);
    } catch {
      showToast("Failed to load properties", "error");
    } finally {
      setLoading(false);
    }
  }, [token, navigate]);

  const fetchMe = useCallback(async () => {
    if (!isPM) return;
    try {
      const res = await fetch(`${API}/users/me`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await res.json();
      setMe(data);
    } catch {}
  }, [token, isPM]);

  useEffect(() => {
    fetchProperties();
    fetchMe();
  }, [fetchProperties, fetchMe]);

  // Fetch units for a single property, guarded so we never fire duplicate GETs
  const fetchUnits = useCallback(async (propertyId) => {
    if (fetchingUnitsRef.current.has(propertyId)) return;
    fetchingUnitsRef.current.add(propertyId);
    setUnitsLoading(prev => ({ ...prev, [propertyId]: true }));
    try {
      const res = await fetch(`${API}/properties/${propertyId}/units`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.status === 401) { navigate("/"); return; }
      const data = await res.json();
      setUnitsMap(prev => ({ ...prev, [propertyId]: Array.isArray(data) ? data : [] }));
    } catch {
      showToast("Failed to load units", "error");
    } finally {
      setUnitsLoading(prev => ({ ...prev, [propertyId]: false }));
      fetchingUnitsRef.current.delete(propertyId);
    }
  }, [token, navigate]);

  // Expand/collapse a property card; fetch units only the first time it's opened
  const toggleExpand = (propertyId) => {
    setExpandedId(prev => {
      const next = prev === propertyId ? null : propertyId;
      if (next && unitsMap[propertyId] === undefined) fetchUnits(propertyId);
      if (!next) setExpandedUnitId(null); // collapsing the card also closes any open lease panel
      return next;
    });
  };

  // Occupancy summary for the card header chip, e.g. "4/10 occupied (40%)"
  const getOccupancySummary = (propertyId) => {
    const units = unitsMap[propertyId];
    if (!units || units.length === 0) return null;
    const occupied = units.filter(u => u.status === "occupied").length;
    const pct = Math.round((occupied / units.length) * 100);
    return { occupied, total: units.length, pct };
  };

  // ---- Lease helpers (Day 7) ----

  const fetchLease = useCallback(async (unitId) => {
    setLeaseLoading(prev => ({ ...prev, [unitId]: true }));
    try {
      const res = await fetch(`${API}/units/${unitId}/lease`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.status === 404) {
        setLeaseMap(prev => ({ ...prev, [unitId]: null }));
        return;
      }
      const data = await res.json();
      setLeaseMap(prev => ({ ...prev, [unitId]: res.ok ? data : null }));
    } catch {
      showToast("Failed to load lease", "error");
    } finally {
      setLeaseLoading(prev => ({ ...prev, [unitId]: false }));
    }
  }, [token]);

  const fetchLeaseHistory = useCallback(async (propertyId) => {
    try {
      const res = await fetch(`${API}/properties/${propertyId}/leases`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await res.json();
      setLeaseHistoryMap(prev => ({ ...prev, [propertyId]: Array.isArray(data) ? data : [] }));
    } catch {
      // history is secondary — fail silently, card still works without it
    }
  }, [token]);

  // Toggle the lease detail panel for a unit row; fetch lease + history on first open
  const toggleUnitExpand = (propertyId, unitId) => {
    setExpandedUnitId(prev => {
      const next = prev === unitId ? null : unitId;
      if (next) {
        if (leaseMap[unitId] === undefined) fetchLease(unitId);
        if (leaseHistoryMap[propertyId] === undefined) fetchLeaseHistory(propertyId);
        if (photosMap[unitId] === undefined) fetchPhotos(unitId);
      }
      return next;
    });
  };

  const daysToExpiry = (endDate) => {
    if (!endDate) return null;
    return Math.ceil((new Date(endDate) - new Date()) / 86400000);
  };

  const expiryBadgeStyle = (days) => {
    if (days == null) return { bg: "#f1f5f9", color: "#475569" };
    if (days < 0) return { bg: "#fee2e2", color: "#991b1b" };
    if (days < 30) return { bg: "#fee2e2", color: "#991b1b" };
    if (days <= 60) return { bg: "#fef3c7", color: "#92400e" };
    return { bg: "#d1fae5", color: "#065f46" };
  };

  const resetLeaseForm = () => {
    setLeaseForm({ tenant_username: "", start_date: "", end_date: "", monthly_rent: "", escalation_pct: "", renewal_flag: false });
    setLeaseFormErr("");
  };

  const handleCreateLease = async () => {
    if (!leaseForm.start_date) { setLeaseFormErr("Start date is required"); return; }
    if (!leaseForm.monthly_rent) { setLeaseFormErr("Monthly rent is required"); return; }
    setLeaseSaving(true);
    setLeaseFormErr("");
    try {
      const res = await fetch(`${API}/leases`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          unit_id: leaseModalUnit.unit.id,
          tenant_username: leaseForm.tenant_username || null,
          start_date: leaseForm.start_date,
          end_date: leaseForm.end_date || null,
          monthly_rent: parseFloat(leaseForm.monthly_rent),
          escalation_pct: leaseForm.escalation_pct ? parseFloat(leaseForm.escalation_pct) : 0,
          renewal_flag: !!leaseForm.renewal_flag,
        })
      });
      const data = await res.json();
      if (!res.ok) { setLeaseFormErr(data.detail || "Failed to create lease"); return; }
      showToast("Lease created — unit marked occupied");
      const { property, unit } = leaseModalUnit;
      setLeaseModalUnit(null);
      resetLeaseForm();
      fetchLease(unit.id);
      fetchLeaseHistory(property.id);
      fetchingUnitsRef.current.delete(property.id);
      fetchUnits(property.id);
    } catch {
      setLeaseFormErr("Server error. Please try again.");
    } finally {
      setLeaseSaving(false);
    }
  };

  const handleTerminateLease = async () => {
    if (!terminateTarget) return;
    setTerminating(true);
    try {
      const res = await fetch(`${API}/leases/${terminateTarget.lease.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ status: "terminated" })
      });
      if (!res.ok) { const d = await res.json(); showToast(d.detail || "Failed to terminate lease", "error"); return; }
      showToast("Lease terminated — unit marked vacant");
      const { property, unit } = terminateTarget;
      setTerminateTarget(null);
      fetchLease(unit.id);
      fetchLeaseHistory(property.id);
      fetchingUnitsRef.current.delete(property.id);
      fetchUnits(property.id);
    } catch {
      showToast("Server error", "error");
    } finally {
      setTerminating(false);
    }
  };

  // ---- Photo helpers (Day 8) ----

  const fetchPhotos = useCallback(async (unitId) => {
    setPhotosLoading(prev => ({ ...prev, [unitId]: true }));
    try {
      const res = await fetch(`${API}/units/${unitId}/photos`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await res.json();
      setPhotosMap(prev => ({ ...prev, [unitId]: Array.isArray(data) ? data : [] }));
    } catch {
      showToast("Failed to load photos", "error");
    } finally {
      setPhotosLoading(prev => ({ ...prev, [unitId]: false }));
    }
  }, [token]);

  const handleUploadPhotos = async (unitId, fileList) => {
    const files = Array.from(fileList || []);
    if (files.length === 0) return;
    if (files.length > 5) {
      setPhotoUploadErr(prev => ({ ...prev, [unitId]: "Max 5 photos per upload" }));
      return;
    }
    const oversized = files.find(f => f.size > 5 * 1024 * 1024);
    if (oversized) {
      setPhotoUploadErr(prev => ({ ...prev, [unitId]: `'${oversized.name}' is too large (max 5MB)` }));
      return;
    }

    setPhotoUploadErr(prev => ({ ...prev, [unitId]: "" }));
    setPhotoUploading(prev => ({ ...prev, [unitId]: true }));
    try {
      const body = new FormData();
      files.forEach(f => body.append("files", f));
      const res = await fetch(`${API}/units/${unitId}/photos`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` }, // no Content-Type — browser sets multipart boundary
        body,
      });
      const data = await res.json();
      if (!res.ok) {
        setPhotoUploadErr(prev => ({ ...prev, [unitId]: data.detail || "Upload failed" }));
        return;
      }
      showToast(files.length > 1 ? `${files.length} photos uploaded` : "Photo uploaded");
      setPhotosMap(prev => ({ ...prev, [unitId]: [...(prev[unitId] || []), ...data] }));
    } catch {
      setPhotoUploadErr(prev => ({ ...prev, [unitId]: "Server error. Please try again." }));
    } finally {
      setPhotoUploading(prev => ({ ...prev, [unitId]: false }));
      if (fileInputRefs.current[unitId]) fileInputRefs.current[unitId].value = ""; // allow re-picking the same file
    }
  };

  const handleDeletePhoto = async () => {
    if (!deletePhotoTarget) return;
    const { unitId, photo } = deletePhotoTarget;
    setDeletingPhoto(true);
    try {
      const res = await fetch(`${API}/units/${unitId}/photos/${photo.id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` }
      });
      if (!res.ok) { const d = await res.json(); showToast(d.detail || "Delete failed", "error"); return; }
      showToast("Photo deleted");
      setPhotosMap(prev => ({ ...prev, [unitId]: (prev[unitId] || []).filter(p => p.id !== photo.id) }));
      setDeletePhotoTarget(null);
    } catch {
      showToast("Server error", "error");
    } finally {
      setDeletingPhoto(false);
    }
  };

  const resetForm = () => {
    setForm({ name: "", address: "", description: "", total_units: "", status: "active" });
    setDimensions([{ name: "", unit: "", value: "" }]);
    setFormErr("");
  };

  const resetUnitForm = () => {
    setUnitForm({ unit_number: "", type: "", beds: "", baths: "", sqft: "", floor: "", rent: "", status: "vacant" });
    setUnitFormErr("");
    setEditUnitTarget(null);
  };

  // Populate the same modal/form in edit mode, pre-filled with the unit's data
  const openEditUnit = (property, unit) => {
    setUnitForm({
      unit_number: unit.unit_number,
      type: unit.type || "",
      beds: unit.beds ?? "",
      baths: unit.baths ?? "",
      sqft: unit.sqft ?? "",
      floor: unit.floor ?? "",
      rent: unit.rent_amount ?? "",
      status: unit.status || "vacant",
    });
    setUnitFormErr("");
    setEditUnitTarget({ property, unit });
    setAddUnitTarget(property); // reuses the same modal shell
  };

  const addDimension = () => setDimensions(d => [...d, { name: "", unit: "", value: "" }]);
  const removeDimension = (i) => setDimensions(d => d.filter((_, idx) => idx !== i));
  const updateDimension = (i, field, val) => {
    setDimensions(d => d.map((dim, idx) => idx === i ? { ...dim, [field]: val } : dim));
  };

  const handleCreate = async () => {
    if (!form.name.trim()) { setFormErr("Property name is required"); return; }
    const validDims = dimensions.filter(d => d.name.trim() && d.value.trim());
    setSaving(true);
    setFormErr("");
    try {
      const res = await fetch(`${API}/properties`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          name: form.name,
          address: form.address,
          description: form.description,
          total_units: parseInt(form.total_units) || 0,
          status: form.status,
          dimensions: validDims.map(d => ({ name: d.name, unit: d.unit, value: d.value })),
        })
      });
      const data = await res.json();
      if (!res.ok) { setFormErr(data.detail || "Failed to create property"); return; }
      showToast("Property created successfully");
      setShowCreate(false);
      resetForm();
      fetchProperties();
      fetchMe(); // refresh quota display
    } catch {
      setFormErr("Server error. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  const handleEdit = async () => {
    if (!editProp.name.trim()) { setFormErr("Property name is required"); return; }
    setSaving(true);
    setFormErr("");
    try {
      const res = await fetch(`${API}/properties/${editProp.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          name: editProp.name,
          address: editProp.address,
          description: editProp.description,
          total_units: parseInt(editProp.total_units) || 0,
          status: editProp.status,
        })
      });
      const data = await res.json();
      if (!res.ok) { setFormErr(data.detail || "Failed to update property"); return; }
      showToast("Property updated successfully");
      setEditProp(null);
      fetchProperties();
      fetchMe();
    } catch {
      setFormErr("Server error. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    setDeleting(true);
    try {
      const res = await fetch(`${API}/properties/${deleteTarget.id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` }
      });
      if (!res.ok) { const d = await res.json(); showToast(d.detail || "Delete failed", "error"); return; }
      showToast("Property deleted");
      setDeleteTarget(null);
      fetchProperties();
      fetchMe();
    } catch {
      showToast("Server error", "error");
    } finally {
      setDeleting(false);
    }
  };

  // Creates a new Unit (POST) or, when editUnitTarget is set, updates one (PUT) — Day 5
  const handleAddUnit = async () => {
    if (!unitForm.unit_number.trim()) { setUnitFormErr("Unit number is required"); return; }
    if (unitForm.rent !== "" && parseFloat(unitForm.rent) <= 0) { setUnitFormErr("Rent must be positive"); return; }
    setUnitSaving(true);
    setUnitFormErr("");
    const isEditing = !!editUnitTarget;
    const payload = {
      unit_number: unitForm.unit_number.trim(),
      type: unitForm.type || null,
      beds: unitForm.beds !== "" ? parseInt(unitForm.beds, 10) : null,
      baths: unitForm.baths !== "" ? parseFloat(unitForm.baths) : null, // parseFloat: 1.5/2.5 baths are valid
      sqft: unitForm.sqft !== "" ? parseInt(unitForm.sqft, 10) : null,
      floor: unitForm.floor !== "" ? parseInt(unitForm.floor, 10) : null,
      rent_amount: unitForm.rent !== "" ? parseFloat(unitForm.rent) : null,
      status: unitForm.status,
    };
    // Unit Number is read-only while editing (protects lease/ticket references) — don't send it on PUT
    if (isEditing) delete payload.unit_number;

    try {
      const url = isEditing ? `${API}/units/${editUnitTarget.unit.id}` : `${API}/properties/${addUnitTarget.id}/units`;
      const res = await fetch(url, {
        method: isEditing ? "PUT" : "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify(payload)
      });
      const data = await res.json();
      if (!res.ok) { setUnitFormErr(data.detail || `Failed to ${isEditing ? "update" : "add"} unit`); return; }
      showToast(isEditing ? "Unit updated successfully" : "Unit added successfully");
      const propertyId = isEditing ? editUnitTarget.property.id : addUnitTarget.id;
      setAddUnitTarget(null);
      resetUnitForm();
      // Refresh this property's unit list so the change shows up immediately
      fetchingUnitsRef.current.delete(propertyId);
      fetchUnits(propertyId);
      fetchProperties(); // in case backend recalculates total_units / occupancy off Unit rows
      fetchMe();          // refresh PM unit quota after consuming one
    } catch {
      setUnitFormErr("Server error. Please try again.");
    } finally {
      setUnitSaving(false);
    }
  };

  const remainingUnits = me ? (me.max_units || 0) - (me.used_units || 0) : null;


  return (
    <div style={s.page}>
      <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&display=swap" rel="stylesheet" />
      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        .unit-photo-delete { opacity: 0; transition: opacity .15s; }
        .unit-photo-thumb:hover .unit-photo-delete { opacity: 1; }
      `}</style>

      {toast && (
        <div style={{ ...s.toast, background: toast.type === "error" ? "#ef4444" : "#10b981" }}>
          {toast.msg}
        </div>
      )}

      {/* HEADER */}
      <div style={s.header}>
        <div>
          <h2 style={s.pageTitle}>Property Management</h2>
          <p style={s.pageSub}>
            {properties.length} {isPM ? "properties you manage" : "properties in your company"}
            {isPM && remainingUnits !== null && (
              <span style={s.quotaBadge}>
                {remainingUnits} unit(s) remaining of {me.max_units || 0}
              </span>
            )}
          </p>
        </div>
        {isPM && (
          <button style={s.primaryBtn} onClick={() => { setShowCreate(true); resetForm(); }}>
            + Add Property
          </button>
        )}
      </div>

      {/* PROPERTY LIST */}
      {loading ? (
        <div style={s.empty}>Loading properties…</div>
      ) : properties.length === 0 ? (
        <div style={s.emptyCard}>
          <p style={s.emptyIcon}>🏢</p>
          <p style={s.emptyTitle}>No properties yet</p>
          <p style={s.emptySub}>
            {isPM ? 'Click "Add Property" to create your first property.' : "No properties have been created yet."}
          </p>
        </div>
      ) : (
        <div style={s.grid}>
          {properties.map(p => (
            <div key={p.id} style={s.card}>
              <div style={s.cardHeader}>
                <div>
                  <h3 style={s.cardTitle}>{p.name}</h3>
                  <p style={s.cardAddress}>{p.address || "No address"}</p>
                </div>
                <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 6 }}>
                  <span style={{ ...s.statusBadge, background: p.status === "active" ? "#d1fae5" : "#fee2e2", color: p.status === "active" ? "#065f46" : "#991b1b" }}>
                    {p.status}
                  </span>
                  {getOccupancySummary(p.id) && (
                    <span style={s.occupancyChip}>
                      {getOccupancySummary(p.id).occupied}/{getOccupancySummary(p.id).total} occupied ({getOccupancySummary(p.id).pct}%)
                    </span>
                  )}
                </div>
              </div>

              {p.description && <p style={s.cardDesc}>{p.description}</p>}

              {/* Dimensions */}
              {p.dimensions?.length > 0 && (
                <div style={s.dimSection}>
                  <p style={s.dimLabel}>Dimensions</p>
                  <div style={s.dimGrid}>
                    {p.dimensions.map(d => (
                      <div key={d.id} style={s.dimChip}>
                        <span style={s.dimName}>{d.name}</span>
                        <span style={s.dimValue}>{d.value} {d.unit || ""}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Units */}
              <div style={s.unitsRow}>
                <span style={s.unitsLabel}>Units Added</span>
                <span style={s.unitsValue}>{p.actual_unit_count ?? 0} / {p.total_units ?? 0}</span>
              </div>

              {/* Owner */}
              <div style={s.assignSection}>
                <p style={s.dimLabel}>Property Manager</p>
                <span style={s.pmChip}>{p.created_by}</span>
              </div>

              {/* Units (Day 4) */}
              <div style={s.unitsSection}>
                <button style={s.unitsToggle} onClick={() => toggleExpand(p.id)}>
                  <span>Units</span>
                  <span style={{ transform: expandedId === p.id ? "rotate(90deg)" : "rotate(0deg)", transition: "transform .15s" }}>›</span>
                </button>

                {expandedId === p.id && (
                  <div style={s.unitsPanel}>
                    {unitsLoading[p.id] ? (
                      <div style={s.unitsSpinnerRow}>
                        <span style={s.spinner} />
                        <span>Loading units…</span>
                      </div>
                    ) : (unitsMap[p.id]?.length || 0) === 0 ? (
                      <div style={s.unitsEmpty}>
                        <p style={s.unitsEmptyText}>No units added yet</p>
                        {canManage && (
                          <button style={s.addUnitBtn} onClick={() => { setAddUnitTarget(p); resetUnitForm(); }}>+ Add Unit</button>
                        )}
                      </div>
                    ) : (
                      <>
                        <div style={s.unitTable}>
                          <div style={{ ...s.unitRow, ...s.unitHeaderRow }}>
                            <span>Unit #</span>
                            <span>Type</span>
                            <span>Beds/Baths</span>
                            <span>Sqft</span>
                            <span>Floor</span>
                            <span>Rent</span>
                            <span>Status</span>
                            {canManage && <span>Actions</span>}
                          </div>
                          {unitsMap[p.id].map(u => {
                            const st = UNIT_STATUS_STYLES[u.status] || { bg: "#f1f5f9", color: "#475569", label: u.status };
                            const isOpen = expandedUnitId === u.id;
                            const lease = leaseMap[u.id];
                            const days = lease ? daysToExpiry(lease.end_date) : null;
                            const badge = expiryBadgeStyle(days);
                            const history = (leaseHistoryMap[p.id] || []).filter(l => l.unit_id === u.id && l.status !== "active");
                            return (
                              <React.Fragment key={u.id}>
                                <div
                                  style={{ ...s.unitRow, cursor: "pointer", background: isOpen ? "#f8fafc" : "transparent" }}
                                  onClick={() => toggleUnitExpand(p.id, u.id)}
                                >
                                  <span style={s.unitCellStrong}>{u.unit_number}</span>
                                  <span>{u.type || "—"}</span>
                                  <span>{u.beds ?? "—"}/{u.baths ?? "—"}</span>
                                  <span>{u.sqft ?? "—"}</span>
                                  <span>{u.floor ?? "—"}</span>
                                  <span>{u.rent_amount != null ? `₹${u.rent_amount}` : "—"}</span>
                                  <span style={{ ...s.unitStatusBadge, background: st.bg, color: st.color }}>{st.label}</span>
                                  {canManage && (
                                    <span>
                                      <button
                                        style={s.unitEditBtn}
                                        onClick={(e) => { e.stopPropagation(); openEditUnit(p, u); }}
                                      >
                                        Edit
                                      </button>
                                    </span>
                                  )}
                                </div>

                                {isOpen && (
                                  <div style={s.leasePanel} onClick={(e) => e.stopPropagation()}>
                                    {leaseLoading[u.id] ? (
                                      <div style={s.unitsSpinnerRow}><span style={s.spinner} /><span>Loading lease…</span></div>
                                    ) : lease ? (
                                      <div style={s.leaseCard}>
                                        <div style={s.leaseCardHeader}>
                                          <div>
                                            <div style={s.leaseTenant}>{lease.tenant_name || lease.tenant_username || "Unassigned"}</div>
                                            {lease.tenant_email && <div style={s.leaseTenantEmail}>{lease.tenant_email}</div>}
                                          </div>
                                          {days != null && (
                                            <span style={{ ...s.expiryBadge, background: badge.bg, color: badge.color }}>
                                              {days < 0 ? `Expired ${Math.abs(days)}d ago` : `${days}d`}
                                            </span>
                                          )}
                                        </div>
                                        <div style={s.leaseMetaRow}>
                                          <span><strong>Start:</strong> {lease.start_date}</span>
                                          <span><strong>End:</strong> {lease.end_date || "—"}</span>
                                          <span><strong>Rent:</strong> ₹{lease.monthly_rent}</span>
                                        </div>
                                        {canManage && (
                                          <button
                                            style={s.terminateBtn}
                                            onClick={() => setTerminateTarget({ lease, property: p, unit: u })}
                                          >
                                            Terminate Lease
                                          </button>
                                        )}
                                      </div>
                                    ) : (
                                      <div style={s.leaseEmpty}>
                                        <span>No active lease</span>
                                        {canManage && (
                                          <button
                                            style={s.createLeaseBtn}
                                            onClick={() => { setLeaseModalUnit({ property: p, unit: u }); resetLeaseForm(); }}
                                          >
                                            Create Lease
                                          </button>
                                        )}
                                      </div>
                                    )}

                                    {history.length > 0 && (
                                      <div style={s.historySection}>
                                        <button
                                          style={s.historyToggle}
                                          onClick={() => setHistoryOpenFor(prev => prev === u.id ? null : u.id)}
                                        >
                                          {historyOpenFor === u.id ? "▾" : "▸"} Lease History ({history.length})
                                        </button>
                                        {historyOpenFor === u.id && (
                                          <div style={s.historyList}>
                                            {history
                                              .slice()
                                              .sort((a, b) => (a.start_date < b.start_date ? 1 : -1))
                                              .map(h => (
                                                <div key={h.id} style={s.historyItem}>
                                                  <span>{h.tenant_name || h.tenant_username || "Unassigned"}</span>
                                                  <span>{h.start_date} → {h.end_date || "—"}</span>
                                                  <span style={s.historyStatus}>{h.status}</span>
                                                </div>
                                              ))}
                                          </div>
                                        )}
                                      </div>
                                    )}

                                    {/* Photo gallery (Day 8) */}
                                    <div style={s.photoSection}>
                                      <div style={s.photoSectionHeader}>
                                        <span style={s.photoSectionTitle}>
                                          Photos {(photosMap[u.id]?.length || 0) > 0 && `(${photosMap[u.id].length})`}
                                        </span>
                                        {canManage && (
                                          <>
                                            <input
                                              type="file"
                                              accept="image/*"
                                              multiple
                                              style={{ display: "none" }}
                                              ref={el => { fileInputRefs.current[u.id] = el; }}
                                              onChange={(e) => handleUploadPhotos(u.id, e.target.files)}
                                            />
                                            <button
                                              style={s.uploadPhotosBtn}
                                              disabled={photoUploading[u.id]}
                                              onClick={() => fileInputRefs.current[u.id]?.click()}
                                            >
                                              {photoUploading[u.id] ? "Uploading…" : "Upload Photos"}
                                            </button>
                                          </>
                                        )}
                                      </div>

                                      {photoUploadErr[u.id] && <p style={s.photoErrMsg}>{photoUploadErr[u.id]}</p>}

                                      {photosLoading[u.id] ? (
                                        <div style={s.unitsSpinnerRow}><span style={s.spinner} /><span>Loading photos…</span></div>
                                      ) : (photosMap[u.id]?.length || 0) === 0 ? (
                                        <p style={s.photoEmptyText}>No photos yet</p>
                                      ) : (
                                        <div style={s.photoStrip}>
                                          {photosMap[u.id].map(photo => (
                                            <div key={photo.id} style={s.photoThumbWrap} className="unit-photo-thumb">
                                              <img
                                                src={photo.url}
                                                alt={photo.filename}
                                                style={s.photoThumb}
                                                onClick={() => setLightboxPhoto(photo)}
                                              />
                                              {canManage && (
                                                <button
                                                  style={s.photoDeleteBtn}
                                                  className="unit-photo-delete"
                                                  onClick={() => setDeletePhotoTarget({ unitId: u.id, photo })}
                                                  title="Delete photo"
                                                >
                                                  ✕
                                                </button>
                                              )}
                                            </div>
                                          ))}
                                        </div>
                                      )}
                                    </div>
                                  </div>
                                )}
                              </React.Fragment>
                            );
                          })}
                        </div>
                        {canManage && (
                          <button style={s.addUnitBtnInline} onClick={() => { setAddUnitTarget(p); resetUnitForm(); }}>+ Add Unit</button>
                        )}
                      </>
                    )}
                  </div>
                )}
              </div>

              {/* Actions */}
              {canManage && (
                <div style={s.cardActions}>
                  <button style={s.editBtn} onClick={() => { setEditProp({ ...p }); setFormErr(""); }}>Edit</button>
                  <button style={s.deleteBtn} onClick={() => setDeleteTarget(p)}>Delete</button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* CREATE MODAL (PM only) */}
      {showCreate && isPM && (
        <div style={ms.overlay} onClick={() => setShowCreate(false)}>
          <div style={ms.box} onClick={e => e.stopPropagation()}>
            <div style={ms.header}>
              <h3 style={ms.title}>Add New Property</h3>
              <button style={ms.close} onClick={() => setShowCreate(false)}>✕</button>
            </div>
            <div style={ms.body}>

              {remainingUnits !== null && (
                <p style={ms.quotaNote}>
                  You have <strong>{remainingUnits}</strong> unit(s) remaining of your {me.max_units || 0} allocated.
                </p>
              )}

              <label style={ms.label}>Property Name <span style={ms.req}>*</span></label>
              <input style={ms.input} placeholder="e.g. Block A, Tower 1" value={form.name}
                onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />

              <label style={ms.label}>Address</label>
              <input style={ms.input} placeholder="Full address" value={form.address}
                onChange={e => setForm(f => ({ ...f, address: e.target.value }))} />

              <label style={ms.label}>Description</label>
              <textarea style={{ ...ms.input, height: 70, resize: "vertical" }} placeholder="Optional description"
                value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} />

              <div style={{ display: "flex", gap: 12 }}>
                <div style={{ flex: 1 }}>
                  <label style={ms.label}>Total Units</label>
                  <input style={ms.input} type="number" placeholder="0" value={form.total_units}
                    onChange={e => setForm(f => ({ ...f, total_units: e.target.value }))} />
                </div>
                <div style={{ flex: 1 }}>
                  <label style={ms.label}>Status</label>
                  <select style={ms.input} value={form.status} onChange={e => setForm(f => ({ ...f, status: e.target.value }))}>
                    <option value="active">Active</option>
                    <option value="inactive">Inactive</option>
                  </select>
                </div>
              </div>

              {/* Dimensions */}
              <label style={{ ...ms.label, marginTop: 4 }}>Dimensions</label>
              {dimensions.map((dim, i) => (
                <div key={i} style={ms.dimRow}>
                  <input style={{ ...ms.input, marginBottom: 0, flex: 2 }} placeholder="Name (e.g. Square Feet)"
                    value={dim.name} onChange={e => updateDimension(i, "name", e.target.value)} />
                  <input style={{ ...ms.input, marginBottom: 0, flex: 1 }} placeholder="Unit (e.g. sqft)"
                    value={dim.unit} onChange={e => updateDimension(i, "unit", e.target.value)} />
                  <input style={{ ...ms.input, marginBottom: 0, flex: 1 }} placeholder="Value"
                    value={dim.value} onChange={e => updateDimension(i, "value", e.target.value)} />
                  {dimensions.length > 1 && (
                    <button style={ms.removeDimBtn} onClick={() => removeDimension(i)}>✕</button>
                  )}
                </div>
              ))}
              <button style={ms.addDimBtn} onClick={addDimension}>+ Add Dimension</button>

              {formErr && <p style={ms.errorMsg}>{formErr}</p>}

              <div style={ms.footer}>
                <button style={ms.cancelBtn} onClick={() => setShowCreate(false)}>Cancel</button>
                <button style={ms.submitBtn} onClick={handleCreate} disabled={saving}>
                  {saving ? "Creating…" : "Create Property"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* EDIT MODAL */}
      {editProp && (
        <div style={ms.overlay} onClick={() => setEditProp(null)}>
          <div style={ms.box} onClick={e => e.stopPropagation()}>
            <div style={ms.header}>
              <h3 style={ms.title}>Edit Property</h3>
              <button style={ms.close} onClick={() => setEditProp(null)}>✕</button>
            </div>
            <div style={ms.body}>

              <label style={ms.label}>Property Name <span style={ms.req}>*</span></label>
              <input style={ms.input} value={editProp.name}
                onChange={e => setEditProp(p => ({ ...p, name: e.target.value }))} />

              <label style={ms.label}>Address</label>
              <input style={ms.input} value={editProp.address || ""}
                onChange={e => setEditProp(p => ({ ...p, address: e.target.value }))} />

              <label style={ms.label}>Description</label>
              <textarea style={{ ...ms.input, height: 70, resize: "vertical" }}
                value={editProp.description || ""}
                onChange={e => setEditProp(p => ({ ...p, description: e.target.value }))} />

              <div style={{ display: "flex", gap: 12 }}>
                <div style={{ flex: 1 }}>
                  <label style={ms.label}>Total Units</label>
                  <input style={ms.input} type="number" value={editProp.total_units || 0}
                    onChange={e => setEditProp(p => ({ ...p, total_units: e.target.value }))} />
                </div>
                <div style={{ flex: 1 }}>
                  <label style={ms.label}>Status</label>
                  <select style={ms.input} value={editProp.status}
                    onChange={e => setEditProp(p => ({ ...p, status: e.target.value }))}>
                    <option value="active">Active</option>
                    <option value="inactive">Inactive</option>
                  </select>
                </div>
              </div>

              {formErr && <p style={ms.errorMsg}>{formErr}</p>}

              <div style={ms.footer}>
                <button style={ms.cancelBtn} onClick={() => setEditProp(null)}>Cancel</button>
                <button style={ms.submitBtn} onClick={handleEdit} disabled={saving}>
                  {saving ? "Saving…" : "Save Changes"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* DELETE CONFIRM */}
      {deleteTarget && (
        <div style={ms.overlay} onClick={() => setDeleteTarget(null)}>
          <div style={{ ...ms.box, maxWidth: 400 }} onClick={e => e.stopPropagation()}>
            <div style={ms.header}>
              <h3 style={ms.title}>Delete Property</h3>
              <button style={ms.close} onClick={() => setDeleteTarget(null)}>✕</button>
            </div>
            <div style={ms.body}>
              <p style={{ fontSize: 14, color: "#475569", marginBottom: 20 }}>
                Are you sure you want to delete <strong>{deleteTarget.name}</strong>? This cannot be undone.
              </p>
              <div style={ms.footer}>
                <button style={ms.cancelBtn} onClick={() => setDeleteTarget(null)}>Cancel</button>
                <button style={{ ...ms.submitBtn, background: "#ef4444" }} onClick={handleDelete} disabled={deleting}>
                  {deleting ? "Deleting…" : "Delete"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ADD/EDIT UNIT MODAL — POST /properties/:id/units to create, PUT /units/:id to edit (Day 5) */}
      {addUnitTarget && (
        <div style={ms.overlay} onClick={() => { setAddUnitTarget(null); resetUnitForm(); }}>
          <div style={{ ...ms.box, maxWidth: 480 }} onClick={e => e.stopPropagation()}>
            <div style={ms.header}>
              <h3 style={ms.title}>{editUnitTarget ? "Edit Unit" : "Add Unit"} — {addUnitTarget.name}</h3>
              <button style={ms.close} onClick={() => { setAddUnitTarget(null); resetUnitForm(); }}>✕</button>
            </div>
            <div style={ms.body}>

              <label style={ms.label}>Unit Number <span style={ms.req}>*</span></label>
              <input
                style={{ ...ms.input, ...(editUnitTarget ? { background: "#f1f5f9", color: "#94a3b8" } : {}) }}
                placeholder="e.g. A-101"
                value={unitForm.unit_number}
                readOnly={!!editUnitTarget}
                title={editUnitTarget ? "Unit number can't be changed once created (protects lease/ticket references)" : undefined}
                onChange={e => setUnitForm(f => ({ ...f, unit_number: e.target.value }))}
              />

              <div style={{ display: "flex", gap: 12 }}>
                <div style={{ flex: 1 }}>
                  <label style={ms.label}>Type</label>
                  <select style={ms.input} value={unitForm.type}
                    onChange={e => setUnitForm(f => ({ ...f, type: e.target.value }))}>
                    <option value="">Select type</option>
                    {UNIT_TYPE_OPTIONS.map(t => <option key={t} value={t}>{t}</option>)}
                  </select>
                </div>
                <div style={{ flex: 1 }}>
                  <label style={ms.label}>Status</label>
                  <select style={ms.input} value={unitForm.status}
                    onChange={e => setUnitForm(f => ({ ...f, status: e.target.value }))}>
                    <option value="vacant">Vacant</option>
                    <option value="occupied">Occupied</option>
                    <option value="maintenance">Maintenance</option>
                  </select>
                </div>
              </div>

              <div style={{ display: "flex", gap: 12 }}>
                <div style={{ flex: 1 }}>
                  <label style={ms.label}>Beds</label>
                  <input style={ms.input} type="number" min="0" placeholder="0" value={unitForm.beds}
                    onChange={e => setUnitForm(f => ({ ...f, beds: e.target.value }))} />
                </div>
                <div style={{ flex: 1 }}>
                  <label style={ms.label}>Baths</label>
                  <input style={ms.input} type="number" min="0" step="0.5" placeholder="0" value={unitForm.baths}
                    onChange={e => setUnitForm(f => ({ ...f, baths: e.target.value }))} />
                </div>
                <div style={{ flex: 1 }}>
                  <label style={ms.label}>Floor</label>
                  <input style={ms.input} type="number" placeholder="0" value={unitForm.floor}
                    onChange={e => setUnitForm(f => ({ ...f, floor: e.target.value }))} />
                </div>
              </div>

              <div style={{ display: "flex", gap: 12 }}>
                <div style={{ flex: 1 }}>
                  <label style={ms.label}>Sqft</label>
                  <input style={ms.input} type="number" min="0" placeholder="0" value={unitForm.sqft}
                    onChange={e => setUnitForm(f => ({ ...f, sqft: e.target.value }))} />
                </div>
                <div style={{ flex: 1 }}>
                  <label style={ms.label}>Rent Amount (₹)</label>
                  <input style={ms.input} type="number" min="0" placeholder="0" value={unitForm.rent}
                    onChange={e => setUnitForm(f => ({ ...f, rent: e.target.value }))} />
                </div>
              </div>

              {unitFormErr && <p style={ms.errorMsg}>{unitFormErr}</p>}

              <div style={ms.footer}>
                <button style={ms.cancelBtn} onClick={() => { setAddUnitTarget(null); resetUnitForm(); }}>Cancel</button>
                <button style={ms.submitBtn} onClick={handleAddUnit} disabled={unitSaving}>
                  {unitSaving ? (editUnitTarget ? "Saving…" : "Adding…") : (editUnitTarget ? "Save Changes" : "Add Unit")}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* CREATE LEASE MODAL (Day 7) */}
      {leaseModalUnit && (
        <div style={ms.overlay} onClick={() => { setLeaseModalUnit(null); resetLeaseForm(); }}>
          <div style={{ ...ms.box, maxWidth: 460 }} onClick={e => e.stopPropagation()}>
            <div style={ms.header}>
              <h3 style={ms.title}>Create Lease — Unit {leaseModalUnit.unit.unit_number}</h3>
              <button style={ms.close} onClick={() => { setLeaseModalUnit(null); resetLeaseForm(); }}>✕</button>
            </div>
            <div style={ms.body}>

              <label style={ms.label}>Tenant Username</label>
              <input style={ms.input} placeholder="Optional — can assign later" value={leaseForm.tenant_username}
                onChange={e => setLeaseForm(f => ({ ...f, tenant_username: e.target.value }))} />

              <div style={{ display: "flex", gap: 12 }}>
                <div style={{ flex: 1 }}>
                  <label style={ms.label}>Start Date <span style={ms.req}>*</span></label>
                  <input style={ms.input} type="date" value={leaseForm.start_date}
                    onChange={e => setLeaseForm(f => ({ ...f, start_date: e.target.value }))} />
                </div>
                <div style={{ flex: 1 }}>
                  <label style={ms.label}>End Date</label>
                  <input style={ms.input} type="date" value={leaseForm.end_date}
                    onChange={e => setLeaseForm(f => ({ ...f, end_date: e.target.value }))} />
                </div>
              </div>

              <div style={{ display: "flex", gap: 12 }}>
                <div style={{ flex: 1 }}>
                  <label style={ms.label}>Monthly Rent (₹) <span style={ms.req}>*</span></label>
                  <input style={ms.input} type="number" min="0" placeholder="0" value={leaseForm.monthly_rent}
                    onChange={e => setLeaseForm(f => ({ ...f, monthly_rent: e.target.value }))} />
                </div>
                <div style={{ flex: 1 }}>
                  <label style={ms.label}>Escalation %</label>
                  <input style={ms.input} type="number" min="0" step="0.1" placeholder="0" value={leaseForm.escalation_pct}
                    onChange={e => setLeaseForm(f => ({ ...f, escalation_pct: e.target.value }))} />
                </div>
              </div>

              <label style={{ ...ms.label, display: "flex", alignItems: "center", gap: 8, marginTop: 4 }}>
                <input type="checkbox" checked={leaseForm.renewal_flag}
                  onChange={e => setLeaseForm(f => ({ ...f, renewal_flag: e.target.checked }))} />
                Auto-renewal
              </label>

              {leaseFormErr && <p style={ms.errorMsg}>{leaseFormErr}</p>}

              <div style={ms.footer}>
                <button style={ms.cancelBtn} onClick={() => { setLeaseModalUnit(null); resetLeaseForm(); }}>Cancel</button>
                <button style={ms.submitBtn} onClick={handleCreateLease} disabled={leaseSaving}>
                  {leaseSaving ? "Creating…" : "Create Lease"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* TERMINATE LEASE CONFIRM (Day 7) */}
      {terminateTarget && (
        <div style={ms.overlay} onClick={() => setTerminateTarget(null)}>
          <div style={{ ...ms.box, maxWidth: 400 }} onClick={e => e.stopPropagation()}>
            <div style={ms.header}>
              <h3 style={ms.title}>Terminate Lease?</h3>
              <button style={ms.close} onClick={() => setTerminateTarget(null)}>✕</button>
            </div>
            <div style={ms.body}>
              <p style={{ fontSize: 13, color: "#475569", lineHeight: 1.5 }}>
                This will mark unit <strong>{terminateTarget.unit.unit_number}</strong> as vacant. This can't be undone.
              </p>
              <div style={ms.footer}>
                <button style={ms.cancelBtn} onClick={() => setTerminateTarget(null)}>Cancel</button>
                <button style={{ ...ms.submitBtn, background: "#ef4444" }} onClick={handleTerminateLease} disabled={terminating}>
                  {terminating ? "Terminating…" : "Terminate Lease"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* PHOTO LIGHTBOX (Day 8) */}
      {lightboxPhoto && (
        <div style={ms.overlay} onClick={() => setLightboxPhoto(null)}>
          <div style={s.lightboxBox} onClick={e => e.stopPropagation()}>
            <button style={s.lightboxClose} onClick={() => setLightboxPhoto(null)}>✕</button>
            <img src={lightboxPhoto.url} alt={lightboxPhoto.filename} style={s.lightboxImg} />
            <p style={s.lightboxCaption}>{lightboxPhoto.filename}</p>
          </div>
        </div>
      )}

      {/* DELETE PHOTO CONFIRM (Day 8) */}
      {deletePhotoTarget && (
        <div style={ms.overlay} onClick={() => setDeletePhotoTarget(null)}>
          <div style={{ ...ms.box, maxWidth: 380 }} onClick={e => e.stopPropagation()}>
            <div style={ms.header}>
              <h3 style={ms.title}>Delete Photo?</h3>
              <button style={ms.close} onClick={() => setDeletePhotoTarget(null)}>✕</button>
            </div>
            <div style={ms.body}>
              <p style={{ fontSize: 13, color: "#475569", lineHeight: 1.5 }}>
                This removes <strong>{deletePhotoTarget.photo.filename}</strong> permanently. This can't be undone.
              </p>
              <div style={ms.footer}>
                <button style={ms.cancelBtn} onClick={() => setDeletePhotoTarget(null)}>Cancel</button>
                <button style={{ ...ms.submitBtn, background: "#ef4444" }} onClick={handleDeletePhoto} disabled={deletingPhoto}>
                  {deletingPhoto ? "Deleting…" : "Delete Photo"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

const s = {
  page:        { padding: 32, background: "#f8fafc", minHeight: "100vh", fontFamily: "'DM Sans', sans-serif" },
  header:      { display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 24 },
  pageTitle:   { margin: 0, fontSize: 24, fontWeight: 700, color: "#0f172a" },
  pageSub:     { margin: "4px 0 0", fontSize: 13, color: "#64748b" },
  quotaBadge:  { marginLeft: 10, background: "#ede9fe", color: "#6366f1", padding: "2px 10px", borderRadius: 20, fontSize: 12, fontWeight: 600 },
  primaryBtn:  { background: "#6366f1", color: "#fff", border: "none", padding: "10px 20px", borderRadius: 8, cursor: "pointer", fontWeight: 600, fontSize: 14 },
  empty:       { textAlign: "center", color: "#94a3b8", padding: 40, fontSize: 14 },
  emptyCard:   { background: "#fff", borderRadius: 12, border: "1px solid #e2e8f0", padding: "60px 20px", textAlign: "center" },
  emptyIcon:   { fontSize: 40, margin: "0 0 12px" },
  emptyTitle:  { fontSize: 16, fontWeight: 700, color: "#0f172a", margin: "0 0 6px" },
  emptySub:    { fontSize: 13, color: "#64748b", margin: 0 },
  grid:        { display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(340px, 1fr))", gap: 20 },
  card:        { background: "#fff", borderRadius: 12, border: "1px solid #e2e8f0", padding: 20, boxShadow: "0 1px 4px rgba(0,0,0,.04)" },
  cardHeader:  { display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 8 },
  cardTitle:   { margin: 0, fontSize: 16, fontWeight: 700, color: "#0f172a" },
  cardAddress: { margin: "2px 0 0", fontSize: 12, color: "#64748b" },
  cardDesc:    { fontSize: 13, color: "#475569", margin: "8px 0", lineHeight: 1.5 },
  statusBadge: { padding: "3px 10px", borderRadius: 20, fontSize: 11, fontWeight: 600, flexShrink: 0 },
  dimSection:  { marginTop: 12 },
  dimLabel:    { fontSize: 11, fontWeight: 600, color: "#94a3b8", textTransform: "uppercase", letterSpacing: 0.5, margin: "0 0 6px" },
  dimGrid:     { display: "flex", flexWrap: "wrap", gap: 6 },
  dimChip:     { background: "#f1f5f9", borderRadius: 6, padding: "4px 10px", fontSize: 12, display: "flex", gap: 6, alignItems: "center" },
  dimName:     { color: "#475569", fontWeight: 600 },
  dimValue:    { color: "#6366f1", fontWeight: 700 },
  unitsRow:    { display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 12, padding: "8px 0", borderTop: "1px solid #f1f5f9" },
  unitsLabel:  { fontSize: 12, color: "#64748b" },
  unitsValue:  { fontSize: 14, fontWeight: 700, color: "#0f172a" },
  assignSection:{ marginTop: 12, paddingTop: 12, borderTop: "1px solid #f1f5f9" },
  pmChip:      { background: "#ede9fe", color: "#6366f1", padding: "3px 10px", borderRadius: 20, fontSize: 12, fontWeight: 600 },
  notAssigned: { fontSize: 12, color: "#94a3b8", margin: "4px 0" },
  cardActions: { display: "flex", gap: 8, marginTop: 14, justifyContent: "flex-end" },
  editBtn:     { background: "#ede9fe", color: "#6366f1", border: "none", padding: "6px 14px", borderRadius: 6, cursor: "pointer", fontSize: 12, fontWeight: 600 },
  deleteBtn:   { background: "#fee2e2", color: "#ef4444", border: "none", padding: "6px 14px", borderRadius: 6, cursor: "pointer", fontSize: 12, fontWeight: 600 },
  toast:       { position: "fixed", top: 20, right: 20, color: "#fff", padding: "12px 20px", borderRadius: 8, fontSize: 13, fontWeight: 600, zIndex: 9999, boxShadow: "0 4px 12px rgba(0,0,0,.15)" },

  // Occupancy chip (card header)
  occupancyChip: { background: "#eef2ff", color: "#4338ca", padding: "2px 9px", borderRadius: 20, fontSize: 11, fontWeight: 600, whiteSpace: "nowrap" },

  // Units section
  unitsSection:    { marginTop: 12, paddingTop: 12, borderTop: "1px solid #f1f5f9" },
  unitsToggle:     { display: "flex", alignItems: "center", gap: 6, background: "none", border: "none", padding: 0, cursor: "pointer", fontSize: 12, fontWeight: 700, color: "#0f172a", textTransform: "uppercase", letterSpacing: 0.5 },
  unitsPanel:      { marginTop: 10 },
  unitsSpinnerRow: { display: "flex", alignItems: "center", gap: 8, fontSize: 12, color: "#64748b", padding: "10px 0" },
  spinner:         { width: 14, height: 14, border: "2px solid #e2e8f0", borderTopColor: "#6366f1", borderRadius: "50%", display: "inline-block", animation: "spin 0.8s linear infinite" },
  unitsEmpty:      { textAlign: "center", padding: "16px 8px", background: "#f8fafc", borderRadius: 8 },
  unitsEmptyText:  { fontSize: 12, color: "#94a3b8", margin: "0 0 10px" },
  addUnitBtn:      { background: "#ede9fe", color: "#6366f1", border: "none", padding: "7px 14px", borderRadius: 8, cursor: "pointer", fontSize: 12, fontWeight: 600 },
  addUnitBtnInline:{ marginTop: 10, background: "none", border: "1px dashed #c7d2fe", color: "#6366f1", padding: "7px 14px", borderRadius: 8, cursor: "pointer", fontSize: 12, fontWeight: 600, width: "100%" },
  unitTable:       { display: "flex", flexDirection: "column", gap: 4 },
  unitRow:         { display: "grid", gridTemplateColumns: "1fr 1fr 1fr 0.8fr 0.7fr 0.9fr 1fr 0.7fr", gap: 6, alignItems: "center", fontSize: 12, color: "#334155", padding: "6px 4px", borderBottom: "1px solid #f1f5f9" },
  unitHeaderRow:   { fontSize: 10, fontWeight: 700, color: "#94a3b8", textTransform: "uppercase", letterSpacing: 0.4, borderBottom: "1px solid #e2e8f0" },
  unitCellStrong:  { fontWeight: 700, color: "#0f172a" },
  unitStatusBadge: { padding: "2px 8px", borderRadius: 20, fontSize: 10, fontWeight: 700, textAlign: "center", justifySelf: "start" },
  unitEditBtn:     { background: "none", border: "1px solid #e2e8f0", color: "#6366f1", padding: "3px 10px", borderRadius: 6, cursor: "pointer", fontSize: 11, fontWeight: 600 },
  leasePanel:      { background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 8, padding: 14, margin: "4px 0 10px", cursor: "default" },
  leaseCard:       { display: "flex", flexDirection: "column", gap: 8 },
  leaseCardHeader: { display: "flex", justifyContent: "space-between", alignItems: "flex-start" },
  leaseTenant:     { fontSize: 13, fontWeight: 700, color: "#0f172a" },
  leaseTenantEmail:{ fontSize: 11, color: "#64748b" },
  expiryBadge:     { padding: "2px 10px", borderRadius: 20, fontSize: 10, fontWeight: 700, flexShrink: 0 },
  leaseMetaRow:    { display: "flex", gap: 16, fontSize: 12, color: "#475569" },
  terminateBtn:    { alignSelf: "flex-start", background: "#fee2e2", color: "#991b1b", border: "none", padding: "6px 14px", borderRadius: 6, cursor: "pointer", fontSize: 12, fontWeight: 600, marginTop: 4 },
  leaseEmpty:      { display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 12, color: "#64748b" },
  createLeaseBtn:  { background: "#6366f1", color: "#fff", border: "none", padding: "6px 14px", borderRadius: 6, cursor: "pointer", fontSize: 12, fontWeight: 600 },
  historySection:  { marginTop: 12, paddingTop: 10, borderTop: "1px solid #e2e8f0" },
  historyToggle:   { background: "none", border: "none", color: "#64748b", fontSize: 11, fontWeight: 600, cursor: "pointer", padding: 0 },
  historyList:     { display: "flex", flexDirection: "column", gap: 4, marginTop: 8 },
  historyItem:     { display: "flex", justifyContent: "space-between", fontSize: 11, color: "#64748b", padding: "4px 0" },
  historyStatus:   { textTransform: "capitalize", fontWeight: 600, color: "#94a3b8" },
  photoSection:    { marginTop: 12, paddingTop: 10, borderTop: "1px solid #e2e8f0" },
  photoSectionHeader: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 },
  photoSectionTitle: { fontSize: 11, fontWeight: 700, color: "#64748b", textTransform: "uppercase", letterSpacing: 0.4 },
  uploadPhotosBtn: { background: "none", border: "1px solid #c7d2fe", color: "#6366f1", padding: "4px 12px", borderRadius: 6, cursor: "pointer", fontSize: 11, fontWeight: 600 },
  photoErrMsg:     { color: "#ef4444", fontSize: 11, margin: "0 0 8px" },
  photoEmptyText:  { fontSize: 12, color: "#94a3b8", margin: 0 },
  photoStrip:      { display: "flex", gap: 8, flexWrap: "wrap" },
  photoThumbWrap:  { position: "relative", width: 72, height: 72, borderRadius: 8, overflow: "hidden", border: "1px solid #e2e8f0" },
  photoThumb:      { width: "100%", height: "100%", objectFit: "cover", cursor: "pointer", display: "block" },
  photoDeleteBtn:  { position: "absolute", top: 2, right: 2, width: 18, height: 18, borderRadius: "50%", border: "none", background: "rgba(15,23,42,0.75)", color: "#fff", fontSize: 10, lineHeight: "18px", cursor: "pointer", padding: 0 },
  lightboxBox:     { position: "relative", maxWidth: "90vw", maxHeight: "90vh", display: "flex", flexDirection: "column", alignItems: "center" },
  lightboxImg:     { maxWidth: "90vw", maxHeight: "80vh", borderRadius: 8, objectFit: "contain" },
  lightboxCaption: { color: "#f1f5f9", fontSize: 13, marginTop: 10 },
  lightboxClose:   { position: "absolute", top: -36, right: 0, background: "none", border: "none", color: "#fff", fontSize: 20, cursor: "pointer" },
};

const ms = {
  overlay:     { position: "fixed", inset: 0, background: "rgba(15,23,42,.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000, padding: 20 },
  box:         { background: "#fff", borderRadius: 12, width: "100%", maxWidth: 560, maxHeight: "90vh", overflowY: "auto", boxShadow: "0 20px 60px rgba(0,0,0,.2)" },
  header:      { display: "flex", justifyContent: "space-between", alignItems: "center", padding: "18px 24px", borderBottom: "1px solid #f1f5f9", position: "sticky", top: 0, background: "#fff", zIndex: 1 },
  title:       { margin: 0, fontSize: 16, fontWeight: 700, color: "#0f172a" },
  close:       { background: "none", border: "none", fontSize: 18, cursor: "pointer", color: "#94a3b8" },
  body:        { padding: 24 },
  quotaNote:   { fontSize: 13, color: "#475569", background: "#f1f5f9", padding: "8px 12px", borderRadius: 8, marginBottom: 14 },
  label:       { display: "block", fontSize: 11, fontWeight: 600, color: "#475569", marginBottom: 5, textTransform: "uppercase", letterSpacing: 0.5 },
  req:         { color: "#ef4444" },
  input:       { width: "100%", padding: "10px 12px", border: "1px solid #e2e8f0", borderRadius: 8, fontSize: 13, marginBottom: 14, outline: "none", boxSizing: "border-box", fontFamily: "inherit" },
  errorMsg:    { color: "#ef4444", fontSize: 12, marginBottom: 12 },
  footer:      { display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 8 },
  cancelBtn:   { background: "#f1f5f9", color: "#475569", border: "none", padding: "9px 18px", borderRadius: 8, cursor: "pointer", fontSize: 13, fontWeight: 600 },
  submitBtn:   { background: "#6366f1", color: "#fff", border: "none", padding: "9px 18px", borderRadius: 8, cursor: "pointer", fontSize: 13, fontWeight: 600 },
  dimRow:      { display: "flex", gap: 8, marginBottom: 8, alignItems: "center" },
  addDimBtn:   { background: "none", border: "1px dashed #c7d2fe", color: "#6366f1", padding: "7px 14px", borderRadius: 8, cursor: "pointer", fontSize: 12, fontWeight: 600, width: "100%", marginBottom: 8 },
  removeDimBtn:{ background: "#fee2e2", color: "#ef4444", border: "none", borderRadius: 6, padding: "4px 8px", cursor: "pointer", fontSize: 12, flexShrink: 0 },
};