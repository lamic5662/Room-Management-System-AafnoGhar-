import { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import http from "../api/http";
import Spinner from "../components/Spinner";
import Modal from "../components/Modal";
import { useToast } from "../context/ToastContext";
import { getPhotoUrl } from "../utils/photo";

const VALID_TABS = ["pending", "approved"];
const getTabFromSearch = (search) => {
  const params = new URLSearchParams(search);
  const requested = params.get("tab");
  return VALID_TABS.includes(requested) ? requested : "pending";
};

export default function AdminKyc() {
  const { showToast } = useToast();
  const location = useLocation();
  const navigate = useNavigate();

  const tab = useMemo(() => getTabFromSearch(location.search), [location.search]);
  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState([]);
  const [busyId, setBusyId] = useState("");
  const [summary, setSummary] = useState({ pending: 0, approved: 0 });
  const goToTab = (target) => {
    if (!VALID_TABS.includes(target)) return;
    navigate(`/admin/kyc?tab=${target}`, { replace: true });
  };

  const [openReject, setOpenReject] = useState(false);
  const [openApprove, setOpenApprove] = useState(false);
  const [selected, setSelected] = useState(null);
  const [reason, setReason] = useState("Document is unclear. Please upload clear image.");
  const [adminNote, setAdminNote] = useState("Verified all details.");
  const [sending, setSending] = useState(false);
  const [previewSrc, setPreviewSrc] = useState("");
  const [checks, setChecks] = useState({
    docClear: false,
    nameMatch: false,
    dobMatch: false,
    faceMatch: false,
    notReused: false,
  });

  const load = async (nextTab = tab) => {
    try {
      setLoading(true);
      const url = nextTab === "approved" ? "/api/kyc/approved" : "/api/kyc/pending";
      const res = await http.get(url);
      setItems(res.data.users || []);
    } catch (e) {
      showToast("error", e?.response?.data?.message || "Failed to load KYC");
    } finally {
      setLoading(false);
    }
  };

  const loadSummary = async () => {
    try {
      const res = await http.get("/api/kyc/summary");
      setSummary(res.data || { pending: 0, approved: 0 });
    } catch {
      // ignore
    }
  };

  useEffect(() => {
    load(tab);
    loadSummary();
  }, [tab]);

  const approve = async () => {
    if (!selected?._id) return;
    const allChecked = Object.values(checks).every(Boolean);
    if (!allChecked) {
      return showToast("error", "Please complete all checklist items");
    }
    try {
      setBusyId(selected._id);
      await http.patch(`/api/kyc/${selected._id}/approve`, { adminNote, checks });
      showToast("success", "KYC approved ✅");
      setOpenApprove(false);
      await load();
      await loadSummary();
    } catch (e) {
      showToast("error", e?.response?.data?.message || "Approve failed");
    } finally {
      setBusyId("");
    }
  };

  const openApproveModal = (u) => {
    setSelected(u);
    setAdminNote("Verified all details.");
    setChecks({
      docClear: false,
      nameMatch: false,
      dobMatch: false,
      faceMatch: false,
      notReused: false,
    });
    setOpenApprove(true);
  };

  const openRejectModal = (u) => {
    setSelected(u);
    setReason("Document is unclear. Please upload clear image.");
    setOpenReject(true);
  };

  const reject = async () => {
    if (!selected?._id) return;
    if (!reason.trim()) return showToast("error", "Write a reason");

    try {
      setSending(true);
      await http.patch(`/api/kyc/${selected._id}/reject`, { reason, checks });
      showToast("success", "KYC rejected ✅");
      setOpenReject(false);
      await load();
      await loadSummary();
    } catch (e) {
      showToast("error", e?.response?.data?.message || "Reject failed");
    } finally {
      setSending(false);
    }
  };

  if (loading) return <Spinner text="Loading KYC submissions..." />;

  return (
    <div>
      <div className="row" style={{ justifyContent: "space-between", flexWrap: "wrap" }}>
        <div>
          <h1 className="h1">KYC Review</h1>
          <p className="muted" style={{ marginTop: 6 }}>
            Review documents submitted by owners and tenants.
          </p>
        </div>
      </div>

      <div className="spacer" />

      <div className="row" style={{ flexWrap: "wrap", gap: 12 }}>
        <button
          type="button"
          className="card cardPad kycSummaryCard"
          style={{ flex: "1 1 220px", minWidth: 220, textAlign: "left" }}
          onClick={() => goToTab("pending")}
        >
          <div className="muted" style={{ fontSize: 13 }}>Pending KYC</div>
          <div style={{ fontSize: 28, fontWeight: 900, marginTop: 6 }}>{summary.pending}</div>
          <div className="muted" style={{ marginTop: 6, fontSize: 13 }}>Click to review pending submissions</div>
        </button>

        <button
          type="button"
          className="card cardPad kycSummaryCard"
          style={{ flex: "1 1 220px", minWidth: 220, textAlign: "left" }}
          onClick={() => goToTab("approved")}
        >
          <div className="muted" style={{ fontSize: 13 }}>Approved KYC</div>
          <div style={{ fontSize: 28, fontWeight: 900, marginTop: 6 }}>{summary.approved}</div>
          <div className="muted" style={{ marginTop: 6, fontSize: 13 }}>Click to view approved users</div>
        </button>
      </div>

      <div className="spacer" />

      <div className="spacer" />

      <div className="spacer" />

      {items.length === 0 ? (
        <div className="card cardPad">
          {tab === "approved" ? "No approved KYC right now." : "No pending KYC right now."}
        </div>
      ) : (
        <div className="gridCards">
          {items.map((u) => {
            const isBusy = busyId === u._id;
            const submittedAt = u?.kyc?.submittedAt
              ? new Date(u.kyc.submittedAt).toLocaleString()
              : "";

            const frontRaw = u?.kyc?.docFrontUrl || u?.kyc?.documentFrontUrl;
            const backRaw = u?.kyc?.docBackUrl || u?.kyc?.documentBackUrl;
            const selfieRaw = u?.kyc?.selfieUrl;
            const docsRaw = Array.isArray(u?.kyc?.docs) ? u.kyc.docs : [];
            const fieldRows = buildKycFieldRows(u?.kyc?.docType, u?.kyc?.fields);

            const front = frontRaw ? getPhotoUrl(frontRaw) : "";
            const back = backRaw ? getPhotoUrl(backRaw) : "";
            const selfie = selfieRaw ? getPhotoUrl(selfieRaw) : "";
            const docs = docsRaw.map((p) => getPhotoUrl(p)).filter(Boolean);

            return (
              <div key={u._id} className="card cardPad">
                <div className="row" style={{ justifyContent: "space-between", alignItems: "flex-start" }}>
                <div>
                    <div style={{ fontWeight: 900, fontSize: 16 }}>{u.fullName}</div>
                    <div className="muted" style={{ marginTop: 4, fontSize: 13 }}>
                      {u.email} • {u.phone} • role: <b style={{ color: "#111827" }}>{u.role}</b>
                    </div>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <span className="badge">{tab === "approved" ? "APPROVED" : "PENDING"}</span>
                  {u.kyc?.resubmitted ? (
                    <span className="badge badgeWarning" style={{ borderColor: "#f97316", background: "rgba(249,115,22,0.08)", color: "#c2410c" }}>
                      RESUBMITTED
                    </span>
                  ) : null}
                </div>
              </div>
              {submittedAt ? (
                <div className="muted" style={{ marginTop: 6, fontSize: 12, whiteSpace: "normal" }}>
                  {tab === "approved" ? "Approved" : "Submitted"}: {submittedAt}
                </div>
              ) : null}

                {fieldRows.length ? (
                  <div className="card cardPad" style={{ marginTop: 10, boxShadow: "none", borderRadius: 14 }}>
                    <div style={{ fontWeight: 900, marginBottom: 6 }}>Submitted Details</div>
                    <div className="muted" style={{ fontSize: 13, lineHeight: 1.7 }}>
                      {fieldRows.map((row) => (
                        <div key={row.label}>
                          <b style={{ color: "#111827" }}>{row.label}:</b> {row.value}
                        </div>
                      ))}
                    </div>
                  </div>
                ) : null}

            {(front || back || selfie || docs.length) ? (
              <>
                <div className="spacer" />
                <div className="kycGrid">
                      {front ? <KycImg title="Doc Front" src={front} onPreview={setPreviewSrc} /> : null}
                      {back ? <KycImg title="Doc Back" src={back} onPreview={setPreviewSrc} /> : null}
                      {selfie ? <KycImg title="Selfie" src={selfie} onPreview={setPreviewSrc} /> : null}
                      {docs.length
                        ? docs.map((d, idx) => (
                            <KycImg key={d} title={`Doc ${idx + 1}`} src={d} onPreview={setPreviewSrc} />
                          ))
                        : null}
                    </div>
                </>
              ) : (
                <div className="muted" style={{ marginTop: 10, fontSize: 13 }}>
                  No KYC images found in API response (still OK).
                </div>
              )}

              {u.kyc?.history?.length ? (
                <div className="kycHistoryListCompact">
                  {u.kyc.history.slice(0, 3).map((entry) => (
                    <div key={`${entry.createdAt}-${entry.action}`} className="kycHistoryItemCompact">
                      <div>
                        <div className="kycHistoryActionCompact">
                          {entry.action === "submitted" ? "Submitted" : "Updated"}
                          {" • "}
                          {formatDocTypeLabel(entry.docType)}
                        </div>
                        <div className="muted" style={{ fontSize: 12 }}>
                          {entry.actor?.role?.toUpperCase()}
                        </div>
                      </div>
                      <div className="muted" style={{ fontSize: 12 }}>
                        {new Date(entry.createdAt).toLocaleString()}
                      </div>
                    </div>
                  ))}
                </div>
              ) : null}

              <div className="spacer" />

                {tab === "pending" ? (
                  <div className="row" style={{ justifyContent: "flex-end", flexWrap: "wrap" }}>
                    <button
                      className="btn btnOutline"
                      disabled={isBusy}
                      onClick={() => openRejectModal(u)}
                    >
                      Reject
                    </button>
                    <button
                      className="btn"
                      disabled={isBusy}
                      onClick={() => openApproveModal(u)}
                    >
                      Approve
                    </button>
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      )}

      <Modal
        open={openReject}
        title="Reject KYC"
        subtitle="Write a reason so user can fix and re-upload."
        onClose={() => setOpenReject(false)}
      >
        <label className="muted" style={{ fontSize: 13 }}>Reason</label>
        <textarea
          className="input"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          style={{ minHeight: 120, paddingTop: 12 }}
        />

        <div className="spacer" />
        <div className="row" style={{ justifyContent: "flex-end" }}>
          <button className="btn btnOutline" onClick={() => setOpenReject(false)}>Cancel</button>
          <button className="btn" onClick={reject} disabled={sending}>
            {sending ? "Rejecting..." : "Reject"}
          </button>
        </div>
      </Modal>

      <Modal
        open={openApprove}
        title="Approve KYC"
        subtitle="Ensure all checks pass before approving."
        onClose={() => setOpenApprove(false)}
      >
        <div className="grid2">
          <div>
            <label className="muted" style={{ fontSize: 13 }}>Admin note</label>
            <input
              type="text"
              className="input"
              value={adminNote}
              onChange={(e) => setAdminNote(e.target.value)}
            />
          </div>
          <div>
            <label className="muted" style={{ fontSize: 13 }}>Checklist</label>
            <div className="card cardPad" style={{ boxShadow: "none", borderRadius: 14 }}>
              <CheckItem label="Document clear" value={checks.docClear} onChange={(v) => setChecks((prev) => ({ ...prev, docClear: v }))} />
              <CheckItem label="Name matches" value={checks.nameMatch} onChange={(v) => setChecks((prev) => ({ ...prev, nameMatch: v }))} />
              <CheckItem label="DOB matches" value={checks.dobMatch} onChange={(v) => setChecks((prev) => ({ ...prev, dobMatch: v }))} />
              <CheckItem label="Face matches" value={checks.faceMatch} onChange={(v) => setChecks((prev) => ({ ...prev, faceMatch: v }))} />
              <CheckItem label="Not reused" value={checks.notReused} onChange={(v) => setChecks((prev) => ({ ...prev, notReused: v }))} />
            </div>
          </div>
        </div>

        <div className="spacer" />
        <div className="row" style={{ justifyContent: "flex-end" }}>
          <button className="btn btnOutline" onClick={() => setOpenApprove(false)}>Cancel</button>
          <button className="btn" onClick={approve} disabled={busyId === selected?._id}>
            {busyId === selected?._id ? "Approving..." : "Approve"}
          </button>
        </div>
      </Modal>

      {previewSrc ? (
        <div className="modalBg" onClick={() => setPreviewSrc("")}>
          <div className="modal modalWithClose" onClick={(event) => event.stopPropagation()}>
            <button
              type="button"
              className="modalClose"
              onClick={() => setPreviewSrc("")}
              aria-label="Close preview"
            >
              ×
            </button>
            <div className="spacer" />
            <div className="card" style={{ borderRadius: 16, overflow: "hidden", boxShadow: "none", background: "#f3f4f6" }}>
              <img
                src={previewSrc}
                alt="KYC preview"
                style={{ width: "100%", maxHeight: "70vh", objectFit: "contain", display: "block" }}
              />
            </div>
            <div className="spacer" />
          </div>
        </div>
      ) : null}
    </div>
  );
}

function KycImg({ title, src, onPreview }) {
  return (
    <button
      type="button"
      onClick={() => onPreview?.(src)}
      className="card"
      style={{
        boxShadow: "none",
        borderRadius: 14,
        border: "1px solid #e5e7eb",
        overflow: "hidden",
        padding: 0,
        textAlign: "left",
        cursor: "pointer",
        background: "#fff",
      }}
    >
      <div style={{ padding: 10, borderBottom: "1px solid #eef0f3", fontWeight: 900, fontSize: 13 }}>
        {title}
      </div>
      <img src={src} alt={title} style={{ width: "100%", display: "block" }} />
    </button>
  );
}

function CheckItem({ label, value, onChange }) {
  return (
    <div className="row" style={{ justifyContent: "space-between" }}>
      <div style={{ fontWeight: 800 }}>{label}</div>
      <button
        type="button"
        className={"pill " + (value ? "" : "muted")}
        onClick={() => onChange(!value)}
        style={{
          borderColor: value ? "#111827" : "#e5e7eb",
          background: value ? "#111827" : "#fff",
          color: value ? "#fff" : "#111827",
          fontWeight: 800,
        }}
      >
        {value ? "YES" : "NO"}
      </button>
    </div>
  );
}

function buildKycFieldRows(docType, fields) {
  if (!fields || typeof fields !== "object") return [];
  const f = fields || {};
  const rows = [];

  const add = (label, value) => {
    if (value === undefined || value === null || value === "") return;
    rows.push({ label, value: String(value) });
  };

  if (docType === "citizenship") {
    add("Full Name", f.fullName);
    add("Citizenship No", f.citizenshipNo);
    add("DOB (BS)", f.dob);
    add("Issue Date (BS)", f.issueDate);
    add("District", f.district);
    return rows;
  }

  if (docType === "college_id") {
    add("Full Name", f.fullName);
    add("College", f.collegeName);
    add("Student ID", f.studentId);
    add("DOB (BS)", f.dob);
    add("Issue Date (BS)", f.issueDate);
    return rows;
  }

  if (docType === "job_id") {
    add("Full Name", f.fullName);
    add("Company", f.companyName);
    add("Employee ID", f.employeeId);
    add("DOB (BS)", f.dob);
    add("Issue Date (BS)", f.issueDate);
    return rows;
  }

  add("Document Name", f.docName);
  add("ID Number", f.idNumber);
  add("Issue Date (BS)", f.issueDate);
  add("DOB (BS)", f.dob);
  return rows;
}

const docTypeLabels = {
  citizenship: "Citizenship",
  house_paper: "House Paper",
  college_id: "College ID",
  job_id: "Job ID",
  other: "Other Document",
};

function formatDocTypeLabel(type) {
  return docTypeLabels[type] || type;
}
