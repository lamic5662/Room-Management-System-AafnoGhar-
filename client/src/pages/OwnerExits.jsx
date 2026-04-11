import { useEffect, useMemo, useState } from "react";
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
  const [downloading, setDownloading] = useState("");

  const [openReject, setOpenReject] = useState(false);
  const [selected, setSelected] = useState(null);
  const [rejectNote, setRejectNote] = useState("Cannot approve exit right now.");
  const [sendingReject, setSendingReject] = useState(false);
  const [rejectErrors, setRejectErrors] = useState({});

  const [openSettle, setOpenSettle] = useState(false);
  const [unpaidRent, setUnpaidRent] = useState("0");
  const [damagesCost, setDamagesCost] = useState("0");
  const [otherDeductions, setOtherDeductions] = useState("0");
  const [electricityUnits, setElectricityUnits] = useState("0");
  const [electricityUnitRate, setElectricityUnitRate] = useState("0");
  const [electricityAmount, setElectricityAmount] = useState("0");
  const [ownerNote, setOwnerNote] = useState("Settlement completed.");
  const [sendingSettle, setSendingSettle] = useState(false);
  const [settleErrors, setSettleErrors] = useState({});
  const [purgeBusy, setPurgeBusy] = useState("");

  useEffect(() => {
    const units = Number(electricityUnits);
    const rate = Number(electricityUnitRate);
    if (!Number.isFinite(units) || !Number.isFinite(rate)) {
      setElectricityAmount("0");
      return;
    }
    const total = Math.max(0, units * rate);
    setElectricityAmount(String(Math.ceil(total)));
  }, [electricityUnits, electricityUnitRate]);

  const statusLabel = (s) => {
    const key = String(s || "").toLowerCase();
    if (key === "settlement_pending") return t("SETTLEMENT PENDING");
    return String(s || "").toUpperCase();
  };

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

  const downloadSummary = async (exitId) => {
    if (!exitId) return;
    try {
      setDownloading(exitId);
      const res = await http.get(`/api/exits/${exitId}/summary-pdf`, { responseType: "blob" });
      const blob = new Blob([res.data], { type: "application/pdf" });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `exit-summary-${exitId}.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
    } catch (e) {
      showToast("error", e?.response?.data?.message || t("Summary download failed"));
    } finally {
      setDownloading("");
    }
  };

  const approve = async (x) => {
    try {
      setBusyId(x._id);
      await http.patch(`/api/exits/${x._id}/approve`);
      showToast("success", t("Exit approved ✅"));
      await load();
      openSettleModal(x);
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
    const baseUnpaid = Number(x?.computedUnpaidRent ?? x?.unpaidRent ?? 0) || 0;
    setUnpaidRent(String(baseUnpaid));
    setElectricityUnits(String(x?.electricityUnits ?? 0));
    setElectricityUnitRate(String(x?.electricityUnitRate ?? 0));
    setElectricityAmount(String(x?.electricityAmount ?? 0));
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
    const elecUnits = Number(electricityUnits);
    const elecRate = Number(electricityUnitRate);
    const elecAmt = Number(electricityAmount);
    if (!Number.isFinite(unpaid) || unpaid < 0) nextErrors.unpaidRent = t("Unpaid rent must be 0 or more");
    if (!Number.isFinite(damages) || damages < 0) nextErrors.damagesCost = t("Damages must be 0 or more");
    if (!Number.isFinite(others) || others < 0) nextErrors.otherDeductions = t("Other deductions must be 0 or more");
    if (!Number.isFinite(elecUnits) || elecUnits < 0) nextErrors.electricityUnits = t("Units must be 0 or more");
    if (!Number.isFinite(elecRate) || elecRate < 0) nextErrors.electricityUnitRate = t("Unit rate must be 0 or more");
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
        electricityUnits: Number(electricityUnits || 0),
        electricityUnitRate: Number(electricityUnitRate || 0),
        electricityAmount: Number(electricityAmount || 0),
        ownerNote,
      });
      showToast("success", t("Settlement sent ✅"));
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
            const status = String(x.status || "").toLowerCase();
            const canApprove = status === "requested";
            const canSettle = status === "approved";
            const canPurge = status === "settled" && x.settlementPaid;
            const canDownload = !!x?._id;
            const hasSettlement = ["settlement_pending", "settled"].includes(status) || x.settlementAt;
            const summaryUnpaid = Math.ceil(
              hasSettlement
                ? Number(x.unpaidRent || 0)
                : Number(x.computedUnpaidRent ?? x.unpaidRent ?? 0)
            );
            const refundable = Math.ceil(Number(x.refundableAmount || 0));
            const deposit = Math.ceil(Number(x.depositPaid ?? x.securityDeposit ?? 0));
            const summaryValue = hasSettlement ? refundable : summaryUnpaid;
            const showSummary = deposit > 0 || summaryValue > 0;

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
                  <div className="row" style={{ gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                    <span className="badge">{statusLabel(x.status)}</span>
                  </div>
                </div>

                <div className="spacer" />
                <div className="muted" style={{ fontSize: 13 }}>
                  {t("Move-out")}: <b style={{ color: "#111827" }}>{new Date(x.moveOutDate).toLocaleDateString()}</b>
                </div>
                {showSummary && (
                  <div className="muted" style={{ marginTop: 6, fontSize: 12 }}>
                    {t("Deposit")}: NPR {deposit} • {hasSettlement ? t("Refund") : t("Unpaid")}: NPR {summaryValue}
                  </div>
                )}
                {x.rentPerDay ? (
                  <div className="muted" style={{ marginTop: 6, fontSize: 12 }}>
                    {t("Per-day rent")}: NPR {x.rentPerDay} / {t("day")} •{" "}
                    {t("Days charged")}: {x.daysCharged} / {x.daysInMonth}{" "}
                    {x.proratedFirstMonth ? `• ${t("Prorated")}` : ""}
                  </div>
                ) : null}
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
                      <button className="btn" disabled={isBusy} onClick={() => approve(x)}>
                        {isBusy ? t("Approving...") : t("Approve")}
                      </button>
                    </>
                  )}

                  {canSettle && (
                    <button className="btn" onClick={() => openSettleModal(x)}>
                      {t("Settle")}
                    </button>
                  )}

                  {canDownload && (
                    <button
                      className="btn btnOutline"
                      onClick={() => downloadSummary(x._id)}
                      disabled={downloading === x._id}
                    >
                      {downloading === x._id ? t("Downloading...") : t("Download Summary")}
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
                </div>

                {(x.status === "settled" || x.status === "settlement_pending") && x.settlementAt && x.hasPaidRent && x.isEarlyExit && !x.settlementPaid ? (
                  <div className="muted" style={{ marginTop: 10, fontSize: 13, lineHeight: 1.7 }}>
                    {t("Deposit")}: <b style={{ color: "#111827" }}>{x.depositPaid ?? x.securityDeposit}</b> •
                    {t("Unpaid")}: <b style={{ color: "#111827" }}> {x.unpaidRent}</b> •
                    {t("Damages")}: <b style={{ color: "#111827" }}> {x.damagesCost}</b> •
                    {t("Others")}: <b style={{ color: "#111827" }}> {x.otherDeductions}</b>
                    {Number(x.electricityAmount || 0) > 0 && (
                      <> • {t("Electricity")}: <b style={{ color: "#111827" }}> {x.electricityAmount}</b></>
                    )}
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
        {selected?.rentPerDay ? (
          <div className="card cardPad" style={{ boxShadow: "none", marginBottom: 12 }}>
            <div className="muted" style={{ fontSize: 12 }}>
              {t("Per-day rent")}: NPR {selected.rentPerDay} / {t("day")} •{" "}
              {t("Days charged")}: {selected.daysCharged} / {selected.daysInMonth}{" "}
              {selected.proratedFirstMonth ? `• ${t("Prorated")}` : ""}
            </div>
            <div className="muted" style={{ fontSize: 12, marginTop: 6 }}>
              {t("Calculated unpaid rent")}: <b style={{ color: "#111827" }}>NPR {selected.computedUnpaidRent ?? 0}</b>
            </div>
            <div className="muted" style={{ fontSize: 12, marginTop: 6 }}>
              {t("Electricity due")}: <b style={{ color: "#111827" }}>NPR {electricityAmount || "0"}</b>
            </div>
          </div>
        ) : null}
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
          <div style={{ flex: 1, minWidth: 180 }}>
            <div className="muted" style={{ fontSize: 13 }}>{t("Electricity units")}</div>
            <input
              className={`input ${settleErrors.electricityUnits ? "inputErr" : ""}`}
              value={electricityUnits}
              onChange={(e) => {
                setElectricityUnits(e.target.value);
                if (settleErrors.electricityUnits) setSettleErrors((p) => ({ ...p, electricityUnits: "" }));
              }}
            />
            {settleErrors.electricityUnits ? <div className="fieldErr">{settleErrors.electricityUnits}</div> : null}
          </div>
          <div style={{ flex: 1, minWidth: 180 }}>
            <div className="muted" style={{ fontSize: 13 }}>{t("Unit rate")}</div>
            <input
              className={`input ${settleErrors.electricityUnitRate ? "inputErr" : ""}`}
              value={electricityUnitRate}
              onChange={(e) => {
                setElectricityUnitRate(e.target.value);
                if (settleErrors.electricityUnitRate) setSettleErrors((p) => ({ ...p, electricityUnitRate: "" }));
              }}
            />
            {settleErrors.electricityUnitRate ? <div className="fieldErr">{settleErrors.electricityUnitRate}</div> : null}
          </div>
          <div style={{ flex: 1, minWidth: 180 }}>
            <div className="muted" style={{ fontSize: 13 }}>{t("Electricity due")}</div>
            <input className="input" value={electricityAmount} readOnly />
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
        <div className="row" style={{ justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
          <button
            className="btn btnOutline"
            onClick={() => downloadSummary(selected?._id)}
            disabled={!selected?._id || downloading === selected?._id}
          >
            {downloading === selected?._id ? t("Downloading...") : t("Download Summary")}
          </button>
          <div className="row" style={{ gap: 8 }}>
            <button className="btn btnOutline" onClick={() => setOpenSettle(false)}>{t("Cancel")}</button>
            <button className="btn" onClick={settle} disabled={sendingSettle}>
              {sendingSettle ? t("Saving...") : t("Settle Exit")}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
