import { useEffect, useState } from "react";
import http from "../api/http";
import Spinner from "../components/Spinner";
import { useToast } from "../context/ToastContext";

const formatMeta = (meta) => {
  if (!meta || typeof meta !== "object") return "-";
  if (meta.from !== undefined && meta.to !== undefined) return `${meta.from} → ${meta.to}`;
  if (meta.note) return `Note: ${meta.note}`;
  if (meta.reason) return `Reason: ${meta.reason}`;
  if (meta.key) return `Flag: ${meta.key} = ${meta.enabled}`;
  if (meta.ownerCount) return `Owners: ${meta.ownerCount}`;
  const keys = Object.keys(meta);
  if (!keys.length) return "-";
  const summary = keys.slice(0, 3).map((k) => `${k}: ${String(meta[k])}`).join(", ");
  return keys.length > 3 ? `${summary}…` : summary;
};

export default function AdminAuditLogs() {
  const { showToast } = useToast();
  const [loading, setLoading] = useState(true);
  const [logs, setLogs] = useState([]);
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  const [action, setAction] = useState("");
  const [entityType, setEntityType] = useState("");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [exporting, setExporting] = useState(false);
  const [cleanupBusy, setCleanupBusy] = useState(false);
  const [cleanupDays, setCleanupDays] = useState("180");
  const limit = 20;

  const load = async (nextPage = page, overrides = {}) => {
    try {
      setLoading(true);
      const nextAction = overrides.action ?? action;
      const nextEntityType = overrides.entityType ?? entityType;
      const nextFrom = overrides.fromDate ?? fromDate;
      const nextTo = overrides.toDate ?? toDate;
      const params = new URLSearchParams();
      if (nextAction.trim()) params.set("action", nextAction.trim());
      if (nextEntityType) params.set("entityType", nextEntityType);
      if (nextFrom) params.set("from", nextFrom);
      if (nextTo) params.set("to", nextTo);
      params.set("page", String(nextPage));
      params.set("limit", String(limit));

      const res = await http.get(`/api/admin/audit-logs?${params.toString()}`);
      setLogs(res.data.logs || []);
      setPage(res.data.page || nextPage);
      setPages(res.data.pages || 1);
    } catch (e) {
      showToast("error", e?.response?.data?.message || "Failed to load audit logs");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const applyFilters = () => {
    setPage(1);
    load(1);
  };

  const applyQuickFilter = (nextAction, nextEntityType = "") => {
    setAction(nextAction);
    setEntityType(nextEntityType);
    setPage(1);
    load(1, { action: nextAction, entityType: nextEntityType });
  };

  const clearFilters = () => {
    setAction("");
    setEntityType("");
    setFromDate("");
    setToDate("");
    setPage(1);
    load(1, { action: "", entityType: "", fromDate: "", toDate: "" });
  };

  const exportCsv = async () => {
    try {
      setExporting(true);
      const params = new URLSearchParams();
      if (action.trim()) params.set("action", action.trim());
      if (entityType) params.set("entityType", entityType);
      if (fromDate) params.set("from", fromDate);
      if (toDate) params.set("to", toDate);
      const res = await http.get(`/api/admin/audit-logs/export?${params.toString()}`, {
        responseType: "blob",
      });
      const blob = new Blob([res.data], { type: "text/csv" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `audit-logs-${new Date().toISOString().slice(0, 10)}.csv`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      showToast("success", "Exported audit logs ✅");
    } catch (e) {
      showToast("error", e?.response?.data?.message || "Failed to export audit logs");
    } finally {
      setExporting(false);
    }
  };

  const cleanupLogs = async () => {
    const days = Number(cleanupDays);
    if (!Number.isFinite(days) || days < 30) {
      showToast("error", "Retention must be at least 30 days");
      return;
    }
    if (!confirm(`Delete audit logs older than ${days} days?`)) return;
    try {
      setCleanupBusy(true);
      const res = await http.post("/api/admin/audit-logs/cleanup", { days });
      showToast("success", res.data.message || "Audit logs cleaned ✅");
      load(1);
    } catch (e) {
      showToast("error", e?.response?.data?.message || "Failed to clean audit logs");
    } finally {
      setCleanupBusy(false);
    }
  };

  if (loading) return <Spinner text="Loading audit logs..." />;

  return (
    <div>
      <div className="row" style={{ justifyContent: "space-between", flexWrap: "wrap" }}>
        <div>
          <h1 className="h1">Audit Logs</h1>
          <p className="muted" style={{ marginTop: 6 }}>
            Track admin actions across KYC, users, and rooms.
          </p>
        </div>
        <button className="btn btnOutline" onClick={() => load(page)}>Refresh</button>
      </div>

      <div className="spacer" />

      <div className="card cardPad">
        <div className="row" style={{ flexWrap: "wrap", gap: 8 }}>
          <input
            className="input"
            value={action}
            onChange={(e) => setAction(e.target.value)}
            placeholder="Filter by action (e.g. kyc.approve)"
            style={{ minWidth: 240, flex: 1 }}
          />
          <select
            className="input"
            value={entityType}
            onChange={(e) => setEntityType(e.target.value)}
            style={{ width: 200 }}
          >
            <option value="">All entities</option>
            <option value="user">User</option>
            <option value="room">Room</option>
            <option value="kyc">KYC</option>
            <option value="feature_flag">Feature flag</option>
            <option value="response_stats">Response stats</option>
          </select>
          <input
            className="input"
            type="date"
            value={fromDate}
            onChange={(e) => setFromDate(e.target.value)}
            style={{ width: 170 }}
          />
          <input
            className="input"
            type="date"
            value={toDate}
            onChange={(e) => setToDate(e.target.value)}
            style={{ width: 170 }}
          />
          <button className="btn btnOutline" onClick={applyFilters}>Apply</button>
          <button className="btn" onClick={exportCsv} disabled={exporting}>
            {exporting ? "Exporting..." : "Export CSV"}
          </button>
        </div>
        <div className="row" style={{ flexWrap: "wrap", gap: 8, marginTop: 10 }}>
          <button className="pill" type="button" onClick={() => applyQuickFilter("user.role.update", "user")}>
            Role changes
          </button>
          <button className="pill" type="button" onClick={() => applyQuickFilter("user.delete", "user")}>
            User deletes
          </button>
          <button className="pill" type="button" onClick={() => applyQuickFilter("staff.create", "user")}>
            Staff created
          </button>
          <button className="pill pillInfo" type="button" onClick={clearFilters}>
            Clear
          </button>
        </div>
        <div className="row" style={{ flexWrap: "wrap", gap: 8, marginTop: 10, alignItems: "center" }}>
          <span className="muted" style={{ fontSize: 12 }}>Retention (days)</span>
          <input
            className="input"
            type="number"
            min={30}
            max={3650}
            value={cleanupDays}
            onChange={(e) => setCleanupDays(e.target.value)}
            style={{ width: 120 }}
          />
          <button className="btn btnOutline" onClick={cleanupLogs} disabled={cleanupBusy}>
            {cleanupBusy ? "Cleaning..." : "Cleanup old logs"}
          </button>
        </div>
      </div>

      <div className="spacer" />

      {logs.length === 0 ? (
        <div className="card cardPad">No audit logs yet.</div>
      ) : (
        <div className="tableCard card">
          <table className="table">
            <thead>
              <tr>
                <th>Time</th>
                <th>Admin</th>
                <th>Action</th>
                <th>Entity</th>
                <th>Details</th>
              </tr>
            </thead>
            <tbody>
              {logs.map((log) => (
                <tr key={log._id}>
                  <td className="muted">{new Date(log.createdAt).toLocaleString()}</td>
                  <td>{log.admin?.fullName || log.admin?.email || "Admin"}</td>
                  <td><span className="badge">{log.action}</span></td>
                  <td className="muted">
                    {log.entityType || "-"} {log.entityId ? `• ${String(log.entityId).slice(-6)}` : ""}
                  </td>
                  <td className="muted">{formatMeta(log.meta)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {pages > 1 && (
        <div className="pagination">
          <button
            className="btn btnOutline"
            onClick={() => load(Math.max(1, page - 1))}
            disabled={page <= 1}
          >
            Previous
          </button>
          <div className="muted">
            {page} / {pages}
          </div>
          <button
            className="btn"
            onClick={() => load(Math.min(pages, page + 1))}
            disabled={page >= pages}
          >
            Next
          </button>
        </div>
      )}
    </div>
  );
}
