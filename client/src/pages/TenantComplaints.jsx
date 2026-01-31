import { useEffect, useState } from "react";
import http from "../api/http";
import Spinner from "../components/Spinner";
import Modal from "../components/Modal";
import { useToast } from "../context/ToastContext";
import { getPhotoUrl } from "../utils/photo";
import { useI18n } from "../context/I18nContext";

export default function TenantComplaints() {
  const { showToast } = useToast();
  const { t } = useI18n();
  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState([]);

  const [open, setOpen] = useState(false);
  const [agreements, setAgreements] = useState([]);
  const [agreementId, setAgreementId] = useState("");
  const [title, setTitle] = useState("Water issue");
  const [description, setDescription] = useState("Water is not available today.");
  const [sending, setSending] = useState(false);

  const load = async () => {
    try {
      setLoading(true);
      const res = await http.get("/api/complaints/my");
      setItems(res.data.complaints || []);
    } catch (e) {
      showToast("error", e?.response?.data?.message || t("Failed to load complaints"));
    } finally {
      setLoading(false);
    }
  };

  const loadAgreements = async () => {
    try {
      const res = await http.get("/api/agreements/my-tenant");
      const list = res.data.agreements || [];
      setAgreements(list);
      if (!agreementId && list[0]?._id) setAgreementId(list[0]._id);
    } catch (e) {
      showToast("error", t("Failed to load agreements"));
    }
  };

  useEffect(() => {
    load();
    loadAgreements();
  }, []);

  const create = async () => {
    if (!agreementId) return showToast("error", t("Select agreement"));
    if (!title.trim()) return showToast("error", t("Title is required"));
    if (!description.trim()) return showToast("error", t("Write complaint description"));
    try {
      setSending(true);
      await http.post("/api/complaints", { agreementId, title, description });
      showToast("success", t("Complaint sent ✅"));
      setOpen(false);
      setTitle(t("Water issue"));
      setDescription(t("Water is not available today."));
      await load();
    } catch (e) {
      showToast("error", e?.response?.data?.message || t("Failed to create complaint"));
    } finally {
      setSending(false);
    }
  };

  if (loading) return <Spinner text={t("Loading complaints...")} />;

  return (
    <div>
      <div className="row" style={{ justifyContent: "space-between", flexWrap: "wrap" }}>
        <div>
          <h1 className="h1">{t("Complaints")}</h1>
          <p className="muted" style={{ marginTop: 6 }}>
            {t("Create complaint and track responses.")}
          </p>
        </div>
        <div className="row">
          <button className="btn btnOutline" onClick={load}>{t("Refresh")}</button>
          <button className="btn" onClick={() => setOpen(true)}>{t("New Complaint")}</button>
        </div>
      </div>

      <div className="spacer" />

      {items.length === 0 ? (
        <div className="card cardPad">{t("No complaints yet.")}</div>
      ) : (
        <div className="gridCards">
          {items.map((c) => (
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

              <div style={{ fontWeight: 900 }}>{c.title}</div>
              <div className="muted" style={{ marginTop: 6, fontSize: 13, lineHeight: 1.6 }}>
                {c.description}
              </div>

              {c.ownerReply ? (
                <div className="muted" style={{ marginTop: 10, fontSize: 13, lineHeight: 1.6 }}>
                  <b style={{ color: "#111827" }}>{t("Owner")}:</b> {c.ownerReply}
                </div>
              ) : (
                <div className="muted" style={{ marginTop: 10, fontSize: 13 }}>
                  {t("Owner reply")}: {t("pending")}
                </div>
              )}

              <div className="spacer" />

              <div className="muted" style={{ fontSize: 13 }}>
                {t("Created")}: {new Date(c.createdAt).toLocaleString()}
              </div>
            </div>
          ))}
        </div>
      )}

      <Modal
        open={open}
        title={t("New Complaint")}
        subtitle={t("Choose agreement and write complaint.")}
        onClose={() => setOpen(false)}
      >
        <label className="muted" style={{ fontSize: 13 }}>{t("Agreement")}</label>
        <select className="input" value={agreementId} onChange={(e) => setAgreementId(e.target.value)}>
          {agreements.map((a) => (
            <option key={a._id} value={a._id}>
              {a.room?.title} — NPR {a.monthlyRent}
            </option>
          ))}
        </select>

        <div className="spacer" />

        <label className="muted" style={{ fontSize: 13 }}>{t("Title")}</label>
        <input className="input" value={title} onChange={(e) => setTitle(e.target.value)} />

        <div className="spacer" />

        <label className="muted" style={{ fontSize: 13 }}>{t("Description")}</label>
        <textarea
          className="input"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          style={{ minHeight: 120, paddingTop: 12 }}
        />

        <div className="spacer" />

        <div className="row" style={{ justifyContent: "flex-end" }}>
          <button className="btn btnOutline" onClick={() => setOpen(false)}>{t("Cancel")}</button>
          <button className="btn" onClick={create} disabled={sending}>
            {sending ? t("Sending...") : t("Send")}
          </button>
        </div>
      </Modal>
    </div>
  );
}
