import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import http from "../api/http";
import Spinner from "../components/Spinner";
import { useI18n } from "../context/I18nContext";
import { useToast } from "../context/ToastContext";

export default function AdminDashboard() {
  const { showToast } = useToast();
  const { t } = useI18n();
  const [user] = useState(() => JSON.parse(localStorage.getItem("user") || "null"));
  const isSuperAdmin = user?.role === "super_admin";
  const isAdminRole = user?.role === "admin" || user?.role === "super_admin";
  const [loading, setLoading] = useState(true);
  const [summary, setSummary] = useState({ pending: 0, approved: 0 });
  const [monitoring, setMonitoring] = useState({
    flaggedRooms: 0,
    improvementRequests: 0,
    publishedFlaggedRooms: 0,
  });
  const [trendData, setTrendData] = useState([]);
  const [userSummary, setUserSummary] = useState({
    owner: 0,
    tenant: 0,
    admin: 0,
    moderator: 0,
    super_admin: 0,
    responseOwners: 0,
    fastResponders: 0,
    totalResponses: 0,
    avgResponseMinutes: 0,
  });
  const [topPosters, setTopPosters] = useState([]);
  const [autoFraudEnabled, setAutoFraudEnabled] = useState(false);
  const [autoFraudLoading, setAutoFraudLoading] = useState(false);
  const navigate = useNavigate();
  const hasPendingKyc = summary.pending > 0;
  const formatResponseMinutes = (mins) => {
    if (!Number.isFinite(mins) || mins <= 0) return "—";
    if (mins < 60) return `${mins} min`;
    const hours = Math.floor(mins / 60);
    const remaining = mins % 60;
    if (remaining === 0) return `${hours} hr`;
    return `${hours} hr ${remaining} min`;
  };

  const loadSummary = async () => {
    try {
      const res = await http.get("/api/kyc/summary");
      setSummary(res.data || { pending: 0, approved: 0 });
    } catch (e) {
      showToast("error", e?.response?.data?.message || "Failed to load dashboard");
    }
  };

  const loadUserSummary = async () => {
    try {
      const res = await http.get("/api/admin/summary");
      setUserSummary(
        res.data || {
          owner: 0,
          tenant: 0,
          admin: 0,
          moderator: 0,
          super_admin: 0,
          responseOwners: 0,
          fastResponders: 0,
          totalResponses: 0,
          avgResponseMinutes: 0,
        }
      );
    } catch {
      // ignore
    }
  };

  const loadMonitoring = async () => {
    try {
      const res = await http.get("/api/fraud/summary");
      setMonitoring(
        res.data || {
          flaggedRooms: 0,
          improvementRequests: 0,
          publishedFlaggedRooms: 0,
        }
      );
    } catch {
      // ignore for now
    }
  };

  const loadTopPosters = async () => {
    try {
      const res = await http.get("/api/admin/user-room-stats?limit=6");
      setTopPosters(res.data.stats || []);
    } catch (e) {
      console.log("Unable to load room stats:", e);
    }
  };

  const AUTO_FRAUD_FLAG = "auto_fraud_unpublish";
  const loadAutoFraudFlag = async () => {
    try {
      setAutoFraudLoading(true);
      const res = await http.get("/api/admin/feature-flags");
      const flag = res.data.flags?.find((item) => item.key === AUTO_FRAUD_FLAG);
      setAutoFraudEnabled(Boolean(flag?.enabled));
    } catch (e) {
      console.log("Unable to load auto fraud flag:", e);
    } finally {
      setAutoFraudLoading(false);
    }
  };

  const toggleAutoFraudFlag = async () => {
    try {
      setAutoFraudLoading(true);
      const res = await http.patch(`/api/admin/feature-flags/${AUTO_FRAUD_FLAG}`, {
        enabled: !autoFraudEnabled,
      });
      const updated = res.data.flag;
      setAutoFraudEnabled(Boolean(updated?.enabled));
      showToast(
        "success",
        updated?.enabled ? t("Auto fraud remediation enabled") : t("Auto fraud remediation disabled")
      );
    } catch (e) {
      showToast("error", e?.response?.data?.message || "Failed to update auto fraud flag");
    } finally {
      setAutoFraudLoading(false);
    }
  };

  const loadTrend = async () => {
    try {
      const res = await http.get("/api/fraud/trend");
      setTrendData(res.data?.trend || []);
    } catch {
      // ignore for now
    }
  };

  useEffect(() => {
    let active = true;
    setLoading(true);
    const tasks = [loadMonitoring(), loadTrend()];
    if (isAdminRole) {
      tasks.push(loadSummary());
    } else {
      setSummary({ pending: 0, approved: 0 });
    }
    if (isSuperAdmin) {
      tasks.push(loadUserSummary(), loadTopPosters(), loadAutoFraudFlag());
    }
    Promise.allSettled(tasks).finally(() => {
      if (active) setLoading(false);
    });
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAdminRole, isSuperAdmin]);

  if (loading) return <Spinner text="Loading admin dashboard..." />;

  return (
    <div>
      <div className="row" style={{ justifyContent: "space-between", flexWrap: "wrap" }}>
        <div>
          <h1 className="h1">Admin Dashboard</h1>
          <p className="muted" style={{ marginTop: 6 }}>
            {isAdminRole ? "Keep an eye on KYC submissions and platform trust." : "Monitor flagged rooms and platform trust."}
          </p>
        </div>
        {isAdminRole ? (
          <button className="btn btnOutline" onClick={() => navigate("/admin/kyc")}>Go to KYC review</button>
        ) : null}
      </div>

      {isAdminRole && hasPendingKyc && (
        <div
          className="card cardPad alertCard row"
          style={{ marginTop: 16, justifyContent: "space-between", flexWrap: "wrap", gap: 16 }}
        >
          <div style={{ flex: "1 1 0", minWidth: 0 }}>
            <div style={{ fontWeight: 700, fontSize: 18 }}>
              {summary.pending} pending KYC submission{summary.pending === 1 ? "" : "s"}
            </div>
            <div className="muted" style={{ marginTop: 6 }}>
              Review the pending documents before owners can relist rooms.
            </div>
          </div>
          <button className="btn" style={{ minWidth: 180 }} onClick={() => navigate("/admin/kyc?tab=pending")}>
            Open pending KYC
          </button>
        </div>
      )}

      {isSuperAdmin && (
        <>
          <div className="spacer" />
          <div className="card cardPad autoFraudCard">
            <div className="row" style={{ justifyContent: "space-between", flexWrap: "wrap", gap: 16 }}>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontWeight: 900 }}>{t("Auto fraud remediation")}</div>
                <div className="muted" style={{ fontSize: 13, marginTop: 4 }}>
                  {t("Automatically unpublish flagged rooms whenever fraud detection fires.")}
                </div>
              </div>
              <div className="row" style={{ gap: 8, alignItems: "center" }}>
                <span className={`pill ${autoFraudEnabled ? "pillOk" : "pillBad"}`} style={{ fontSize: 12 }}>
                  {autoFraudEnabled ? t("Enabled") : t("Disabled")}
                </span>
                <button
                  className="btn btnOutline"
                  onClick={toggleAutoFraudFlag}
                  disabled={autoFraudLoading}
                >
                  {autoFraudEnabled ? t("Disable auto unpublish") : t("Enable auto unpublish")}
                </button>
              </div>
            </div>
          </div>
        </>
      )}

      <div className="spacer" />

      <div className="row" style={{ justifyContent: "space-between", flexWrap: "wrap" }}>
        <div>
          <h2 className="h3">Monitoring</h2>
          <p className="muted" style={{ marginTop: 6 }}>
            Quick insight into suspicious listings so you can act faster.
          </p>
        </div>
        <button className="btn btnOutline" onClick={() => navigate("/admin/flagged-rooms")}>View flagged list</button>
      </div>

      <div className="row" style={{ flexWrap: "wrap", gap: 12 }}>
        <button
          type="button"
          className="card cardPad kycSummaryCard"
          style={{ flex: "1 1 220px", minWidth: 220, textAlign: "left" }}
          onClick={() => navigate("/admin/flagged-rooms")}
        >
          <div className="muted" style={{ fontSize: 13 }}>Flagged rooms</div>
          <div style={{ fontSize: 28, fontWeight: 900, marginTop: 6 }}>{monitoring.flaggedRooms ?? 0}</div>
          <div className="muted" style={{ marginTop: 6, fontSize: 13 }}>Listings flagged by the fraud detector</div>
        </button>

        <button
          type="button"
          className="card cardPad kycSummaryCard"
          style={{ flex: "1 1 220px", minWidth: 220, textAlign: "left" }}
          onClick={() => navigate("/admin/flagged-rooms")}
        >
          <div className="muted" style={{ fontSize: 13 }}>Improvement requests</div>
          <div style={{ fontSize: 28, fontWeight: 900, marginTop: 6 }}>{monitoring.improvementRequests ?? 0}</div>
          <div className="muted" style={{ marginTop: 6, fontSize: 13 }}>Rooms waiting for owner fixes</div>
        </button>

        <button
          type="button"
          className="card cardPad kycSummaryCard"
          style={{ flex: "1 1 220px", minWidth: 220, textAlign: "left" }}
          onClick={() => navigate("/admin/flagged-rooms")}
        >
          <div className="muted" style={{ fontSize: 13 }}>Flagged & published</div>
          <div style={{ fontSize: 28, fontWeight: 900, marginTop: 6 }}>{monitoring.publishedFlaggedRooms ?? 0}</div>
          <div className="muted" style={{ marginTop: 6, fontSize: 13 }}>Suspicious listings still live</div>
      </button>
    </div>

    {isSuperAdmin && topPosters.length > 0 && (
      <>
        <div className="spacer" />
        <div className="card cardPad">
          <div className="row" style={{ justifyContent: "space-between", flexWrap: "wrap" }}>
            <div>
              <div style={{ fontWeight: 900 }}>{t("Top room posters")}</div>
              <div className="muted" style={{ fontSize: 13, marginTop: 4 }}>
                {t("Spot which users post the most rooms and keep an eye on rapid posters.")}
              </div>
            </div>
            <button className="btn btnOutline" onClick={() => navigate("/admin/users")}>
              {t("View all owners")}
            </button>
          </div>

          <div className="spacer" />
          <div className="topPosterList">
            {topPosters.map((poster) => (
              <div key={poster.ownerId || poster.ownerEmail} className="row topPosterRow">
                <div className="topPosterInfo">
                  <div style={{ fontWeight: 700 }}>
                    {poster.ownerName || t("Unidentified user")}
                  </div>
                  <div className="muted" style={{ fontSize: 13 }}>
                    {poster.ownerEmail || poster.ownerPhone || t("No contact info")}
                  </div>
                </div>
                <div className="topPosterStats">
                  <div style={{ fontWeight: 900, fontSize: 20 }}>{poster.totalRooms}</div>
                  <div className="muted" style={{ marginTop: 4, fontSize: 13 }}>
                    {t("rooms posted")}
                  </div>
                  <div className="muted" style={{ fontSize: 12 }}>
                    {poster.publishedRooms ?? 0} {t("published rooms")}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </>
    )}

    <div className="spacer" />

      <div className="card cardPad">
        <div className="row" style={{ justifyContent: "space-between", flexWrap: "wrap" }}>
          <div>
            <div style={{ fontWeight: 800 }}>Suspicious listing trend</div>
            <div className="muted" style={{ fontSize: 13, marginTop: 4 }}>
              Last {trendData.length ? trendData.length : 7} days{trendData.length ? ` (${trendData[0].label} — ${trendData[trendData.length - 1]?.label})` : ""}
            </div>
          </div>
          <button className="btn btnOutline" onClick={() => navigate("/admin/flagged-rooms")}>View flagged rooms</button>
        </div>

        {trendData.length === 0 ? (
          <div className="muted" style={{ marginTop: 12 }}>Waiting for fraud activity to appear.</div>
        ) : (
          <>
            {trendData.length > 0 && (
              <TrendChart data={trendData} />
            )}
            <div className="row" style={{ flexWrap: "wrap", gap: 10, marginTop: 10 }}>
              <TrendLegend label="Flagged rooms" color="#ef4444" />
              <TrendLegend label="Improvement requests" color="#f97316" />
              <TrendLegend label="Flagged & published" color="#0ea5e9" />
            </div>
          </>
        )}
      </div>

      {isAdminRole && (
        <>
          <div className="spacer" />

          <div className="spacer" />

          <div className="row" style={{ flexWrap: "wrap", gap: 12 }}>
            <button
              type="button"
              className="card cardPad kycSummaryCard"
              style={{ flex: "1 1 220px", minWidth: 220, textAlign: "left" }}
              onClick={() => navigate("/admin/kyc?tab=pending")}
            >
              <div className="muted" style={{ fontSize: 13 }}>Pending KYC</div>
              <div style={{ fontSize: 28, fontWeight: 900, marginTop: 6 }}>{summary.pending}</div>
              <div className="muted" style={{ marginTop: 6, fontSize: 13 }}>Click to review pending submissions</div>
            </button>

            <button
              type="button"
              className="card cardPad kycSummaryCard"
              style={{ flex: "1 1 220px", minWidth: 220, textAlign: "left" }}
              onClick={() => navigate("/admin/kyc?tab=approved")}
            >
              <div className="muted" style={{ fontSize: 13 }}>Approved KYC</div>
              <div style={{ fontSize: 28, fontWeight: 900, marginTop: 6 }}>{summary.approved}</div>
              <div className="muted" style={{ marginTop: 6, fontSize: 13 }}>Click to view approved users</div>
            </button>
          </div>

          <div className="spacer" />

          <div className="card cardPad">
            <div style={{ fontWeight: 900 }}>Platform trust</div>
            <div className="muted" style={{ marginTop: 6, lineHeight: 1.6, fontSize: 13 }}>
              Use the KYC review page to approve or reject documents. Everything else stays here (statistics, quick tips, or future reports).
            </div>
          </div>
        </>
      )}
      {isSuperAdmin && (
        <>
          <div className="spacer" />
          <div className="row" style={{ flexWrap: "wrap", gap: 12 }}>
            <button
              type="button"
              className="card cardPad kycSummaryCard"
              style={{ flex: "1 1 220px", minWidth: 220, textAlign: "left" }}
              onClick={() => navigate("/admin/users")}
            >
              <div className="muted" style={{ fontSize: 13 }}>Owners with responses</div>
              <div style={{ fontSize: 28, fontWeight: 900, marginTop: 6 }}>{userSummary.responseOwners ?? 0}</div>
              <div className="muted" style={{ marginTop: 6, fontSize: 13 }}>Owners who replied at least once</div>
            </button>

            <button
              type="button"
              className="card cardPad kycSummaryCard"
              style={{ flex: "1 1 220px", minWidth: 220, textAlign: "left" }}
              onClick={() => navigate("/admin/users")}
            >
              <div className="muted" style={{ fontSize: 13 }}>Fast responders</div>
              <div style={{ fontSize: 28, fontWeight: 900, marginTop: 6 }}>{userSummary.fastResponders ?? 0}</div>
              <div className="muted" style={{ marginTop: 6, fontSize: 13 }}>Avg response time within threshold</div>
            </button>

            <button
              type="button"
              className="card cardPad kycSummaryCard"
              style={{ flex: "1 1 220px", minWidth: 220, textAlign: "left" }}
              onClick={() => navigate("/admin/users")}
            >
              <div className="muted" style={{ fontSize: 13 }}>Avg response time</div>
              <div style={{ fontSize: 28, fontWeight: 900, marginTop: 6 }}>
                {formatResponseMinutes(userSummary.avgResponseMinutes)}
              </div>
              <div className="muted" style={{ marginTop: 6, fontSize: 13 }}>
                Across {userSummary.totalResponses ?? 0} replies
              </div>
            </button>
          </div>
          <div className="spacer" />
        </>
      )}
      {isSuperAdmin && (
        <div className="card cardPad" style={{ cursor: "pointer" }} onClick={() => navigate("/admin/users")}>
          <div style={{ fontWeight: 900 }}>User counts</div>
          <div className="muted" style={{ marginTop: 6, display: "flex", gap: 16, flexWrap: "wrap" }}>
            <span>Owners: <strong>{userSummary.owner}</strong></span>
            <span>Tenants: <strong>{userSummary.tenant}</strong></span>
            <span>Admins: <strong>{userSummary.admin}</strong></span>
            <span>Moderators: <strong>{userSummary.moderator}</strong></span>
            <span>Super Admins: <strong>{userSummary.super_admin}</strong></span>
          </div>
        </div>
      )}
      {isSuperAdmin && (
        <div className="card cardPad" style={{ marginTop: 16 }}>
          <div className="row" style={{ justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
            <div>
              <div style={{ fontWeight: 900 }}>Staff management</div>
              <div className="muted" style={{ marginTop: 4, fontSize: 13 }}>
                Admin and moderator access overview.
              </div>
            </div>
            <div className="row" style={{ gap: 8 }}>
              <button className="btn btnOutline" onClick={() => navigate("/admin/users")}>Manage staff</button>
              <button className="btn btnOutline" onClick={() => navigate("/admin/audit-logs")}>Audit logs</button>
            </div>
          </div>
          <div className="muted" style={{ marginTop: 10, display: "flex", gap: 16, flexWrap: "wrap" }}>
            <span>Admins: <strong>{userSummary.admin}</strong></span>
            <span>Moderators: <strong>{userSummary.moderator}</strong></span>
            <span>Super Admins: <strong>{userSummary.super_admin}</strong></span>
          </div>
        </div>
      )}
  </div>
);
}

const TrendChart = ({ data }) => {
  const chartWidth = 320;
  const chartHeight = 140;
  const values = data.length
    ? data.reduce(
        (acc, point) => [
          ...acc,
          point.flagged || 0,
          point.improvement || 0,
          point.publishedFlagged || 0,
        ],
        []
      )
    : [0];
  const rawMax = values.length ? Math.max(...values) : 0;
  const maxValue = Math.max(1, rawMax);
  const step = data.length > 1 ? chartWidth / (data.length - 1) : chartWidth / 2;

  const buildPath = (key) => {
    if (!data.length) return "";
    return data
      .map((point, index) => {
        const x = data.length === 1 ? chartWidth / 2 : step * index;
        const value = point[key] || 0;
        const y = chartHeight - (value / maxValue) * chartHeight;
        return `${index === 0 ? "M" : "L"}${x.toFixed(2)},${y.toFixed(2)}`;
      })
      .join(" ");
  };

  return (
    <div style={{ marginTop: 16 }}>
      <svg viewBox={`0 0 ${chartWidth} ${chartHeight}`} width="100%" height={chartHeight}>
        {[0, 0.25, 0.5, 0.75].map((ratio) => (
          <line
            key={`grid-${ratio}`}
            x1={0}
            x2={chartWidth}
            y1={chartHeight - ratio * chartHeight}
            y2={chartHeight - ratio * chartHeight}
            stroke="#e5e7eb"
            strokeDasharray="4 4"
            strokeWidth={1}
          />
        ))}
        <path d={buildPath("flagged")} stroke="#ef4444" strokeWidth={2} fill="none" />
        <path d={buildPath("improvement")} stroke="#f97316" strokeWidth={2} fill="none" />
        <path d={buildPath("publishedFlagged")} stroke="#0ea5e9" strokeWidth={2} fill="none" />
        {data.map((point, index) => {
          const x = data.length === 1 ? chartWidth / 2 : step * index;
          const y = chartHeight - ((point.flagged || 0) / maxValue) * chartHeight;
          return (
            <circle
              key={`point-${point.date}`}
              cx={x}
              cy={y}
              r={3}
              fill="#ef4444"
              stroke="#fff"
              strokeWidth={1}
            />
          );
        })}
      </svg>
      <div className="row" style={{ justifyContent: "space-between", marginTop: 8, fontSize: 11 }}>
        {data.map((point) => (
          <span key={point.date} style={{ textAlign: "center", flex: 1 }}>
            {point.label}
          </span>
        ))}
      </div>
    </div>
  );
};

const TrendLegend = ({ label, color }) => (
  <div className="row" style={{ gap: 6, alignItems: "center" }}>
    <span
      style={{
        width: 16,
        height: 16,
        borderRadius: 999,
        background: color,
        boxShadow: "0 0 0 2px rgba(15,23,42,0.25)",
      }}
    />
    <span className="muted" style={{ fontSize: 12 }}>{label}</span>
  </div>
);
