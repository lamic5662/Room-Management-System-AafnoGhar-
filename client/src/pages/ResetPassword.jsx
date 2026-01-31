import { useMemo, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import http from "../api/http";
import { useToast } from "../context/ToastContext";
import { useI18n } from "../context/I18nContext";

export default function ResetPassword() {
  const [params] = useSearchParams();
  const token = params.get("token") || "";
  const navigate = useNavigate();
  const { showToast } = useToast();
  const { t } = useI18n();

  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPass, setShowPass] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState({});

  const passwordStrength = useMemo(() => {
    const pwd = String(password || "");
    const hasUpper = /[A-Z]/.test(pwd);
    const hasLower = /[a-z]/.test(pwd);
    const hasNum = /[0-9]/.test(pwd);
    const hasSym = /[^A-Za-z0-9]/.test(pwd);
    const score = [hasUpper, hasLower, hasNum, hasSym].filter(Boolean).length + (pwd.length >= 8 ? 1 : 0);
    if (!pwd) return { label: "", level: "" };
    if (score >= 5) return { label: "Strong", level: "strong" };
    if (score >= 3) return { label: "Medium", level: "medium" };
    return { label: "Weak", level: "weak" };
  }, [password]);

  const submit = async (e) => {
    e.preventDefault();
    const nextErrors = {};
    const pwd = password.trim();
    const hasUpper = /[A-Z]/.test(pwd);
    const hasLower = /[a-z]/.test(pwd);
    const hasNum = /[0-9]/.test(pwd);
    const hasSym = /[^A-Za-z0-9]/.test(pwd);
    if (!pwd) nextErrors.password = "Password is required";
    if (pwd && (pwd.length < 8 || !hasUpper || !hasLower || !hasNum || !hasSym)) {
      nextErrors.password = "Password must be 8+ chars with upper, lower, number, symbol";
    }
    if (!confirmPassword.trim()) nextErrors.confirmPassword = "Confirm password is required";
    if (password && confirmPassword && password !== confirmPassword) nextErrors.confirmPassword = "Passwords do not match";

    setErrors(nextErrors);
    if (Object.keys(nextErrors).length) {
      showToast("error", "Please fix the highlighted fields");
      return;
    }

    try {
      setLoading(true);
      await http.post("/api/auth/reset-password", { token, password, confirmPassword });
      showToast("success", "Password reset successful ✅");
      setTimeout(() => navigate("/login"), 400);
    } catch (e2) {
      showToast("error", e2?.response?.data?.message || "Reset failed");
    } finally {
      setLoading(false);
    }
  };

  if (!token) {
    return (
      <div className="authWrap">
        <div className="authCard card cardPad" style={{ textAlign: "center" }}>
          <div className="badge brandBadge" style={{ display: "inline-flex" }}>AafnoGhar</div>
          <h1 className="h1" style={{ marginTop: 10 }}>{t("Reset Password")}</h1>
          <p className="muted" style={{ marginTop: 6 }}>{t("Reset link is missing or invalid.")}</p>
          <div className="spacer" />
          <Link className="btn" to="/forgot-password">{t("Request new link")}</Link>
        </div>
      </div>
    );
  }

  return (
    <div className="authWrap">
      <div className="authCard card cardPad">
        <div style={{ textAlign: "center" }}>
          <div className="badge brandBadge" style={{ display: "inline-flex" }}>AafnoGhar</div>
          <h1 className="h1" style={{ marginTop: 10 }}>{t("Reset Password")}</h1>
          <p className="muted" style={{ marginTop: 6 }}>{t("Set a new password for your account.")}</p>
        </div>

        <div className="spacer" />

        <form onSubmit={submit}>
          <label className="muted" style={{ fontSize: 13 }}>{t("New Password")}</label>
          <div className="inputWrap">
            <input
              className={`input ${errors.password ? "inputErr" : ""}`}
              type={showPass ? "text" : "password"}
              value={password}
              onChange={(e) => {
                setPassword(e.target.value);
                if (errors.password) setErrors((p) => ({ ...p, password: "" }));
              }}
              placeholder="Minimum 8 characters"
            />
            <button
              type="button"
              className="eyeBtn"
              onClick={() => setShowPass((v) => !v)}
              aria-label={showPass ? t("Hide password") : t("Show password")}
              title={showPass ? t("Hide password") : t("Show password")}
            >
              {showPass ? "🙈" : "👁"}
            </button>
          </div>
          {errors.password ? <div className="fieldErr">{errors.password}</div> : null}
          {passwordStrength.label ? (
            <div className={`pwdStrength ${passwordStrength.level}`}>
              {passwordStrength.label}
            </div>
          ) : null}

          <div className="spacer" />

          <label className="muted" style={{ fontSize: 13 }}>{t("Confirm Password")}</label>
          <div className="inputWrap">
            <input
              className={`input ${errors.confirmPassword ? "inputErr" : ""}`}
              type={showConfirm ? "text" : "password"}
              value={confirmPassword}
              onChange={(e) => {
                setConfirmPassword(e.target.value);
                if (errors.confirmPassword) setErrors((p) => ({ ...p, confirmPassword: "" }));
              }}
              placeholder="Re-enter password"
            />
            <button
              type="button"
              className="eyeBtn"
              onClick={() => setShowConfirm((v) => !v)}
              aria-label={showConfirm ? t("Hide password") : t("Show password")}
              title={showConfirm ? t("Hide password") : t("Show password")}
            >
              {showConfirm ? "🙈" : "👁"}
            </button>
          </div>
          {errors.confirmPassword ? <div className="fieldErr">{errors.confirmPassword}</div> : null}

          <div className="spacer" />

          <button className="btn" disabled={loading} style={{ width: "100%" }}>
            {loading ? t("Resetting...") : t("Reset Password")}
          </button>
        </form>

        <div className="spacer" />

        <div style={{ textAlign: "center" }} className="muted">
          <Link to="/login" style={{ fontWeight: 900, color: "#111827" }}>
            {t("Back to Login")}
          </Link>
        </div>
      </div>
    </div>
  );
}
