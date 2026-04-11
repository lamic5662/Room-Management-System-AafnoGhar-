import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import http from "../api/http";
import Spinner from "../components/Spinner";
import VisitCalendar from "../components/VisitCalendar";
import { useToast } from "../context/ToastContext";
import { useI18n } from "../context/I18nContext";
import { getPhotoUrl } from "../utils/photo";
import { useNotifications } from "../context/NotificationContext";

export default function OwnerVisits() {
  const { showToast } = useToast();
  const { t } = useI18n();
  const { visitEvent } = useNotifications();
  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState([]);
  const [busyId, setBusyId] = useState("");
  const [rescheduleBusyId, setRescheduleBusyId] = useState("");
  const visitEventRef = useRef(null);
  const visitEventTimer = useRef(null);

  const load = async () => {
    try {
      setLoading(true);
      const res = await http.get("/api/visits/incoming");
      setItems(res.data.visits || []);
    } catch (e) {
      showToast("error", e?.response?.data?.message || t("Failed to load visits"));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  useEffect(() => {
    if (!visitEvent?.visit) return;
    visitEventRef.current = visitEvent;
    if (visitEventTimer.current) clearTimeout(visitEventTimer.current);
    visitEventTimer.current = setTimeout(() => {
      const evt = visitEventRef.current;
      if (!evt?.visit) return;
      setItems((prev) => {
        const idx = prev.findIndex((v) => v._id === evt.visit._id);
        if (evt.action === "deleted") {
          if (idx === -1) return prev;
          return prev.filter((v) => v._id !== evt.visit._id);
        }
        if (idx === -1) return [evt.visit, ...prev];
        const next = [...prev];
        next[idx] = evt.visit;
        return next;
      });
      if (evt.action === "deleted") showToast("info", t("Visit removed"));
      if (evt.action === "created") showToast("success", t("New visit scheduled"));
    }, 150);
    return () => {
      if (visitEventTimer.current) clearTimeout(visitEventTimer.current);
    };
  }, [visitEvent]);

  const updateStatus = async (id, status) => {
    try {
      setBusyId(id);
      const res = await http.patch(`/api/visits/${id}/status`, { status });
      if (status === "rejected") {
        setItems((prev) => prev.filter((v) => v._id !== id));
        showToast("success", t("Visit rejected ✅"));
      } else {
        setItems((prev) => prev.map((v) => (v._id === id ? res.data.visit : v)));
        showToast("success", t("Visit approved ✅"));
      }
    } catch (e) {
      showToast("error", e?.response?.data?.message || t("Failed to update visit"));
    } finally {
      setBusyId("");
    }
  };

  const decideReschedule = async (id, action) => {
    try {
      setRescheduleBusyId(id);
      const res = await http.patch(`/api/visits/${id}/reschedule/decision`, { action });
      setItems((prev) => prev.map((v) => (v._id === id ? res.data.visit : v)));
      const msg = action === "approve" ? t("Reschedule approved ✅") : t("Reschedule rejected ✅");
      showToast("success", msg);
    } catch (e) {
      showToast("error", e?.response?.data?.message || t("Failed to update visit"));
    } finally {
      setRescheduleBusyId("");
    }
  };

  const sorted = useMemo(() => {
    return [...items].sort((a, b) => new Date(a.scheduledAt) - new Date(b.scheduledAt));
  }, [items]);

  if (loading) return <Spinner text={t("Loading incoming visits...")} />;

  return (
    <div>
      <div className="row" style={{ justifyContent: "space-between", flexWrap: "wrap" }}>
        <div>
          <h1 className="h1">{t("Visit Requests")}</h1>
          <p className="muted" style={{ marginTop: 6 }}>
            {t("Approve or reject tenant visit requests.")}
          </p>
        </div>
        <button className="btn btnOutline" onClick={load}>{t("Refresh")}</button>
      </div>

      <div className="spacer" />
      <VisitCalendar visits={items} t={t} />

      <div className="spacer" />

      {sorted.length === 0 ? (
        <div className="card cardPad">{t("No visit requests.")}</div>
      ) : (
        <div className="gridCards">
          {sorted.map((v) => {
            const isPending = (v.status || "pending") === "pending";
            const isBusy = busyId === v._id;
            return (
              <div key={v._id} className="card cardPad">
                {v.room?.photos?.[0] ? (
                  <div className="card" style={{ overflow: "hidden", borderRadius: 14, border: "1px solid #e5e7eb", boxShadow: "none", marginBottom: 10 }}>
                    <img src={getPhotoUrl(v.room.photos[0])} alt="thumb" style={{ width: "100%", display: "block" }} />
                  </div>
                ) : null}

                <div className="row" style={{ justifyContent: "space-between", alignItems: "flex-start" }}>
                  <div>
                    <div style={{ fontWeight: 900, fontSize: 16 }}>{v.room?.title}</div>
                    <div className="muted" style={{ marginTop: 4 }}>{v.room?.location}</div>
                  </div>
                  <StatusBadge status={v.status} />
                </div>

                <div className="spacer" />

                <div className="row" style={{ justifyContent: "space-between", flexWrap: "wrap" }}>
                  <div className="muted" style={{ fontSize: 13 }}>
                    {t("Visit time")}: <b style={{ color: "#111827" }}>{new Date(v.scheduledAt).toLocaleString()}</b>
                  </div>
                  <div className="muted" style={{ fontSize: 13 }}>
                    {t("Tenant")}: <b style={{ color: "#111827" }}>{v.tenant?.fullName || "-"}</b>
                  </div>
                </div>

                {v.rescheduleStatus === "pending" && v.rescheduleProposedAt ? (
                  <div className="card" style={{ padding: 10, marginTop: 10, borderRadius: 12, boxShadow: "none" }}>
                    <div style={{ fontWeight: 800 }}>{t("Reschedule request")}</div>
                    <div className="muted" style={{ fontSize: 13, marginTop: 4 }}>
                      {t("Proposed time")}: <b>{new Date(v.rescheduleProposedAt).toLocaleString()}</b>
                    </div>
                    {v.rescheduleNote ? (
                      <div className="muted" style={{ fontSize: 13, marginTop: 4 }}>
                        {v.rescheduleNote}
                      </div>
                    ) : null}
                  </div>
                ) : null}

                {v.note ? (
                  <div className="muted" style={{ marginTop: 10, fontSize: 13, lineHeight: 1.5 }}>
                    “{v.note}”
                  </div>
                ) : null}

                <div className="spacer" />

                <div className="row" style={{ justifyContent: "flex-end", flexWrap: "wrap", gap: 8 }}>
                  <Link className="btn btnOutline" to={`/rooms/${v.room?._id}`}>{t("View Room")}</Link>
                  {isPending ? (
                    <>
                      <button className="btn btnOutline" onClick={() => updateStatus(v._id, "rejected")} disabled={isBusy}>
                        {isBusy ? t("Rejecting...") : t("Reject")}
                      </button>
                      <button className="btn" onClick={() => updateStatus(v._id, "approved")} disabled={isBusy}>
                        {isBusy ? t("Approving...") : t("Approve")}
                      </button>
                    </>
                  ) : null}
                  {v.rescheduleStatus === "pending" ? (
                    <>
                      <button
                        className="btn btnOutline"
                        onClick={() => decideReschedule(v._id, "reject")}
                        disabled={rescheduleBusyId === v._id}
                      >
                        {rescheduleBusyId === v._id ? t("Rejecting...") : t("Reject reschedule")}
                      </button>
                      <button
                        className="btn"
                        onClick={() => decideReschedule(v._id, "approve")}
                        disabled={rescheduleBusyId === v._id}
                      >
                        {rescheduleBusyId === v._id ? t("Approving...") : t("Approve reschedule")}
                      </button>
                    </>
                  ) : null}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function StatusBadge({ status }) {
  const { t } = useI18n();
  const s = (status || "pending").toLowerCase();
  if (s === "approved") return <span className="badge">{t("Approved")}</span>;
  if (s === "rejected") return <span className="badge">{t("Rejected")}</span>;
  if (s === "cancelled") return <span className="badge">{t("Cancelled")}</span>;
  return <span className="badge">{t("Pending")}</span>;
}
