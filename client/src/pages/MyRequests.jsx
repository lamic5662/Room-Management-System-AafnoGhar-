import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import http from "../api/http";
import Spinner from "../components/Spinner";
import { useToast } from "../context/ToastContext";
import { getPhotoUrl } from "../utils/photo";
import { useI18n } from "../context/I18nContext";

export default function MyRequests() {
  const { showToast } = useToast();
  const { t } = useI18n();
  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState([]);

  const load = async () => {
    try {
      setLoading(true);
      const res = await http.get("/api/requests/my");
      setItems(res.data.requests || []);
    } catch (e) {
      showToast("error", e?.response?.data?.message || t("Failed to load requests"));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  if (loading) return <Spinner text={t("Loading your requests...")} />;

  return (
    <div>
      <div className="row" style={{ justifyContent: "space-between", flexWrap: "wrap" }}>
        <div>
          <h1 className="h1">{t("My Requests")}</h1>
          <p className="muted" style={{ marginTop: 6 }}>
            {t("Track your requests and their status.")}
          </p>
        </div>
        <button className="btn btnOutline" onClick={load}>{t("Refresh")}</button>
      </div>

      <div className="spacer" />

      {items.length === 0 ? (
        <div className="card cardPad">
          {t("No requests yet.")} <Link to="/rooms">{t("Browse Rooms")}</Link>
        </div>
      ) : (
        <div className="gridCards">
          {items.map((r) => (
            <div key={r._id} className="card cardPad">
              {/* thumbnail */}
              {r.room?.photos?.[0] ? (
                <div className="card" style={{ overflow: "hidden", borderRadius: 14, border: "1px solid #e5e7eb", boxShadow: "none", marginBottom: 10 }}>
                  <img
                    src={getPhotoUrl(r.room.photos[0])}
                    alt="thumb"
                    style={{ width: "100%", display: "block" }}
                  />
                </div>
              ) : null}

              <div className="row" style={{ justifyContent: "space-between", alignItems: "flex-start" }}>
                <div>
                  <div style={{ fontWeight: 900, fontSize: 16 }}>{r.room?.title}</div>
                  <div className="muted" style={{ marginTop: 4 }}>{r.room?.location}</div>
                </div>
                <StatusBadge status={r.status} />
              </div>

              <div className="spacer" />

              <div className="row" style={{ justifyContent: "space-between" }}>
                <div className="muted" style={{ fontSize: 13 }}>
                  {t("Rent")}: <b style={{ color: "#111827" }}>NPR {r.room?.monthlyRent}</b>
                </div>
                <div className="muted" style={{ fontSize: 13 }}>
                  {new Date(r.createdAt).toLocaleString()}
                </div>
              </div>

              {r.message ? (
                <div className="muted" style={{ marginTop: 10, fontSize: 13, lineHeight: 1.5 }}>
                  “{r.message}”
                </div>
              ) : null}

              <div className="spacer" />

              <div className="row" style={{ justifyContent: "flex-end", flexWrap: "wrap" }}>
                <Link className="btn btnOutline" to={`/rooms/${r.room?._id}`}>{t("View Room")}</Link>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function StatusBadge({ status }) {
  const { t } = useI18n();
  const s = (status || "pending").toLowerCase();
  let text = t("PENDING");
  if (s === "accepted" || s === "approved") text = t("ACCEPTED");
  if (s === "rejected") text = t("REJECTED");

  return <span className="badge">{text}</span>;
}
