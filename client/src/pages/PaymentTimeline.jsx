import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import http from "../api/http";
import Spinner from "../components/Spinner";
import { useToast } from "../context/ToastContext";
import { useI18n } from "../context/I18nContext";

export default function PaymentTimeline() {
  const { agreementId } = useParams();
  const { showToast } = useToast();
  const { t } = useI18n();
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState(null);
  const [downloading, setDownloading] = useState("");
  const [feeInputs, setFeeInputs] = useState({});
  const [feeBusy, setFeeBusy] = useState("");

  const user = useMemo(() => JSON.parse(localStorage.getItem("user") || "null"), []);
  const isOwner = user?.role === "owner";
  const paymentsPath = isOwner ? "/owner/payments" : "/tenant/payments";

  const load = async () => {
    try {
      setLoading(true);
      const res = await http.get(`/api/payments/timeline?agreementId=${agreementId}`);
      setData(res.data);
      const nextFees = {};
      (res.data?.periods || []).forEach((p) => {
        nextFees[p.period] = p.lateFee > 0 ? String(p.lateFee) : "";
      });
      setFeeInputs(nextFees);
    } catch (e) {
      showToast("error", e?.response?.data?.message || t("Failed to load timeline"));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, [agreementId]);

  const formatDate = (value) => {
    if (!value) return "";
    try {
      return new Date(value).toLocaleDateString();
    } catch {
      return "";
    }
  };

  const calcDueDate = (period, startDate) => {
    if (!period) return null;
    const [yearStr, monthStr] = String(period).split("-");
    const year = Number(yearStr);
    const month = Number(monthStr) - 1;
    if (!Number.isFinite(year) || !Number.isFinite(month)) return null;
    const start = startDate ? new Date(startDate) : null;
    const dueDay = start && !Number.isNaN(start.getTime()) ? start.getDate() : 1;
    const lastDay = new Date(year, month + 1, 0).getDate();
    const day = Math.min(dueDay, lastDay);
    return new Date(year, month, day);
  };

  const downloadBill = async (paymentId, period) => {
    if (!paymentId) return;
    try {
      setDownloading(paymentId);
      const res = await http.get(`/api/payments/${paymentId}/bill`, { responseType: "blob" });
      const blob = new Blob([res.data], { type: "application/pdf" });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `rent-bill-${period}.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
    } catch (e) {
      showToast("error", e?.response?.data?.message || t("Bill download failed"));
    } finally {
      setDownloading("");
    }
  };

  const applyLateFee = async (period) => {
    const raw = feeInputs[period];
    const amount = Number(raw);
    if (!Number.isFinite(amount) || amount <= 0) {
      showToast("error", t("Late fee must be a positive number"));
      return;
    }
    try {
      setFeeBusy(period);
      await http.post("/api/payments/late-fee", { agreementId, period, amount });
      showToast("success", t("Late fee applied ✅"));
      await load();
    } catch (e) {
      showToast("error", e?.response?.data?.message || t("Failed to apply late fee"));
    } finally {
      setFeeBusy("");
    }
  };

  const removeLateFee = async (period) => {
    try {
      setFeeBusy(period);
      await http.post("/api/payments/late-fee/remove", { agreementId, period });
      showToast("success", t("Late fee removed ✅"));
      await load();
    } catch (e) {
      showToast("error", e?.response?.data?.message || t("Failed to remove late fee"));
    } finally {
      setFeeBusy("");
    }
  };

  if (loading) return <Spinner text={t("Loading payment timeline...")} />;

  const agreement = data?.agreement;
  const periods = data?.periods || [];

  return (
    <div>
      <div className="row" style={{ justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}>
        <div>
          <h1 className="h1">{t("Payment Timeline")}</h1>
          <p className="muted" style={{ marginTop: 6 }}>
            {t("Track rent due dates, payment status, and receipts per month.")}
          </p>
        </div>
        <div className="row" style={{ gap: 8 }}>
          <button className="btn btnOutline" onClick={load}>{t("Refresh")}</button>
          <Link className="btn" to={paymentsPath}>{t("Go to Payments")}</Link>
        </div>
      </div>

      <div className="spacer" />

      {agreement ? (
        <div className="card cardPad">
          <div style={{ fontWeight: 900 }}>{agreement.room?.title}</div>
          <div className="muted" style={{ marginTop: 4 }}>{agreement.room?.location}</div>
          <div className="row" style={{ marginTop: 8, gap: 12, flexWrap: "wrap" }}>
            <span className="pill pillInfo">{t("Monthly rent")}: NPR {agreement.monthlyRent}</span>
            <span className="pill">{t("Start")}: {formatDate(agreement.startDate)}</span>
            <span className="pill">{t("Status")}: {(agreement.status || "").toUpperCase()}</span>
          </div>
        </div>
      ) : null}

      <div className="spacer" />

      {periods.length === 0 ? (
        <div className="card cardPad">{t("No timeline data yet.")}</div>
      ) : (
        <div className="gridCards">
          {periods.map((p) => {
            const dueDate = calcDueDate(p.period, agreement?.startDate);
            const status = p.status || "unpaid";
            const statusClass =
              status === "confirmed" ? "pillOk" : status === "pending" ? "pillWarn" : "pillBad";
            const rentBillReady = p.rentPayment?.status === "confirmed";
            const elecBillReady = p.electricityPayment?.status === "confirmed";
            const primaryPayment = p.rentPayment || p.electricityPayment;
            const displayRent =
              p.rentPayment?.rentAmount ??
              (p.rentPaid ? p.rentPayment?.rentAmount || p.dueRent : p.dueRent);
            const displayElectricity =
              p.rentPayment?.electricityAmount ??
              p.electricityPayment?.electricityAmount ??
              p.dueElectricity;
            const displayTotal =
              p.rentPayment?.amount ?? p.electricityPayment?.amount ?? p.totalDue;
            return (
              <div key={p.period} className="card cardPad">
                <div className="row" style={{ justifyContent: "space-between", alignItems: "flex-start" }}>
                  <div>
                    <div style={{ fontWeight: 900 }}>{p.period}</div>
                    <div className="muted" style={{ marginTop: 4 }}>
                      {t("Due")}: {formatDate(dueDate) || "—"}
                    </div>
                  </div>
                  <span className={`pill ${statusClass}`}>{status.toUpperCase()}</span>
                </div>

                <div className="spacer" />

                <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
                  <span className="pill">{t("Rent")}: NPR {displayRent}</span>
                  <span className="pill">{t("Electricity")}: NPR {displayElectricity}</span>
                  <span className="pill">{t("Late fee")}: NPR {p.lateFee}</span>
                  <span className="pill pillInfo">{t("Total")}: NPR {displayTotal}</span>
                </div>

                {isOwner && (
                  <div className="row" style={{ gap: 8, flexWrap: "wrap", alignItems: "center", marginTop: 8 }}>
                    <span className="muted" style={{ fontSize: 12 }}>{t("Late fee")}</span>
                    <input
                      className="input"
                      type="number"
                      step="0.01"
                      min="0"
                      value={feeInputs[p.period] ?? ""}
                      onChange={(e) =>
                        setFeeInputs((prev) => ({ ...prev, [p.period]: e.target.value }))
                      }
                      style={{ width: 120 }}
                      disabled={p.rentPaid || feeBusy === p.period}
                      placeholder="0"
                    />
                    <button
                      className="btn btnOutline"
                      onClick={() => applyLateFee(p.period)}
                      disabled={p.rentPaid || feeBusy === p.period}
                    >
                      {feeBusy === p.period ? t("Saving...") : t("Apply")}
                    </button>
                    {p.lateFee > 0 ? (
                      <button
                        className="btn btnOutline"
                        onClick={() => removeLateFee(p.period)}
                        disabled={feeBusy === p.period}
                      >
                        {feeBusy === p.period ? t("Removing...") : t("Waive")}
                      </button>
                    ) : null}
                    {p.rentPaid ? (
                      <span className="muted" style={{ fontSize: 12 }}>
                        {t("Rent already paid")}
                      </span>
                    ) : null}
                  </div>
                )}

                {p.rentPerDay > 0 ? (
                  <div className="muted" style={{ marginTop: 8, fontSize: 13 }}>
                    {t("Rent calc")}: NPR {p.rentPerDay}/day × {p.daysCharged}/{p.daysInMonth} {t("days")}
                    {p.proratedFirstMonth ? ` (${t("prorated")})` : ""}
                  </div>
                ) : null}

                <div className="spacer" />

                <div className="row" style={{ justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}>
                  <div className="muted" style={{ fontSize: 13 }}>
                    {primaryPayment?.paidAt
                      ? `${t("Paid")}: ${new Date(primaryPayment.paidAt).toLocaleString()}`
                      : `${t("Created")}: ${primaryPayment?.createdAt ? new Date(primaryPayment.createdAt).toLocaleString() : t("Not paid yet")}`}
                  </div>
                  <div className="row" style={{ gap: 6 }}>
                    {rentBillReady ? (
                      <button
                        className="btn btnOutline"
                        onClick={() => downloadBill(p.rentPayment.id, p.period)}
                        disabled={downloading === p.rentPayment.id}
                      >
                        {downloading === p.rentPayment.id ? t("Downloading...") : t("Rent bill")}
                      </button>
                    ) : null}
                    {elecBillReady ? (
                      <button
                        className="btn btnOutline"
                        onClick={() => downloadBill(p.electricityPayment.id, p.period)}
                        disabled={downloading === p.electricityPayment.id}
                      >
                        {downloading === p.electricityPayment.id ? t("Downloading...") : t("Electricity bill")}
                      </button>
                    ) : null}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
