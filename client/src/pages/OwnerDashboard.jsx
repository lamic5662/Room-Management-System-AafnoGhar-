import { useEffect, useState } from "react";
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

  return (
    <div>
      <div className="row" style={{ justifyContent: "space-between", flexWrap: "wrap" }}>
        <div>
          <h1 className="h1">{t("Owner Dashboard")}</h1>
          <p className="muted" style={{ marginTop: 6 }}>{t("Quick summary of your activity.")}</p>
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
      </div>
    </div>
  );
}
