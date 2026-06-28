import React, { useState } from "react";

function CompanySettings() {
  const [file,    setFile]    = useState(null);
  const [status,  setStatus]  = useState(""); // "success" | "error" | ""
  const [message, setMessage] = useState("");

  const uploadLogo = async () => {
    if (!file) { setStatus("error"); setMessage("Please select a file first."); return; }

    const token = localStorage.getItem("token");
    const formData = new FormData();
    formData.append("file", file);

    try {
      const res  = await fetch(`http://187.127.180.107/company/upload-logo`, {
        method:  "POST",
        headers: { Authorization: `Bearer ${token}` },
        body:    formData,
      });

      const data = await res.json();

      if (res.ok) {
        setStatus("success");
        setMessage(data.message || "Logo uploaded successfully.");
      } else {
        setStatus("error");
        setMessage(data.detail || "Upload failed.");
      }
    } catch {
      setStatus("error");
      setMessage("Server error. Please try again.");
    }
  };

  return (
    <div>
      <h2>Company Settings</h2>

      <input type="file" onChange={(e) => setFile(e.target.files[0])} />
      <button onClick={uploadLogo}>Upload Logo</button>

      {message && (
        <p style={{ marginTop: 8, color: status === "success" ? "#10b981" : "#ef4444", fontSize: 13 }}>
          {status === "success" ? "✓" : "⚠"} {message}
        </p>
      )}
    </div>
  );
}

export default CompanySettings;