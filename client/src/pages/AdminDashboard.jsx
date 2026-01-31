import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import http from "../api/http";
import Spinner from "../components/Spinner";
import { useToast } from "../context/ToastContext";

export default function AdminDashboard() {
  const { showToast } = useToast();
  const [loading, setLoading] = useState(true);
  const [summary, setSummary] = useState({ pending: 0, approved: 0 });
  const [monitoring, setMonitoring] = useState({
    flaggedRooms: 0,
    improvementRequests: 0,
    publishedFlaggedRooms: 0,
  });
  const [trendData, setTrendData] = useState([]);
  const [userSummary, setUserSummary] = useState({ owner: 0, tenant: 0, admin: 0 });
  const navigate = useNavigate();

  const loadSummary = async () => {
    try {
      const res = await http.get("/api/kyc/summary");
      setSummary(res.data || { pending: 0, approved: 0 });
    } catch (e) {
      showToast("error", e?.response?.data?.message || "Failed to load dashboard");
    } finally {
      setLoading(false);
    }
  };

  const loadUserSummary = async () => {
    try {
      const res = await http.get("/api/admin/summary");
      setUserSummary(res.data || { owner: 0, tenant: 0, admin: 0 });
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

  const loadTrend = async () => {
    try {
      const res = await http.get("/api/fraud/trend");
      setTrendData(res.data?.trend || []);
    } catch {
      // ignore for now
    }
  };

  useEffect(() => {
    loadSummary();
    loadUserSummary();
    loadMonitoring();
    loadTrend();
  }, []);

  if (loading) return <Spinner text="Loading admin dashboard..." />;

  return (
    <div>
      <div className="row" style={{ justifyContent: "space-between", flexWrap: "wrap" }}>
        <div>
          <h1 className="h1">Admin Dashboard</h1>
          <p className="muted" style={{ marginTop: 6 }}>
            Keep an eye on KYC submissions and platform trust.
          </p>
        </div>
        <button className="btn btnOutline" onClick={() => navigate("/admin/kyc")}>Go to KYC review</button>
      </div>

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
      <div className="spacer" />
      <div className="card cardPad" style={{ cursor: "pointer" }} onClick={() => navigate("/admin/users")}>
        <div style={{ fontWeight: 900 }}>User counts</div>
        <div className="muted" style={{ marginTop: 6, display: "flex", gap: 16, flexWrap: "wrap" }}>
          <span>Owners: <strong>{userSummary.owner}</strong></span>
          <span>Tenants: <strong>{userSummary.tenant}</strong></span>
          <span>Admins: <strong>{userSummary.admin}</strong></span>
        </div>
      </div>
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
