import { Link } from "react-router-dom";

export default function EsewaFailure() {
  return (
    <div className="authWrap">
      <div className="authCard card cardPad" style={{ textAlign: "center" }}>
        <div className="badge" style={{ display: "inline-flex" }}>eSewa</div>
        <h1 className="h1" style={{ marginTop: 10 }}>Payment Failed</h1>
        <p className="muted" style={{ marginTop: 6 }}>
          Your payment was not completed. You can try again.
        </p>
        <div className="spacer" />
        <div className="row" style={{ justifyContent: "center" }}>
          <Link className="btn" to="/tenant/agreements">Try Again</Link>
          <Link className="btn btnOutline" to="/rooms">Browse Rooms</Link>
        </div>
      </div>
    </div>
  );
}
