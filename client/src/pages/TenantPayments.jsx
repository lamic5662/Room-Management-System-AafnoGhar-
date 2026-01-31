import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import http from "../api/http";
import Spinner from "../components/Spinner";
import { useToast } from "../context/ToastContext";
import { getPhotoUrl } from "../utils/photo";
import { useI18n } from "../context/I18nContext";

export default function TenantPayments() {
  const { showToast } = useToast();
  const { t } = useI18n();
  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState([]);
  const [downloading, setDownloading] = useState("");
  const [tab, setTab] = useState("pending");

  const filtered = useMemo(() => {
    if (tab === "all") return items;
    return items.filter((p) => (p.status || "pending") === tab);
  }, [items, tab]);

  const load = async () => {
    try {
      setLoading(true);
      const res = await http.get("/api/payments/my");
      setItems(res.data.payments || []);
    } catch (e) {
      showToast("error", e?.response?.data?.message || t("Failed to load payments"));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const downloadBill = async (payment) => {
    if (!payment?._id) return;
    try {
      setDownloading(payment._id);
      const res = await http.get(`/api/payments/${payment._id}/bill`, { responseType: "blob" });
      const blob = new Blob([res.data], { type: "application/pdf" });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `rent-bill-${payment.period}.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
    } catch (e) {
      showToast("error", e?.response?.data?.message || t("Bill download failed"));
    } finally {
      setDownloading("");
    }
  };

  if (loading) return <Spinner text={t("Loading your payments...")} />;

  return (
    <div>
      <div className="row" style={{ justifyContent: "space-between", flexWrap: "wrap" }}>
        <div>
          <h1 className="h1">{t("My Payments")}</h1>
          <p className="muted" style={{ marginTop: 6 }}>
            {t("Track rent payments and confirmation status.")}
          </p>
        </div>
        <button className="btn btnOutline" onClick={load}>{t("Refresh")}</button>
      </div>

      <div className="spacer" />

      <div className="row" style={{ flexWrap: "wrap" }}>
        <button className={"pill " + (tab === "pending" ? "" : "muted")} onClick={() => setTab("pending")}>
          {t("Pending")}
        </button>
        <button className={"pill " + (tab === "confirmed" ? "" : "muted")} onClick={() => setTab("confirmed")}>
          {t("Confirmed")}
        </button>
        <button className={"pill " + (tab === "all" ? "" : "muted")} onClick={() => setTab("all")}>
          {t("All")}
        </button>
        <span className="muted" style={{ marginLeft: 8, fontSize: 13 }}>
          {t("Showing")} {filtered.length} {t("payments")}
        </span>
      </div>

      <div className="spacer" />

      {filtered.length === 0 ? (
        <div className="card cardPad">
          {t("No payments in this tab.")} <Link to="/tenant/agreements">{t("Go to Agreements")}</Link>
        </div>
      ) : (
        <div className="gridCards">
          {filtered.map((p) => (
            <div key={p._id} className="card cardPad">
              {p.room?.photos?.[0] ? (
                <div className="card" style={{ overflow: "hidden", borderRadius: 14, border: "1px solid #e5e7eb", boxShadow: "none", marginBottom: 10 }}>
                  <img
                    src={getPhotoUrl(p.room.photos[0])}
                    alt="thumb"
                    style={{ width: "100%", display: "block" }}
                  />
                </div>
              ) : null}

              <div className="row" style={{ justifyContent: "space-between", alignItems: "flex-start" }}>
                <div>
                  <div style={{ fontWeight: 900, fontSize: 16 }}>{p.room?.title}</div>
                  <div className="muted" style={{ marginTop: 4 }}>{p.room?.location}</div>
                </div>
                <span className="badge">{(p.status || "pending").toUpperCase()}</span>
              </div>

              <div className="spacer" />

              <div className="row" style={{ justifyContent: "space-between", flexWrap: "wrap" }}>
                <div className="muted" style={{ fontSize: 13 }}>
                  {t("Owner")}: <b style={{ color: "#111827" }}>{p.owner?.fullName}</b>
                </div>
                <div className="muted" style={{ fontSize: 13 }}>
                  {t("Period")}: <b style={{ color: "#111827" }}>{p.period}</b>
                </div>
              </div>

              <div className="spacer" />

              <div className="row" style={{ justifyContent: "space-between", flexWrap: "wrap" }}>
                <div className="muted" style={{ fontSize: 13 }}>
                  {t("Amount")}: <b style={{ color: "#111827" }}>NPR {p.amount}</b>
                </div>
                <div className="muted" style={{ fontSize: 13 }}>
                  {t("Method")}: <b style={{ color: "#111827" }}>{p.method}</b>
                </div>
              </div>

              {p.note ? (
                <div className="muted" style={{ marginTop: 10, fontSize: 13 }}>
                  {t("Note")}: {p.note}
                </div>
              ) : null}

              <div className="spacer" />

                <div className="row" style={{ justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}>
                <div className="muted" style={{ fontSize: 13 }}>
                  {p.paidAt
                    ? `${t("Paid")}: ${new Date(p.paidAt).toLocaleString()}`
                    : `${t("Created")}: ${new Date(p.createdAt).toLocaleString()}`}
                </div>

                <div className="row" style={{ gap: 6 }}>
                  {p.agreement?._id ? (
                    <Link className="btn btnOutline" to="/tenant/agreements">
                      {t("Agreement")}
                    </Link>
                  ) : null}

                  {p.status === "confirmed" ? (
                    <button
                      className="btn btnOutline"
                      onClick={() => downloadBill(p)}
                      disabled={downloading === p._id}
                    >
                      {downloading === p._id ? t("Downloading...") : t("Download bill")}
                    </button>
                  ) : null}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
