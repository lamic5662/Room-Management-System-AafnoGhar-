import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import http from "../api/http";
import Spinner from "../components/Spinner";
import SignaturePad from "../components/SignaturePad";
import { useToast } from "../context/ToastContext";
import { getPhotoUrl } from "../utils/photo";
import { useI18n } from "../context/I18nContext";

export default function TenantAgreements() {
  const { showToast } = useToast();
  const { t } = useI18n();
  const API = "http://localhost:5001";

  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState([]);

  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState(null);
  const [sending, setSending] = useState(false);

  const load = async () => {
    try {
      setLoading(true);
      const res = await http.get("/api/agreements/my-tenant");
      setItems(res.data.agreements || []);
    } catch (e) {
      showToast("error", e?.response?.data?.message || t("Failed to load agreements"));
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

  const uploadTenantSignature = async (file) => {
    if (!selected?._id) return;
    if (!file) return showToast("error", t("Please sign before saving"));

    try {
      setSending(true);
      const fd = new FormData();
      fd.append("signature", file);

      await http.post(`/api/agreements/${selected._id}/sign/tenant`, fd, {
        headers: { "Content-Type": "multipart/form-data" },
      });

      showToast("success", t("Tenant signature uploaded ✅"));
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

  if (loading) return <Spinner text={t("Loading your agreements...")} />;

  return (
    <div>
      <div className="row" style={{ justifyContent: "space-between", flexWrap: "wrap" }}>
        <div>
          <h1 className="h1">{t("My Agreements")}</h1>
          <p className="muted" style={{ marginTop: 6 }}>
            {t("Upload your signature and pay monthly rent.")}
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
                  {t("Owner")}: <b style={{ color: "#111827" }}>{a.owner?.fullName}</b>
                </div>
                <div className="muted" style={{ fontSize: 13 }}>
                  {t("Rent")}: <b style={{ color: "#111827" }}>NPR {a.monthlyRent}</b>
                </div>
              </div>

              <div className="spacer" />

              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <span className="badge">{a.ownerSignatureUrl ? t("Owner Signed") : t("Owner Not Signed")}</span>
                <span className="badge">{a.tenantSignatureUrl ? t("You Signed") : t("You Not Signed")}</span>
              </div>

              <div className="spacer" />

              <div className="agreementActions">
                {a.status !== "ended" && (
                  <Link
                    className="btn agreementIconBtn"
                    to={`/tenant/pay/${a._id}`}
                    data-tip={t("Pay Rent")}
                    title={t("Pay Rent")}
                    aria-label={t("Pay Rent")}
                  >
                    💳
                  </Link>
                )}
                <Link
                  className="btn btnOutline agreementIconBtn"
                  to={`/tenant/agreements/${a._id}/chat`}
                  data-tip={t("Chat")}
                  title={t("Chat")}
                  aria-label={t("Chat")}
                >
                  💬
                </Link>
                <Link
                  className="btn btnOutline agreementIconBtn"
                  to={`/tenant/agreements/${a._id}/timeline`}
                  data-tip={t("Payment Timeline")}
                  title={t("Payment Timeline")}
                  aria-label={t("Payment Timeline")}
                >
                  📅
                </Link>
                {a.status !== "ended" && (
                  <button
                    className="btn agreementIconBtn"
                    onClick={() => openSign(a)}
                    data-tip={t("Upload Signature")}
                    title={t("Upload Signature")}
                    aria-label={t("Upload Signature")}
                  >
                    ✍
                  </button>
                )}
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
        title={t("Tenant Signature")}
        subtitle={t("Draw your signature below.")}
        onClose={() => setOpen(false)}
        onSave={(blob) => {
          const file = new File([blob], "tenant-signature.png", { type: "image/png" });
          uploadTenantSignature(file);
        }}
      />
    </div>
  );
}
