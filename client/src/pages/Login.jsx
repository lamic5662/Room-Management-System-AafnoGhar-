import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import http from "../api/http";
import { useToast } from "../context/ToastContext";
import { useI18n } from "../context/I18nContext";

export default function Login() {
  const navigate = useNavigate();
  const { showToast } = useToast();
  const { t } = useI18n();

  const [emailOrPhone, setEmailOrPhone] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState({});
  const [showPass, setShowPass] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    const nextErrors = {};
    const input = emailOrPhone.trim();
    if (!input) nextErrors.emailOrPhone = "Email or phone is required";
    if (input) {
      if (input.includes("@")) {
        const emailOk = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input);
        if (!emailOk) nextErrors.emailOrPhone = "Enter a valid email";
      } else {
        const digits = input.replace(/[^0-9]/g, "");
        if (digits.length < 7 || digits.length > 15) {
          nextErrors.emailOrPhone = "Enter a valid phone number";
        }
      }
    }
    if (!password.trim()) nextErrors.password = "Password is required";

    setErrors(nextErrors);
    if (Object.keys(nextErrors).length) {
      showToast("error", "Please fix the highlighted fields");
      return;
    }

    try {
      setLoading(true);
      const res = await http.post("/api/auth/login", { emailOrPhone, password });

      localStorage.setItem("token", res.data.token);
      localStorage.setItem("user", JSON.stringify(res.data.user));
      window.dispatchEvent(new Event("auth:updated"));

      showToast("success", "Login successful ✅");

      const role = res.data.user?.role;
      setTimeout(() => {
        if (role === "admin") navigate("/admin/dashboard");
        else if (role === "owner") navigate("/owner/dashboard");
        else navigate("/rooms");
      }, 400);
    } catch (e2) {
      showToast("error", e2?.response?.data?.message || "Login failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="authWrap">
      <div className="authCard card cardPad">
        <div style={{ textAlign: "center" }}>
          <div className="badge brandBadge" style={{ display: "inline-flex" }}>AafnoGhar</div>
          <h1 className="h1" style={{ marginTop: 10 }}>{t("Welcome back")}</h1>
          <p className="muted" style={{ marginTop: 6 }}>{t("Login using email or phone number.")}</p>
        </div>

        <div className="spacer" />

        <form onSubmit={submit}>
          <label className="muted" style={{ fontSize: 13 }}>{t("Email or Phone")}</label>
          <input
            className={`input ${errors.emailOrPhone ? "inputErr" : ""}`}
            value={emailOrPhone}
            onChange={(e) => {
              setEmailOrPhone(e.target.value);
              if (errors.emailOrPhone) setErrors((p) => ({ ...p, emailOrPhone: "" }));
            }}
            placeholder="suraj@test.com or 9800000000"
          />
          {errors.emailOrPhone ? <div className="fieldErr">{errors.emailOrPhone}</div> : null}

          <div className="spacer" />

          <label className="muted" style={{ fontSize: 13 }}>{t("Password")}</label>
          <div className="inputWrap">
            <input
              className={`input ${errors.password ? "inputErr" : ""}`}
              type={showPass ? "text" : "password"}
              value={password}
              onChange={(e) => {
                setPassword(e.target.value);
                if (errors.password) setErrors((p) => ({ ...p, password: "" }));
              }}
              placeholder="******"
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

          <div className="spacer" />

          <button className="btn" disabled={loading} style={{ width: "100%" }}>
            {loading ? t("Logging in...") : t("Login")}
          </button>
        </form>

        <div className="spacer" />
        <div style={{ textAlign: "center" }}>
          <Link to="/forgot-password" style={{ fontWeight: 900, color: "#111827" }}>
            {t("Forgot Password")}
          </Link>
        </div>

        <div className="spacer" />

        <div style={{ textAlign: "center" }} className="muted">
          {t("Don’t have an account?")}{" "}
          <Link to="/register" style={{ fontWeight: 900, color: "#111827" }}>
            {t("Register")}
          </Link>
        </div>
      </div>
    </div>
  );
}
