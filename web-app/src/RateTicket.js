import { useParams } from "react-router-dom";

// Day 31 placeholder. The emailed link /rate/:token lands here so tenants see
// a real page instead of a blank screen. Day 44 replaces this with the actual
// star-rating form that submits the rating using this token.
export default function RateTicket() {
  const { token } = useParams();
  return (
    <div style={{ minHeight: "100vh", background: "#f1f5f9", display: "flex",
                  alignItems: "center", justifyContent: "center", padding: 16,
                  fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" }}>
      <div style={{ maxWidth: 440, background: "#fff", border: "1px solid #e2e8f0",
                    borderRadius: 12, padding: 24, textAlign: "center" }}>
        <h1 style={{ fontSize: 20, margin: "0 0 8px" }}>Thanks for your feedback</h1>
        <p style={{ color: "#64748b", fontSize: 14, margin: 0 }}>
          Rating for completed requests is coming soon. You don't need to do anything right now.
        </p>
        <p data-testid="rate-token" style={{ display: "none" }}>{token}</p>
      </div>
    </div>
  );
}
