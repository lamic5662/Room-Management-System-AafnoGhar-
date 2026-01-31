import { useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import http from "../api/http";
import { useToast } from "../context/ToastContext";
import { useI18n } from "../context/I18nContext";

export default function Register() {
  const navigate = useNavigate();
  const { showToast } = useToast();
  const { t } = useI18n();

  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [countryCode, setCountryCode] = useState("+977");
  const [phone, setPhone] = useState("");
  const [role, setRole] = useState("tenant");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPass, setShowPass] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState({});

  const phoneRules = useMemo(
    () => ({
      "+977": { label: "Nepal", len: 10, starts: ["97", "98"] },
      "+91": { label: "India", len: 10 },
      "+1": { label: "USA/CA", len: 10 },
      "+44": { label: "UK", len: 10 },
    }),
    []
  );
  const requiredPhoneLen = phoneRules[countryCode]?.len || 10;
  const phoneStarts = phoneRules[countryCode]?.starts || [];

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

    if (!fullName.trim()) nextErrors.fullName = "Full name is required";
    if (!email.trim()) nextErrors.email = "Email is required";
    const emailOk = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
    if (email.trim() && !emailOk) nextErrors.email = "Enter a valid email";
    if (!phone.trim()) nextErrors.phone = "Phone is required";
    if (phone && phone.length !== requiredPhoneLen) nextErrors.phone = `Phone must be ${requiredPhoneLen} digits`;
    if (countryCode === "+977" && phone && phoneStarts.length) {
      const ok = phoneStarts.some((p) => phone.startsWith(p));
      if (!ok) nextErrors.phone = "Nepal phone must start with 97 or 98";
    }
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
    if (!["tenant", "owner"].includes(role)) nextErrors.role = "Role must be tenant or owner";

    setErrors(nextErrors);
    if (Object.keys(nextErrors).length) {
      showToast("error", "Please fix the highlighted fields");
      return;
    }

    try {
      setLoading(true);
      const fullPhone = `${countryCode}${phone}`;
      await http.post("/api/auth/register", { fullName, email, phone: fullPhone, role, password });

      showToast("success", "Registered ✅ Please login");

      setTimeout(() => {
        navigate("/login");
      }, 400);
    } catch (e2) {
      showToast("error", e2?.response?.data?.message || "Register failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="authWrap">
      <div className="authCard card cardPad">
        <div style={{ textAlign: "center" }}>
          <div className="badge brandBadge" style={{ display: "inline-flex" }}>AafnoGhar</div>
          <h1 className="h1" style={{ marginTop: 10 }}>{t("Create account")}</h1>
          <p className="muted" style={{ marginTop: 6 }}>{t("Register as Tenant or Owner.")}</p>
        </div>

        <div className="spacer" />

        <form onSubmit={submit}>
          <label className="muted" style={{ fontSize: 13 }}>{t("Full Name")}</label>
          <input
            className={`input ${errors.fullName ? "inputErr" : ""}`}
            value={fullName}
            onChange={(e) => {
              setFullName(e.target.value);
              if (errors.fullName) setErrors((p) => ({ ...p, fullName: "" }));
            }}
            placeholder="Suraj Lamichhane"
          />
          {errors.fullName ? <div className="fieldErr">{errors.fullName}</div> : null}

          <div className="spacer" />

          <label className="muted" style={{ fontSize: 13 }}>{t("Email")}</label>
          <input
            className={`input ${errors.email ? "inputErr" : ""}`}
            value={email}
            onChange={(e) => {
              setEmail(e.target.value);
              if (errors.email) setErrors((p) => ({ ...p, email: "" }));
            }}
            placeholder="suraj@test.com"
          />
          {errors.email ? <div className="fieldErr">{errors.email}</div> : null}

          <div className="spacer" />

          <label className="muted" style={{ fontSize: 13 }}>{t("Phone")}</label>
          <div className="row">
            <select
              className="input"
              value={countryCode}
              onChange={(e) => setCountryCode(e.target.value)}
              style={{ width: 120 }}
            >
              <option value="+977">+977 (NP)</option>
              <option value="+91">+91 (IN)</option>
              <option value="+1">+1 (US/CA)</option>
              <option value="+44">+44 (UK)</option>
            </select>
            <input
              className={`input ${errors.phone ? "inputErr" : ""}`}
              value={phone}
              onChange={(e) => setPhone(e.target.value.replace(/[^0-9]/g, "").slice(0, requiredPhoneLen))}
              placeholder="9800000000"
            />
          </div>
          {errors.phone ? <div className="fieldErr">{errors.phone}</div> : null}

          <div className="spacer" />

          <label className="muted" style={{ fontSize: 13 }}>{t("Role")}</label>
          <div className={`roleGrid ${errors.role ? "roleErr" : ""}`} role="radiogroup" aria-label="Select role">
            <button
              type="button"
              className={"roleCard " + (role === "tenant" ? "active" : "")}
              onClick={() => setRole("tenant")}
              aria-checked={role === "tenant"}
              role="radio"
            >
              <div className="roleTitle">{t("Tenant")}</div>
              <div className="roleDesc">Find rooms, send requests, pay rent.</div>
            </button>
            <button
              type="button"
              className={"roleCard " + (role === "owner" ? "active" : "")}
              onClick={() => setRole("owner")}
              aria-checked={role === "owner"}
              role="radio"
            >
              <div className="roleTitle">{t("Owner")}</div>
              <div className="roleDesc">Post rooms, manage requests & payments.</div>
            </button>
          </div>
          {errors.role ? <div className="fieldErr">{errors.role}</div> : null}

          <div className="spacer" />

          <label className="muted" style={{ fontSize: 13 }}>{t("Password")}</label>
          <div className="inputWrap">
            <input
              className={`input ${errors.password ? "inputErr" : ""}`}
              type={showPass ? "text" : "password"}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="8+ chars with upper/lower/number/symbol"
            />
            <button type="button" className="eyeBtn" onClick={() => setShowPass((v) => !v)}>
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
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="Re-enter password"
            />
            <button type="button" className="eyeBtn" onClick={() => setShowConfirm((v) => !v)}>
              {showConfirm ? "🙈" : "👁"}
            </button>
          </div>
          {errors.confirmPassword ? <div className="fieldErr">{errors.confirmPassword}</div> : null}

          <div className="spacer" />

          <button className="btn" disabled={loading} style={{ width: "100%" }}>
            {loading ? t("Creating...") : t("Register")}
          </button>
        </form>

        <div className="spacer" />

        <div style={{ textAlign: "center" }} className="muted">
          {t("Already have an account?")}{" "}
          <Link to="/login" style={{ fontWeight: 900, color: "#111827" }}>
            {t("Login")}
          </Link>
        </div>
      </div>
    </div>
  );
}
