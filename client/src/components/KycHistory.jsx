import { useMemo } from "react";
import { useI18n } from "../context/I18nContext";

const docLabels = {
  citizenship: "Nepal Citizenship",
  house_paper: "House Paper",
  college_id: "College ID",
  job_id: "Job ID",
  other: "Other Document",
};

const attachmentsOrder = ["front", "back", "selfie"];

function formatFields(fields) {
  if (!fields || typeof fields !== "object") return "";
  const entries = Object.entries(fields)
    .filter(([, value]) => String(value || "").trim())
    .slice(0, 3)
    .map(([key, value]) => `${key}: ${value}`);
  if (!entries.length) return "";
  return entries.join(" · ");
}

export default function KycHistory({ history = [] }) {
  const { t } = useI18n();
  const events = useMemo(() => (history || []).slice(0, 12), [history]);
  if (!events.length) return null;

  return (
    <div className="card cardPad">
      <div style={{ fontWeight: 1000 }}>{t("KYC history")}</div>
      <div className="muted" style={{ marginTop: 6, fontSize: 13 }}>
        {t("Recent submissions and updates.")}
      </div>
      <div className="spacer" />
      <div className="kycHistoryList">
        {events.map((entry) => (
          <div key={`${entry.createdAt}-${entry.action}`} className="kycHistoryEntry">
            <div className="kycHistoryHeader">
              <div className="kycHistoryAction">
                {entry.action === "submitted" ? t("Submitted") : t("Updated")}
              </div>
              <div className="kycHistoryTime muted">{new Date(entry.createdAt).toLocaleString()}</div>
            </div>
            <div className="kycHistoryMeta">
              <span>{t(docLabels[entry.docType] || entry.docType)}</span>
              <span className="muted">{(entry.actor?.role || "").toUpperCase()}</span>
            </div>
            <div className="kycHistoryFields">{formatFields(entry.fields)}</div>
            <div className="kycHistoryAttachments">
              {attachmentsOrder.map((key) =>
                entry.attachments?.[key] ? (
                  <span key={key} className="pill kycHistoryAttachmentActive">
                    {t(key.charAt(0).toUpperCase() + key.slice(1))}
                  </span>
                ) : null
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
