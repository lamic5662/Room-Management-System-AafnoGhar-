import { useEffect, useState } from "react";
import http from "../api/http";
import Spinner from "../components/Spinner";
import { useToast } from "../context/ToastContext";
import { useI18n } from "../context/I18nContext";
import KycDocCard from "../components/KycDocCard";
import NepaliDateInput from "../components/NepaliDateInput";

const API = "http://localhost:5001";

export default function OwnerKyc() {
  const { showToast } = useToast();
  const { t } = useI18n();
  const [loading, setLoading] = useState(true);
  const [kyc, setKyc] = useState(null);
  const [docType, setDocType] = useState("citizenship");
  const [fields, setFields] = useState(defaultFields("citizenship"));
  const [front, setFront] = useState(null);
  const [back, setBack] = useState(null);
  const [selfie, setSelfie] = useState(null);
  const [sending, setSending] = useState(false);
  const [errors, setErrors] = useState({});
  const [previewSrc, setPreviewSrc] = useState("");

  const load = async () => {
    try {
      setLoading(true);
      const res = await http.get("/api/kyc/me");
      const k = res.data.kyc ?? res.data.user?.kyc ?? null;
      setKyc(k);
    } catch (e) {
      showToast("error", e?.response?.data?.message || t("Failed to load KYC"));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  useEffect(() => {
    if (kyc?.docType) {
      setDocType(kyc.docType);
      setFields(kyc.fields && Object.keys(kyc.fields).length ? kyc.fields : defaultFields(kyc.docType));
    }
  }, [kyc?.docType]);

  const submit = async () => {
    const nextErrors = {};
    if (!docType) nextErrors.docType = t("Document type is required");
    if (!front) nextErrors.front = t("Front image is required");
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length) {
      return showToast("error", t("Please fix the highlighted fields"));
    }

    try {
      setSending(true);
      const fd = new FormData();
      fd.append("docType", docType);
      fd.append("fields", JSON.stringify(fields));
      fd.append("front", front);
      if (back) fd.append("back", back);
      if (selfie) fd.append("selfie", selfie);

      const res = await http.post("/api/kyc/submit", fd, {
        headers: { "Content-Type": "multipart/form-data" },
      });

      showToast("success", t("KYC submitted ✅"));
      setFront(null);
      setBack(null);
      setSelfie(null);
      const k = res.data.kyc ?? res.data.user?.kyc ?? null;
      setKyc(k);
    } catch (e) {
      showToast("error", e?.response?.data?.message || t("Submit failed"));
    } finally {
      setSending(false);
    }
  };

  if (loading) return <Spinner text={t("Loading KYC...")} />;

  const status = kyc?.status || "not_submitted";

  return (
    <div>
      <div className="row" style={{ justifyContent: "space-between", flexWrap: "wrap" }}>
        <div>
          <h1 className="h1">{t("Owner KYC")}</h1>
          <p className="muted" style={{ marginTop: 6 }}>
            {t("Upload documents for verification. After approval, you can publish rooms and get a Verified badge.")}
          </p>
        </div>
        <button className="btn btnOutline" onClick={load}>{t("Refresh")}</button>
      </div>

      <div className="spacer" />

      <div className="grid2">
        <div className="card cardPad">
          <div className="row" style={{ justifyContent: "space-between", flexWrap: "wrap" }}>
            <div>
              <div style={{ fontWeight: 1000 }}>{t("Status")}</div>
              <div className="muted" style={{ marginTop: 6 }}>
                {t("Current")}: <b style={{ color: "#111827" }}>{status.toUpperCase()}</b>
              </div>
              {kyc?.adminNote ? (
                <div className="muted" style={{ marginTop: 8 }}>
                  <b style={{ color: "#111827" }}>{t("Note")}:</b> {kyc.adminNote}
                </div>
              ) : null}
            </div>

            {status === "verified" || status === "approved" ? (
              <span className="badge">✓ {t("VERIFIED")}</span>
            ) : (
              <span className="badge">{t("Not Verified")}</span>
            )}
          </div>

          <div className="spacer" />

          {(kyc?.docFrontUrl || kyc?.docBackUrl || kyc?.selfieUrl) ? (
            <div>
              <div style={{ fontWeight: 1000, marginBottom: 10 }}>{t("Uploaded Docs")}</div>
              <div className="row" style={{ flexWrap: "wrap" }}>
                {kyc?.docFrontUrl ? (
                  <button className="pill" type="button" onClick={() => setPreviewSrc(`${API}${kyc.docFrontUrl}`)}>
                    {t("Front")}
                  </button>
                ) : null}
                {kyc?.docBackUrl ? (
                  <button className="pill" type="button" onClick={() => setPreviewSrc(`${API}${kyc.docBackUrl}`)}>
                    {t("Back")}
                  </button>
                ) : null}
                {kyc?.selfieUrl ? (
                  <button className="pill" type="button" onClick={() => setPreviewSrc(`${API}${kyc.selfieUrl}`)}>
                    {t("Selfie")}
                  </button>
                ) : null}
              </div>
            </div>
          ) : null}

          <div className="spacer" />

          {(status === "not_submitted" || status === "rejected") && (
          <>
            <div style={{ fontWeight: 1000 }}>{t("Submit Documents")}</div>
            <div className="muted" style={{ marginTop: 6, fontSize: 13 }}>
              {t("Upload front/back of your document and optional selfie.")}
            </div>

            <div className="spacer" />
            <label className="muted" style={{ fontSize: 13 }}>{t("Document Type")}</label>
            <div className={`selectWrap ${errors.docType ? "inputErr" : ""}`}>
              <select
                className={`input selectInput ${errors.docType ? "inputErr" : ""}`}
                value={docType}
                onChange={(e) => {
                  const v = e.target.value;
                  setDocType(v);
                  setFields(defaultFields(v));
                  if (errors.docType) setErrors((p) => ({ ...p, docType: "" }));
                }}
              >
                <option value="citizenship">{t("Citizenship")}</option>
                <option value="house_paper">{t("House Paper")}</option>
                <option value="college_id">{t("College ID")}</option>
                <option value="job_id">{t("Job ID")}</option>
                <option value="other">{t("Other")}</option>
              </select>
              <span className="selectCaret">▾</span>
            </div>
            {errors.docType ? <div className="fieldErr">{errors.docType}</div> : null}

            <div className="spacer" />
            <div className="card cardPad" style={{ boxShadow: "none", borderRadius: 14 }}>
              <div style={{ fontWeight: 1000, fontSize: 13 }}>{t("Document Details")}</div>
              <div className="spacer" />
              {docFields(docType).map((f) => (
                <div key={f.key} style={{ marginBottom: 10 }}>
                  {f.type === "nepali-date" ? (
                    <NepaliDateInput
                      label={f.label}
                      value={fields[f.key] || ""}
                      placeholder={f.placeholder}
                      onChange={(bs, ad) =>
                        setFields((p) => ({
                          ...p,
                          [f.key]: bs,
                          [f.adKey]: ad,
                        }))
                      }
                    />
                  ) : (
                    <>
                      <label className="muted" style={{ fontSize: 12 }}>{f.label}</label>
                      <input
                        className="input"
                        type={f.type || "text"}
                        value={fields[f.key] || ""}
                        onChange={(e) => setFields((p) => ({ ...p, [f.key]: e.target.value }))}
                        placeholder={f.placeholder}
                      />
                    </>
                  )}
                </div>
              ))}
            </div>

            <div className="spacer" />
            <label className="muted" style={{ fontSize: 13 }}>{t("Front Image (required)")}</label>
            <input
              className={`input ${errors.front ? "inputErr" : ""}`}
              type="file"
              accept="image/*"
              onChange={(e) => {
                setFront(e.target.files?.[0] || null);
                if (errors.front) setErrors((p) => ({ ...p, front: "" }));
              }}
            />
            {errors.front ? <div className="fieldErr">{errors.front}</div> : null}

            <div className="spacer" />
            <label className="muted" style={{ fontSize: 13 }}>{t("Back Image (optional)")}</label>
            <input
              className="input"
              type="file"
              accept="image/*"
              onChange={(e) => setBack(e.target.files?.[0] || null)}
            />

            <div className="spacer" />
            <label className="muted" style={{ fontSize: 13 }}>{t("Selfie (optional)")}</label>
            <input
              className="input"
              type="file"
              accept="image/*"
              onChange={(e) => setSelfie(e.target.files?.[0] || null)}
            />

            <div className="spacer" />
            <button className="btn" onClick={submit} disabled={sending}>
              {sending ? t("Submitting...") : t("Submit KYC")}
            </button>
            </>
          )}

          {status === "pending" && (
            <div className="muted">{t("Your KYC is pending review. Please wait for admin approval.")}</div>
          )}
        </div>

        <div className="card cardPad">
          <div style={{ fontWeight: 1000 }}>{t("Preview")}</div>
          <div className="muted" style={{ marginTop: 6, fontSize: 13 }}>
            {t("Selected documents preview (images only).")}
          </div>

          <div className="spacer" />

          <KycDocCard docType={docType} fields={fields} />
          <div className="spacer" />

          {!front && !back && !selfie ? (
            <div className="muted" style={{ fontSize: 13 }}>{t("No files selected yet.")}</div>
          ) : (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 10 }}>
              {front ? (
                <Preview label={t("Front")} file={front} />
              ) : null}
              {back ? (
                <Preview label={t("Back")} file={back} />
              ) : null}
              {selfie ? (
                <Preview label={t("Selfie")} file={selfie} />
              ) : null}
            </div>
          )}
        </div>
      </div>
      {previewSrc ? (
        <div className="modalBg" onMouseDown={() => setPreviewSrc("")}>
          <div className="modal" onMouseDown={(e) => e.stopPropagation()} style={{ maxWidth: 900 }}>
            <div className="row" style={{ justifyContent: "space-between" }}>
              <div style={{ fontWeight: 900 }}>{t("Document Preview")}</div>
              <button className="pill" onClick={() => setPreviewSrc("")} style={{ padding: "4px 10px" }}>
                ✕
              </button>
            </div>
            <div className="spacer" />
            <div className="card" style={{ borderRadius: 16, overflow: "hidden", boxShadow: "none", background: "#f3f4f6" }}>
              <img
                src={previewSrc}
                alt="KYC preview"
                style={{ width: "100%", maxHeight: "70vh", objectFit: "contain", display: "block" }}
              />
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function docFields(type) {
  if (type === "citizenship") {
    return [
      { key: "fullName", label: "Full Name", placeholder: "As on citizenship" },
      { key: "citizenshipNo", label: "Citizenship No", placeholder: "12-34-56-7890" },
      { key: "dob", label: "Date of Birth (BS)", type: "nepali-date", adKey: "dobAd" },
      { key: "issueDate", label: "Issue Date (BS)", type: "nepali-date", adKey: "issueDateAd" },
      { key: "district", label: "District", placeholder: "Kathmandu" },
    ];
  }
  if (type === "house_paper") {
    return [
      { key: "ownerName", label: "Owner Name" },
      { key: "houseNo", label: "House No" },
      { key: "ward", label: "Ward" },
      { key: "issueDate", label: "Issue Date (BS)", type: "nepali-date", adKey: "issueDateAd" },
    ];
  }
  if (type === "college_id") {
    return [
      { key: "fullName", label: "Full Name" },
      { key: "collegeName", label: "College" },
      { key: "studentId", label: "Student ID" },
      { key: "dob", label: "Date of Birth (BS)", type: "nepali-date", adKey: "dobAd" },
      { key: "issueDate", label: "Issue Date (BS)", type: "nepali-date", adKey: "issueDateAd" },
    ];
  }
  if (type === "job_id") {
    return [
      { key: "fullName", label: "Full Name" },
      { key: "companyName", label: "Company" },
      { key: "employeeId", label: "Employee ID" },
      { key: "dob", label: "Date of Birth (BS)", type: "nepali-date", adKey: "dobAd" },
      { key: "issueDate", label: "Issue Date (BS)", type: "nepali-date", adKey: "issueDateAd" },
    ];
  }
  return [
    { key: "docName", label: "Document Name" },
    { key: "idNumber", label: "ID Number" },
    { key: "fullName", label: "Full Name" },
    { key: "issueDate", label: "Issue Date (BS)", type: "nepali-date", adKey: "issueDateAd" },
  ];
}

function defaultFields(type) {
  const obj = {};
  docFields(type).forEach((f) => {
    obj[f.key] = "";
  });
  return obj;
}

function Preview({ label, file }) {
  const isImage = file?.type?.startsWith("image/");
  return (
    <div
      className="card"
      style={{ overflow: "hidden", borderRadius: 14, border: "1px solid #e5e7eb", boxShadow: "none" }}
    >
      <div style={{ padding: 8, fontSize: 12, fontWeight: 900 }}>{label}</div>
      {isImage ? (
        <img src={URL.createObjectURL(file)} alt={label} style={{ width: "100%", display: "block" }} />
      ) : (
        <div className="muted" style={{ padding: 12, fontSize: 13 }}>
          {file?.name || "File"}
        </div>
      )}
    </div>
  );
}
