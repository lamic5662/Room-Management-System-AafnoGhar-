import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import http from "../api/http";
import Spinner from "../components/Spinner";
import StatCard from "../components/StatCard";
import { useToast } from "../context/ToastContext";
import { useI18n } from "../context/I18nContext";

export default function OwnerDashboard() {
  const { showToast } = useToast();
  const { t } = useI18n();
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState(null);
  const navigate = useNavigate();

  const formatResponseMinutes = (mins) => {
    if (!Number.isFinite(mins) || mins <= 0) return "—";
    if (mins < 60) return `${mins} ${t("min")}`;
    const hours = Math.floor(mins / 60);
    const remaining = mins % 60;
    if (remaining === 0) return `${hours} ${t("hr")}`;
    return `${hours} ${t("hr")} ${remaining} ${t("min")}`;
  };

  const load = async () => {
    try {
      setLoading(true);
      const res = await http.get("/api/stats/owner");
      setStats(res.data);
    } catch (e) {
      showToast("error", e?.response?.data?.message || t("Failed to load dashboard"));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  if (loading) return <Spinner text={t("Loading owner dashboard...")} />;

  const maintenance = stats?.recentMaintenance || [];

  return (
    <div>
      <div className="row" style={{ justifyContent: "space-between", flexWrap: "wrap" }}>
        <div>
          <h1 className="h1">{t("Owner Dashboard")}</h1>
          <p className="muted" style={{ marginTop: 6 }}>{t("Quick summary of your activity.")}</p>
          {stats?.fastResponder ? (
            <div style={{ marginTop: 8 }}>
              <span className="badge badgeFast">⚡ {t("Fast Responder")}</span>
            </div>
          ) : null}
        </div>
        <button className="btn btnOutline" onClick={load}>{t("Refresh")}</button>
      </div>

      <div className="spacer" />

      <div className="statsGrid">
        <StatCard label={t("My Rooms")} value={stats?.rooms} to="/owner/my-rooms" hint={t("Manage listings")} />
        <StatCard label={t("Pending Requests")} value={stats?.pendingRequests} to="/owner/requests" hint={t("Review tenants")} />
        <StatCard label={t("Active Agreements")} value={stats?.activeAgreements} to="/owner/agreements" hint={t("Sign & track")} />
        <StatCard label={t("Pending Payments")} value={stats?.pendingPayments} to="/owner/payments" hint={t("Confirm rent")} />
        <StatCard label={t("Open Complaints")} value={stats?.openComplaints} to="/owner/complaints" hint={t("Resolve issues")} />
        <StatCard label={t("Responses")} value={stats?.responseCount ?? 0} hint={t("Owner reply count")} />
        <StatCard label={t("Avg Response Time")} value={formatResponseMinutes(stats?.responseAvgMinutes)} hint={t("Based on replies")} />
      </div>

      <div className="spacer" />

      <div className="card cardPad">
        <div className="row" style={{ justifyContent: "space-between", alignItems: "center", flexWrap: "wrap" }}>
          <div>
            <div style={{ fontWeight: 900 }}>{t("Maintenance Timeline")}</div>
            <div className="muted" style={{ marginTop: 4, fontSize: 13 }}>
              {t("Recent maintenance requests across your agreements.")}
            </div>
          </div>
          <button className="btn btnOutline" onClick={() => navigate("/owner/complaints")}>
            {t("View all")}
          </button>
        </div>

        <div className="spacer" />

        {maintenance.length === 0 ? (
          <div className="muted">{t("No maintenance requests yet.")}</div>
        ) : (
          <div style={{ display: "grid", gap: 10 }}>
            {maintenance.map((m) => (
              <div key={m._id} className="row" style={{ justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
                <div>
                  <div style={{ fontWeight: 700 }}>{m.roomTitle}</div>
                  <div className="muted" style={{ fontSize: 12, marginTop: 2 }}>
                    {new Date(m.createdAt).toLocaleString()}
                  </div>
                </div>
                <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
                  <span className="pill">{String(m.category || "").toUpperCase()}</span>
                  <span className="pill pillInfo">{String(m.priority || "").toUpperCase()}</span>
                  <span className="badge">{String(m.status || "").toUpperCase()}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
