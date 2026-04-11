import { useEffect, useState } from "react";
import http from "../api/http";
import Spinner from "../components/Spinner";
import Modal from "../components/Modal";
import { useToast } from "../context/ToastContext";
import { getPhotoUrl } from "../utils/photo";
import { useI18n } from "../context/I18nContext";

export default function OwnerComplaints() {
  const { showToast } = useToast();
  const { t } = useI18n();
  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState([]);

  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState(null);
  const [reply, setReply] = useState("Fixed. Water is now available.");
  const [status, setStatus] = useState("resolved");
  const [priorityFilter, setPriorityFilter] = useState("all");
  const [sending, setSending] = useState(false);

  const load = async () => {
    try {
      setLoading(true);
      const res = await http.get("/api/complaints/incoming");
      setItems(res.data.complaints || []);
    } catch (e) {
      showToast("error", e?.response?.data?.message || t("Failed to load requests"));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const openResolve = (c) => {
    setSelected(c);
    setReply(c.ownerReply || t("Fixed. Water is now available."));
    setStatus(c.status || "open");
    setOpen(true);
  };

  const resolve = async () => {
    if (!selected?._id) return;
    if (!reply.trim()) return showToast("error", t("Write reply"));
    try {
      setSending(true);
      await http.patch(`/api/complaints/${selected._id}`, {
        status,
        ownerReply: reply,
      });
      showToast("success", t("Request updated ✅"));
      setOpen(false);
      await load();
    } catch (e) {
      showToast("error", e?.response?.data?.message || t("Failed to update"));
    } finally {
      setSending(false);
    }
  };

  if (loading) return <Spinner text={t("Loading requests...")} />;

  const filteredItems = priorityFilter === "all"
    ? items
    : items.filter((c) => (c.priority || "medium") === priorityFilter);

  return (
    <div>
      <div className="row" style={{ justifyContent: "space-between", flexWrap: "wrap" }}>
        <div>
          <h1 className="h1">{t("Maintenance Requests")}</h1>
          <p className="muted" style={{ marginTop: 6 }}>
            {t("Track, update, and resolve maintenance issues.")}
          </p>
        </div>
        <button className="btn btnOutline" onClick={load}>{t("Refresh")}</button>
      </div>

      <div className="spacer" />

      <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
        <button className={"pill " + (priorityFilter === "all" ? "" : "muted")} onClick={() => setPriorityFilter("all")}>
          {t("All priorities")}
        </button>
        <button className={"pill " + (priorityFilter === "urgent" ? "" : "muted")} onClick={() => setPriorityFilter("urgent")}>
          {t("Urgent")}
        </button>
        <button className={"pill " + (priorityFilter === "high" ? "" : "muted")} onClick={() => setPriorityFilter("high")}>
          {t("High")}
        </button>
        <button className={"pill " + (priorityFilter === "medium" ? "" : "muted")} onClick={() => setPriorityFilter("medium")}>
          {t("Medium")}
        </button>
        <button className={"pill " + (priorityFilter === "low" ? "" : "muted")} onClick={() => setPriorityFilter("low")}>
          {t("Low")}
        </button>
        {priorityFilter !== "all" && (
          <button className="pill pillInfo" onClick={() => setPriorityFilter("all")}>
            {t("Clear filter")}
          </button>
        )}
      </div>

      <div className="spacer" />

      {filteredItems.length === 0 ? (
        <div className="card cardPad">{t("No requests.")}</div>
      ) : (
        <div className="gridCards">
          {filteredItems.map((c) => (
            <div key={c._id} className="card cardPad">
              {c.room?.photos?.[0] ? (
                <div className="card" style={{ overflow: "hidden", borderRadius: 14, border: "1px solid #e5e7eb", boxShadow: "none", marginBottom: 10 }}>
                  <img
                    src={getPhotoUrl(c.room.photos[0])}
                    alt="thumb"
                    style={{ width: "100%", display: "block" }}
                  />
                </div>
              ) : null}

              <div className="row" style={{ justifyContent: "space-between", alignItems: "flex-start" }}>
                <div>
                  <div style={{ fontWeight: 900, fontSize: 16 }}>{c.room?.title}</div>
                  <div className="muted" style={{ marginTop: 4 }}>{c.room?.location}</div>
                </div>
                <span className="badge">{(c.status || "open").toUpperCase()}</span>
              </div>

              <div className="spacer" />

              <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
                <span className="pill">{(c.category || "other").toUpperCase()}</span>
                <span className="pill pillInfo">{(c.priority || "medium").toUpperCase()}</span>
              </div>

              <div className="spacer" />

              <div className="card cardPad" style={{ boxShadow: "none", borderRadius: 14 }}>
                <div style={{ fontWeight: 900 }}>{t("Tenant")}</div>
                <div className="muted" style={{ marginTop: 4, fontSize: 13 }}>
                  {c.tenant?.fullName} • {c.tenant?.phone} • {c.tenant?.email}
                </div>
                <div className="muted" style={{ marginTop: 10, fontSize: 13, lineHeight: 1.6 }}>
                  <b style={{ color: "#111827" }}>{t("Issue")}:</b> {c.title} — {c.description}
                </div>
              </div>

              {c.ownerReply ? (
                <div className="muted" style={{ marginTop: 10, fontSize: 13 }}>
                  <b style={{ color: "#111827" }}>{t("Your reply")}:</b> {c.ownerReply}
                </div>
              ) : (
                <div className="muted" style={{ marginTop: 10, fontSize: 13 }}>
                  {t("Reply")}: {t("not sent yet")}
                </div>
              )}

              <div className="spacer" />

              <div className="row" style={{ justifyContent: "space-between", flexWrap: "wrap" }}>
                <div className="muted" style={{ fontSize: 13 }}>
                  {t("Created")}: {new Date(c.createdAt).toLocaleString()}
                </div>

                <button
                  className="btn"
                  onClick={() => openResolve(c)}
                  disabled={(c.status || "open") === "resolved"}
                >
                  {t("Update")}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      <Modal
        open={open}
        title={t("Update Request")}
        subtitle={t("Update status, costs, and reply.")}
        onClose={() => setOpen(false)}
      >
        <label className="muted" style={{ fontSize: 13 }}>{t("Status")}</label>
        <select className="input" value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="open">{t("Open")}</option>
          <option value="in_progress">{t("In progress")}</option>
          <option value="resolved">{t("Resolved")}</option>
          <option value="rejected">{t("Rejected")}</option>
        </select>

        <label className="muted" style={{ fontSize: 13 }}>{t("Owner reply")}</label>
        <textarea
          className="input"
          value={reply}
          onChange={(e) => setReply(e.target.value)}
          style={{ minHeight: 120, paddingTop: 12 }}
        />

        <div className="spacer" />

        <div className="row" style={{ justifyContent: "flex-end" }}>
          <button className="btn btnOutline" onClick={() => setOpen(false)}>{t("Cancel")}</button>
          <button className="btn" onClick={resolve} disabled={sending}>
            {sending ? t("Saving...") : t("Save")}
          </button>
        </div>
      </Modal>
    </div>
  );
}
