import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import http from "../api/http";
import Spinner from "../components/Spinner";
import { useToast } from "../context/ToastContext";

export default function TenantAgreementRules() {
  const { agreementId } = useParams();
  const { showToast } = useToast();
  const [loading, setLoading] = useState(true);
  const [rules, setRules] = useState([]);

  const load = async () => {
    try {
      setLoading(true);
      const res = await http.get(`/api/rules/tenant/agreement/${agreementId}`);
      setRules(res.data.rules || []);
    } catch (e) {
      showToast("error", e?.response?.data?.message || "Failed to load rules");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  if (loading) return <Spinner text="Loading rules..." />;

  return (
    <div>
      <div className="row" style={{ justifyContent: "space-between", flexWrap: "wrap" }}>
        <div>
          <h1 className="h1">Rules & Regulations</h1>
          <p className="muted" style={{ marginTop: 6 }}>Follow these rules during your stay.</p>
        </div>
      </div>

      <div className="spacer" />

      {rules.length === 0 ? (
        <div className="card cardPad">No rules added by owner yet.</div>
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
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
