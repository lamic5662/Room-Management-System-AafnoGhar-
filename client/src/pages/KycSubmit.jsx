import { useEffect, useMemo, useRef, useState } from "react";
import http from "../api/http";
import { useToast } from "../context/ToastContext";
import { useI18n } from "../context/I18nContext";
import KycDocCard from "../components/KycDocCard";
import NepaliDateInput from "../components/NepaliDateInput";
import { getPhotoUrl } from "../utils/photo";
import KycHistory from "../components/KycHistory";

export default function KycSubmit() {
  const user = useMemo(() => JSON.parse(localStorage.getItem("user") || "null"), []);
  const [previewSrc, setPreviewSrc] = useState("");
  const token = useMemo(() => localStorage.getItem("token"), []);

  const [loading, setLoading] = useState(true);
  const [kyc, setKyc] = useState(null);

  const [docType, setDocType] = useState("citizenship");
  const [fields, setFields] = useState(defaultFields("citizenship"));
  const [front, setFront] = useState(null);
  const [back, setBack] = useState(null);
  const frontRef = useRef(null);
  const backRef = useRef(null);

  const [sending, setSending] = useState(false);
  const [errors, setErrors] = useState({});
  const [snapshot, setSnapshot] = useState({
    docType: "",
    fields: {},
    hasFront: false,
    hasBack: false,
  });

  const { showToast } = useToast();
  const { t } = useI18n();

  const isTenant = user?.role === "tenant";
  const hasSubmission = !!kyc?.status && kyc.status !== "not_submitted";

  const load = async () => {
    try {
      setLoading(true);
      const res = await http.get("/api/kyc/me");
      const k = res.data.kyc ?? res.data.user?.kyc ?? null;
      setKyc(k);
    } catch (e) {
      setKyc(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!token) return showToast("error", "Please login first");
    if (!isTenant) return showToast("error", "Tenant access only");
    load();
  }, []);

  useEffect(() => {
    if (kyc?.docType) {
      setDocType(kyc.docType);
      setFields(kyc.fields && Object.keys(kyc.fields).length ? kyc.fields : defaultFields(kyc.docType));
    }
    setSnapshot({
      docType: kyc?.docType || "",
      fields: kyc?.fields || {},
      hasFront: Boolean(kyc?.docFrontUrl),
      hasBack: Boolean(kyc?.docBackUrl),
    });
  }, [kyc]);

  const fieldsEqual = (a = {}, b = {}) => {
    const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
    for (const key of keys) {
      const va = String(a[key] ?? "").trim();
      const vb = String(b[key] ?? "").trim();
      if (va !== vb) return false;
    }
    return true;
  };

  const shouldSubmitUpdate = () => {
    if (!hasSubmission) return true;
    if (docType !== snapshot.docType) return true;
    if (!fieldsEqual(fields, snapshot.fields)) return true;
    if (front || back) return true;
    return false;
  };

  const submit = async () => {
    const nextErrors = {};
    if (!docType) nextErrors.docType = "Document type is required";
    const frontRequired = !kyc?.docFrontUrl;
    if (!front && frontRequired) nextErrors.front = "Front image is required";
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length) {
      return showToast("error", "Please fix the highlighted fields");
    }
    if (!shouldSubmitUpdate()) {
      return showToast("info", t("No changes detected"));
    }
    setSending(true);

    try {
      const fd = new FormData();
      fd.append("docType", docType);
      fd.append("fields", JSON.stringify(fields));
      if (front) fd.append("front", front);
      if (back) fd.append("back", back);

      const endpoint = hasSubmission ? "/api/kyc/update" : "/api/kyc/submit";
      const res = await (hasSubmission
        ? http.put(endpoint, fd, { headers: { "Content-Type": "multipart/form-data" } })
        : http.post(endpoint, fd, { headers: { "Content-Type": "multipart/form-data" } }));

      showToast(
        "success",
        hasSubmission ? "KYC updated ✅ (pending review)" : "KYC submitted ✅ (pending review)"
      );
      setFront(null);
      setBack(null);
      if (frontRef.current) frontRef.current.value = "";
      if (backRef.current) backRef.current.value = "";
      setErrors({});
      const nextKyc = res.data.kyc ?? res.data.user?.kyc ?? kyc;
      setKyc(nextKyc);
      const nextUser = { ...(user || {}), kyc: { ...(nextKyc || {}), status: nextKyc?.status || "pending" } };
      localStorage.setItem("user", JSON.stringify(nextUser));
      window.dispatchEvent(new Event("auth:updated"));
      await load();
    } catch (e) {
      showToast("error", e?.response?.data?.message || "Failed to submit KYC");
    } finally {
      setSending(false);
    }
  };

  return (
    <div>
      <div className="row" style={{ justifyContent: "space-between", flexWrap: "wrap" }}>
        <div>
          <h1 className="h1">KYC Verification</h1>
          <p className="muted" style={{ marginTop: 6 }}>
            Upload your document so owners/admin can verify your identity.
          </p>
        </div>
        <button className="btn btnOutline" onClick={load}>Refresh</button>
      </div>

      <div className="spacer" />

      <div className="card cardPad">
        <div className="row" style={{ justifyContent: "space-between", flexWrap: "wrap" }}>
          <div>
            <div style={{ fontWeight: 900, fontSize: 16 }}>Current Status</div>
            <div className="muted" style={{ marginTop: 4, fontSize: 13 }}>
              {loading ? "Loading..." : kyc?.status ? kyc.status : "Not submitted"}
            </div>
          </div>

          <span className="badge">
            {kyc?.status ? kyc.status.toUpperCase() : "NOT SUBMITTED"}
          </span>
        </div>

        {kyc?.adminNote ? (
          <div style={{ marginTop: 10, fontSize: 14 }}>
            <b>Admin Note:</b> {kyc.adminNote}
          </div>
        ) : null}
      </div>

      {(kyc?.docFrontUrl || kyc?.docBackUrl || kyc?.selfieUrl) && (
        <div className="card cardPad">
          <div style={{ fontWeight: 900 }}>{kyc?.status === "verified" ? "Verified Docs" : "Uploaded Docs"}</div>
          <div className="muted" style={{ marginTop: 6 }}>
            You can preview previously uploaded documents.
          </div>
          <div className="spacer" />
          <div className="row" style={{ flexWrap: "wrap" }}>
            {kyc?.docFrontUrl && (
              <button className="pill" type="button" onClick={() => setPreviewSrc(getPhotoUrl(kyc.docFrontUrl))}>
                Front
              </button>
            )}
            {kyc?.docBackUrl && (
              <button className="pill" type="button" onClick={() => setPreviewSrc(getPhotoUrl(kyc.docBackUrl))}>
                Back
              </button>
            )}
            {kyc?.selfieUrl && (
              <button className="pill" type="button" onClick={() => setPreviewSrc(getPhotoUrl(kyc.selfieUrl))}>
                Selfie
              </button>
            )}
          </div>
        </div>
      )}

      <div className="spacer" />

      <div className="grid2">
        <div className="card cardPad">
          <h2 className="h2">Submit KYC</h2>
          <p className="muted" style={{ marginTop: 6, fontSize: 13 }}>
            Use clear photo. No blur. Full document must be visible.
          </p>

          <div className="spacer" />

          <label className="muted" style={{ fontSize: 13 }}>Document Type</label>
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
              <option value="citizenship">Citizenship</option>
              <option value="college_id">College ID</option>
              <option value="job_id">Job ID</option>
              <option value="other">Other</option>
            </select>
            <span className="selectCaret">▾</span>
          </div>
          {errors.docType ? <div className="fieldErr">{errors.docType}</div> : null}

          <div className="spacer" />

          <div className="card cardPad" style={{ boxShadow: "none", borderRadius: 14 }}>
            <div style={{ fontWeight: 900, fontSize: 13 }}>Document Details</div>
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

          <label className="muted" style={{ fontSize: 13 }}>Front Image (required)</label>
          <input
            className={`input ${errors.front ? "inputErr" : ""}`}
            type="file"
            accept="image/*"
            ref={frontRef}
            onChange={(e) => {
              setFront(e.target.files?.[0] || null);
              if (errors.front) setErrors((p) => ({ ...p, front: "" }));
            }}
          />
          {errors.front ? <div className="fieldErr">{errors.front}</div> : null}
          <div className="spacer" />

          <label className="muted" style={{ fontSize: 13 }}>Back Image (optional)</label>
          <input
            className="input"
            type="file"
            accept="image/*"
            ref={backRef}
            onChange={(e) => setBack(e.target.files?.[0] || null)}
          />

        <div className="spacer" />

          <button className="btn" onClick={submit} disabled={sending}>
            {sending ? "Submitting..." : hasSubmission ? "Update KYC" : "Submit KYC"}
          </button>

          <div className="spacer" />
          <div className="muted" style={{ fontSize: 12 }}>
            After submitting, admin will review in Admin Dashboard.
          </div>
        </div>

        <div className="card cardPad">
          <h2 className="h2">Preview</h2>
          <p className="muted" style={{ marginTop: 6, fontSize: 13 }}>
            Check your selected files before submit.
          </p>
          <div className="spacer" />

          <KycDocCard docType={docType} fields={fields} />
          <div className="spacer" />

          <PreviewCard
            label="Front"
            file={front}
            onRemove={() => {
              setFront(null);
              if (frontRef.current) frontRef.current.value = "";
            }}
          />
          <div className="spacer" />
          <PreviewCard
            label="Back"
            file={back}
            optional
            onRemove={() => {
              setBack(null);
              if (backRef.current) backRef.current.value = "";
            }}
          />
      </div>
    </div>

      <KycHistory history={kyc?.history} />

      {previewSrc ? (
        <div className="modalBg" onMouseDown={() => setPreviewSrc("")}>
          <div className="modal" onMouseDown={(e) => e.stopPropagation()} style={{ maxWidth: 900 }}>
            <div className="row" style={{ justifyContent: "space-between" }}>
              <div style={{ fontWeight: 900 }}>Document Preview</div>
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

function PreviewCard({ label, file, optional, onRemove }) {
  const url = file ? URL.createObjectURL(file) : null;

  return (
    <div className="card cardPad" style={{ boxShadow: "none", borderRadius: 14 }}>
      <div className="row" style={{ justifyContent: "space-between" }}>
        <div style={{ fontWeight: 900 }}>{label}</div>
        {!file ? (
          <span className="pill muted">{optional ? "Optional" : "No file"}</span>
        ) : (
          <div className="row">
            <span className="pill">Selected</span>
            <button
              type="button"
              className="pill"
              onClick={onRemove}
              style={{ padding: "4px 10px" }}
              aria-label={`Remove ${label} file`}
              title="Remove"
            >
              ✕
            </button>
          </div>
        )}
      </div>
      <div className="spacer" />
      {url ? (
        <div className="card" style={{ boxShadow: "none", borderRadius: 14, overflow: "hidden", border: "1px solid #e5e7eb" }}>
          <img src={url} alt={label} style={{ width: "100%", display: "block" }} />
        </div>
      ) : (
        <div className="muted" style={{ fontSize: 13 }}>
          {optional ? "Upload if your document has back side." : "Please select a clear image."}
        </div>
      )}
    </div>
  );
}
