import { useEffect, useState } from "react";
import http from "../api/http";
import Spinner from "../components/Spinner";
import { useToast } from "../context/ToastContext";
import { getPhotoUrl } from "../utils/photo";
import { useI18n } from "../context/I18nContext";

export default function OwnerRequests() {
  const { showToast } = useToast();
  const { t } = useI18n();
  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState([]);
  const [busyId, setBusyId] = useState("");

  const load = async () => {
    try {
      setLoading(true);
      const res = await http.get("/api/requests/incoming");
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

  const updateStatus = async (id, status) => {
    try {
      setBusyId(id);
      await http.patch(`/api/requests/${id}/status`, { status });
      showToast("success", t(`Request ${status} ✅`));
      load();
    } catch (e) {
      showToast("error", e?.response?.data?.message || t("Failed to update request"));
    } finally {
      setBusyId("");
    }
  };

  const createAgreement = async (id) => {
    try {
      setBusyId(id);
      await http.post(`/api/agreements/from-request/${id}`);
      showToast("success", t("Agreement created ✅"));
      load();
    } catch (e) {
      showToast("error", e?.response?.data?.message || t("Failed to create agreement"));
    } finally {
      setBusyId("");
    }
  };

  if (loading) return <Spinner text={t("Loading incoming requests...")} />;

  return (
    <div>
      <div className="row" style={{ justifyContent: "space-between", flexWrap: "wrap" }}>
        <div>
          <h1 className="h1">{t("Incoming Requests")}</h1>
          <p className="muted" style={{ marginTop: 6 }}>
            {t("Accept/reject tenant requests or create agreement.")}
          </p>
        </div>
        <button className="btn btnOutline" onClick={load}>{t("Refresh")}</button>
      </div>

      <div className="spacer" />

      {items.length === 0 ? (
        <div className="card cardPad">{t("No requests yet.")}</div>
      ) : (
        <div className="gridCards">
          {items.map((r) => {
            const isBusy = busyId === r._id;

            return (
              <div key={r._id} className="card cardPad">
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
                  <span className="badge">{(r.status || "pending").toUpperCase()}</span>
                </div>

                <div className="spacer" />

                <div className="card cardPad" style={{ boxShadow: "none", borderRadius: 14 }}>
                  <div style={{ fontWeight: 900 }}>{t("Tenant")}</div>
                  <div className="muted" style={{ marginTop: 4, fontSize: 13 }}>
                    {r.tenant?.fullName} • {r.tenant?.phone} • {r.tenant?.email}
                  </div>

                  {r.message ? (
                    <div className="muted" style={{ marginTop: 10, fontSize: 13, lineHeight: 1.5 }}>
                      “{r.message}”
                    </div>
                  ) : null}
                </div>

                <div className="spacer" />

                <div className="row" style={{ justifyContent: "space-between", flexWrap: "wrap" }}>
                  <div className="muted" style={{ fontSize: 13 }}>
                    {t("Rent")}: <b style={{ color: "#111827" }}>NPR {r.room?.monthlyRent}</b>
                  </div>
                  <div className="muted" style={{ fontSize: 13 }}>
                    {new Date(r.createdAt).toLocaleString()}
                  </div>
                </div>

                <div className="spacer" />

                <div className="row" style={{ justifyContent: "flex-end", flexWrap: "wrap" }}>
                  <button
                    className="btn btnOutline"
                    disabled={isBusy || r.status !== "pending"}
                    onClick={() => updateStatus(r._id, "rejected")}
                  >
                    {isBusy ? "..." : t("Reject")}
                  </button>

                  <button
                    className="btn btnOutline"
                    disabled={isBusy || r.status !== "pending"}
                    onClick={() => updateStatus(r._id, "approved")}
                  >
                    {isBusy ? "..." : t("Accept")}
                  </button>

                  <button
                    className="btn"
                    disabled={isBusy || r.status !== "approved"}
                    onClick={() => createAgreement(r._id)}
                  >
                    {isBusy ? t("Creating...") : t("Create Agreement")}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
