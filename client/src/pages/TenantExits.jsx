import { useEffect, useState } from "react";
import http from "../api/http";
import Spinner from "../components/Spinner";
import Modal from "../components/Modal";
import { useToast } from "../context/ToastContext";
import { useI18n } from "../context/I18nContext";

export default function TenantExits() {
  const { showToast } = useToast();
  const { t } = useI18n();
  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState([]);

  const [open, setOpen] = useState(false);
  const [agreements, setAgreements] = useState([]);
  const [agreementId, setAgreementId] = useState("");
  const [moveOutDate, setMoveOutDate] = useState("");
  const [reason, setReason] = useState("I am moving to another place.");
  const [sending, setSending] = useState(false);
  const [errors, setErrors] = useState({});

  const load = async () => {
    try {
      setLoading(true);
      const res = await http.get("/api/exits/my");
      setItems(res.data.exitRequests || []);
    } catch (e) {
      showToast("error", e?.response?.data?.message || t("Failed to load exits"));
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
    } catch {
      // ignore
    }
  };

  useEffect(() => { load(); loadAgreements(); }, []);

  const requestExit = async () => {
    const nextErrors = {};
    if (!agreementId) nextErrors.agreementId = t("Select an agreement");
    if (!moveOutDate) nextErrors.moveOutDate = t("Select move-out date");
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length) {
      return showToast("error", t("Please fix the highlighted fields"));
    }

    try {
      setSending(true);
      await http.post("/api/exits", { agreementId, moveOutDate, reason });
      showToast("success", t("Exit requested ✅"));
      setOpen(false);
      setMoveOutDate("");
      setErrors({});
      await load();
    } catch (e) {
      showToast("error", e?.response?.data?.message || t("Exit request failed"));
    } finally {
      setSending(false);
    }
  };

  if (loading) return <Spinner text={t("Loading exit requests...")} />;

  return (
    <div>
      <div className="row" style={{ justifyContent: "space-between", flexWrap: "wrap" }}>
        <div>
          <h1 className="h1">{t("Exit Requests")}</h1>
          <p className="muted" style={{ marginTop: 6 }}>
            {t("Request move-out and track settlement.")}
          </p>
        </div>
        <button className="btn" onClick={() => setOpen(true)}>{t("Request Exit")}</button>
      </div>

      <div className="spacer" />

      {items.length === 0 ? (
        <div className="card cardPad">{t("No exit requests yet.")}</div>
      ) : (
        <div className="gridCards">
          {items.map((x) => (
            <div className="card cardPad" key={x._id}>
              <div className="row" style={{ justifyContent: "space-between", alignItems: "flex-start" }}>
                <div>
                  <div style={{ fontWeight: 1000 }}>{x.room?.title}</div>
                  <div className="muted" style={{ marginTop: 4 }}>{x.room?.location}</div>
                </div>
                <span className="badge">{(x.status || "").toUpperCase()}</span>
              </div>

              <div className="spacer" />
              <div className="muted" style={{ fontSize: 13 }}>
                {t("Move-out")}: <b style={{ color: "#111827" }}>{new Date(x.moveOutDate).toLocaleDateString()}</b>
              </div>
              {x.reason ? (
                <div className="muted" style={{ marginTop: 6, fontSize: 13, lineHeight: 1.6 }}>
                  <b style={{ color: "#111827" }}>{t("Reason")}:</b> {x.reason}
                </div>
              ) : null}

              {x.status === "settled" ? (
                <>
                  <div className="spacer" />
                  <div className="card cardPad" style={{ boxShadow: "none" }}>
                    <div style={{ fontWeight: 1000 }}>{t("Settlement")}</div>
                    <div className="muted" style={{ marginTop: 8, fontSize: 13, lineHeight: 1.7 }}>
                      {t("Deposit")}: NPR <b style={{ color: "#111827" }}>{x.securityDeposit}</b><br/>
                      {t("Unpaid")}: NPR <b style={{ color: "#111827" }}>{x.unpaidRent}</b><br/>
                      {t("Damages")}: NPR <b style={{ color: "#111827" }}>{x.damagesCost}</b><br/>
                      {t("Others")}: NPR <b style={{ color: "#111827" }}>{x.otherDeductions}</b><br/>
                      {t("Refund")}: NPR <b style={{ color: "#111827" }}>{x.refundableAmount}</b>
                    </div>
                    {x.ownerNote ? (
                      <div className="muted" style={{ marginTop: 10, fontSize: 13 }}>
                        <b style={{ color: "#111827" }}>{t("Owner note")}:</b> {x.ownerNote}
                      </div>
                    ) : null}
                  </div>
                </>
              ) : null}

              {x.status === "rejected" && x.ownerNote ? (
                <div className="muted" style={{ marginTop: 10, fontSize: 13 }}>
                  <b style={{ color: "#111827" }}>{t("Owner note")}:</b> {x.ownerNote}
                </div>
              ) : null}

              <div className="spacer" />
              <div className="muted" style={{ fontSize: 13 }}>
                {t("Created")}: {new Date(x.createdAt).toLocaleString()}
              </div>
            </div>
          ))}
        </div>
      )}

      <Modal open={open} title={t("Request Exit")} subtitle={t("Choose agreement and move-out date.")} onClose={() => setOpen(false)}>
        <label className="muted" style={{ fontSize: 13 }}>{t("Agreement")}</label>
        <select
          className={`input ${errors.agreementId ? "inputErr" : ""}`}
          value={agreementId}
          onChange={(e) => {
            setAgreementId(e.target.value);
            if (errors.agreementId) setErrors((p) => ({ ...p, agreementId: "" }));
          }}
        >
          {agreements.map((a) => (
            <option key={a._id} value={a._id}>
              {a.room?.title} — NPR {a.monthlyRent}
            </option>
          ))}
        </select>
        {errors.agreementId ? <div className="fieldErr">{errors.agreementId}</div> : null}

        <div className="spacer" />

        <label className="muted" style={{ fontSize: 13 }}>{t("Move-out date")}</label>
        <input
          className={`input ${errors.moveOutDate ? "inputErr" : ""}`}
          type="date"
          value={moveOutDate}
          onChange={(e) => {
            setMoveOutDate(e.target.value);
            if (errors.moveOutDate) setErrors((p) => ({ ...p, moveOutDate: "" }));
          }}
        />
        {errors.moveOutDate ? <div className="fieldErr">{errors.moveOutDate}</div> : null}

        <div className="spacer" />

        <label className="muted" style={{ fontSize: 13 }}>{t("Reason")}</label>
        <textarea className="input" value={reason} onChange={(e) => setReason(e.target.value)} style={{ minHeight: 100, paddingTop: 12 }} />

        <div className="spacer" />
        <div className="row" style={{ justifyContent: "flex-end" }}>
          <button className="btn btnOutline" onClick={() => setOpen(false)}>{t("Cancel")}</button>
          <button className="btn" onClick={requestExit} disabled={sending}>
            {sending ? t("Sending...") : t("Request")}
          </button>
        </div>
      </Modal>
    </div>
  );
}
