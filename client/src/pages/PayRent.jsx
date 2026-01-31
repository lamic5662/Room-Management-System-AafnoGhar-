import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import http from "../api/http";
import { useToast } from "../context/ToastContext";
import { submitEsewaForm } from "../utils/submitEsewaForm";
import { useI18n } from "../context/I18nContext";

export default function PayRent() {
  const { agreementId } = useParams();
  const navigate = useNavigate();
  const { showToast } = useToast();
  const { t } = useI18n();

  const [period, setPeriod] = useState(new Date().toISOString().slice(0, 7));
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState("cash");
  const [note, setNote] = useState("Paid in hand");
  const [loading, setLoading] = useState(false);
  const [billInfo, setBillInfo] = useState({
    rentAmount: 0,
    electricityAmount: 0,
    totalAmount: 0,
    bill: null,
    rentPaid: false,
    rentPending: false,
    dueRent: 0,
    dueElectricity: 0,
    payable: true,
  });
  const [cardName, setCardName] = useState("");
  const [cardNumber, setCardNumber] = useState("");
  const [cardExpiry, setCardExpiry] = useState("");
  const [cardCvv, setCardCvv] = useState("");
  const [cardFlip, setCardFlip] = useState(false);
  const [errors, setErrors] = useState({});

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

  useEffect(() => {
    const loadBill = async () => {
      if (!agreementId || !period || !/^\d{4}-(0[1-9]|1[0-2])$/.test(period)) return;
      try {
        const res = await http.get(`/api/electricity/for-payment?agreementId=${agreementId}&period=${period}`);
        const next = {
          rentAmount: res.data?.rentAmount || 0,
          electricityAmount: res.data?.electricityAmount || 0,
          totalAmount: res.data?.totalAmount || 0,
          bill: res.data?.bill || null,
          rentPaid: !!res.data?.rentPaid,
          rentPending: !!res.data?.rentPending,
          dueRent: res.data?.dueRent || 0,
          dueElectricity: res.data?.dueElectricity || 0,
          payable: res.data?.payable !== false,
        };
        setBillInfo(next);
        setAmount(next.totalAmount ? String(next.totalAmount) : "");
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
          payable: false,
        });
        setAmount("");
      }
    };

    loadBill();
  }, [agreementId, period]);

  const submit = async () => {
    if (!billInfo.payable || Number(billInfo.totalAmount || 0) <= 0) {
      return showToast("error", t("Nothing due for this period"));
    }
    const nextErrors = {};
    if (!period) nextErrors.period = t("Period is required");
    if (period && !/^\d{4}-(0[1-9]|1[0-2])$/.test(period)) nextErrors.period = t("Period must be YYYY-MM");
    if (!amount || Number(amount) <= 0) nextErrors.amount = t("Valid amount required");
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
    if (!billInfo.payable || Number(amount) <= 0) {
      return showToast("error", t("Nothing due for this period"));
    }

    try {
      setLoading(true);
      if (method === "esewa") {
        const res = await http.post("/api/esewa/init", {
          agreementId,
          period,
          amount: Number(amount),
        });
        submitEsewaForm(res.data.epayUrl, res.data.form);
        return;
      }
      if (method === "khalti") {
        const res = await http.post("/api/khalti/init", {
          agreementId,
          period,
          amountNpr: Number(amount),
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
          <div className="row" style={{ justifyContent: "space-between", flexWrap: "wrap", marginTop: 6 }}>
            <div className="muted" style={{ fontSize: 13 }}>{t("Electricity")}</div>
            <div style={{ fontWeight: 900 }}>NPR {billInfo.dueElectricity || 0}</div>
          </div>
          <div className="row" style={{ justifyContent: "space-between", flexWrap: "wrap", marginTop: 6 }}>
            <div className="muted" style={{ fontSize: 13 }}>{t("Total")}</div>
            <div style={{ fontWeight: 900, fontSize: 18 }}>NPR {billInfo.totalAmount || 0}</div>
          </div>
          <div className="row" style={{ flexWrap: "wrap", marginTop: 8 }}>
            {billInfo.rentPaid ? (
              <span className="pill pillOk">{t("Rent paid")}</span>
            ) : billInfo.rentPending ? (
              <span className="pill pillWarn">{t("Rent pending")}</span>
            ) : (
              <span className="pill pillBad">{t("Rent due")}</span>
            )}
            {billInfo.bill ? (
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
                ? t("Rent already paid. Electricity bill not added yet for this period.")
                : t("Electricity bill not added yet for this period.")}
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

        <div className="row" style={{ justifyContent: "space-between" }}>
          <button className="btn btnOutline" onClick={() => navigate(-1)}>{t("Back")}</button>
          <button className="btn" onClick={submit} disabled={loading || !billInfo.payable || Number(amount) <= 0}>
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
