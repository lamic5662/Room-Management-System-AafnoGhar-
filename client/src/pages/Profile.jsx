import { useEffect, useMemo, useRef, useState } from "react";
import http from "../api/http";
import { useToast } from "../context/ToastContext";
import { getPhotoUrl } from "../utils/photo";
import { useI18n } from "../context/I18nContext";

export default function Profile() {
  const { showToast } = useToast();
  const { t } = useI18n();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [changing, setChanging] = useState(false);
  const [uploading, setUploading] = useState(false);

  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [countryCode, setCountryCode] = useState("+977");
  const [phone, setPhone] = useState("");
  const [avatarUrl, setAvatarUrl] = useState("");
  const avatarInputRef = useRef(null);

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showCur, setShowCur] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  const [errors, setErrors] = useState({});
  const [pwdErrors, setPwdErrors] = useState({});

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
    const pwd = String(newPassword || "");
    const hasUpper = /[A-Z]/.test(pwd);
    const hasLower = /[a-z]/.test(pwd);
    const hasNum = /[0-9]/.test(pwd);
    const hasSym = /[^A-Za-z0-9]/.test(pwd);
    const score = [hasUpper, hasLower, hasNum, hasSym].filter(Boolean).length + (pwd.length >= 8 ? 1 : 0);
    if (!pwd) return { label: "", level: "" };
    if (score >= 5) return { label: "Strong", level: "strong" };
    if (score >= 3) return { label: "Medium", level: "medium" };
    return { label: "Weak", level: "weak" };
  }, [newPassword]);

  const load = async () => {
    try {
      setLoading(true);
      const res = await http.get("/api/users/me");
      const u = res.data.user;
      setFullName(u.fullName || "");
      setEmail(u.email || "");
      setAvatarUrl(u.avatarUrl || "");

      const rawPhone = u.phone || "";
      const matched = Object.keys(phoneRules).find((c) => rawPhone.startsWith(c));
      if (matched) {
        setCountryCode(matched);
        setPhone(rawPhone.replace(matched, ""));
      } else {
        setPhone(rawPhone.replace(/\D/g, ""));
      }
    } catch (e) {
      showToast("error", e?.response?.data?.message || "Failed to load profile");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const saveProfile = async () => {
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
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length) {
      return showToast("error", "Please fix the highlighted fields");
    }

    try {
      setSaving(true);
      const fullPhone = `${countryCode}${phone}`;
      const res = await http.patch("/api/users/me", {
        fullName,
        email,
        phone: fullPhone,
      });
      showToast("success", "Profile updated ✅");
      if (res.data?.user) {
        localStorage.setItem("user", JSON.stringify(res.data.user));
        setAvatarUrl(res.data.user.avatarUrl || "");
        window.dispatchEvent(new Event("auth:updated"));
      }
    } catch (e) {
      showToast("error", e?.response?.data?.message || "Update failed");
    } finally {
      setSaving(false);
    }
  };

  const changePassword = async () => {
    const nextErrors = {};
    if (!currentPassword.trim()) nextErrors.currentPassword = "Current password is required";
    if (!newPassword.trim()) nextErrors.newPassword = "New password is required";
    const pwd = newPassword.trim();
    const hasUpper = /[A-Z]/.test(pwd);
    const hasLower = /[a-z]/.test(pwd);
    const hasNum = /[0-9]/.test(pwd);
    const hasSym = /[^A-Za-z0-9]/.test(pwd);
    if (pwd && (pwd.length < 8 || !hasUpper || !hasLower || !hasNum || !hasSym)) {
      nextErrors.newPassword = "Password must be 8+ chars with upper, lower, number, symbol";
    }
    if (!confirmPassword.trim()) nextErrors.confirmPassword = "Confirm password is required";
    if (newPassword && confirmPassword && newPassword !== confirmPassword) {
      nextErrors.confirmPassword = "Passwords do not match";
    }
    setPwdErrors(nextErrors);
    if (Object.keys(nextErrors).length) {
      return showToast("error", "Please fix the highlighted fields");
    }

    try {
      setChanging(true);
      await http.patch("/api/users/me/password", {
        currentPassword,
        newPassword,
      });
      showToast("success", "Password updated ✅");
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      setPwdErrors({});
    } catch (e) {
      showToast("error", e?.response?.data?.message || "Password update failed");
    } finally {
      setChanging(false);
    }
  };

  const uploadAvatar = async (file) => {
    if (!file) return;
    try {
      setUploading(true);
      const fd = new FormData();
      fd.append("avatar", file);
      const res = await http.post("/api/users/me/avatar", fd, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      showToast("success", "Profile photo updated ✅");
      if (res.data?.user) {
        localStorage.setItem("user", JSON.stringify(res.data.user));
        setAvatarUrl(res.data.user.avatarUrl || "");
        window.dispatchEvent(new Event("auth:updated"));
      }
    } catch (e) {
      showToast("error", e?.response?.data?.message || "Upload failed");
    } finally {
      setUploading(false);
      if (avatarInputRef.current) avatarInputRef.current.value = "";
    }
  };

  const removeAvatar = async () => {
    try {
      setUploading(true);
      const res = await http.delete("/api/users/me/avatar");
      showToast("success", "Profile photo removed ✅");
      if (res.data?.user) {
        localStorage.setItem("user", JSON.stringify(res.data.user));
        setAvatarUrl(res.data.user.avatarUrl || "");
        window.dispatchEvent(new Event("auth:updated"));
      }
    } catch (e) {
      showToast("error", e?.response?.data?.message || "Remove failed");
    } finally {
      setUploading(false);
    }
  };

  if (loading) return <div className="muted">Loading profile...</div>;

  return (
    <div>
      <div className="row" style={{ justifyContent: "space-between", flexWrap: "wrap" }}>
        <div>
          <h1 className="h1">{t("Profile")}</h1>
          <p className="muted" style={{ marginTop: 6 }}>{t("Update your details and password.")}</p>
        </div>
      </div>

      <div className="spacer" />

      <div className="grid2">
        <div className="card cardPad profileCard">
          <h2 className="h2">{t("Edit Profile")}</h2>
          <div className="spacer" />

          <label className="muted" style={{ fontSize: 13 }}>{t("Profile Photo")}</label>
          <div className="row profileRow" style={{ alignItems: "center", gap: 12 }}>
            <div className="profileAvatar">
              {avatarUrl ? (
                <img src={getPhotoUrl(avatarUrl)} alt="avatar" />
              ) : (
                <span>{(fullName || "U")[0]}</span>
              )}
            </div>
            <div>
              <input
                ref={avatarInputRef}
                type="file"
                accept="image/*"
                onChange={(e) => uploadAvatar(e.target.files?.[0])}
              />
              <div className="muted" style={{ fontSize: 12, marginTop: 6 }}>
                PNG/JPG/WEBP • max 2MB
              </div>
              {uploading ? <div className="muted" style={{ fontSize: 12 }}>{t("Uploading...")}</div> : null}
              {avatarUrl ? (
                <div style={{ marginTop: 8 }}>
                  <button className="btn btnOutline" type="button" onClick={removeAvatar} disabled={uploading}>
                    {t("Remove Photo")}
                  </button>
                </div>
              ) : null}
            </div>
          </div>

          <div className="spacer" />

          <label className="muted" style={{ fontSize: 13 }}>{t("Full Name")}</label>
          <input
            className={`input ${errors.fullName ? "inputErr" : ""}`}
            value={fullName}
            onChange={(e) => {
              setFullName(e.target.value);
              if (errors.fullName) setErrors((p) => ({ ...p, fullName: "" }));
            }}
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
          <button className="btn" onClick={saveProfile} disabled={saving}>
            {saving ? t("Saving...") : t("Save Changes")}
          </button>
        </div>

        <div className="card cardPad profileCard">
          <h2 className="h2">{t("Change Password")}</h2>
          <div className="spacer" />

          <label className="muted" style={{ fontSize: 13 }}>{t("Current Password")}</label>
          <div className="inputWrap">
            <input
              className={`input ${pwdErrors.currentPassword ? "inputErr" : ""}`}
              type={showCur ? "text" : "password"}
              value={currentPassword}
              onChange={(e) => {
                setCurrentPassword(e.target.value);
                if (pwdErrors.currentPassword) setPwdErrors((p) => ({ ...p, currentPassword: "" }));
              }}
            />
            <button type="button" className="eyeBtn" onClick={() => setShowCur((v) => !v)}>
              {showCur ? "🙈" : "👁"}
            </button>
          </div>
          {pwdErrors.currentPassword ? <div className="fieldErr">{pwdErrors.currentPassword}</div> : null}

          <div className="spacer" />

          <label className="muted" style={{ fontSize: 13 }}>{t("New Password")}</label>
          <div className="inputWrap">
            <input
              className={`input ${pwdErrors.newPassword ? "inputErr" : ""}`}
              type={showNew ? "text" : "password"}
              value={newPassword}
              onChange={(e) => {
                setNewPassword(e.target.value);
                if (pwdErrors.newPassword) setPwdErrors((p) => ({ ...p, newPassword: "" }));
              }}
              placeholder="8+ chars with upper/lower/number/symbol"
            />
            <button type="button" className="eyeBtn" onClick={() => setShowNew((v) => !v)}>
              {showNew ? "🙈" : "👁"}
            </button>
          </div>
          {pwdErrors.newPassword ? <div className="fieldErr">{pwdErrors.newPassword}</div> : null}
          {passwordStrength.label ? (
            <div className={`pwdStrength ${passwordStrength.level}`}>
              {passwordStrength.label}
            </div>
          ) : null}

          <div className="spacer" />

          <label className="muted" style={{ fontSize: 13 }}>{t("Confirm New Password")}</label>
          <div className="inputWrap">
            <input
              className={`input ${pwdErrors.confirmPassword ? "inputErr" : ""}`}
              type={showConfirm ? "text" : "password"}
              value={confirmPassword}
              onChange={(e) => {
                setConfirmPassword(e.target.value);
                if (pwdErrors.confirmPassword) setPwdErrors((p) => ({ ...p, confirmPassword: "" }));
              }}
            />
            <button type="button" className="eyeBtn" onClick={() => setShowConfirm((v) => !v)}>
              {showConfirm ? "🙈" : "👁"}
            </button>
          </div>
          {pwdErrors.confirmPassword ? <div className="fieldErr">{pwdErrors.confirmPassword}</div> : null}

          <div className="spacer" />
          <button className="btn" onClick={changePassword} disabled={changing}>
            {changing ? t("Updating...") : t("Update Password")}
          </button>
        </div>
      </div>
    </div>
  );
}
