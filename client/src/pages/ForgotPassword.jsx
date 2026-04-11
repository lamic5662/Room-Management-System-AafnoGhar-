import { useState } from "react";
import http from "../api/http";
import { useToast } from "../context/ToastContext";
import { useI18n } from "../context/I18nContext";

export default function ForgotPassword() {
  const { showToast } = useToast();
  const { t } = useI18n();
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [errors, setErrors] = useState({});

  const submit = async (e) => {
    e.preventDefault();
    const nextErrors = {};
    const value = email.trim();
    if (!value) nextErrors.email = "Email is required";
    const emailOk = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
    if (value && !emailOk) nextErrors.email = "Enter a valid email";

    setErrors(nextErrors);
    if (Object.keys(nextErrors).length) {
      showToast("error", "Please fix the highlighted fields");
      return;
    }

    try {
      setLoading(true);
      await http.post("/api/auth/forgot-password", { email: value });
      setSent(true);
      showToast("success", "Reset link sent ✅");
    } catch (e2) {
      showToast("error", e2?.response?.data?.message || "Request failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="authWrap">
      <div className="authCard card cardPad">
        <div style={{ textAlign: "center" }}>
          <div className="badge brandBadge" style={{ display: "inline-flex" }}>AafnoGhar</div>
          <h1 className="h1" style={{ marginTop: 10 }}>{t("Forgot Password")}</h1>
          <p className="muted" style={{ marginTop: 6 }}>{t("We’ll send a reset link to your email.")}</p>
        </div>

        <div className="spacer" />

        <form onSubmit={submit}>
          <label className="muted" style={{ fontSize: 13 }}>{t("Email")}</label>
          <input
            className={`input ${errors.email ? "inputErr" : ""}`}
            value={email}
            onChange={(e) => {
              setEmail(e.target.value);
              if (errors.email) setErrors((p) => ({ ...p, email: "" }));
            }}
            placeholder="you@example.com"
          />
          {errors.email ? <div className="fieldErr">{errors.email}</div> : null}

          <div className="spacer" />

          <button className="btn" disabled={loading} style={{ width: "100%" }}>
            {loading ? t("Sending...") : t("Send Reset Link")}
          </button>
        </form>

        {sent ? (
          <div className="muted" style={{ marginTop: 10, fontSize: 13 }}>
            {t("If the email exists, a reset link has been sent.")}
          </div>
        ) : null}

      </div>
    </div>
  );
}
