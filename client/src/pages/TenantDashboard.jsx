import { useEffect, useState } from "react";
import http from "../api/http";
import Spinner from "../components/Spinner";
import StatCard from "../components/StatCard";
import { useToast } from "../context/ToastContext";
import { useI18n } from "../context/I18nContext";

export default function TenantDashboard() {
  const { showToast } = useToast();
  const { t } = useI18n();
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState(null);

  const load = async () => {
    try {
      setLoading(true);
      const res = await http.get("/api/stats/tenant");
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

  if (loading) return <Spinner text={t("Loading tenant dashboard...")} />;

  return (
    <div>
      <div className="row" style={{ justifyContent: "space-between", flexWrap: "wrap" }}>
        <div>
          <h1 className="h1">{t("Tenant Dashboard")}</h1>
          <p className="muted" style={{ marginTop: 6 }}>{t("Your requests, agreements and payments.")}</p>
        </div>
        <button className="btn btnOutline" onClick={load}>{t("Refresh")}</button>
      </div>

      <div className="spacer" />

      <div className="statsGrid">
        <StatCard label={t("My Requests")} value={stats?.myRequests} to="/tenant/requests" hint={t("Track status")} />
        <StatCard label={t("Active Agreements")} value={stats?.myAgreements} to="/tenant/agreements" hint={t("Sign & pay")} />
        <StatCard label={t("Pending Payments")} value={stats?.pendingPayments} to="/tenant/payments" hint={t("Waiting confirmation")} />
        <StatCard label={t("Open Complaints")} value={stats?.openComplaints} to="/tenant/complaints" hint={t("View replies")} />
        <StatCard label={t("Browse Rooms")} value="→" to="/rooms" hint={t("Find a room")} />
      </div>
    </div>
  );
}
