import { useEffect, useState } from "react";
import { useSearchParams, Link } from "react-router-dom";
import http from "../api/http";

export default function KhaltiReturn() {
  const [params] = useSearchParams();
  const [msg, setMsg] = useState("Verifying Khalti payment...");

  useEffect(() => {
    const paymentId = params.get("paymentId");
    const pidx = params.get("pidx");

    (async () => {
      try {
        const res = await http.post("/api/khalti/verify", { paymentId, pidx });
        setMsg(res.data.message || "Khalti payment verified");
      } catch (e) {
        setMsg(e?.response?.data?.message || "Verification failed");
      }
    })();
  }, [params]);

  return (
    <div className="authWrap">
      <div className="authCard card cardPad" style={{ textAlign: "center" }}>
        <div className="badge" style={{ display: "inline-flex" }}>Khalti</div>
        <h1 className="h1" style={{ marginTop: 10 }}>Payment Status</h1>
        <p className="muted" style={{ marginTop: 6 }}>{msg}</p>
        <div className="spacer" />
        <div className="row" style={{ justifyContent: "center" }}>
          <Link className="btn" to="/tenant/payments">My Payments</Link>
          <Link className="btn btnOutline" to="/tenant/agreements">Agreements</Link>
        </div>
      </div>
    </div>
  );
}
