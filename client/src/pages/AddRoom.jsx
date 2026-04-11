import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import http from "../api/http";
import { useToast } from "../context/ToastContext";
import { MapContainer, Marker, TileLayer, useMap, useMapEvents } from "react-leaflet";
import L from "leaflet";
import markerIcon from "leaflet/dist/images/marker-icon.png";
import markerShadow from "leaflet/dist/images/marker-shadow.png";
import { useI18n } from "../context/I18nContext";
import NearbyList from "../components/NearbyList";
import { hasNearbyEntries } from "../utils/nearby";

export default function AddRoom() {
  const navigate = useNavigate();
  const user = useMemo(() => JSON.parse(localStorage.getItem("user") || "null"), []);
  const token = useMemo(() => localStorage.getItem("token"), []);
  const { t } = useI18n();

  const [form, setForm] = useState({
    title: "",
    location: "",
    roomType: "1BHK",
    monthlyRent: "",
    electricityUnitRate: "",
    rooms: 1,
    bathrooms: 1,
    description: "",
    // facilities
    wifi: true,
    parking: false,
    waterSupply: true,
    electricityBackup: false,
    kitchen: false,
    furnished: false,
  });

  const [photos, setPhotos] = useState([]); // File[]
  const [loading, setLoading] = useState(false);
  const submittingRef = useRef(false);
  const [coords, setCoords] = useState({ lat: 27.7172, lng: 85.3240 });
  const [geoLoading, setGeoLoading] = useState(false);
  const [nearby, setNearby] = useState(null);
  const [nearbyLoading, setNearbyLoading] = useState(false);
  const [autoLocation, setAutoLocation] = useState(true);
  const [autoPinFromLocation, setAutoPinFromLocation] = useState(true);
  const [suggestion, setSuggestion] = useState(null);
  const [suggestLoading, setSuggestLoading] = useState(false);
  const lastSuggestKeyRef = useRef("");
  const { showToast } = useToast();
  const fileInputRef = useRef(null);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewIndex, setPreviewIndex] = useState(0);
  const [errors, setErrors] = useState({});

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

  const buildAddressLabel = (address) => {
    if (!address) return "";
    const keys = ["area", "neighbourhood", "suburb", "city_district", "city", "town", "village", "county", "state", "country"];
    const parts = keys.map((key) => address[key]).filter(Boolean);
    return parts.join(", ");
  };

  const reverseGeocode = async (lat, lng) => {
    const latNum = Number(lat);
    const lngNum = Number(lng);
    const fallbackText = `Lat ${latNum.toFixed(4)}, Lng ${lngNum.toFixed(4)}`;
    try {
      setGeoLoading(true);
      const res = await http.get(`/api/geo/reverse?lat=${latNum}&lng=${lngNum}`);
      const locationText = String(res.data?.locationText || "").trim();
      const addressLabel = buildAddressLabel(res.data?.address);
      const resolvedText = locationText || addressLabel || fallbackText;
      if (autoLocation) {
        update("location", resolvedText);
      }
    } catch {
      if (autoLocation) {
        update("location", fallbackText);
      }
    } finally {
      setGeoLoading(false);
    }
  };

  const forwardGeocode = async (q) => {
    try {
      const res = await http.get(`/api/geo/search?q=${encodeURIComponent(q)}`);
      if (res.data?.found && Number.isFinite(res.data.lat) && Number.isFinite(res.data.lng)) {
        setCoords({ lat: res.data.lat, lng: res.data.lng });
      }
    } catch {
      // ignore
    }
  };

  const nearbySeq = useRef(0);
  const fetchNearby = async (lat, lng) => {
    const seq = ++nearbySeq.current;
    setNearbyLoading(true);
    setNearby(null);
    try {
      const res = await http.get(`/api/geo/nearby?lat=${lat}&lng=${lng}`);
      if (nearbySeq.current !== seq) return;
      setNearby(res.data || null);
    } catch {
      if (nearbySeq.current !== seq) return;
      setNearby(null);
    } finally {
      if (nearbySeq.current === seq) {
        setNearbyLoading(false);
      }
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

  useEffect(() => {
    if (!autoPinFromLocation) return;
    if (autoLocation) return;
    if (!form.location || form.location.trim().length < 3) return;
    const t = setTimeout(() => {
      forwardGeocode(form.location.trim());
    }, 500);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.location, autoPinFromLocation]);

  useEffect(() => {
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setCoords({ lat: pos.coords.latitude, lng: pos.coords.longitude });
      },
      () => {},
      { enableHighAccuracy: true, timeout: 5000 }
    );
  }, []);

  const validate = () => {
    const nextErrors = {};
    if (!token) return { ok: false, message: "Please login first.", errors: nextErrors };
    if (user?.role !== "owner") return { ok: false, message: "Only owner can add rooms.", errors: nextErrors };
    if (!form.title.trim()) nextErrors.title = "Title is required";
    if (!form.location.trim()) nextErrors.location = "Location is required";
    if (!form.roomType) nextErrors.roomType = "Room type is required";
    if (!form.monthlyRent || Number(form.monthlyRent) <= 0) nextErrors.monthlyRent = "Monthly rent must be > 0";
    if (form.electricityUnitRate !== "" && Number(form.electricityUnitRate) < 0) {
      nextErrors.electricityUnitRate = "Electricity unit rate must be >= 0";
    }
    if (form.roomType !== "Single" && form.roomType !== "Other") {
      if (!form.rooms || Number(form.rooms) < 1) nextErrors.rooms = "Rooms must be at least 1";
      if (!form.bathrooms || Number(form.bathrooms) < 1) nextErrors.bathrooms = "Bathrooms must be at least 1";
    }
    if (!form.description.trim()) nextErrors.description = "Description is required";
    if (!photos.length) nextErrors.photos = "Please upload at least 1 photo";

    const ok = Object.keys(nextErrors).length === 0;
    return { ok, message: ok ? "" : "Please fix the highlighted fields", errors: nextErrors };
  };

  const suggestPrice = async () => {
    if (!form.location.trim()) {
      setSuggestion(null);
      return showToast("error", t("Location is required for suggestion"));
    }
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
      showToast("error", e?.response?.data?.message || "Failed to get suggestion");
    } finally {
      setSuggestLoading(false);
    }
  };

  useEffect(() => {
    if (!form.location.trim()) {
      setSuggestion(null);
      return;
    }
    if (suggestLoading) return;
    const t = setTimeout(() => {
      suggestPrice();
    }, 600);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    form.location,
    form.roomType,
    coords?.lat,
    coords?.lng,
    form.wifi,
    form.parking,
    form.waterSupply,
    form.kitchen,
    form.electricityBackup,
    form.furnished,
  ]);

  const submit = async (e) => {
    e.preventDefault();
    if (submittingRef.current || loading) return;
    const v = validate();
    setErrors(v.errors || {});
    if (!v.ok) return showToast("error", v.message);

    submittingRef.current = true;
    setLoading(true);
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

      const createRes = await http.post("/api/rooms", payload);
      const roomId = createRes.data.room?._id || createRes.data._id || createRes.data.roomId;

      if (photos.length && roomId) {
        const fd = new FormData();
        photos.forEach((p) => fd.append("photos", p));
        await http.post(`/api/rooms/${roomId}/photos`, fd, {
          headers: { "Content-Type": "multipart/form-data" },
        });
      }

      showToast("success", "Room posted successfully ✅");
      setTimeout(() => navigate("/owner/my-rooms"), 700);
    } catch (e2) {
      showToast("error", e2?.response?.data?.message || "Failed to create room");
    } finally {
      setLoading(false);
      submittingRef.current = false;
    }
  };

  return (
    <div>
      <div className="row" style={{ justifyContent: "space-between", flexWrap: "wrap" }}>
        <div>
          <h1 className="h1">Add Room</h1>
          <p className="muted" style={{ marginTop: 6 }}>{t("Post a new room for tenants.")}</p>
        </div>
      </div>

      <div className="spacer" />

      <form onSubmit={submit} className="addRoomGrid">
        {/* Left form */}
        <div className="card cardPad">
          <h2 className="h2">{t("Room Details")}</h2>
          <div className="spacer" />

          <label className="muted" style={{ fontSize: 13 }}>{t("Title")} <span style={{ color: "#ef4444" }}>*</span></label>
          <input
            className={`input ${errors.title ? "inputErr" : ""}`}
            required
            value={form.title}
            onChange={(e) => {
              update("title", e.target.value);
              if (errors.title) setErrors((p) => ({ ...p, title: "" }));
            }}
            placeholder={t("e.g. 1BHK Room near Balkumari")}
          />
          {errors.title ? <div className="fieldErr">{errors.title}</div> : null}
          <div className="spacer" />

          <label className="muted" style={{ fontSize: 13 }}>{t("Location")} <span style={{ color: "#ef4444" }}>*</span></label>
          <input
            className={`input ${errors.location ? "inputErr" : ""}`}
            required
            value={form.location}
            onChange={(e) => {
              setAutoLocation(false);
              setAutoPinFromLocation(true);
              update("location", e.target.value);
              if (errors.location) setErrors((p) => ({ ...p, location: "" }));
            }}
            placeholder={t("e.g. Lalitpur, Balkumari")}
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
                onClick={() => {
                  setAutoLocation(true);
                  setAutoPinFromLocation(false);
                }}
              >
                {t("Use map location")}
              </button>
              <button
                type="button"
                className="pill"
                onClick={() => {
                  setAutoLocation(false);
                  setAutoPinFromLocation(true);
                }}
              >
                {t("Use typed location")}
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
                    setAutoPinFromLocation(false);
                    setCoords(v);
                  }} />
                </MapContainer>
            </div>
          </div>
          <div className="spacer" />

          <label className="muted" style={{ fontSize: 13 }}>{t("Room Type")} <span style={{ color: "#ef4444" }}>*</span></label>
          <select
            className={`input ${errors.roomType ? "inputErr" : ""}`}
            required
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
              <label className="muted" style={{ fontSize: 13 }}>{t("Monthly Rent (NPR)")} <span style={{ color: "#ef4444" }}>*</span></label>
              <input
                className={`input ${errors.monthlyRent ? "inputErr" : ""}`}
                type="number"
                min="0"
                required
                value={form.monthlyRent}
                onChange={(e) => {
                  update("monthlyRent", e.target.value);
                  if (errors.monthlyRent) setErrors((p) => ({ ...p, monthlyRent: "" }));
                }}
                placeholder={t("12000")}
                style={{ fontSize: 20, fontWeight: 900, height: 52 }}
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
                <div style={{ width: 110, flex: "0 0 110px" }}>
                  <label className="muted" style={{ fontSize: 13 }}>{t("Rooms")} <span style={{ color: "#ef4444" }}>*</span></label>
                  <input
                    className={`input ${errors.rooms ? "inputErr" : ""}`}
                    required
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
                <div style={{ width: 130, flex: "0 0 130px" }}>
                  <label className="muted" style={{ fontSize: 13 }}>{t("Bathrooms")} <span style={{ color: "#ef4444" }}>*</span></label>
                  <input
                    className={`input ${errors.bathrooms ? "inputErr" : ""}`}
                    required
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
          <div className="row" style={{ justifyContent: "flex-end" }}>
            <button className="btn btnOutline" type="button" onClick={suggestPrice} disabled={suggestLoading}>
              {suggestLoading ? t("Checking...") : t("Suggest Price")}
            </button>
          </div>

          {suggestion ? (
            <>
              <div className="spacer" />
              <div className="priceCard">
                <div className="priceCardTop">
                  <div className="priceBrand">{t("AafnoGhar • Price Suggestion")}</div>
                  <span className="priceChip">{(suggestion.confidence || "low").toUpperCase()}</span>
                </div>

                <div className="priceAmount">NPR {suggestion.recommended}</div>
                <div className="priceRange">{t("Range")}: NPR {suggestion.low} – {suggestion.high}</div>

                <div className="priceMeta">
                  <span className="priceTag">{t("Based on")} {suggestion.basedOn}</span>
                  {Number(form.monthlyRent) > 0 ? (
                    <span className="priceDelta">
                      {Number(form.monthlyRent) - Number(suggestion.recommended || 0) > 0
                        ? `+NPR ${Math.round(Number(form.monthlyRent) - Number(suggestion.recommended || 0))}`
                        : Number(form.monthlyRent) - Number(suggestion.recommended || 0) < 0
                        ? `-NPR ${Math.round(Math.abs(Number(form.monthlyRent) - Number(suggestion.recommended || 0)))}`
                        : t("Exact match")}
                    </span>
                  ) : (
                    <span className="priceDelta muted">{t("Set rent to compare")}</span>
                  )}
                </div>

                <div className="priceAction">
                  <button
                    className="btn btnOutline"
                    type="button"
                    onClick={() => update("monthlyRent", String(suggestion.recommended || ""))}
                  >
                    {t("Use Recommended")}
                  </button>
                </div>
              </div>
            </>
          ) : null}

          <label className="muted" style={{ fontSize: 13 }}>{t("Description")} <span style={{ color: "#ef4444" }}>*</span></label>
          <textarea
            className={`input ${errors.description ? "inputErr" : ""}`}
            required
            value={form.description}
            onChange={(e) => {
              update("description", e.target.value);
              if (errors.description) setErrors((p) => ({ ...p, description: "" }));
            }}
            placeholder={t("Write short details (water, wifi, nearby places, rules...)")}
            style={{ minHeight: 120, paddingTop: 12 }}
          />
          {errors.description ? <div className="fieldErr">{errors.description}</div> : null}

          <div className="spacer" />
          <label className="muted" style={{ fontSize: 13 }}>{t("Photos (max 5)")} <span style={{ color: "#ef4444" }}>*</span></label>
          <input
            className={`input ${errors.photos ? "inputErr" : ""}`}
            type="file"
            accept="image/*"
            multiple
            required
            ref={fileInputRef}
            onChange={(e) => {
              const list = Array.from(e.target.files || []);
              setPhotos((prev) => {
                const merged = [...prev, ...list];
                return merged.slice(0, 5);
              });
              if (errors.photos) setErrors((p) => ({ ...p, photos: "" }));
            }}
          />
          {errors.photos ? <div className="fieldErr">{errors.photos}</div> : null}

          <div className="spacer" />
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10 }}>
            {photos.map((f, i) => (
              <div key={i} className="card" style={{ overflow: "hidden", borderRadius: 14, border: "1px solid #e5e7eb", position: "relative" }}>
                <img
                  src={URL.createObjectURL(f)}
                  alt="preview"
                  style={{ width: "100%", display: "block", cursor: "zoom-in" }}
                  onClick={() => {
                    setPreviewIndex(i);
                    setPreviewOpen(true);
                  }}
                />
                <button
                  type="button"
                  className="pill"
                  onClick={() => {
                    setPhotos((prev) => {
                      const next = prev.filter((_, idx) => idx !== i);
                      if (next.length === 0 && fileInputRef.current) {
                        fileInputRef.current.value = "";
                      }
                      return next;
                    });
                  }}
                  style={{
                    position: "absolute",
                    top: 6,
                    right: 6,
                    padding: "2px 6px",
                    fontSize: 12,
                    width: 26,
                    height: 26,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  ✕
                </button>
              </div>
            ))}
          </div>

          <div className="spacer" />
          <button className="btn" type="submit" disabled={loading}>
            {loading ? t("Posting...") : t("Post Room")}
          </button>
        </div>

        {/* Right: facilities + preview */}
        <div style={{ display: "grid", gap: 14 }}>
          <div className="card cardPad">
            <h2 className="h2">{t("Facilities")}</h2>
            <p className="muted" style={{ marginTop: 6, fontSize: 13 }}>{t("Choose what this room includes.")}</p>
            <div className="spacer" />

            <Toggle label={t("WiFi")} value={form.wifi} onChange={(v) => update("wifi", v)} />
            <Toggle label={t("Water Supply")} value={form.waterSupply} onChange={(v) => update("waterSupply", v)} />
            <Toggle label={t("Parking")} value={form.parking} onChange={(v) => update("parking", v)} />
            <Toggle label={t("Electricity Backup")} value={form.electricityBackup} onChange={(v) => update("electricityBackup", v)} />
            <Toggle label={t("Kitchen")} value={form.kitchen} onChange={(v) => update("kitchen", v)} />
            <Toggle label={t("Furnished")} value={form.furnished} onChange={(v) => update("furnished", v)} />
          </div>

          <div className="card cardPad">
            <h2 className="h2">{t("Preview")}</h2>
            <p className="muted" style={{ marginTop: 6, fontSize: 13 }}>{t("This is how it will look in list.")}</p>
            <div className="spacer" />

            <div className="roomPreviewCard">
              <div className="roomPreviewTop">
                <div className="roomPreviewBrand">AafnoGhar</div>
                <div className="roomPreviewChip">{t("Preview")}</div>
              </div>

              <div className="roomPreviewTitle">{form.title || t("Room title...")}</div>
              <div className="roomPreviewMeta">
                {form.location || t("Location...")} • {form.roomType || t("Room type...")}
              </div>

              <div className="roomPreviewRow">
                <div className="roomPreviewAmount">
                  NPR {form.monthlyRent || "0"}
                  <span className="roomPreviewUnit">/mo</span>
                </div>
              </div>

              <div className="roomPreviewBadges">
                {form.roomType !== "Single" && form.roomType !== "Other" && <span className="badge">{form.rooms || 1} {t("rooms")}</span>}
                {form.roomType !== "Single" && form.roomType !== "Other" && <span className="badge">{form.bathrooms || 1} {t("bath")}</span>}
                {form.roomType === "Other" && <span className="badge">{t("Single • Attached Bath")}</span>}
                {form.wifi && <span className="badge">{t("WiFi")}</span>}
                {form.waterSupply && <span className="badge">{t("Water")}</span>}
                {form.parking && <span className="badge">{t("Parking")}</span>}
                {form.electricityBackup && <span className="badge">{t("Backup")}</span>}
                {form.kitchen && <span className="badge">{t("Kitchen")}</span>}
                {form.furnished && <span className="badge">{t("Furnished")}</span>}
              </div>

              <div className="roomPreviewBelow">
                {photos?.length ? (
                  <div className="roomPreviewStrip">
                    {photos.map((p, i) => (
                      <div key={i} className="roomPreviewThumb">
                        <img src={URL.createObjectURL(p)} alt="preview" />
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="roomPreviewEmptyLine">{t("No photos selected yet.")}</div>
                )}
              </div>

              <div className="roomPreviewNearby">
                <div className="roomPreviewNearbyTitle">{t("Nearby (from map pin)")}</div>
                {nearbyLoading ? (
                  <div className="roomPreviewNearbyText">{t("Loading nearby places…")}</div>
                ) : !hasNearbyEntries(nearby) ? (
                  <div className="roomPreviewNearbyText">{t("No nearby data yet.")}</div>
                ) : (
                  <div className="roomPreviewNearbyList">
                    <NearbyList title={t("Hospitals")} items={nearby.hospitals} />
                    <NearbyList title={t("Colleges")} items={nearby.colleges} />
                    <NearbyList title={t("Markets")} items={nearby.markets} />
                    <NearbyList title={t("Bus Stops")} items={nearby.busStops} />
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </form>

      {previewOpen && photos[previewIndex] ? (
        <div className="modalBg" onMouseDown={() => setPreviewOpen(false)}>
          <div className="modal" onMouseDown={(e) => e.stopPropagation()} style={{ maxWidth: 900 }}>
            <div className="row" style={{ justifyContent: "space-between" }}>
              <div style={{ fontWeight: 900 }}>{t("Photo Preview")}</div>
              <button className="pill" onClick={() => setPreviewOpen(false)} style={{ padding: "4px 10px" }}>
                ✕
              </button>
            </div>
            <div className="spacer" />
            <div className="card" style={{ borderRadius: 16, overflow: "hidden", boxShadow: "none", background: "#f3f4f6" }}>
              <img
                src={URL.createObjectURL(photos[previewIndex])}
                alt="preview"
                style={{ width: "100%", maxHeight: "70vh", objectFit: "contain", display: "block" }}
              />
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
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

function Toggle({ label, value, onChange }) {
  return (
    <div className="row" style={{ justifyContent: "space-between", padding: "10px 0", borderBottom: "1px solid #eef0f3" }}>
      <div>
        <div style={{ fontWeight: 700 }}>{label}</div>
        <div className="muted" style={{ fontSize: 12 }}>Enable/Disable</div>
      </div>
      <button
        type="button"
        className={"pill " + (value ? "" : "muted")}
        onClick={() => onChange(!value)}
        style={{
          borderColor: value ? "#111827" : "#e5e7eb",
          background: value ? "#111827" : "#fff",
          color: value ? "#fff" : "#111827",
          fontWeight: 800,
        }}
      >
        {value ? "ON" : "OFF"}
      </button>
    </div>
  );
}
