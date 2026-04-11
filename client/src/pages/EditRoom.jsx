import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import http from "../api/http";
import { useToast } from "../context/ToastContext";
import { MapContainer, Marker, TileLayer, useMap, useMapEvents } from "react-leaflet";
import L from "leaflet";
import markerIcon from "leaflet/dist/images/marker-icon.png";
import markerShadow from "leaflet/dist/images/marker-shadow.png";
import { useI18n } from "../context/I18nContext";

export default function EditRoom() {
  const { id } = useParams();
  const navigate = useNavigate();

  const user = useMemo(() => JSON.parse(localStorage.getItem("user") || "null"), []);
  const token = useMemo(() => localStorage.getItem("token"), []);
  const isOwner = user?.role === "owner";

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [room, setRoom] = useState(null);

  const [form, setForm] = useState({
    title: "",
    location: "",
    roomType: "1BHK",
    monthlyRent: "",
    electricityUnitRate: "",
    rooms: 1,
    bathrooms: 1,
    description: "",
    isPublished: true,
    wifi: false,
    parking: false,
    waterSupply: false,
    electricityBackup: false,
    kitchen: false,
    furnished: false,
  });

  const [newPhotos, setNewPhotos] = useState([]);
  const [suggestion, setSuggestion] = useState(null);
  const [suggestLoading, setSuggestLoading] = useState(false);
  const lastSuggestKeyRef = useRef("");
  const [errors, setErrors] = useState({});
  const [coords, setCoords] = useState({ lat: 27.7172, lng: 85.3240 });
  const [geoLoading, setGeoLoading] = useState(false);
  const [nearby, setNearby] = useState(null);
  const [nearbyLoading, setNearbyLoading] = useState(false);
  const [autoLocation, setAutoLocation] = useState(true);
  const { showToast } = useToast();
  const { t } = useI18n();

  useEffect(() => {
    L.Marker.prototype.options.icon = L.icon({
      iconUrl: markerIcon,
      shadowUrl: markerShadow,
      iconSize: [25, 41],
      iconAnchor: [12, 41],
      popupAnchor: [1, -34],
      shadowSize: [41, 41],
    });
  }, []);

  const update = (k, v) =>
    setForm((p) => {
      const next = { ...p, [k]: v };
      if (k === "roomType" && (v === "Single" || v === "Other")) {
        next.rooms = 1;
        next.bathrooms = 1;
      }
      return next;
    });

  const load = async () => {
    try {
      setLoading(true);
      const res = await http.get(`/api/rooms/${id}`);
      const r = res.data.room;
      setRoom(r);

      setForm({
        title: r.title || "",
        location: r.location || "",
        roomType: r.roomType || "1BHK",
        monthlyRent: r.monthlyRent || "",
        electricityUnitRate: r.electricityUnitRate ?? "",
        rooms: r.rooms || 1,
        bathrooms: r.bathrooms || 1,
        description: r.description || "",
        isPublished: r.isPublished ?? true,
        wifi: !!r.facilities?.wifi,
        parking: !!r.facilities?.parking,
        waterSupply: !!r.facilities?.waterSupply,
        electricityBackup: !!r.facilities?.electricityBackup,
        kitchen: !!r.facilities?.kitchen,
        furnished: !!r.facilities?.furnished,
      });
      if (r.geo?.lat && r.geo?.lng) {
        setCoords({ lat: r.geo.lat, lng: r.geo.lng });
      }
      if (r.nearby) {
        setNearby({
          hospitals: (r.nearby.hospitals || []).map((n) => ({ name: n, distance: null })),
          colleges: (r.nearby.colleges || []).map((n) => ({ name: n, distance: null })),
          busStops: (r.nearby.busStops || []).map((n) => ({ name: n, distance: null })),
          markets: (r.nearby.markets || []).map((n) => ({ name: n, distance: null })),
        });
      }
    } catch (e) {
      showToast("error", e?.response?.data?.message || t("Failed to load room"));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!token) return showToast("error", t("Please login first"));
    if (!isOwner) return showToast("error", t("Owner access only"));
    load();
  }, [id]);

  const save = async () => {
    const nextErrors = {};
    if (!form.title.trim()) nextErrors.title = t("Title is required");
    if (!form.location.trim()) nextErrors.location = t("Location is required");
    if (!form.roomType) nextErrors.roomType = t("Room type is required");
    const rent = Number(form.monthlyRent);
    if (!Number.isFinite(rent) || rent <= 0) nextErrors.monthlyRent = t("Monthly rent must be > 0");
    if (form.electricityUnitRate !== "" && Number(form.electricityUnitRate) < 0) {
      nextErrors.electricityUnitRate = t("Electricity unit rate must be >= 0");
    }
    if (form.roomType !== "Single" && form.roomType !== "Other") {
      const rooms = Number(form.rooms);
      const baths = Number(form.bathrooms);
      if (!Number.isFinite(rooms) || rooms < 1) nextErrors.rooms = t("Rooms must be at least 1");
      if (!Number.isFinite(baths) || baths < 1) nextErrors.bathrooms = t("Bathrooms must be at least 1");
    }
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length) {
      return showToast("error", t("Please fix the highlighted fields"));
    }

    setSaving(true);
    try {
      const payload = {
        title: form.title,
        location: form.location,
        roomType: form.roomType,
        monthlyRent: Number(form.monthlyRent),
        electricityUnitRate: form.electricityUnitRate === "" ? 0 : Number(form.electricityUnitRate),
        rooms: Number(form.rooms),
        bathrooms: Number(form.bathrooms),
        description: form.description,
        isPublished: form.isPublished,
        facilities: {
          wifi: form.wifi,
          parking: form.parking,
          waterSupply: form.waterSupply,
          electricityBackup: form.electricityBackup,
          kitchen: form.kitchen,
          furnished: form.furnished,
        },
        lat: coords.lat,
        lng: coords.lng,
        nearby: nearby
          ? {
              hospitals: (nearby.hospitals || []).map((x) => x.name).filter(Boolean),
              colleges: (nearby.colleges || []).map((x) => x.name).filter(Boolean),
              busStops: (nearby.busStops || []).map((x) => x.name).filter(Boolean),
              markets: (nearby.markets || []).map((x) => x.name).filter(Boolean),
            }
          : undefined,
      };

      await http.patch(`/api/rooms/${id}`, payload);

      if (newPhotos.length) {
        const fd = new FormData();
        newPhotos.slice(0, 5).forEach((p) => fd.append("photos", p));
        await http.post(`/api/rooms/${id}/photos`, fd, {
          headers: { "Content-Type": "multipart/form-data" },
        });
      }

      showToast("success", t("Room updated ✅"));
      setNewPhotos([]);
      setErrors({});
      await load();
    } catch (e) {
      showToast("error", e?.response?.data?.message || t("Failed to update"));
    } finally {
      setSaving(false);
    }
  };

  const removePhoto = async (photoUrl) => {
    if (!confirm(t("Remove this photo?"))) return;
    try {
      await http.delete(`/api/rooms/${id}/photos`, { data: { photoUrl } });
      showToast("success", t("Photo removed ✅"));
      await load();
    } catch (e) {
      showToast("error", e?.response?.data?.message || t("Failed to remove photo"));
    }
  };

  const suggestPrice = async () => {
    if (!form.location.trim()) return showToast("error", t("Location is required for suggestion"));
    if (suggestLoading) return;
    const suggestKey = JSON.stringify({
      location: form.location.trim(),
      lat: coords?.lat,
      lng: coords?.lng,
      roomType: form.roomType,
      wanted: {
        wifi: form.wifi,
        parking: form.parking,
        waterSupply: form.waterSupply,
        kitchen: form.kitchen,
        electricityBackup: form.electricityBackup,
        furnished: form.furnished,
      },
    });
    if (lastSuggestKeyRef.current === suggestKey) return;
    try {
      setSuggestLoading(true);
      const res = await http.post("/api/price/suggest", {
        location: form.location,
        lat: coords?.lat,
        lng: coords?.lng,
        roomType: form.roomType,
        wanted: {
          wifi: form.wifi,
          parking: form.parking,
          waterSupply: form.waterSupply,
          kitchen: form.kitchen,
          electricityBackup: form.electricityBackup,
          furnished: form.furnished,
        },
      });
      setSuggestion(res.data);
      lastSuggestKeyRef.current = suggestKey;
    } catch (e) {
      showToast("error", e?.response?.data?.message || t("Failed to get suggestion"));
    } finally {
      setSuggestLoading(false);
    }
  };

  const reverseGeocode = async (lat, lng) => {
    try {
      setGeoLoading(true);
      const res = await http.get(`/api/geo/reverse?lat=${lat}&lng=${lng}`);
      if (res.data?.locationText && autoLocation) {
        update("location", res.data.locationText);
      }
    } catch {
      // ignore
    } finally {
      setGeoLoading(false);
    }
  };

  const fetchNearby = async (lat, lng) => {
    try {
      setNearbyLoading(true);
      const res = await http.get(`/api/geo/nearby?lat=${lat}&lng=${lng}`);
      setNearby(res.data || null);
    } catch {
      setNearby(null);
    } finally {
      setNearbyLoading(false);
    }
  };

  useEffect(() => {
    const t = setTimeout(() => {
      if (coords?.lat && coords?.lng) {
        reverseGeocode(coords.lat, coords.lng);
        fetchNearby(coords.lat, coords.lng);
      }
    }, 400);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [coords?.lat, coords?.lng]);

  return (
    <div>
      <div className="row" style={{ justifyContent: "space-between", flexWrap: "wrap" }}>
        <div>
          <h1 className="h1">{t("Edit Room")}</h1>
          <p className="muted" style={{ marginTop: 6 }}>{t("Update room info and manage photos.")}</p>
        </div>

        <div className="row">
          <button className="btn" onClick={save} disabled={saving || loading}>
            {saving ? t("Saving...") : t("Save Changes")}
          </button>
        </div>
      </div>

      <div className="spacer" />

      {loading ? (
        <p className="muted">{t("Loading...")}</p>
      ) : !room ? (
        <div className="card cardPad">{t("Room not found.")}</div>
      ) : (
        <div className="grid2">
          <div className="card cardPad">
            <h2 className="h2">{t("Room Details")}</h2>
            <div className="spacer" />

            <label className="muted" style={{ fontSize: 13 }}>{t("Title")}</label>
            <input
              className={`input ${errors.title ? "inputErr" : ""}`}
              value={form.title}
              onChange={(e) => {
                update("title", e.target.value);
                if (errors.title) setErrors((p) => ({ ...p, title: "" }));
              }}
            />
            {errors.title ? <div className="fieldErr">{errors.title}</div> : null}
            <div className="spacer" />

            <label className="muted" style={{ fontSize: 13 }}>{t("Location")}</label>
            <input
              className={`input ${errors.location ? "inputErr" : ""}`}
              value={form.location}
              onChange={(e) => {
                setAutoLocation(false);
                update("location", e.target.value);
                if (errors.location) setErrors((p) => ({ ...p, location: "" }));
              }}
            />
            {errors.location ? <div className="fieldErr">{errors.location}</div> : null}
            {geoLoading ? <div className="muted" style={{ fontSize: 12, marginTop: 6 }}>{t("Detecting location…")}</div> : null}
            <div className="spacer" />

            <div className="mapCard">
              <div className="row" style={{ justifyContent: "space-between", alignItems: "center" }}>
                <div style={{ fontWeight: 900 }}>{t("Pin on map")}</div>
                <button
                  type="button"
                  className="pill"
                  onClick={() => setAutoLocation(true)}
                >
                  {t("Use map location")}
                </button>
              </div>
              <div className="mapContainer">
                <MapContainer center={[coords.lat, coords.lng]} zoom={14} scrollWheelZoom={true}>
                  <TileLayer
                    attribution='&copy; OpenStreetMap contributors'
                    url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                  />
                  <MapUpdater center={[coords.lat, coords.lng]} />
                  <DraggableMarker value={coords} onChange={(v) => {
                    setAutoLocation(true);
                    setCoords(v);
                  }} />
                </MapContainer>
              </div>
            </div>
            <div className="spacer" />

            <label className="muted" style={{ fontSize: 13 }}>{t("Room Type")}</label>
            <select
              className={`input ${errors.roomType ? "inputErr" : ""}`}
              value={form.roomType}
              onChange={(e) => {
                update("roomType", e.target.value);
                if (errors.roomType) setErrors((p) => ({ ...p, roomType: "" }));
              }}
            >
              <option value="Single">{t("Single")}</option>
              <option value="Studio">{t("Studio")}</option>
              <option value="1BHK">1BHK</option>
              <option value="2BHK">2BHK</option>
              <option value="3BHK">3BHK</option>
              <option value="Other">{t("Single + Attached Bathroom")}</option>
            </select>
            {errors.roomType ? <div className="fieldErr">{errors.roomType}</div> : null}
            <div className="spacer" />

            <div className="row" style={{ flexWrap: "wrap" }}>
              <div style={{ flex: "1 1 220px" }}>
                <label className="muted" style={{ fontSize: 13 }}>{t("Monthly Rent (NPR)")}</label>
                <input
                  className={`input ${errors.monthlyRent ? "inputErr" : ""}`}
                  type="number"
                  min="0"
                  value={form.monthlyRent}
                  onChange={(e) => {
                    update("monthlyRent", e.target.value);
                    if (errors.monthlyRent) setErrors((p) => ({ ...p, monthlyRent: "" }));
                  }}
                  style={{ fontSize: 18, fontWeight: 900 }}
                />
                {errors.monthlyRent ? <div className="fieldErr">{errors.monthlyRent}</div> : null}
              </div>
              <div style={{ flex: "1 1 200px" }}>
                <label className="muted" style={{ fontSize: 13 }}>{t("Electricity Rate (NPR/unit)")}</label>
                <input
                  className={`input ${errors.electricityUnitRate ? "inputErr" : ""}`}
                  type="number"
                  min="0"
                  value={form.electricityUnitRate}
                  onChange={(e) => {
                    update("electricityUnitRate", e.target.value);
                    if (errors.electricityUnitRate) setErrors((p) => ({ ...p, electricityUnitRate: "" }));
                  }}
                  placeholder={t("e.g. 12")}
                />
                {errors.electricityUnitRate ? <div className="fieldErr">{errors.electricityUnitRate}</div> : null}
              </div>
              {form.roomType !== "Single" && form.roomType !== "Other" ? (
                <>
                  <div style={{ width: 110 }}>
                    <label className="muted" style={{ fontSize: 13 }}>{t("Rooms")}</label>
                    <input
                      className={`input ${errors.rooms ? "inputErr" : ""}`}
                      type="number"
                      min="1"
                      value={form.rooms}
                      onChange={(e) => {
                        update("rooms", e.target.value);
                        if (errors.rooms) setErrors((p) => ({ ...p, rooms: "" }));
                      }}
                    />
                    {errors.rooms ? <div className="fieldErr">{errors.rooms}</div> : null}
                  </div>
                  <div style={{ width: 130 }}>
                    <label className="muted" style={{ fontSize: 13 }}>{t("Bathrooms")}</label>
                    <input
                      className={`input ${errors.bathrooms ? "inputErr" : ""}`}
                      type="number"
                      min="1"
                      value={form.bathrooms}
                      onChange={(e) => {
                        update("bathrooms", e.target.value);
                        if (errors.bathrooms) setErrors((p) => ({ ...p, bathrooms: "" }));
                      }}
                    />
                    {errors.bathrooms ? <div className="fieldErr">{errors.bathrooms}</div> : null}
                  </div>
                </>
              ) : null}
            </div>

            <div className="spacer" />

            <label className="muted" style={{ fontSize: 13 }}>{t("Description")}</label>
            <textarea
              className="input"
              value={form.description}
              onChange={(e) => update("description", e.target.value)}
              style={{ minHeight: 110, paddingTop: 12 }}
            />

            <div className="spacer" />

            <div className="row" style={{ justifyContent: "flex-end" }}>
              <button className="btn btnOutline" type="button" onClick={suggestPrice} disabled={suggestLoading}>
                {suggestLoading ? t("Checking...") : t("Suggest Price")}
              </button>
            </div>

            {suggestion ? (
              <>
                <div className="spacer" />
                <div className="card cardPad" style={{ boxShadow: "none", borderRadius: 14 }}>
                  <div style={{ fontWeight: 900 }}>{t("Suggested Rent")}</div>
                  <div className="muted" style={{ marginTop: 6, fontSize: 13 }}>
                    {t("Recommended")}: <b style={{ color: "#111827" }}>NPR {suggestion.recommended}</b>
                  </div>
                  <div className="muted" style={{ marginTop: 6, fontSize: 13 }}>
                    {t("Range")}: NPR {suggestion.low} – {suggestion.high}
                  </div>
                  <div style={{ marginTop: 6, display: "flex", gap: 8, flexWrap: "wrap" }}>
                    <span className="badge">{(suggestion.confidence || "low").toUpperCase()}</span>
                    <span className="badge">{t("Based on")} {suggestion.basedOn}</span>
                  </div>
                  {Number(form.monthlyRent) > 0 ? (
                    <div className="muted" style={{ marginTop: 8, fontSize: 13 }}>
                      {t("Your price is")}{" "}
                      <b style={{ color: "#111827" }}>
                        {Number(form.monthlyRent) - Number(suggestion.recommended || 0) > 0
                          ? `+NPR ${Math.round(Number(form.monthlyRent) - Number(suggestion.recommended || 0))}`
                          : Number(form.monthlyRent) - Number(suggestion.recommended || 0) < 0
                          ? `-NPR ${Math.round(Math.abs(Number(form.monthlyRent) - Number(suggestion.recommended || 0)))}`
                          : t("exact")}
                      </b>{" "}
                      {t("vs recommended")}
                    </div>
                  ) : null}
                  <div className="spacer" />
                  <button
                    className="btn btnOutline"
                    type="button"
                    onClick={() => update("monthlyRent", String(suggestion.recommended || ""))}
                  >
                    {t("Use Recommended")}
                  </button>
                </div>
              </>
            ) : null}

            <div className="row" style={{ justifyContent: "space-between" }}>
              <div>
                <div style={{ fontWeight: 900 }}>{t("Published")}</div>
                <div className="muted" style={{ fontSize: 12 }}>{t("Visible to tenants")}</div>
              </div>
              <button
                className="pill"
                type="button"
                onClick={() => update("isPublished", !form.isPublished)}
                style={{
                  borderColor: form.isPublished ? "#111827" : "#e5e7eb",
                  background: form.isPublished ? "#111827" : "#fff",
                  color: form.isPublished ? "#fff" : "#111827",
                  fontWeight: 900,
                }}
              >
                {form.isPublished ? t("ON") : t("OFF")}
              </button>
            </div>

            <div className="spacer" />

            <h2 className="h2">{t("Facilities")}</h2>
            <div className="spacer" />
            <Toggle label={t("WiFi")} value={form.wifi} onChange={(v) => update("wifi", v)} />
            <Toggle label={t("Water Supply")} value={form.waterSupply} onChange={(v) => update("waterSupply", v)} />
            <Toggle label={t("Parking")} value={form.parking} onChange={(v) => update("parking", v)} />
            <Toggle label={t("Electricity Backup")} value={form.electricityBackup} onChange={(v) => update("electricityBackup", v)} />
            <Toggle label={t("Kitchen")} value={form.kitchen} onChange={(v) => update("kitchen", v)} />
            <Toggle label={t("Furnished")} value={form.furnished} onChange={(v) => update("furnished", v)} />
          </div>

          <div style={{ display: "grid", gap: 14 }}>
            <div className="card cardPad">
              <h2 className="h2">{t("Current Photos")}</h2>
              <p className="muted" style={{ marginTop: 6, fontSize: 13 }}>
                {t("Click remove to delete. Max 5 photos.")}
              </p>
              <div className="spacer" />

              {room.photos?.length ? (
                <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 10 }}>
                  {room.photos.map((p, i) => (
                    <div key={i} className="card" style={{ overflow: "hidden", borderRadius: 14, border: "1px solid #e5e7eb" }}>
                      <img
                        src={getPhotoUrl(p)}
                        alt="room"
                        style={{ width: "100%", display: "block" }}
                      />
                      <div style={{ padding: 10, display: "flex", justifyContent: "flex-end" }}>
                        <button className="btn btnOutline" type="button" onClick={() => removePhoto(p)}>
                          {t("Remove")}
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="muted" style={{ fontSize: 13 }}>{t("No photos yet.")}</div>
              )}
            </div>

            <div className="card cardPad">
              <h2 className="h2">{t("Add New Photos")}</h2>
              <p className="muted" style={{ marginTop: 6, fontSize: 13 }}>
                {t("Select photos and click “Save Changes”.")}
              </p>
              <div className="spacer" />

              <input
                className="input"
                type="file"
                accept="image/*"
                multiple
                onChange={(e) => {
                  const list = Array.from(e.target.files || []).slice(0, 5);
                  setNewPhotos(list);
                }}
              />

              <div className="spacer" />

              {newPhotos.length ? (
                <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10 }}>
                  {newPhotos.map((f, i) => (
                    <div key={i} className="card" style={{ overflow: "hidden", borderRadius: 14, border: "1px solid #e5e7eb" }}>
                      <img src={URL.createObjectURL(f)} alt="preview" style={{ width: "100%", display: "block" }} />
                    </div>
                  ))}
                </div>
              ) : (
                <div className="muted" style={{ fontSize: 13 }}>{t("No new photos selected.")}</div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Toggle({ label, value, onChange }) {
  const { t } = useI18n();
  return (
    <div className="row" style={{ justifyContent: "space-between", padding: "10px 0", borderBottom: "1px solid #eef0f3" }}>
      <div>
        <div style={{ fontWeight: 900 }}>{label}</div>
        <div className="muted" style={{ fontSize: 12 }}>{t("Enable/Disable")}</div>
      </div>
      <button
        type="button"
        className={"pill " + (value ? "" : "muted")}
        onClick={() => onChange(!value)}
        style={{
          borderColor: value ? "#111827" : "#e5e7eb",
          background: value ? "#111827" : "#fff",
          color: value ? "#fff" : "#111827",
          fontWeight: 900,
        }}
      >
        {value ? t("ON") : t("OFF")}
      </button>
    </div>
  );
}


function getPhotoUrl(p) {
  if (!p) return "";
  if (p.startsWith("http")) return p;
  const idx = p.indexOf("/uploads/");
  if (idx !== -1) return `http://localhost:5001${p.slice(idx)}`;
  if (p.startsWith("uploads/")) return `http://localhost:5001/${p}`;
  if (p.startsWith("/uploads/")) return `http://localhost:5001${p}`;
  return `http://localhost:5001/${p.replace(/^\/+/, "")}`;
}

function DraggableMarker({ value, onChange }) {
  const [pos, setPos] = useState(value);
  useEffect(() => {
    setPos(value);
  }, [value]);

  useMapEvents({
    click(e) {
      const next = { lat: e.latlng.lat, lng: e.latlng.lng };
      setPos(next);
      onChange(next);
    },
  });

  return (
    <Marker
      position={pos}
      draggable={true}
      eventHandlers={{
        dragend: (e) => {
          const ll = e.target.getLatLng();
          const next = { lat: ll.lat, lng: ll.lng };
          setPos(next);
          onChange(next);
        },
      }}
    />
  );
}

function MapUpdater({ center }) {
  const map = useMap();
  useEffect(() => {
    map.setView(center);
  }, [center, map]);
  return null;
}
