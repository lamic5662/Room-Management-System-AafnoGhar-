export default function KycDocCard({ docType, fields }) {
  const { t } = useI18n();
  const labels = {
    citizenship: t("Nepal Citizenship"),
    house_paper: t("House Ownership Paper"),
    college_id: t("College ID"),
    job_id: t("Job ID"),
    other: t("Other Document"),
  };
  const title = labels[docType] || t("Document");
  const items = Object.entries(fields || {})
    .filter(([k, v]) => !k.endsWith("Ad"))
    .filter(([, v]) => String(v || "").trim());

  return (
    <div className={`kycDocCard ${docType === "citizenship" ? "citizenship" : ""}`}>
      <div className="kycDocHeader">
        <div>
          <div className="kycDocTitle">{title}</div>
          {docType === "citizenship" ? (
            <div className="kycDocSub">नेपाल सरकार • Government of Nepal</div>
          ) : null}
        </div>
        <div className="kycDocChip">{t("ID")}</div>
      </div>
      {items.length === 0 ? (
        <div className="kycDocEmpty">{t("Fill the form to preview details.")}</div>
      ) : (
        <div className="kycDocGrid">
          {items.map(([k, v]) => (
            <div key={k} className="kycDocRow">
              <div className="kycDocLabel">{prettyLabel(k, t)}</div>
              <div className="kycDocValue">{v}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

import { useI18n } from "../context/I18nContext";

function prettyLabel(key, t) {
  const map = {
    fullName: t("Full Name"),
    citizenshipNo: t("Citizenship No"),
    dob: t("Date of Birth"),
    issueDate: t("Issue Date"),
    district: t("District"),
    collegeName: t("College"),
    studentId: t("Student ID"),
    companyName: t("Company"),
    employeeId: t("Employee ID"),
    houseNo: t("House No"),
    ward: t("Ward"),
    docName: t("Document Name"),
    idNumber: t("ID Number"),
    ownerName: t("Owner Name"),
  };
  return map[key] || key;
}
