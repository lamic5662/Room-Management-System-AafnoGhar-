import { useEffect, useState } from "react";
import { useSearchParams, Link } from "react-router-dom";
import http from "../api/http";

export default function EsewaSuccess() {
  const [params] = useSearchParams();
  const [msg, setMsg] = useState("Verifying payment...");
  const [status, setStatus] = useState("pending");

  useEffect(() => {
    const paymentId = params.get("paymentId");
    const data = params.get("data");

    (async () => {
      try {
        if (!paymentId || !data) {
          setStatus("failed");
          setMsg("Missing payment data. Your payment was not completed.");
          return;
        }
        const res = await http.post("/api/esewa/verify", { paymentId, data });
        setStatus("success");
        setMsg(res.data.message || "Payment verified");
      } catch (e) {
        const raw = e?.response?.data?.message || "Verification failed";
        if (raw === "eSewa status URL missing") {
          setMsg("Verification service is unavailable. Please try again later.");
        } else if (raw === "Payment not complete") {
          setMsg("Payment was not completed. No amount was charged.");
        } else {
          setMsg(raw);
        }
        setStatus("failed");
      }
    })();
  }, [params]);

  return (
    <div className="authWrap">
      <div className="authCard card cardPad" style={{ textAlign: "center" }}>
        <div className="badge" style={{ display: "inline-flex" }}>eSewa</div>
        <h1 className="h1" style={{ marginTop: 10 }}>Payment Status</h1>
        <p className="muted" style={{ marginTop: 6 }}>{msg}</p>
        <div className="spacer" />
        <div className="row" style={{ justifyContent: "center" }}>
          {status === "success" ? (
            <Link className="btn" to="/tenant/payments">My Payments</Link>
          ) : (
            <Link className="btn" to="/tenant/agreements">Try Again</Link>
          )}
          <Link className="btn btnOutline" to="/tenant/agreements">Agreements</Link>
        </div>
      </div>
    </div>
  );
}
