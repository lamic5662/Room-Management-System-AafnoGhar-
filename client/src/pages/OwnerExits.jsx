import { useEffect, useState } from "react";
import http from "../api/http";
import Spinner from "../components/Spinner";
import Modal from "../components/Modal";
import { useToast } from "../context/ToastContext";
import { useI18n } from "../context/I18nContext";

export default function OwnerExits() {
  const { showToast } = useToast();
  const { t } = useI18n();
  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState([]);
  const [busyId, setBusyId] = useState("");

  const [openReject, setOpenReject] = useState(false);
  const [selected, setSelected] = useState(null);
  const [rejectNote, setRejectNote] = useState("Cannot approve exit right now.");
  const [sendingReject, setSendingReject] = useState(false);
  const [rejectErrors, setRejectErrors] = useState({});

  const [openSettle, setOpenSettle] = useState(false);
  const [unpaidRent, setUnpaidRent] = useState("0");
  const [damagesCost, setDamagesCost] = useState("0");
  const [otherDeductions, setOtherDeductions] = useState("0");
  const [ownerNote, setOwnerNote] = useState("Settlement completed.");
  const [sendingSettle, setSendingSettle] = useState(false);
  const [settleErrors, setSettleErrors] = useState({});
  const [purgeBusy, setPurgeBusy] = useState("");

  const load = async () => {
    try {
      setLoading(true);
      const res = await http.get("/api/exits/incoming");
      setItems(res.data.exitRequests || []);
    } catch (e) {
      showToast("error", e?.response?.data?.message || t("Failed to load exits"));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const approve = async (id) => {
    try {
      setBusyId(id);
      await http.patch(`/api/exits/${id}/approve`);
      showToast("success", t("Exit approved ✅"));
      load();
    } catch (e) {
      showToast("error", e?.response?.data?.message || t("Approve failed"));
    } finally {
      setBusyId("");
    }
  };

  const openRejectModal = (x) => {
    setSelected(x);
    setRejectNote(t("Cannot approve exit right now."));
    setOpenReject(true);
  };

  const reject = async () => {
    const nextErrors = {};
    if (!selected?._id) nextErrors.selected = t("No exit request selected");
    if (!rejectNote.trim()) nextErrors.rejectNote = t("Reason is required");
    setRejectErrors(nextErrors);
    if (Object.keys(nextErrors).length) {
      return showToast("error", t("Please fix the highlighted fields"));
    }
    try {
      setSendingReject(true);
      await http.patch(`/api/exits/${selected._id}/reject`, { ownerNote: rejectNote });
      showToast("success", t("Exit rejected ✅"));
      setOpenReject(false);
      setRejectErrors({});
      load();
    } catch (e) {
      showToast("error", e?.response?.data?.message || t("Reject failed"));
    } finally {
      setSendingReject(false);
    }
  };

  const openSettleModal = (x) => {
    setSelected(x);
    setUnpaidRent("0");
    setDamagesCost("0");
    setOtherDeductions("0");
    setOwnerNote(t("Settlement completed."));
    setOpenSettle(true);
  };

  const settle = async () => {
    const nextErrors = {};
    if (!selected?._id) nextErrors.selected = t("No exit request selected");
    const unpaid = Number(unpaidRent);
    const damages = Number(damagesCost);
    const others = Number(otherDeductions);
    if (!Number.isFinite(unpaid) || unpaid < 0) nextErrors.unpaidRent = t("Unpaid rent must be 0 or more");
    if (!Number.isFinite(damages) || damages < 0) nextErrors.damagesCost = t("Damages must be 0 or more");
    if (!Number.isFinite(others) || others < 0) nextErrors.otherDeductions = t("Other deductions must be 0 or more");
    if (!ownerNote.trim()) nextErrors.ownerNote = t("Owner note is required");
    setSettleErrors(nextErrors);
    if (Object.keys(nextErrors).length) {
      return showToast("error", t("Please fix the highlighted fields"));
    }
    try {
      setSendingSettle(true);
      await http.patch(`/api/exits/${selected._id}/settle`, {
        unpaidRent: Number(unpaidRent || 0),
        damagesCost: Number(damagesCost || 0),
        otherDeductions: Number(otherDeductions || 0),
        ownerNote,
      });
      showToast("success", t("Exit settled ✅ Agreement ended"));
      setOpenSettle(false);
      setSettleErrors({});
      load();
    } catch (e) {
      showToast("error", e?.response?.data?.message || t("Settle failed"));
    } finally {
      setSendingSettle(false);
    }
  };

  const purge = async (id) => {
    const ok = window.confirm(t("Delete all tenant-related data for this room? This cannot be undone."));
    if (!ok) return;
    try {
      setPurgeBusy(id);
      await http.delete(`/api/exits/${id}/purge`);
      showToast("success", t("All tenant-related data deleted ✅"));
      load();
    } catch (e) {
      showToast("error", e?.response?.data?.message || t("Delete failed"));
    } finally {
      setPurgeBusy("");
    }
  };

  if (loading) return <Spinner text={t("Loading incoming exits...")} />;

  return (
    <div>
      <div className="row" style={{ justifyContent: "space-between", flexWrap: "wrap" }}>
        <div>
          <h1 className="h1">{t("Exit Requests")}</h1>
          <p className="muted" style={{ marginTop: 6 }}>{t("Approve, reject, and settle move-outs.")}</p>
        </div>
        <button className="btn btnOutline" onClick={load}>{t("Refresh")}</button>
      </div>

      <div className="spacer" />

      {items.length === 0 ? (
        <div className="card cardPad">{t("No exit requests.")}</div>
      ) : (
        <div className="gridCards">
          {items.map((x) => {
            const isBusy = busyId === x._id;
            const canApprove = x.status === "requested";
            const canSettle = x.status === "approved";
            const canPurge = x.status === "approved" || x.status === "settled";

            return (
              <div key={x._id} className="card cardPad">
                <div className="row" style={{ justifyContent: "space-between", alignItems: "flex-start" }}>
                  <div>
                    <div style={{ fontWeight: 1000 }}>{x.room?.title}</div>
                    <div className="muted" style={{ marginTop: 4 }}>{x.room?.location}</div>
                    <div className="muted" style={{ marginTop: 6, fontSize: 13 }}>
                      {t("Tenant")}: <b style={{ color: "#111827" }}>{x.tenant?.fullName}</b> • {x.tenant?.phone}
                    </div>
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

                <div className="spacer" />
                <div className="row" style={{ justifyContent: "flex-end", flexWrap: "wrap" }}>
                  {canApprove && (
                    <>
                      <button className="btn btnOutline" disabled={isBusy} onClick={() => openRejectModal(x)}>
                        {t("Reject")}
                      </button>
                      <button className="btn" disabled={isBusy} onClick={() => approve(x._id)}>
                        {isBusy ? t("Approving...") : t("Approve")}
                      </button>
                    </>
                  )}

                  {canSettle && (
                    <button className="btn" onClick={() => openSettleModal(x)}>
                      {t("Settle")}
                    </button>
                  )}

                  {canPurge && (
                    <button
                      className="btn btnOutline"
                      onClick={() => purge(x._id)}
                      disabled={purgeBusy === x._id || isBusy}
                    >
                      {purgeBusy === x._id ? t("Deleting...") : t("Delete Data")}
                    </button>
                  )}

                  {x.status === "settled" && (
                    <span className="muted" style={{ fontSize: 13 }}>
                      {t("Refund")}: <b style={{ color: "#111827" }}>NPR {x.refundableAmount}</b>
                    </span>
                  )}
                </div>

                {x.status === "settled" ? (
                  <div className="muted" style={{ marginTop: 10, fontSize: 13, lineHeight: 1.7 }}>
                    {t("Deposit")}: <b style={{ color: "#111827" }}>{x.securityDeposit}</b> •
                    {t("Unpaid")}: <b style={{ color: "#111827" }}> {x.unpaidRent}</b> •
                    {t("Damages")}: <b style={{ color: "#111827" }}> {x.damagesCost}</b> •
                    {t("Others")}: <b style={{ color: "#111827" }}> {x.otherDeductions}</b> •
                    {t("Refund")}: <b style={{ color: "#111827" }}> {x.refundableAmount}</b>
                  </div>
                ) : null}

                {x.ownerNote ? (
                  <div className="muted" style={{ marginTop: 10, fontSize: 13 }}>
                    <b style={{ color: "#111827" }}>{t("Note")}:</b> {x.ownerNote}
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      )}

      <Modal open={openReject} title={t("Reject Exit")} subtitle={t("Write a reason for tenant.")} onClose={() => setOpenReject(false)}>
        <label className="muted" style={{ fontSize: 13 }}>{t("Reason / Note")}</label>
        <textarea
          className={`input ${rejectErrors.rejectNote ? "inputErr" : ""}`}
          value={rejectNote}
          onChange={(e) => {
            setRejectNote(e.target.value);
            if (rejectErrors.rejectNote) setRejectErrors((p) => ({ ...p, rejectNote: "" }));
          }}
          style={{ minHeight: 110, paddingTop: 12 }}
        />
        {rejectErrors.rejectNote ? <div className="fieldErr">{rejectErrors.rejectNote}</div> : null}
        <div className="spacer" />
        <div className="row" style={{ justifyContent: "flex-end" }}>
          <button className="btn btnOutline" onClick={() => setOpenReject(false)}>{t("Cancel")}</button>
          <button className="btn" onClick={reject} disabled={sendingReject}>
            {sendingReject ? t("Rejecting...") : t("Reject")}
          </button>
        </div>
      </Modal>

      <Modal open={openSettle} title={t("Settle Exit")} subtitle={t("Enter deductions and confirm refund.")} onClose={() => setOpenSettle(false)}>
        <div className="row" style={{ flexWrap: "wrap" }}>
          <div style={{ flex: 1, minWidth: 180 }}>
            <div className="muted" style={{ fontSize: 13 }}>{t("Unpaid rent")}</div>
            <input
              className={`input ${settleErrors.unpaidRent ? "inputErr" : ""}`}
              value={unpaidRent}
              onChange={(e) => {
                setUnpaidRent(e.target.value);
                if (settleErrors.unpaidRent) setSettleErrors((p) => ({ ...p, unpaidRent: "" }));
              }}
            />
            {settleErrors.unpaidRent ? <div className="fieldErr">{settleErrors.unpaidRent}</div> : null}
          </div>
          <div style={{ flex: 1, minWidth: 180 }}>
            <div className="muted" style={{ fontSize: 13 }}>{t("Damages cost")}</div>
            <input
              className={`input ${settleErrors.damagesCost ? "inputErr" : ""}`}
              value={damagesCost}
              onChange={(e) => {
                setDamagesCost(e.target.value);
                if (settleErrors.damagesCost) setSettleErrors((p) => ({ ...p, damagesCost: "" }));
              }}
            />
            {settleErrors.damagesCost ? <div className="fieldErr">{settleErrors.damagesCost}</div> : null}
          </div>
          <div style={{ flex: 1, minWidth: 180 }}>
            <div className="muted" style={{ fontSize: 13 }}>{t("Other deductions")}</div>
            <input
              className={`input ${settleErrors.otherDeductions ? "inputErr" : ""}`}
              value={otherDeductions}
              onChange={(e) => {
                setOtherDeductions(e.target.value);
                if (settleErrors.otherDeductions) setSettleErrors((p) => ({ ...p, otherDeductions: "" }));
              }}
            />
            {settleErrors.otherDeductions ? <div className="fieldErr">{settleErrors.otherDeductions}</div> : null}
          </div>
        </div>

        <div className="spacer" />

        <div className="muted" style={{ fontSize: 13 }}>{t("Owner note")}</div>
        <textarea
          className={`input ${settleErrors.ownerNote ? "inputErr" : ""}`}
          value={ownerNote}
          onChange={(e) => {
            setOwnerNote(e.target.value);
            if (settleErrors.ownerNote) setSettleErrors((p) => ({ ...p, ownerNote: "" }));
          }}
          style={{ minHeight: 90, paddingTop: 12 }}
        />
        {settleErrors.ownerNote ? <div className="fieldErr">{settleErrors.ownerNote}</div> : null}

        <div className="spacer" />
        <div className="row" style={{ justifyContent: "flex-end" }}>
          <button className="btn btnOutline" onClick={() => setOpenSettle(false)}>{t("Cancel")}</button>
          <button className="btn" onClick={settle} disabled={sendingSettle}>
            {sendingSettle ? t("Saving...") : t("Settle & End Agreement")}
          </button>
        </div>
      </Modal>
    </div>
  );
}
