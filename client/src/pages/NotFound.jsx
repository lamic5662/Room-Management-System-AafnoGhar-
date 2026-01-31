import { Link } from "react-router-dom";

export default function NotFound() {
  return (
    <div className="authWrap">
      <div className="authCard card cardPad" style={{ textAlign: "center" }}>
        <div className="badge" style={{ display: "inline-flex" }}>404</div>
        <h1 className="h1" style={{ marginTop: 12 }}>Page not found</h1>
        <p className="muted" style={{ marginTop: 6 }}>
          The page you are looking for does not exist.
        </p>

        <div className="spacer" />
        <div className="row" style={{ justifyContent: "center" }}>
          <Link to="/" className="btn">Go Home</Link>
          <Link to="/rooms" className="btn btnOutline">Browse Rooms</Link>
        </div>
      </div>
    </div>
  );
}
