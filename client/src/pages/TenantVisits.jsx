import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import http from "../api/http";
import Spinner from "../components/Spinner";
import VisitCalendar from "../components/VisitCalendar";
import Modal from "../components/Modal";
import { useToast } from "../context/ToastContext";
import { useI18n } from "../context/I18nContext";
import { getPhotoUrl } from "../utils/photo";
import { useNotifications } from "../context/NotificationContext";

export default function TenantVisits() {
  const { showToast } = useToast();
  const { t } = useI18n();
  const { visitEvent } = useNotifications();
  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState([]);
  const visitEventRef = useRef(null);
  const visitEventTimer = useRef(null);
  const [rescheduleOpen, setRescheduleOpen] = useState(false);
  const [rescheduleId, setRescheduleId] = useState("");
  const [rescheduleAt, setRescheduleAt] = useState("");
  const [rescheduleNote, setRescheduleNote] = useState("");
  const [rescheduling, setRescheduling] = useState(false);
  const minRescheduleAt = useMemo(() => {
    const d = new Date();
    const pad = (n) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  }, []);

  const load = async () => {
    try {
      setLoading(true);
      const res = await http.get("/api/visits/my");
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

  const cancelVisit = async (id) => {
    if (!confirm(t("Cancel this visit?"))) return;
    try {
      await http.patch(`/api/visits/${id}/cancel`);
      setItems((prev) => prev.filter((v) => v._id !== id));
      showToast("success", t("Visit cancelled"));
    } catch (e) {
      showToast("error", e?.response?.data?.message || t("Failed to cancel visit"));
    }
  };

  const openReschedule = (v) => {
    setRescheduleId(v._id);
    setRescheduleAt("");
    setRescheduleNote(v.rescheduleNote || "");
    setRescheduleOpen(true);
  };

  const submitReschedule = async () => {
    if (!rescheduleId || rescheduling) return;
    if (!rescheduleAt) return showToast("error", t("Please select a visit time."));
    try {
      setRescheduling(true);
      const res = await http.patch(`/api/visits/${rescheduleId}/reschedule`, {
        scheduledAt: rescheduleAt,
        note: rescheduleNote,
      });
      setItems((prev) => prev.map((v) => (v._id === rescheduleId ? res.data.visit : v)));
      showToast("success", t("Reschedule requested ✅"));
      setRescheduleOpen(false);
      setRescheduleId("");
      setRescheduleAt("");
      setRescheduleNote("");
    } catch (e) {
      showToast("error", e?.response?.data?.message || t("Failed to request reschedule"));
    } finally {
      setRescheduling(false);
    }
  };

  const sorted = useMemo(() => {
    return [...items].sort((a, b) => new Date(a.scheduledAt) - new Date(b.scheduledAt));
  }, [items]);

  if (loading) return <Spinner text={t("Loading your visits...")} />;

  return (
    <div>
      <div className="row" style={{ justifyContent: "space-between", flexWrap: "wrap" }}>
        <div>
          <h1 className="h1">{t("My Visits")}</h1>
          <p className="muted" style={{ marginTop: 6 }}>
            {t("Track scheduled room visits and updates.")}
          </p>
        </div>
        <button className="btn btnOutline" onClick={load}>{t("Refresh")}</button>
      </div>

      <div className="spacer" />
      <VisitCalendar visits={items} t={t} />

      <div className="spacer" />

      {sorted.length === 0 ? (
        <div className="card cardPad">
          {t("No visits yet.")} <Link to="/rooms">{t("Browse Rooms")}</Link>
        </div>
      ) : (
        <div className="gridCards">
          {sorted.map((v) => (
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
                  {t("Owner")}: <b style={{ color: "#111827" }}>{v.owner?.fullName || "-"}</b>
                </div>
              </div>

              {v.rescheduleStatus === "pending" && v.rescheduleProposedAt ? (
                <div className="muted" style={{ marginTop: 6, fontSize: 13 }}>
                  {t("Reschedule pending")}: {new Date(v.rescheduleProposedAt).toLocaleString()}
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
                {["pending", "approved"].includes((v.status || "").toLowerCase()) && v.rescheduleStatus !== "pending" ? (
                  <button className="btn btnOutline" onClick={() => openReschedule(v)}>{t("Request reschedule")}</button>
                ) : null}
                {["pending", "approved"].includes((v.status || "").toLowerCase()) ? (
                  <button className="btn btnOutline" onClick={() => cancelVisit(v._id)}>{t("Cancel visit")}</button>
                ) : null}
              </div>
            </div>
          ))}
        </div>
      )}

      <Modal
        open={rescheduleOpen}
        title={t("Reschedule visit")}
        subtitle={t("Select new date & time")}
        onClose={() => setRescheduleOpen(false)}
      >
        <div className="muted" style={{ fontSize: 13 }}>{t("Visit time")}</div>
        <input
          type="datetime-local"
          className="input"
          value={rescheduleAt}
          onChange={(e) => setRescheduleAt(e.target.value)}
          min={minRescheduleAt}
        />

        <div className="spacer" />
        <div className="muted" style={{ fontSize: 13 }}>{t("Visit note (optional)")}</div>
        <textarea
          className="input"
          value={rescheduleNote}
          onChange={(e) => setRescheduleNote(e.target.value)}
          placeholder={t("e.g. I can visit after 5 PM")}
          style={{ minHeight: 90, paddingTop: 12 }}
        />

        <div className="spacer" />
        <div className="row" style={{ justifyContent: "flex-end" }}>
          <button className="btn btnOutline" onClick={() => setRescheduleOpen(false)}>{t("Cancel")}</button>
          <button className="btn" onClick={submitReschedule} disabled={rescheduling}>
            {rescheduling ? t("Saving...") : t("Request")}
          </button>
        </div>
      </Modal>
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
