import { Link } from "react-router-dom";

export default function StatCard({ label, value, to, hint }) {
  return (
    <Link to={to || "#"} className="statCard card cardPad" style={{ textDecoration: "none" }}>
      <div className="muted" style={{ fontSize: 13 }}>{label}</div>
      <div style={{ fontSize: 30, fontWeight: 900, marginTop: 8, color: "#111827" }}>
        {value ?? 0}
      </div>
      {hint ? <div className="muted" style={{ marginTop: 6, fontSize: 13 }}>{hint}</div> : null}
    </Link>
  );
}
