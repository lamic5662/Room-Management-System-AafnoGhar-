import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import http from "../api/http";
import { useToast } from "../context/ToastContext";
import { useI18n } from "../context/I18nContext";
import { formatRoomLocation } from "../utils/roomLocation";

export default function MyRooms() {
  const { showToast } = useToast();
  const { t } = useI18n();
  const [rooms, setRooms] = useState([]);
  const [loading, setLoading] = useState(true);

  const loadRooms = async () => {
    setLoading(true);
    const res = await http.get("/api/rooms/my");
    setRooms(res.data.rooms || []);
    setLoading(false);
  };

  useEffect(() => {
    loadRooms();
  }, []);

  const publish = async (roomId) => {
    try {
      const res = await http.patch(`/api/rooms/${roomId}/publish`);
      showToast("success", res.data.message || "Published ✅");
      loadRooms();
    } catch (e) {
      const msg = e?.response?.data?.message || "Publish failed";
      showToast("error", msg);
    }
  };

  const unpublish = async (roomId) => {
    try {
      const res = await http.patch(`/api/rooms/${roomId}/unpublish`);
      showToast("success", res.data.message || "Unpublished ✅");
      loadRooms();
    } catch (e) {
      showToast("error", e?.response?.data?.message || "Unpublish failed");
    }
  };

  const removeRoom = async (roomId) => {
    if (!confirm(t("Delete this room? This will remove related records."))) return;
    try {
      const res = await http.delete(`/api/rooms/${roomId}`);
      showToast("success", res.data.message || "Room deleted ✅");
      loadRooms();
    } catch (e) {
      showToast("error", e?.response?.data?.message || "Delete failed");
    }
  };

  return (
    <div>
      <div className="row" style={{ justifyContent: "space-between", flexWrap: "wrap" }}>
        <div>
          <h1 className="h1">My Rooms</h1>
          <p className="muted" style={{ marginTop: 6 }}>{t("Rooms you posted.")}</p>
        </div>
        <Link className="btn" to="/owner/add-room">+ {t("Add Room")}</Link>
      </div>

      <div className="spacer" />

      {loading ? (
        <p className="muted">{t("Loading...")}</p>
      ) : rooms.length === 0 ? (
        <div className="card cardPad">{t("No rooms yet. Click “Add Room”.")}</div>
      ) : (
        <div className="gridCards">
          {rooms.map((r) => (
            <div key={r._id} className="card cardPad">
              <div className="row" style={{ justifyContent: "space-between", alignItems: "flex-start" }}>
                  <div>
                    <div style={{ fontWeight: 900, fontSize: 16 }}>{r.title}</div>
                    <div className="muted" style={{ marginTop: 4 }}>
                      {formatRoomLocation(r.location, r.geo) || t("Location not provided")}
                    </div>
                  </div>
                <div style={{ textAlign: "right" }}>
                  <button
                    type="button"
                    className="iconBtn"
                    title={t("Delete room")}
                    data-tip={t("Delete room")}
                    onClick={() => removeRoom(r._id)}
                    style={{ marginBottom: 6 }}
                  >
                    🗑
                  </button>
                  <div className="muted" style={{ fontSize: 12 }}>{t("Rent")}</div>
                  <div style={{ fontWeight: 900, fontSize: 18 }}>NPR {r.monthlyRent}</div>
                </div>
              </div>

              <div style={{ marginTop: 12, display: "flex", justifyContent: "space-between", gap: 10 }}>
                <span className="statusPill">
                  {r.isPublished ? t("Published") : t("Draft")}
                </span>
                <div className="row">
                  <Link className="btn btnOutline" to={`/rooms/${r._id}`}>{t("View")}</Link>
                  <Link className="btn" to={`/owner/rooms/${r._id}/edit`}>{t("Edit")}</Link>
                </div>
              </div>

              <div style={{ marginTop: 10, display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 10 }}>
                {r.isPublished ? (
                  <button className="btn btnOutline" onClick={() => unpublish(r._id)}>
                    {t("Unpublish")}
                  </button>
                ) : (
                  <button className="btn" onClick={() => publish(r._id)}>
                    {t("Publish")}
                  </button>
                )}
              </div>

              {r.requiresImprovement ? (
                <div className="muted" style={{ marginTop: 8, fontSize: 13 }}>
                  <strong>{t("Admin feedback")}:</strong> {r.improvementNote || t("Pending admin approval.")}
                  <div style={{ marginTop: 4 }}>{t("Pending admin approval.")}</div>
                </div>
              ) : null}

              {!r.isPublished ? (
                <div className="muted" style={{ marginTop: 8, fontSize: 13 }}>
                  {t("To publish, your KYC must be verified.")}
                </div>
              ) : null}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
