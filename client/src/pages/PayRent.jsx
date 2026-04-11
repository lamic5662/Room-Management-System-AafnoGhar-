import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams, useLocation } from "react-router-dom";
import http from "../api/http";
import { useToast } from "../context/ToastContext";
import { submitEsewaForm } from "../utils/submitEsewaForm";
import { useI18n } from "../context/I18nContext";

const PERIOD_PATTERN = /^\d{4}-(0[1-9]|1[0-2])$/;

export default function PayRent() {
  const { agreementId } = useParams();
  const navigate = useNavigate();
  const { search } = useLocation();
  const { showToast } = useToast();
  const { t } = useI18n();

  const [period, setPeriod] = useState(new Date().toISOString().slice(0, 7));
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState("cash");
  const [note, setNote] = useState("Paid in hand");
  const [loading, setLoading] = useState(false);
  const [electricityUnits, setElectricityUnits] = useState("");
  const [electricityUnitRate, setElectricityUnitRate] = useState("");
  const [billInfo, setBillInfo] = useState({
    rentAmount: 0,
    electricityAmount: 0,
    totalAmount: 0,
    bill: null,
    rentPaid: false,
    rentPending: false,
    dueRent: 0,
    dueElectricity: 0,
    expectedRent: 0,
    paidRent: 0,
    damagesCost: 0,
    otherDeductions: 0,
    depositPaid: 0,
    settlementDue: 0,
    hasSettlement: false,
    rentPerDay: 0,
    daysInMonth: 0,
    daysCharged: 0,
    proratedFirstMonth: false,
    startDate: null,
    roomElectricityUnitRate: 0,
    payable: true,
  });
  const [cardName, setCardName] = useState("");
  const [cardNumber, setCardNumber] = useState("");
  const [cardExpiry, setCardExpiry] = useState("");
  const [cardCvv, setCardCvv] = useState("");
  const [cardFlip, setCardFlip] = useState(false);
  const [errors, setErrors] = useState({});
  const exitIdParam = useMemo(() => {
    const params = new URLSearchParams(search);
    return params.get("exitId") || "";
  }, [search]);

  const isBank = method === "bank";
  const formattedExpiry = useMemo(() => {
    const v = String(cardExpiry || "").replace(/[^0-9]/g, "").slice(0, 4);
    if (v.length <= 2) return v;
    return `${v.slice(0, 2)}/${v.slice(2)}`;
  }, [cardExpiry]);
  const maskedNumber = useMemo(() => {
    const digits = String(cardNumber || "").replace(/[^0-9]/g, "").slice(0, 16);
    if (!digits) return "**** **** **** 1234";
    const last4 = digits.slice(-4);
    return `**** **** **** ${last4.padStart(4, "•")}`;
  }, [cardNumber]);

  const computedElectricity = useMemo(() => {
    const units = Number(electricityUnits);
    const rate = Number(electricityUnitRate);
    if (!Number.isFinite(units) || units <= 0) return 0;
    if (!Number.isFinite(rate) || rate <= 0) return 0;
    return Math.round(units * rate);
  }, [electricityUnits, electricityUnitRate]);

  const showElectricityInputs = !exitIdParam && !billInfo.bill && !billInfo.rentPaid && !billInfo.rentPending;
  const displayElectricity = exitIdParam || billInfo.bill ? billInfo.dueElectricity || 0 : computedElectricity;
  const baseTotal = billInfo.totalAmount || billInfo.dueRent || 0;
  const displayTotal = exitIdParam || billInfo.bill
    ? billInfo.totalAmount || 0
    : baseTotal + computedElectricity;
  const canPay = billInfo.payable || (showElectricityInputs && computedElectricity > 0);

  useEffect(() => {
    const loadBill = async () => {
      if (!agreementId || !period || !/^\d{4}-(0[1-9]|1[0-2])$/.test(period)) return;
      try {
        const exitParam = exitIdParam ? `&exitId=${encodeURIComponent(exitIdParam)}` : "";
        const res = await http.get(`/api/electricity/for-payment?agreementId=${agreementId}&period=${period}${exitParam}`);
        const next = {
          rentAmount: res.data?.rentAmount || 0,
          electricityAmount: res.data?.electricityAmount || 0,
          totalAmount: res.data?.totalAmount || 0,
          bill: res.data?.bill || null,
          rentPaid: !!res.data?.rentPaid,
          rentPending: !!res.data?.rentPending,
          dueRent: res.data?.dueRent || 0,
          dueElectricity: res.data?.dueElectricity || 0,
          expectedRent: res.data?.expectedRent || 0,
          paidRent: res.data?.paidRent || 0,
          damagesCost: res.data?.damagesCost || 0,
          otherDeductions: res.data?.otherDeductions || 0,
          depositPaid: res.data?.depositPaid || 0,
          settlementDue: res.data?.settlementDue || 0,
          hasSettlement: !!res.data?.hasSettlement,
          rentPerDay: res.data?.rentPerDay || 0,
          daysInMonth: res.data?.daysInMonth || 0,
          daysCharged: res.data?.daysCharged || 0,
          proratedFirstMonth: !!res.data?.proratedFirstMonth,
          startDate: res.data?.startDate || null,
          roomElectricityUnitRate: res.data?.roomElectricityUnitRate || 0,
          payable: res.data?.payable !== false,
        };
        setBillInfo(next);
        const nextAmount = next.totalAmount ?? next.dueRent ?? 0;
        setAmount(nextAmount ? String(nextAmount) : "");
      } catch {
        setBillInfo({
          rentAmount: 0,
          electricityAmount: 0,
          totalAmount: 0,
          bill: null,
          rentPaid: false,
          rentPending: false,
          dueRent: 0,
          dueElectricity: 0,
          expectedRent: 0,
          paidRent: 0,
          damagesCost: 0,
          otherDeductions: 0,
          depositPaid: 0,
          settlementDue: 0,
          hasSettlement: false,
          rentPerDay: 0,
          daysInMonth: 0,
          daysCharged: 0,
          proratedFirstMonth: false,
          startDate: null,
          roomElectricityUnitRate: 0,
          payable: false,
        });
        setAmount("");
      }
    };

    loadBill();
  }, [agreementId, period, exitIdParam]);

  useEffect(() => {
    if (exitIdParam || billInfo.bill) {
      if (electricityUnits) setElectricityUnits("");
      if (electricityUnitRate) setElectricityUnitRate("");
      return;
    }
    const base = billInfo.totalAmount || billInfo.dueRent || 0;
    const total = base + computedElectricity;
    setAmount(total > 0 ? String(total) : "");
  }, [billInfo.bill, billInfo.dueRent, computedElectricity, exitIdParam]);

  useEffect(() => {
    setElectricityUnits("");
    setElectricityUnitRate("");
  }, [agreementId, period, exitIdParam]);

  useEffect(() => {
    if (!showElectricityInputs) return;
    if (electricityUnitRate) return;
    const rate = Number(billInfo.roomElectricityUnitRate || 0);
    if (rate > 0) {
      setElectricityUnitRate(String(rate));
    }
  }, [billInfo.roomElectricityUnitRate, electricityUnitRate, showElectricityInputs]);

  useEffect(() => {
    const params = new URLSearchParams(search);
    const periodParam = params.get("period");
    if (periodParam && PERIOD_PATTERN.test(periodParam)) {
      setPeriod((current) => (current === periodParam ? current : periodParam));
    }
    const amountParam = params.get("amount");
    if (amountParam) {
      setAmount((current) => (current === amountParam ? current : amountParam));
    }
  }, [search]);

  const submit = async () => {
    if (!canPay || Number(amount) <= 0) {
      return showToast("error", t("Nothing due for this period"));
    }
    const nextErrors = {};
    if (!period) nextErrors.period = t("Period is required");
    if (period && !/^\d{4}-(0[1-9]|1[0-2])$/.test(period)) nextErrors.period = t("Period must be YYYY-MM");
    if (!amount || Number(amount) <= 0) nextErrors.amount = t("Valid amount required");
    const wantsElectricity = showElectricityInputs && (electricityUnits || electricityUnitRate);
    if (wantsElectricity) {
      const unitsNum = Number(electricityUnits);
      const rateNum = Number(electricityUnitRate);
      if (!Number.isFinite(unitsNum) || unitsNum <= 0) {
        nextErrors.electricityUnits = t("Valid units required");
      }
      if (!Number.isFinite(rateNum) || rateNum <= 0) {
        nextErrors.electricityUnitRate = t("Valid unit rate required");
      }
    }
    if (isBank) {
      if (!cardName.trim()) nextErrors.cardName = t("Card holder name is required");
      const numDigits = String(cardNumber || "").replace(/[^0-9]/g, "");
      if (numDigits.length < 12) nextErrors.cardNumber = t("Card number is too short");
      if (!formattedExpiry || formattedExpiry.length < 5) nextErrors.cardExpiry = t("Valid expiry is required");
      if (!cardCvv || String(cardCvv).length < 3) nextErrors.cardCvv = t("Valid CVV is required");
    }
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length) {
      return showToast("error", t("Please fix the highlighted fields"));
    }
    if (!canPay || Number(amount) <= 0) {
      return showToast("error", t("Nothing due for this period"));
    }

    try {
      setLoading(true);
      if (method === "esewa") {
        const res = await http.post("/api/esewa/init", {
          agreementId,
          period,
          amount: Number(amount),
          exitId: exitIdParam || undefined,
          electricityUnits: showElectricityInputs && electricityUnits ? Number(electricityUnits) : undefined,
          electricityUnitRate: showElectricityInputs && electricityUnitRate ? Number(electricityUnitRate) : undefined,
        });
        submitEsewaForm(res.data.epayUrl, res.data.form);
        return;
      }
      if (method === "khalti") {
        const res = await http.post("/api/khalti/init", {
          agreementId,
          period,
          amountNpr: Number(amount),
          exitId: exitIdParam || undefined,
          electricityUnits: showElectricityInputs && electricityUnits ? Number(electricityUnits) : undefined,
          electricityUnitRate: showElectricityInputs && electricityUnitRate ? Number(electricityUnitRate) : undefined,
        });
        if (res.data?.payment_url) {
          window.location.href = res.data.payment_url;
          return;
        }
        throw new Error("No Khalti payment URL");
      }

      await http.post("/api/payments", {
        agreementId,
        period,
        amount: Number(amount),
        method,
        note,
        exitId: exitIdParam || undefined,
        electricityUnits: showElectricityInputs && electricityUnits ? Number(electricityUnits) : undefined,
        electricityUnitRate: showElectricityInputs && electricityUnitRate ? Number(electricityUnitRate) : undefined,
        cardName: isBank ? cardName.trim() : "",
        cardExpiry: isBank ? formattedExpiry : "",
      });

      showToast("success", t("Payment submitted ✅ (waiting confirmation)"));
      setTimeout(() => navigate("/tenant/agreements"), 500);
    } catch (e) {
      showToast("error", e?.response?.data?.message || t("Payment failed"));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="authWrap">
      <div className="authCard card cardPad">
        <div style={{ textAlign: "center" }}>
          <div className="badge" style={{ display: "inline-flex" }}>{t("Pay Rent")}</div>
          <h1 className="h1" style={{ marginTop: 10 }}>{t("Submit Monthly Rent")}</h1>
          <p className="muted" style={{ marginTop: 6 }}>
            {t("Owner will confirm your payment.")}
          </p>
        </div>

        <div className="spacer" />

        <label className="muted" style={{ fontSize: 13 }}>{t("Period (YYYY-MM)")}</label>
        <input
          className={`input ${errors.period ? "inputErr" : ""}`}
          value={period}
          onChange={(e) => {
            setPeriod(e.target.value);
            if (errors.period) setErrors((p) => ({ ...p, period: "" }));
          }}
          placeholder={t("2026-01")}
        />
        {errors.period ? <div className="fieldErr">{errors.period}</div> : null}

        <div className="spacer" />

        <label className="muted" style={{ fontSize: 13 }}>{t("Amount (NPR)")}</label>
        <input
          className={`input ${errors.amount ? "inputErr" : ""}`}
          value={amount}
          onChange={(e) => {
            setAmount(e.target.value);
            if (errors.amount) setErrors((p) => ({ ...p, amount: "" }));
          }}
          placeholder={t("12000")}
          readOnly
        />
        {errors.amount ? <div className="fieldErr">{errors.amount}</div> : null}

        <div className="spacer" />

        <div className="card cardPad" style={{ boxShadow: "none" }}>
          <div className="row" style={{ justifyContent: "space-between", flexWrap: "wrap" }}>
            <div className="muted" style={{ fontSize: 13 }}>{t("Rent")}</div>
            <div style={{ fontWeight: 900 }}>NPR {billInfo.dueRent || 0}</div>
          </div>
          {billInfo.rentPerDay > 0 && billInfo.daysCharged > 0 ? (
            <div className="muted" style={{ fontSize: 12, marginTop: 6 }}>
              {t("Per-day rent")}: NPR {billInfo.rentPerDay} / {t("day")} •{" "}
              {t("Days charged")}: {billInfo.daysCharged} / {billInfo.daysInMonth} •{" "}
              {t("Calculated rent")}: NPR {billInfo.dueRent || 0}
              {billInfo.proratedFirstMonth ? ` (${t("Prorated first month")})` : ""}
            </div>
          ) : null}
          {exitIdParam && billInfo.expectedRent > 0 ? (
            <div className="muted" style={{ fontSize: 12, marginTop: 6 }}>
              {t("Exit total rent")}: NPR {billInfo.expectedRent} •{" "}
              {t("Paid rent")}: NPR {billInfo.paidRent} •{" "}
              {t("Unpaid")}: NPR {billInfo.dueRent || 0}
            </div>
          ) : null}
          {exitIdParam && billInfo.hasSettlement ? (
            <div className="muted" style={{ fontSize: 12, marginTop: 6, lineHeight: 1.6 }}>
              {t("Settlement due")}: NPR <b style={{ color: "#111827" }}>{billInfo.settlementDue || 0}</b>
              {billInfo.damagesCost > 0 ? (
                <>
                  {" • "}{t("Damages")}: NPR {billInfo.damagesCost}
                </>
              ) : null}
              {billInfo.otherDeductions > 0 ? (
                <>
                  {" • "}{t("Others")}: NPR {billInfo.otherDeductions}
                </>
              ) : null}
              {billInfo.depositPaid > 0 ? (
                <>
                  {" • "}{t("Deposit")}: NPR {billInfo.depositPaid}
                </>
              ) : null}
            </div>
          ) : null}
          <div className="row" style={{ justifyContent: "space-between", flexWrap: "wrap", marginTop: 6 }}>
            <div className="muted" style={{ fontSize: 13 }}>{t("Electricity")}</div>
            <div style={{ fontWeight: 900 }}>NPR {displayElectricity || 0}</div>
          </div>
          {showElectricityInputs ? (
            <>
              <div className="spacer" />
              <div className="row" style={{ gap: 12, flexWrap: "wrap" }}>
                <div style={{ flex: 1, minWidth: 140 }}>
                  <label className="muted" style={{ fontSize: 12 }}>{t("Units used")}</label>
                  <input
                    className={`input ${errors.electricityUnits ? "inputErr" : ""}`}
                    value={electricityUnits}
                    onChange={(e) => {
                      setElectricityUnits(e.target.value);
                      if (errors.electricityUnits) setErrors((p) => ({ ...p, electricityUnits: "" }));
                    }}
                    placeholder={t("e.g. 45")}
                  />
                  {errors.electricityUnits ? <div className="fieldErr">{errors.electricityUnits}</div> : null}
                </div>
                <div style={{ flex: 1, minWidth: 140 }}>
                  <label className="muted" style={{ fontSize: 12 }}>{t("Unit Rate (NPR)")}</label>
                  <input
                    className={`input ${errors.electricityUnitRate ? "inputErr" : ""}`}
                    value={electricityUnitRate}
                    onChange={(e) => {
                      setElectricityUnitRate(e.target.value);
                      if (errors.electricityUnitRate) setErrors((p) => ({ ...p, electricityUnitRate: "" }));
                    }}
                    placeholder={t("e.g. 12")}
                  />
                  {errors.electricityUnitRate ? <div className="fieldErr">{errors.electricityUnitRate}</div> : null}
                </div>
              </div>
              <div className="muted" style={{ fontSize: 12, marginTop: 6 }}>
                {t("Calculated electricity")}: NPR {computedElectricity || 0}
              </div>
            </>
          ) : null}
          <div className="row" style={{ justifyContent: "space-between", flexWrap: "wrap", marginTop: 6 }}>
            <div className="muted" style={{ fontSize: 13 }}>{t("Total")}</div>
            <div style={{ fontWeight: 900, fontSize: 18 }}>NPR {displayTotal || 0}</div>
          </div>
          <div className="row" style={{ flexWrap: "wrap", marginTop: 8 }}>
            {billInfo.rentPaid ? (
              <span className="pill pillOk">{t("Rent paid")}</span>
            ) : billInfo.rentPending ? (
              <span className="pill pillWarn">{t("Rent pending")}</span>
            ) : (
              <span className="pill pillBad">{t("Rent due")}</span>
            )}
            {billInfo.bill || computedElectricity > 0 ? (
              <span className="pill pillInfo">{t("Electricity due")}</span>
            ) : (
              <span className="pill pillMuted">{t("No electricity bill")}</span>
            )}
          </div>
          {billInfo.bill ? (
            <div className="muted" style={{ fontSize: 12, marginTop: 8 }}>
              {t("Units")}: {billInfo.bill.unitsUsed} • {t("Rate")}: NPR {billInfo.bill.unitRate} / {t("unit")} • {t("Reading")}: {billInfo.bill.previousReading} → {billInfo.bill.currentReading}
            </div>
          ) : (
            <div className="muted" style={{ fontSize: 12, marginTop: 8 }}>
              {billInfo.rentPaid
                ? t("Rent already paid. Electricity not added for this period.")
                : t("Enter electricity units to include with this payment.")}
            </div>
          )}
          {billInfo.rentPending ? (
            <div className="muted" style={{ fontSize: 12, marginTop: 6 }}>
              {t("Rent payment is pending confirmation. Please wait.")}
            </div>
          ) : null}
        </div>

        <div className="spacer" />

        <label className="muted" style={{ fontSize: 13 }}>{t("Method")}</label>
        <select className="input" value={method} onChange={(e) => setMethod(e.target.value)}>
          <option value="cash">{t("Cash")}</option>
          <option value="bank">{t("Bank Transfer")}</option>
          <option value="esewa">eSewa</option>
          <option value="khalti">Khalti</option>
        </select>

        <div className="spacer" />

        {isBank ? (
          <>
            <div className="payCardWrap">
              <div className={"payCard " + (cardFlip ? "flip" : "")}>
                <div className="payCardFront">
                  <div className="payCardTop">
                    <span className="badge">DEBIT</span>
                    <span className="muted" style={{ fontSize: 12 }}>{t("Bank Transfer")}</span>
                  </div>
                  <div className="payCardEmblem" aria-hidden="true">
                    <svg viewBox="0 0 120 70" width="100%" height="100%" role="img" aria-label="Nepal emblem">
                      <defs>
                        <linearGradient id="f" x1="0" x2="1">
                          <stop offset="0" stopColor="#c81d25"/>
                          <stop offset="1" stopColor="#a00f18"/>
                        </linearGradient>
                      </defs>
                      <path d="M5 60 L35 20 L55 45 L70 25 L95 60 Z" fill="rgba(255,255,255,0.18)"/>
                      <path d="M88 8 L110 18 L88 28 Z" fill="url(#f)"/>
                      <rect x="84" y="8" width="4" height="24" fill="#0b4ea2"/>
                      <rect x="84" y="8" width="4" height="24" fill="#0b4ea2"/>
                      <path d="M86 8 L88 8 L88 32 L86 32 Z" fill="#0b4ea2"/>
                    </svg>
                  </div>
                  <div className="payCardBird" aria-hidden="true">
                    <svg viewBox="0 0 120 60" width="100%" height="100%" role="img" aria-label="Danphe bird">
                      <path
                        d="M12 38c8-10 18-14 30-12 7 1 13 4 18 8l10-6 20 2-12 6c4 4 7 9 9 14l-10-3c-7 6-16 10-26 10-14 0-27-6-39-19z"
                        fill="rgba(255,255,255,0.2)"
                      />
                      <path
                        d="M62 28c4-6 10-9 18-9 6 0 12 2 18 6l-6 3c-6-3-10-4-14-3-5 1-8 4-10 9l-6-6z"
                        fill="rgba(255,255,255,0.16)"
                      />
                    </svg>
                  </div>
                  <div className="payCardNumber">{maskedNumber}</div>
                  <div className="payCardMeta">
                    <div>
                      <div className="muted" style={{ fontSize: 11 }}>{t("CARD HOLDER")}</div>
                      <div style={{ fontWeight: 900 }}>{cardName || t("YOUR NAME")}</div>
                    </div>
                    <div style={{ textAlign: "right" }}>
                      <div className="muted" style={{ fontSize: 11 }}>{t("EXPIRY")}</div>
                      <div style={{ fontWeight: 900 }}>{formattedExpiry || t("MM/YY")}</div>
                    </div>
                  </div>
                </div>
                <div className="payCardBack">
                  <div className="payStripe" />
                  <div className="payCvvRow">
                    <div className="payCvvBox">{cardCvv || "***"}</div>
                  </div>
                </div>
              </div>
            </div>

            <label className="muted" style={{ fontSize: 13 }}>{t("Card Holder Name")}</label>
            <input
              className={`input ${errors.cardName ? "inputErr" : ""}`}
              value={cardName}
              onChange={(e) => {
                setCardName(e.target.value);
                if (errors.cardName) setErrors((p) => ({ ...p, cardName: "" }));
              }}
              placeholder={t("Full name")}
            />
            {errors.cardName ? <div className="fieldErr">{errors.cardName}</div> : null}

            <div className="spacer" />

            <label className="muted" style={{ fontSize: 13 }}>{t("Card Number")}</label>
            <input
              className={`input ${errors.cardNumber ? "inputErr" : ""}`}
              value={cardNumber}
              onChange={(e) => {
                setCardNumber(e.target.value.replace(/[^0-9]/g, "").slice(0, 16));
                if (errors.cardNumber) setErrors((p) => ({ ...p, cardNumber: "" }));
              }}
              placeholder={t("0000 0000 0000 0000")}
            />
            {errors.cardNumber ? <div className="fieldErr">{errors.cardNumber}</div> : null}

            <div className="spacer" />

            <div className="row">
              <div style={{ flex: 1 }}>
                <label className="muted" style={{ fontSize: 13 }}>{t("Expiry (MM/YY)")}</label>
                <input
                  className={`input ${errors.cardExpiry ? "inputErr" : ""}`}
                  value={formattedExpiry}
                  onChange={(e) => {
                    setCardExpiry(e.target.value);
                    if (errors.cardExpiry) setErrors((p) => ({ ...p, cardExpiry: "" }));
                  }}
                  placeholder={t("MM/YY")}
                />
                {errors.cardExpiry ? <div className="fieldErr">{errors.cardExpiry}</div> : null}
              </div>
              <div style={{ width: 120 }}>
                <label className="muted" style={{ fontSize: 13 }}>{t("CVV")}</label>
                <input
                  className={`input ${errors.cardCvv ? "inputErr" : ""}`}
                  value={cardCvv}
                  onChange={(e) => {
                    setCardCvv(e.target.value.replace(/[^0-9]/g, "").slice(0, 4));
                    if (errors.cardCvv) setErrors((p) => ({ ...p, cardCvv: "" }));
                  }}
                  onFocus={() => setCardFlip(true)}
                  onBlur={() => setCardFlip(false)}
                  placeholder={t("***")}
                />
                {errors.cardCvv ? <div className="fieldErr">{errors.cardCvv}</div> : null}
              </div>
            </div>

            <div className="spacer" />
            <div className="muted" style={{ fontSize: 12 }}>
              {t("Card details are for display only and are not stored.")}
            </div>

            <div className="spacer" />
          </>
        ) : null}

        <label className="muted" style={{ fontSize: 13 }}>{t("Note")}</label>
        <input className="input" value={note} onChange={(e) => setNote(e.target.value)} placeholder={t("Paid in hand / transaction id...")} />

        <div className="spacer" />

        <div className="row" style={{ justifyContent: "flex-end" }}>
          <button className="btn" onClick={submit} disabled={loading || !canPay || Number(amount) <= 0}>
            {loading
              ? t("Submitting...")
              : (method === "esewa"
                ? t("Pay with eSewa")
                : method === "khalti"
                  ? t("Pay with Khalti")
                  : t("Submit Payment"))}
          </button>
        </div>
      </div>
    </div>
  );
}
