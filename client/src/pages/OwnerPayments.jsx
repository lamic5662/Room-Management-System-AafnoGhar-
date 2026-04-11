import { useEffect, useMemo, useState } from "react";
import http from "../api/http";
import Spinner from "../components/Spinner";
import { useToast } from "../context/ToastContext";
import { getPhotoUrl } from "../utils/photo";
import { useI18n } from "../context/I18nContext";

export default function OwnerPayments() {
  const { showToast } = useToast();
  const { t } = useI18n();
  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState([]);
  const [busyId, setBusyId] = useState("");
  const [downloading, setDownloading] = useState("");

  const [tab, setTab] = useState("pending");
  const [typeFilter, setTypeFilter] = useState("all");

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

  const calcLateFee = (payment) => {
    const rent = Number(payment?.rentAmount || 0);
    if (rent <= 0) return 0;
    const elec = Number(payment?.electricityAmount || 0);
    const total = Number(payment?.amount || 0);
    const late = total - rent - elec;
    return late > 0.01 ? Number(late.toFixed(2)) : 0;
  };

  const classifyPayment = (p) => {
    if (p?.exitAmount > 0) return "exit";
    if (p?.rentAmount > 0) return "rent";
    if (p?.electricityAmount > 0) return "electricity";
    return "other";
  };

  const filtered = useMemo(() => {
    const statusFiltered = tab === "all" ? items : items.filter((p) => (p.status || "pending") === tab);
    if (typeFilter === "all") return statusFiltered;
    return statusFiltered.filter((p) => classifyPayment(p) === typeFilter);
  }, [items, tab, typeFilter]);

  const load = async () => {
    try {
      setLoading(true);
      const res = await http.get("/api/payments/incoming");
      setItems(res.data.payments || []);
    } catch (e) {
      showToast("error", e?.response?.data?.message || t("Failed to load payments"));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const confirm = async (id) => {
    try {
      setBusyId(id);
      await http.patch(`/api/payments/${id}/status`, { status: "confirmed" });
      showToast("success", t("Payment confirmed ✅"));
      load();
    } catch (e) {
      showToast("error", e?.response?.data?.message || t("Failed to confirm payment"));
    } finally {
      setBusyId("");
    }
  };

  const downloadBill = async (payment) => {
    if (!payment?._id) return;
    try {
      setDownloading(payment._id);
      const res = await http.get(`/api/payments/${payment._id}/bill`, { responseType: "blob" });
      const blob = new Blob([res.data], { type: "application/pdf" });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `rent-bill-${payment.period}.pdf`;
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

  if (loading) return <Spinner text={t("Loading payments...")} />;

  return (
    <div>
      <div className="row" style={{ justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}>
        <div>
          <h1 className="h1">{t("Payments")}</h1>
          <p className="muted" style={{ marginTop: 6 }}>
            {t("Confirm tenant payments and track history.")}
          </p>
        </div>
        <button className="btn btnOutline" onClick={load}>{t("Refresh")}</button>
      </div>

      <div className="spacer" />

      <div className="row" style={{ flexWrap: "wrap" }}>
        <button className={"pill " + (tab === "pending" ? "" : "muted")} onClick={() => setTab("pending")}>
          {t("Pending")}
        </button>
        <button className={"pill " + (tab === "confirmed" ? "" : "muted")} onClick={() => setTab("confirmed")}>
          {t("Confirmed")}
        </button>
        <button className={"pill " + (tab === "all" ? "" : "muted")} onClick={() => setTab("all")}>
          {t("All")}
        </button>
        <span className="muted" style={{ marginLeft: 8, fontSize: 13 }}>
          {t("Showing")} {filtered.length} {t("payments")}
        </span>
      </div>

      <div className="spacer" />

      <div className="row" style={{ flexWrap: "wrap" }}>
        <button className={"pill " + (typeFilter === "all" ? "" : "muted")} onClick={() => setTypeFilter("all")}>
          {t("All types")}
        </button>
        <button className={"pill " + (typeFilter === "rent" ? "" : "muted")} onClick={() => setTypeFilter("rent")}>
          {t("Rent")}
        </button>
        <button
          className={"pill " + (typeFilter === "electricity" ? "" : "muted")}
          onClick={() => setTypeFilter("electricity")}
        >
          {t("Electricity")}
        </button>
        <button className={"pill " + (typeFilter === "exit" ? "" : "muted")} onClick={() => setTypeFilter("exit")}>
          {t("Exit")}
        </button>
        <span className="muted" style={{ marginLeft: 8, fontSize: 13 }}>
          {t("Receipts available after confirmation.")}
        </span>
      </div>

      <div className="spacer" />

      <div>
        <div style={{ fontWeight: 900 }}>{t("Receipt history")}</div>
        <div className="muted" style={{ fontSize: 13, marginTop: 4 }}>
          {t("Review due dates, paid dates, late fees, and receipts.")}
        </div>
      </div>

      <div className="spacer" />

      {filtered.length === 0 ? (
        <div className="card cardPad">{t("No payments in this tab.")}</div>
      ) : (
        <div className="gridCards">
          {filtered.map((p) => {
            const isBusy = busyId === p._id;
            const status = (p.status || "pending").toUpperCase();

            return (
              <div key={p._id} className="card cardPad">
                {p.room?.photos?.[0] ? (
                  <div
                    className="card"
                    style={{
                      overflow: "hidden",
                      borderRadius: 14,
                      border: "1px solid #e5e7eb",
                      boxShadow: "none",
                      marginBottom: 10,
                    }}
                  >
                    <img
                      src={getPhotoUrl(p.room.photos[0])}
                      alt="thumb"
                      style={{ width: "100%", display: "block" }}
                    />
                  </div>
                ) : null}

                <div className="row" style={{ justifyContent: "space-between", alignItems: "flex-start" }}>
                  <div>
                    <div style={{ fontWeight: 900, fontSize: 16 }}>{p.room?.title}</div>
                    <div className="muted" style={{ marginTop: 4 }}>{p.room?.location}</div>
                  </div>
                  <span className="badge">{status}</span>
                </div>

                <div className="spacer" />

                <div className="row" style={{ justifyContent: "space-between" }}>
                  <div className="muted" style={{ fontSize: 13 }}>
                    {t("Tenant")}: <b style={{ color: "#111827" }}>{p.tenant?.fullName}</b>
                  </div>
                  <div className="muted" style={{ fontSize: 13 }}>
                    {t("Period")}: <b style={{ color: "#111827" }}>{p.period}</b>
                  </div>
                </div>

                <div className="spacer" />

                <div className="row" style={{ justifyContent: "space-between", flexWrap: "wrap" }}>
                  <div className="muted" style={{ fontSize: 13 }}>
                    {t("Amount")}: <b style={{ color: "#111827" }}>NPR {p.amount}</b>
                  </div>
                  <div className="muted" style={{ fontSize: 13 }}>
                    {t("Method")}: <b style={{ color: "#111827" }}>{p.method}</b>
                  </div>
                </div>

                <div className="spacer" />

                <div className="row" style={{ flexWrap: "wrap", gap: 8 }}>
                  {p.rentAmount > 0 ? (
                    <span className="pill pillInfo">
                      {t("Due")}: {formatDate(calcDueDate(p.period, p.agreement?.startDate)) || "—"}
                    </span>
                  ) : null}
                  <span className={`pill ${p.paidAt ? "pillOk" : "pillWarn"}`}>
                    {t("Paid")}: {p.paidAt ? formatDate(p.paidAt) : t("Not paid yet")}
                  </span>
                  {calcLateFee(p) > 0 ? (
                    <span className="pill pillBad">
                      {t("Late fee")}: NPR {calcLateFee(p)}
                    </span>
                  ) : null}
                </div>

                {p.note ? (
                  <div className="muted" style={{ marginTop: 10, fontSize: 13 }}>
                    {t("Note")}: {p.note}
                  </div>
                ) : null}

                <div className="spacer" />

                <div className="row" style={{ justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}>
                  <div className="muted" style={{ fontSize: 13 }}>
                    {p.paidAt
                      ? `${t("Paid at")}: ${new Date(p.paidAt).toLocaleString()}`
                      : `${t("Created")}: ${new Date(p.createdAt).toLocaleString()}`}
                  </div>

                  <div className="row" style={{ gap: 6 }}>
                    {p.status === "confirmed" ? (
                      <button
                        className="btn btnOutline"
                        onClick={() => downloadBill(p)}
                        disabled={downloading === p._id}
                      >
                        {downloading === p._id ? t("Downloading...") : t("Download bill")}
                      </button>
                    ) : null}

                    <button
                      className="btn"
                      disabled={isBusy || (p.status || "pending") !== "pending"}
                      onClick={() => confirm(p._id)}
                    >
                      {isBusy ? t("Confirming...") : t("Confirm")}
                    </button>
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
