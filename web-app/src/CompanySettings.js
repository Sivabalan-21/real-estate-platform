import React, { useState } from "react";

function CompanySettings() {

  const [file, setFile] = useState(null);

  const uploadLogo = async () => {

    const token = localStorage.getItem("token");

    const formData = new FormData();
    formData.append("file", file);

    const res = await fetch(
      "http://localhost:8000/company/upload-logo",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`
        },
        body: formData
      }
    );

    const data = await res.json();

    alert(data.message);
  };

  return (
    <div>
      <h2>Company Settings</h2>

      <input
        type="file"
        onChange={(e) => setFile(e.target.files[0])}
      />

      <button onClick={uploadLogo}>
        Upload Logo
      </button>
    </div>
  );
}

export default CompanySettings;