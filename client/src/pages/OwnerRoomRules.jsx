import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import http from "../api/http";
import Spinner from "../components/Spinner";
import Modal from "../components/Modal";
import { useToast } from "../context/ToastContext";
import { useI18n } from "../context/I18nContext";

export default function OwnerRoomRules() {
  const { roomId } = useParams();
  const { showToast } = useToast();
  const { t } = useI18n();

  const [loading, setLoading] = useState(true);
  const [rules, setRules] = useState([]);

  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("No smoking inside room.");
  const [description, setDescription] = useState("Smoking is allowed only outside the building area.");
  const [severity, setSeverity] = useState("important");
  const [sending, setSending] = useState(false);

  const load = async () => {
    try {
      setLoading(true);
      const res = await http.get(`/api/rules/owner/room/${roomId}`);
      setRules(res.data.rules || []);
    } catch (e) {
      showToast("error", e?.response?.data?.message || t("Failed to load rules"));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const create = async () => {
    if (!title.trim()) return showToast("error", t("Title required"));
    try {
      setSending(true);
      await http.post("/api/rules", { roomId, title, description, severity });
      showToast("success", t("Rule created ✅"));
      setOpen(false);
      await load();
    } catch (e) {
      showToast("error", e?.response?.data?.message || t("Create failed"));
    } finally {
      setSending(false);
    }
  };

  const toggleActive = async (id, current) => {
    try {
      await http.patch(`/api/rules/${id}`, { isActive: !current });
      load();
    } catch (e) {
      showToast("error", e?.response?.data?.message || t("Update failed"));
    }
  };

  if (loading) return <Spinner text={t("Loading rules...")} />;

  return (
    <div>
      <div className="row" style={{ justifyContent: "space-between", flexWrap: "wrap" }}>
        <div>
          <h1 className="h1">{t("Room Rules")}</h1>
          <p className="muted" style={{ marginTop: 6 }}>{t("Create and manage rules for tenants.")}</p>
        </div>
        <div className="row">
          <Link className="btn btnOutline" to="/owner/my-rooms">{t("Back")}</Link>
          <button className="btn" onClick={() => setOpen(true)}>{t("Add Rule")}</button>
        </div>
      </div>

      <div className="spacer" />

      {rules.length === 0 ? (
        <div className="card cardPad">{t("No rules yet.")}</div>
      ) : (
        <div className="gridCards">
          {rules.map((r) => (
            <div key={r._id} className="card cardPad">
              <div className="row" style={{ justifyContent: "space-between", alignItems: "flex-start" }}>
                <div>
                  <div style={{ fontWeight: 1000 }}>{r.title}</div>
                  {r.description ? <div className="muted" style={{ marginTop: 6, lineHeight: 1.6 }}>{r.description}</div> : null}
                </div>
                <span className="badge">{(r.severity || "normal").toUpperCase()}</span>
              </div>

              <div className="spacer" />
              <div className="row" style={{ justifyContent: "space-between", flexWrap: "wrap" }}>
                <span className="muted" style={{ fontSize: 13 }}>
                  {t("Status")}: <b style={{ color: "#111827" }}>{r.isActive ? t("Active") : t("Disabled")}</b>
                </span>
                <button className="btn btnOutline" onClick={() => toggleActive(r._id, r.isActive)}>
                  {r.isActive ? t("Disable") : t("Enable")}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      <Modal open={open} title={t("Add Rule")} subtitle={t("Create rule for tenants.")} onClose={() => setOpen(false)}>
        <label className="muted" style={{ fontSize: 13 }}>{t("Title")}</label>
        <input className="input" value={title} onChange={(e) => setTitle(e.target.value)} />

        <div className="spacer" />

        <label className="muted" style={{ fontSize: 13 }}>{t("Description")}</label>
        <textarea className="input" value={description} onChange={(e) => setDescription(e.target.value)} style={{ minHeight: 110, paddingTop: 12 }} />

        <div className="spacer" />

        <label className="muted" style={{ fontSize: 13 }}>{t("Severity")}</label>
        <select className="input" value={severity} onChange={(e) => setSeverity(e.target.value)}>
          <option value="normal">{t("Normal")}</option>
          <option value="important">{t("Important")}</option>
        </select>

        <div className="spacer" />

        <div className="row" style={{ justifyContent: "flex-end" }}>
          <button className="btn btnOutline" onClick={() => setOpen(false)}>{t("Cancel")}</button>
          <button className="btn" onClick={create} disabled={sending}>
            {sending ? t("Saving...") : t("Save")}
          </button>
        </div>
      </Modal>
    </div>
  );
}
