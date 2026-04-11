import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import http from "../api/http";
import Spinner from "../components/Spinner";
import SignaturePad from "../components/SignaturePad";
import { useToast } from "../context/ToastContext";
import { getPhotoUrl } from "../utils/photo";
import { useI18n } from "../context/I18nContext";

export default function OwnerAgreements() {
  const { showToast } = useToast();
  const { t } = useI18n();
  const API = "http://localhost:5001";

  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState([]);
  const [reminderDays, setReminderDays] = useState({});
  const [savingReminderId, setSavingReminderId] = useState("");

  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState(null);
  const [sending, setSending] = useState(false);

  const load = async () => {
    try {
      setLoading(true);
      const res = await http.get("/api/agreements/my");
      const list = res.data.agreements || [];
      setItems(list);
      setReminderDays(
        list.reduce((acc, a) => {
          const startDay = a.startDate ? new Date(a.startDate).getDate() : 1;
          acc[a._id] = a.rentReminderDay || startDay;
          return acc;
        }, {})
      );
    } catch (e) {
      showToast("error", e?.response?.data?.message || "Failed to load agreements");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const openSign = (a) => {
    setSelected(a);
    setOpen(true);
  };

  const uploadOwnerSignature = async (file) => {
    if (!selected?._id) return;
    if (!file) return showToast("error", t("Please sign before saving"));

    try {
      setSending(true);
      const fd = new FormData();
      fd.append("signature", file);

      await http.post(`/api/agreements/${selected._id}/sign/owner`, fd, {
        headers: { "Content-Type": "multipart/form-data" },
      });

      showToast("success", t("Owner signature uploaded ✅"));
      setOpen(false);
      await load();
    } catch (e) {
      showToast("error", e?.response?.data?.message || t("Upload failed"));
    } finally {
      setSending(false);
    }
  };

  const downloadPdf = async (agreementId) => {
    try {
      const ok = window.confirm(t("Download agreement PDF?"));
      if (!ok) return;
      const token = localStorage.getItem("token");
      const res = await fetch(`${API}/api/agreements/${agreementId}/pdf`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        showToast("error", data.message || t("Download failed"));
        return;
      }

      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);

      const a = document.createElement("a");
      a.href = url;
      a.download = `agreement-${agreementId}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
    } catch (e) {
      showToast("error", t("Download failed"));
    }
  };

  const saveReminder = async (agreementId) => {
    const day = Number(reminderDays[agreementId]);
    if (!Number.isFinite(day) || day < 1 || day > 31) {
      showToast("error", "Reminder day must be between 1 and 31");
      return;
    }
    try {
      setSavingReminderId(agreementId);
      const res = await http.patch(`/api/agreements/${agreementId}/reminder`, { day });
      showToast("success", res.data.message || "Reminder day updated ✅");
      setItems((prev) =>
        prev.map((a) => (a._id === agreementId ? { ...a, rentReminderDay: day } : a))
      );
    } catch (e) {
      showToast("error", e?.response?.data?.message || "Failed to update reminder day");
    } finally {
      setSavingReminderId("");
    }
  };

  if (loading) return <Spinner text={t("Loading agreements...")} />;

  return (
    <div>
      <div className="row" style={{ justifyContent: "space-between", flexWrap: "wrap" }}>
        <div>
          <h1 className="h1">{t("Agreements")}</h1>
          <p className="muted" style={{ marginTop: 6 }}>
            {t("Upload signature and manage active agreements.")}
          </p>
        </div>
        <button className="btn btnOutline" onClick={load}>{t("Refresh")}</button>
      </div>

      <div className="spacer" />

      {items.length === 0 ? (
        <div className="card cardPad">{t("No agreements yet.")}</div>
      ) : (
        <div className="gridCards">
          {items.map((a) => (
            <div key={a._id} className="card cardPad">
              {a.room?.photos?.[0] ? (
                <div className="card" style={{ overflow: "hidden", borderRadius: 14, border: "1px solid #e5e7eb", boxShadow: "none", marginBottom: 10 }}>
                  <img
                    src={getPhotoUrl(a.room.photos[0])}
                    alt="thumb"
                    style={{ width: "100%", display: "block" }}
                  />
                </div>
              ) : null}

              <div className="row" style={{ justifyContent: "space-between", alignItems: "flex-start" }}>
                <div>
                  <div style={{ fontWeight: 900, fontSize: 16 }}>{a.room?.title}</div>
                  <div className="muted" style={{ marginTop: 4 }}>{a.room?.location}</div>
                </div>
                <span className="badge">{(a.status || "active").toUpperCase()}</span>
              </div>

              <div className="spacer" />

              <div className="row" style={{ justifyContent: "space-between", flexWrap: "wrap" }}>
                <div className="muted" style={{ fontSize: 13 }}>
                  {t("Tenant")}: <b style={{ color: "#111827" }}>{a.tenant?.fullName}</b>
                </div>
                <div className="muted" style={{ fontSize: 13 }}>
                  {t("Rent")}: <b style={{ color: "#111827" }}>NPR {a.monthlyRent}</b>
                </div>
              </div>

              <div className="spacer" />

              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <span className="badge">{a.ownerSignatureUrl ? t("Owner Signed") : t("Owner Not Signed")}</span>
                <span className="badge">{a.tenantSignatureUrl ? t("Tenant Signed") : t("Tenant Not Signed")}</span>
              </div>

              <div className="spacer" />

              <div className="row" style={{ justifyContent: "space-between", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
                <div className="muted" style={{ fontSize: 13 }}>
                  {t("Rent reminder day")}
                </div>
                <div className="row" style={{ gap: 8, alignItems: "center" }}>
                  <select
                    className="input"
                    value={reminderDays[a._id] || 1}
                    onChange={(e) =>
                      setReminderDays((prev) => ({ ...prev, [a._id]: e.target.value }))
                    }
                    style={{ width: 100 }}
                    disabled={a.status === "ended"}
                  >
                    {Array.from({ length: 31 }, (_, i) => i + 1).map((d) => (
                      <option key={d} value={d}>
                        {d}
                      </option>
                    ))}
                  </select>
                  <button
                    className="btn btnOutline"
                    onClick={() => saveReminder(a._id)}
                    disabled={a.status === "ended" || savingReminderId === a._id}
                  >
                    {savingReminderId === a._id ? t("Saving...") : t("Save")}
                  </button>
                </div>
              </div>

              <div className="spacer" />

              <div className="agreementActions">
                <Link
                  className="btn btnOutline agreementIconBtn"
                  to={`/owner/agreements/${a._id}/chat`}
                  data-tip={t("Chat")}
                  title={t("Chat")}
                  aria-label={t("Chat")}
                >
                  💬
                </Link>
                <Link
                  className="btn btnOutline agreementIconBtn"
                  to={`/owner/agreements/${a._id}/timeline`}
                  data-tip={t("Payment Timeline")}
                  title={t("Payment Timeline")}
                  aria-label={t("Payment Timeline")}
                >
                  📅
                </Link>
                <button
                  className="btn agreementIconBtn"
                  onClick={() => openSign(a)}
                  data-tip={t("Upload Signature")}
                  title={t("Upload Signature")}
                  aria-label={t("Upload Signature")}
                >
                  ✍
                </button>
                <button
                  className="btn btnOutline agreementIconBtn"
                  onClick={() => downloadPdf(a._id)}
                  data-tip={t("Download PDF")}
                  title={t("Download PDF")}
                  aria-label={t("Download PDF")}
                >
                  ⬇
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      <SignaturePad
        open={open}
        title={t("Owner Signature")}
        subtitle={t("Draw your signature below.")}
        onClose={() => setOpen(false)}
        onSave={(blob) => {
          const file = new File([blob], "owner-signature.png", { type: "image/png" });
          uploadOwnerSignature(file);
        }}
      />
    </div>
  );
}
