import { useEffect, useState } from "react";
import http from "../api/http";
import Spinner from "../components/Spinner";
import { useToast } from "../context/ToastContext";
import { useI18n } from "../context/I18nContext";

export default function AdminFlaggedRooms() {
  const { showToast } = useToast();
  const { t } = useI18n();
  const [loading, setLoading] = useState(true);
  const [rooms, setRooms] = useState([]);
  const [busyId, setBusyId] = useState("");

  const load = async () => {
    try {
      setLoading(true);
      const res = await http.get("/api/fraud/rooms/flagged");
      setRooms(res.data.rooms || []);
    } catch (e) {
      showToast("error", e?.response?.data?.message || "Failed to load flagged rooms");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const runAction = async ({ id, path = "", method = "patch", suffix, body }) => {
    try {
      setBusyId(id + suffix);
      const res = await http({
        method,
        url: `/api/fraud/rooms/${id}${path}`,
        data: body,
      });
      showToast("success", res.data?.message || "Done ✅");
      await load();
    } catch (e) {
      showToast("error", e?.response?.data?.message || "Action failed");
    } finally {
      setBusyId("");
    }
  };

  const act = (id, action) =>
    runAction({ id, path: `/${action}`, suffix: action });

  const requestImprovement = async (room) => {
    const note = window.prompt(t("Describe required fixes for the owner."), room.improvementNote || "");
    if (note === null) return;
    if (!note.trim()) {
      showToast("error", t("Improvement note is required"));
      return;
    }
    await runAction({
      id: room._id,
      path: "/request-improvement",
      method: "post",
      suffix: "improve",
      body: { note: note.trim() },
    });
  };

  const approveImprovement = async (room) => {
    await runAction({
      id: room._id,
      path: "/approve-improvement",
      suffix: "approve",
    });
  };

  const deleteRoom = async (room) => {
    if (!window.confirm(t("Delete this room? This will remove related records."))) return;
    await runAction({
      id: room._id,
      method: "delete",
      path: "",
      suffix: "delete",
    });
  };

  if (loading) return <Spinner text="Loading flagged rooms..." />;

  return (
    <div>
      <div className="row" style={{ justifyContent: "space-between", flexWrap: "wrap" }}>
        <div>
          <h1 className="h1">Flagged Rooms</h1>
          <p className="muted" style={{ marginTop: 6 }}>
            Admin review panel for suspicious listings.
          </p>
        </div>
        <button className="btn btnOutline" onClick={load}>Refresh</button>
      </div>

      <div className="spacer" />

      {rooms.length === 0 ? (
        <div className="card cardPad">No flagged rooms 🎉</div>
      ) : (
        <div className="gridCards">
          {rooms.map((r) => (
            <div className="card cardPad" key={r._id}>
              <div className="row" style={{ justifyContent: "space-between", alignItems: "flex-start" }}>
                <div>
                  <div style={{ fontWeight: 1000 }}>{r.title}</div>
                  <div className="muted" style={{ marginTop: 4 }}>{r.location}</div>
                  <div className="muted" style={{ marginTop: 6, fontSize: 13 }}>
                    Rent: <b style={{ color: "#111827" }}>NPR {r.monthlyRent}</b>
                    {" "} • Published: <b style={{ color: "#111827" }}>{r.isPublished ? "Yes" : "No"}</b>
                  </div>
                </div>

                <div style={{ textAlign: "right" }}>
                  <div className="badge">Score: {r.fraudScore}</div>
                  <div style={{ marginTop: 8 }}>
                    {r.owner?.kyc?.status === "approved" ? (
                      <span className="badge">Owner Verified</span>
                    ) : (
                      <span className="badge">Owner Not Verified</span>
                    )}
                  </div>
                  <div style={{ marginTop: 8 }}>
                    <span className={`badge ${r.requiresImprovement ? "badgeWarning" : ""}`}>
                      {r.requiresImprovement ? t("Improvement requested") : "Flagged"}
                    </span>
                  </div>
                </div>
              </div>

              <div className="spacer" />

              <div className="muted" style={{ fontSize: 13 }}>
                Owner: <b style={{ color: "#111827" }}>{r.owner?.fullName}</b> • {r.owner?.phone}
              </div>

              <div className="spacer" />

              <div className="row" style={{ flexWrap: "wrap" }}>
                {(r.fraudFlags || []).map((f) => (
                  <span key={f} className="pill">{f}</span>
                ))}
              </div>

              <div className="spacer" />

              <div className="row" style={{ justifyContent: "flex-end", flexWrap: "wrap", gap: 8 }}>
                <button
                  className="btn btnOutline"
                  onClick={() => act(r._id, "recalc")}
                  disabled={busyId === r._id + "recalc"}
                >
                  {busyId === r._id + "recalc" ? "Checking..." : "Recalculate"}
                </button>

                <button
                  className="btn btnOutline"
                  onClick={() => act(r._id, r.isPublished ? "disable" : "enable")}
                  disabled={busyId === r._id + (r.isPublished ? "disable" : "enable")}
                >
                  {busyId === r._id + (r.isPublished ? "disable" : "enable")
                    ? (r.isPublished ? "Disabling..." : "Enabling...")
                    : (r.isPublished ? "Disable" : "Enable")}
                </button>

                <button
                  className="btn"
                  onClick={() => act(r._id, "unflag")}
                  disabled={busyId === r._id + "unflag"}
                >
                  {busyId === r._id + "unflag" ? "Unflagging..." : "Unflag (Mark Safe)"}
                </button>

                <button
                  className="btn btnOutline"
                  onClick={() => requestImprovement(r)}
                  disabled={busyId === r._id + "improve"}
                >
                  {busyId === r._id + "improve"
                    ? "Requesting..."
                    : (r.requiresImprovement ? t("Update improvement request") : t("Request improvement"))}
                </button>

                {r.requiresImprovement && (
                  <button
                    className="btn"
                    onClick={() => approveImprovement(r)}
                    disabled={busyId === r._id + "approve"}
                  >
                    {busyId === r._id + "approve" ? "Approving..." : t("Approve and publish")}
                  </button>
                )}

                <button
                  className="btn btnOutline"
                  onClick={() => deleteRoom(r)}
                  disabled={busyId === r._id + "delete"}
                  style={{ borderColor: "#dc2626", color: "#dc2626" }}
                >
                  {busyId === r._id + "delete" ? "Deleting..." : t("Delete room permanently")}
                </button>
              </div>

              {r.requiresImprovement && r.improvementNote ? (
                <div className="muted" style={{ marginTop: 10, fontSize: 13 }}>
                  <strong>{t("Improvement requested")}:</strong> {r.improvementNote}
                </div>
              ) : null}

              <div className="spacer" />
              <div className="muted" style={{ fontSize: 13 }}>
                Created: {new Date(r.createdAt).toLocaleString()}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
