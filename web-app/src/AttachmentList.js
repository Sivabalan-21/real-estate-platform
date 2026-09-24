import React from "react";

const API = "http://localhost:8000";

function attachmentUrl(url) {
  if (!url) return "#";
  return url.startsWith("http") ? url : `${API}${url}`;
}

function attachmentKind(attachment) {
  const filename = (attachment.filename || "").toLowerCase();
  if (filename.match(/\.(jpg|jpeg|png|gif|webp)$/)) return "Image";
  if (attachment.type === "pm_note" || filename.endsWith(".pdf")) return "PDF";
  return attachment.type || "Document";
}

function formatDate(value) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}

function AttachmentList({ attachments = [], onRequestDelete }) {
  if (!attachments.length) return <p style={styles.muted}>No attachments yet.</p>;

  return (
    <div style={styles.list}>
      {attachments.map(attachment => {
        const url = attachmentUrl(attachment.url);
        const kind = attachmentKind(attachment);
        return (
          <div key={attachment.id} style={styles.card}>
            <span style={styles.icon} aria-hidden="true">{kind === "Image" ? "🖼️" : "📄"}</span>
            <div style={styles.info}>
              <a href={url} target="_blank" rel="noreferrer" style={styles.filename} title={attachment.filename}>
                {attachment.filename || "Unnamed document"}
              </a>
              <span style={styles.meta}>
                {kind} · {attachment.type === "pm_note" ? "PM Document" : "Ticket attachment"} · {formatDate(attachment.uploaded_at)}
              </span>
            </div>
            <div style={styles.actions}>
              <a href={url} target="_blank" rel="noreferrer" style={styles.action}>View</a>
              <a href={url} download={attachment.filename} style={styles.action}>Download</a>
              {onRequestDelete && (
                <button type="button" style={styles.delete} onClick={() => onRequestDelete(attachment)}>
                  Delete
                </button>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

const styles = {
  list: { display: "flex", flexDirection: "column", gap: 8, marginTop: 10, minWidth: 0 },
  card: { display: "flex", alignItems: "center", gap: 11, minWidth: 0, padding: "11px 12px", border: "1px solid #e2e8f0", borderRadius: 10, background: "#fff" },
  icon: { width: 30, height: 30, display: "grid", placeItems: "center", flexShrink: 0, borderRadius: 8, background: "#f1f5f9", fontSize: 16 },
  info: { display: "flex", flexDirection: "column", gap: 3, minWidth: 0, flex: 1 },
  filename: { display: "block", minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", color: "#334155", fontSize: 13, fontWeight: 700, textDecoration: "none" },
  meta: { overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", color: "#94a3b8", fontSize: 11 },
  actions: { display: "flex", alignItems: "center", gap: 9, flexShrink: 0, flexWrap: "wrap", justifyContent: "flex-end" },
  action: { color: "#4f46e5", fontSize: 11, fontWeight: 700, textDecoration: "none" },
  delete: { border: 0, background: "transparent", color: "#64748b", padding: 0, cursor: "pointer", font: "inherit", fontSize: 11, fontWeight: 700 },
  muted: { color: "#64748b", fontSize: 13 },
};

export default AttachmentList;
