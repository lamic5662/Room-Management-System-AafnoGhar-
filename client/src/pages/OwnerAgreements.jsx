import { useEffect, useState } from "react";
import http from "../api/http";
import Spinner from "../components/Spinner";
import Modal from "../components/Modal";
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

  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState(null);
  const [sending, setSending] = useState(false);
  const [billOpen, setBillOpen] = useState(false);
  const [billAgreement, setBillAgreement] = useState(null);
  const [billPeriod, setBillPeriod] = useState(new Date().toISOString().slice(0, 7));
  const [billPrev, setBillPrev] = useState("");
  const [billCurrent, setBillCurrent] = useState("");
  const [billRate, setBillRate] = useState("");
  const [billSending, setBillSending] = useState(false);

  const load = async () => {
    try {
      setLoading(true);
      const res = await http.get("/api/agreements/my");
      setItems(res.data.agreements || []);
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

  const openBill = (a) => {
    setBillAgreement(a);
    setBillPeriod(new Date().toISOString().slice(0, 7));
    setBillPrev("");
    setBillCurrent("");
    setBillRate("");
    setBillOpen(true);
  };

  const createBill = async () => {
    if (!billAgreement?._id) return;
    if (!billPeriod) return showToast("error", t("Period is required"));
    if (!billCurrent || Number(billCurrent) < 0) return showToast("error", t("Current reading is required"));
    if (!billRate || Number(billRate) <= 0) return showToast("error", t("Unit rate is required"));
    try {
      setBillSending(true);
      await http.post("/api/electricity", {
        agreementId: billAgreement._id,
        period: billPeriod,
        currentReading: Number(billCurrent),
        unitRate: Number(billRate),
        previousReading: billPrev ? Number(billPrev) : undefined,
      });
      showToast("success", t("Electricity bill created ✅"));
      setBillOpen(false);
    } catch (e) {
      showToast("error", e?.response?.data?.message || t("Failed to create bill"));
    } finally {
      setBillSending(false);
    }
  };

  const downloadPdf = async (agreementId) => {
    try {
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

              <div className="cardActions">
                <button className="btn btnOutline" onClick={() => downloadPdf(a._id)}>
                  ⬇ {t("Download PDF")}
                </button>
                <button className="btn btnOutline" onClick={() => openBill(a)}>
                  ⚡ {t("Add Electricity Bill")}
                </button>
                <button className="btn" onClick={() => openSign(a)}>
                  ✍ {t("Upload Signature")}
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

      <Modal
        open={billOpen}
        title={t("Create Electricity Bill")}
        subtitle={t("Enter meter reading and unit rate for this period.")}
        onClose={() => setBillOpen(false)}
      >
        <label className="muted" style={{ fontSize: 13 }}>{t("Period (YYYY-MM)")}</label>
        <input className="input" value={billPeriod} onChange={(e) => setBillPeriod(e.target.value)} placeholder={t("2026-01")} />

        <div className="spacer" />

        <label className="muted" style={{ fontSize: 13 }}>{t("Previous Reading (optional)")}</label>
        <input className="input" value={billPrev} onChange={(e) => setBillPrev(e.target.value)} placeholder={t("e.g. 1200")} />

        <div className="spacer" />

        <label className="muted" style={{ fontSize: 13 }}>{t("Current Reading")}</label>
        <input className="input" value={billCurrent} onChange={(e) => setBillCurrent(e.target.value)} placeholder={t("e.g. 1255")} />

        <div className="spacer" />

        <label className="muted" style={{ fontSize: 13 }}>{t("Unit Rate (NPR)")}</label>
        <input className="input" value={billRate} onChange={(e) => setBillRate(e.target.value)} placeholder={t("e.g. 12")} />

        <div className="spacer" />
        <div className="row" style={{ justifyContent: "flex-end" }}>
          <button className="btn btnOutline" onClick={() => setBillOpen(false)}>{t("Cancel")}</button>
          <button className="btn" onClick={createBill} disabled={billSending}>
            {billSending ? t("Saving...") : t("Create Bill")}
          </button>
        </div>
      </Modal>
    </div>
  );
}
