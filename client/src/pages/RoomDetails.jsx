import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import http from "../api/http";
import Modal from "../components/Modal";
import Spinner from "../components/Spinner";
import { useToast } from "../context/ToastContext";
import { getPhotoUrl } from "../utils/photo";
import { MapContainer, Marker, TileLayer, useMap } from "react-leaflet";
import L from "leaflet";
import markerIcon from "leaflet/dist/images/marker-icon.png";
import markerShadow from "leaflet/dist/images/marker-shadow.png";
import { useI18n } from "../context/I18nContext";
import { formatRoomLocation } from "../utils/roomLocation";
import NearbyList from "../components/NearbyList";
import { hasNearbyEntries } from "../utils/nearby";

export default function RoomDetails() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { showToast } = useToast();
  const { t } = useI18n();

  const [token, setToken] = useState(() => localStorage.getItem("token"));
  const [user, setUser] = useState(() => JSON.parse(localStorage.getItem("user") || "null"));
  const isTenant = user?.role === "tenant";
  const tenantVerified = ["approved", "verified"].includes(user?.kyc?.status);

  const [loading, setLoading] = useState(true);
  const [room, setRoom] = useState(null);
  const [userPos, setUserPos] = useState(null);
  const [nearby, setNearby] = useState(null);
  const [nearbyLoading, setNearbyLoading] = useState(false);
  const [ratingScore, setRatingScore] = useState(0);
  const [ratingComment, setRatingComment] = useState("");
  const [ratingSubmitting, setRatingSubmitting] = useState(false);
  const [ratingThanks, setRatingThanks] = useState(false);

  // gallery
  const [activeImg, setActiveImg] = useState(0);
  const [viewerOpen, setViewerOpen] = useState(false);

  // request modal
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState("I want to rent from next month.");
  const [sending, setSending] = useState(false);

  // offer modal
  const [openOffer, setOpenOffer] = useState(false);
  const [offeredRent, setOfferedRent] = useState("");
  const [offerMessage, setOfferMessage] = useState("Hi, I am interested. Can we finalize this price?");
  const [sendingOffer, setSendingOffer] = useState(false);
  // visit modal
  const [openVisit, setOpenVisit] = useState(false);
  const [visitAt, setVisitAt] = useState("");
  const [visitNote, setVisitNote] = useState("");
  const [sendingVisit, setSendingVisit] = useState(false);
  const [suggestion, setSuggestion] = useState(null);
  const [showMap, setShowMap] = useState(false);
  const [selectedNearby, setSelectedNearby] = useState(null);
  const minVisitAt = useMemo(() => {
    const d = new Date();
    const pad = (n) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  }, []);

  const formatResponseMinutes = (mins) => {
    if (!Number.isFinite(mins) || mins <= 0) return "—";
    if (mins < 60) return `${mins} ${t("min")}`;
    const hours = Math.floor(mins / 60);
    const remaining = mins % 60;
    if (remaining === 0) return `${hours} ${t("hr")}`;
    return `${hours} ${t("hr")} ${remaining} ${t("min")}`;
  };

  const fetchRoomDetails = async () => {
    const res = await http.get(`/api/rooms/${id}`);
    const r = res.data.room;
    setRoom(r);
    if (r?.nearby) {
      setNearby({
        hospitals: (r.nearby.hospitals || []).map((n) => ({ name: n, distance: null, lat: null, lng: null })),
        colleges: (r.nearby.colleges || []).map((n) => ({ name: n, distance: null, lat: null, lng: null })),
        busStops: (r.nearby.busStops || []).map((n) => ({ name: n, distance: null, lat: null, lng: null })),
        markets: (r.nearby.markets || []).map((n) => ({ name: n, distance: null, lat: null, lng: null })),
      });
    } else {
      setNearby(null);
    }
    setActiveImg(0);
  };

  const load = async () => {
    try {
      setLoading(true);
      await fetchRoomDetails();
    } catch (e) {
      showToast("error", e?.response?.data?.message || "Failed to load room");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, [id]);

  useEffect(() => {
    const sync = () => {
      setToken(localStorage.getItem("token"));
      setUser(JSON.parse(localStorage.getItem("user") || "null"));
    };
    window.addEventListener("storage", sync);
    window.addEventListener("auth:updated", sync);
    return () => {
      window.removeEventListener("storage", sync);
      window.removeEventListener("auth:updated", sync);
    };
  }, []);

  useEffect(() => {
    if (!token || !isTenant) return;
    const refreshKyc = async () => {
      try {
        const res = await http.get("/api/kyc/me");
        const k = res.data.user?.kyc ?? res.data.kyc ?? null;
        if (!k) return;
        const next = { ...(user || {}), kyc: k };
        setUser(next);
        localStorage.setItem("user", JSON.stringify(next));
        window.dispatchEvent(new Event("auth:updated"));
      } catch {
        // ignore
      }
    };
    refreshKyc();
  }, [token, isTenant]);

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

  useEffect(() => {
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      (pos) => setUserPos({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      () => {},
      { enableHighAccuracy: true, timeout: 5000 }
    );
  }, []);

  useEffect(() => {
    if (!room?._id) return;
    if (!room?.geo?.lat || !room?.geo?.lng) return;
    const fallbackHasNearby = hasNearbyEntries(room?.nearby);

    const fetchNearby = async () => {
      try {
        setNearbyLoading(true);
        const res = await http.get(`/api/rooms/${room._id}/nearby`);
        if (hasNearbyEntries(res.data)) {
          setNearby(res.data);
        } else if (!fallbackHasNearby) {
          setNearby(null);
        }
      } catch {
        if (!fallbackHasNearby) {
          setNearby(null);
        }
      } finally {
        setNearbyLoading(false);
      }
    };

    fetchNearby();
  }, [room?._id, room?.geo?.lat, room?.geo?.lng]);

  useEffect(() => {
    if (!token || !room?.location) return;
    const run = async () => {
      try {
        const res = await http.post("/api/price/suggest", {
          location: room.location,
          lat: room?.geo?.lat,
          lng: room?.geo?.lng,
          roomType: room?.roomType,
          wanted: {
            wifi: room.facilities?.wifi,
            parking: room.facilities?.parking,
            waterSupply: room.facilities?.waterSupply,
            kitchen: room.facilities?.kitchen,
            electricityBackup: room.facilities?.electricityBackup,
          },
        });
        setSuggestion(res.data);
      } catch {
        // silent: suggestion is optional
      }
    };
    run();
  }, [token, room?.location]);

  const distanceKm = useMemo(() => {
    if (!userPos || !room?.geo?.lat || !room?.geo?.lng) return null;
    const toRad = (v) => (v * Math.PI) / 180;
    const R = 6371;
    const dLat = toRad(room.geo.lat - userPos.lat);
    const dLon = toRad(room.geo.lng - userPos.lng);
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(toRad(userPos.lat)) * Math.cos(toRad(room.geo.lat)) *
      Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return Math.round(R * c * 10) / 10;
  }, [userPos, room?.geo?.lat, room?.geo?.lng]);

  const nearbyPoints = useMemo(() => {
    if (!nearby) return [];
    const collect = (arr) =>
      (arr || [])
        .filter((i) => Number.isFinite(i.lat) && Number.isFinite(i.lng))
        .map((i) => ({ name: i.name, lat: i.lat, lng: i.lng }));
    return [
      ...collect(nearby.hospitals),
      ...collect(nearby.colleges),
      ...collect(nearby.busStops),
      ...collect(nearby.markets),
    ];
  }, [nearby]);

  const photos = (room?.photos || [])
    .map((p) => (typeof p === "string" ? p.trim() : ""))
    .filter(Boolean)
    .map((p) => getPhotoUrl(p))
    .filter(Boolean);
  const totalPhotos = photos.length;
  const ratingAverage = Number(room?.ratingAvg ?? 0);
  const ratingCount = room?.ratingCount || 0;
  const recentRatings = (room?.ratings || []).slice(0, 3);

  useEffect(() => {
    if (!totalPhotos) return;
    if (activeImg >= totalPhotos) setActiveImg(0);
  }, [totalPhotos, activeImg]);

  const canRequest = !!token && isTenant && tenantVerified;
  const canRate = !!token && isTenant && tenantVerified && room?.canRate;

  const submitRequest = async () => {
    if (!canRequest) return;
    if (!message.trim()) return showToast("error", "Please write a message");

    try {
      setSending(true);
      await http.post("/api/requests", { roomId: room._id, message });
      setOpen(false);
      showToast("success", "Request sent ✅");
    } catch (e) {
      showToast("error", e?.response?.data?.message || "Failed to send request");
    } finally {
      setSending(false);
    }
  };

  const userRating = useMemo(() => {
    if (!room || !room.ratings || !user?._id) return null;
    return room.ratings.find((r) => String(r.user?._id || r.user) === String(user._id)) || null;
  }, [room, user?._id]);

  useEffect(() => {
    if (!userRating) {
      setRatingScore(0);
      setRatingComment("");
      return;
    }
    setRatingScore(userRating.score || 0);
    setRatingComment(userRating.comment || "");
  }, [userRating]);

  const submitRating = async () => {
    if (!canRate) {
      if (isTenant && tenantVerified && room && !room.canRate) {
        showToast("error", t("Complete your exit before rating this room."));
      } else {
        showToast("error", t("Log in as tenant to leave a rating."));
      }
      return;
    }
    if (!ratingScore) {
      showToast("error", t("Please select a rating before submitting."));
      return;
    }
    try {
      setRatingSubmitting(true);
      await http.post(`/api/rooms/${id}/rate`, { score: ratingScore, comment: ratingComment });
      showToast("success", t("Rating saved."));
      setRatingThanks(true);
      window.setTimeout(() => setRatingThanks(false), 3500);
      await fetchRoomDetails();
    } catch (e) {
      showToast("error", e?.response?.data?.message || t("Failed to save rating."));
    } finally {
      setRatingSubmitting(false);
    }
  };

  const sendOffer = async () => {
    if (!offeredRent) return showToast("error", "Enter offered rent");

    try {
      setSendingOffer(true);
      await http.post("/api/offers", {
        roomId: room._id,
        offeredRent: Number(offeredRent),
        message: offerMessage,
      });
      showToast("success", "Offer sent ✅");
      setOpenOffer(false);
    } catch (e) {
      showToast("error", e?.response?.data?.message || "Offer failed");
    } finally {
      setSendingOffer(false);
    }
  };

  const submitVisit = async () => {
    if (!canRequest) return;
    if (!visitAt) return showToast("error", t("Please select a visit time."));
    try {
      setSendingVisit(true);
      await http.post("/api/visits", {
        roomId: room._id,
        scheduledAt: visitAt,
        note: visitNote,
      });
      showToast("success", t("Visit scheduled ✅"));
      setOpenVisit(false);
      setVisitAt("");
      setVisitNote("");
    } catch (e) {
      showToast("error", e?.response?.data?.message || t("Failed to schedule visit"));
    } finally {
      setSendingVisit(false);
    }
  };

  if (loading) return <Spinner text={t("Loading room...")} />;

  if (!room) {
    return (
      <div className="card cardPad">
        {t("Room not found.")} <Link to="/rooms">{t("Go back")}</Link>
      </div>
    );
  }

  return (
    <div>
      <div className="row" style={{ justifyContent: "space-between", flexWrap: "wrap" }}>
        <div>
          <h1 className="h1">{room.title}</h1>
          <div className="row" style={{ gap: 8, flexWrap: "wrap", marginTop: 6 }}>
            <div className="muted">
              {formatRoomLocation(room.location, room.geo) || t("Location not provided")}
            </div>
            {room.geo?.lat && room.geo?.lng ? (
              <button
                type="button"
                className="pill"
                onClick={() => setShowMap((v) => !v)}
                style={{ padding: "4px 10px" }}
              >
                {showMap ? t("Hide Map") : t("View Map")}
              </button>
            ) : null}
          </div>
          {room.roomType ? (
            <div className="muted" style={{ marginTop: 6, fontSize: 13 }}>{t("Type")}: {room.roomType}</div>
          ) : null}
          {distanceKm !== null ? (
            <div className="muted" style={{ marginTop: 6, fontSize: 13 }}>
              {t("Distance from you")}: <b style={{ color: "#111827" }}>{distanceKm} km</b>
            </div>
          ) : null}
        </div>

        <div style={{ textAlign: "right" }}>
          <div className="muted" style={{ fontSize: 12 }}>{t("Monthly Rent")}</div>
          <div style={{ fontWeight: 900, fontSize: 22 }}>NPR {room.monthlyRent}</div>
        </div>
      </div>

      <div className="spacer" />

      <div className="roomLayout">
        {/* LEFT: Gallery */}
        <div className="card cardPad">
          <div className="galleryMain">
            {photos.length ? (
              <>
                <img
                  className="galleryImg"
                  src={photos[activeImg]}
                  alt="room"
                  onClick={() => setViewerOpen(true)}
                  style={{ cursor: "zoom-in" }}
                />
                {totalPhotos > 1 ? (
                  <>
                    <button
                      type="button"
                      className="pill"
                      onClick={() => setActiveImg((p) => (p - 1 + totalPhotos) % totalPhotos)}
                      style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)" }}
                    >
                      ‹
                    </button>
                    <button
                      type="button"
                      className="pill"
                      onClick={() => setActiveImg((p) => (p + 1) % totalPhotos)}
                      style={{ position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)" }}
                    >
                      ›
                    </button>
                  </>
                ) : null}
              </>
            ) : (
              <div className="galleryEmpty">
                <div style={{ fontWeight: 900 }}>{t("No Photos")}</div>
                <div className="muted" style={{ marginTop: 6 }}>{t("Owner hasn’t uploaded images yet.")}</div>
              </div>
            )}
          </div>

          {photos.length > 1 ? (
            <div className="galleryThumbs">
              {photos.map((p, i) => (
                <button
                  key={i}
                  className={"thumbBtn " + (i === activeImg ? "active" : "")}
                  onClick={() => setActiveImg(i)}
                  type="button"
                >
                  <img src={p} alt="thumb" className="thumbImg" />
                </button>
              ))}
            </div>
          ) : null}
        </div>

        {/* RIGHT: Info + CTA */}
        <div style={{ display: "grid", gap: 14 }}>
          <div className="card cardPad" id="ratings">
            <div className="row" style={{ justifyContent: "space-between", alignItems: "flex-start" }}>
              <div>
                <div style={{ fontWeight: 900, fontSize: 16 }}>{t("Details")}</div>
                <div className="muted" style={{ marginTop: 4, fontSize: 13 }}>
                  {t("Rooms")}: {room.rooms || 1} • {t("Bathrooms")}: {room.bathrooms || 1} • {t("Type")}: {room.roomType || "1BHK"}
                </div>
              </div>
              <span className="badge">{room.isPublished ? t("Published") : t("Hidden")}</span>
            </div>

            <div className="spacer" />

            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {room.facilities?.wifi && <span className="badge">{t("WiFi")}</span>}
              {room.facilities?.parking && <span className="badge">{t("Parking")}</span>}
              {room.facilities?.waterSupply && <span className="badge">{t("Water")}</span>}
              {room.facilities?.electricityBackup && <span className="badge">{t("Backup")}</span>}
              {room.facilities?.kitchen && <span className="badge">{t("Kitchen")}</span>}
              {room.facilities?.furnished && <span className="badge">{t("Furnished")}</span>}
            </div>

            {room.description ? (
              <>
                <div className="spacer" />
                <div className="muted" style={{ fontSize: 14, lineHeight: 1.6 }}>
                  {room.description}
                </div>
              </>
            ) : null}
          </div>

          <div className="card cardPad" id="ratings">
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 16 }}>
              <div>
                <div style={{ fontWeight: 900, fontSize: 16 }}>{t("Ratings")}</div>
                <div className="muted" style={{ fontSize: 13, marginTop: 4 }}>
                  {ratingCount ? `${ratingCount} ${t("ratings")}` : t("No ratings yet.")}
                </div>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <div style={{ fontSize: 24, fontWeight: 800 }}>{ratingAverage ? ratingAverage.toFixed(1) : "0.0"}</div>
                <div className="ratingStars">
                  {[1, 2, 3, 4, 5].map((value) => (
                    <span
                      key={`rating-star-${value}`}
                      style={{ color: value <= Math.round(ratingAverage) ? "#fcd34d" : "#e5e7eb" }}
                    >
                      ★
                    </span>
                  ))}
                </div>
              </div>
            </div>

            {recentRatings.length ? (
              <div className="ratingList">
                {recentRatings.map((entry) => (
                  <div key={`${entry.user?._id || entry.user}-${entry.createdAt}`} className="ratingItem">
                    <div className="row" style={{ justifyContent: "space-between" }}>
                      <div style={{ fontWeight: 700 }}>{entry.user?.fullName || t("Unidentified user")}</div>
                      <div className="muted" style={{ fontSize: 12 }}>
                        {entry.score}/5 • {new Date(entry.createdAt).toLocaleDateString()}
                      </div>
                    </div>
                    {entry.comment ? (
                      <div className="muted" style={{ marginTop: 6, fontSize: 13 }}>
                        {entry.comment}
                      </div>
                    ) : null}
                  </div>
                ))}
              </div>
            ) : null}

            <div className="spacer" />
            {canRate ? (
              <>
                <div className="ratingSelect">
                  <div style={{ fontWeight: 600, marginBottom: 6 }}>{t("Leave your rating")}</div>
                  <div className="row" style={{ flexWrap: "wrap", gap: 6 }}>
                    {[1, 2, 3, 4, 5].map((value) => (
                      <button
                        key={`rating-select-${value}`}
                        className={`pill ${ratingScore >= value ? "pillOk" : ""}`}
                        type="button"
                        style={{ padding: "4px 10px" }}
                        onClick={() => {
                          setRatingScore(value);
                          if (ratingThanks) setRatingThanks(false);
                        }}
                      >
                        {value} ★
                      </button>
                    ))}
                  </div>
                </div>
                <textarea
                  className="input"
                  rows={3}
                  value={ratingComment}
                  onChange={(e) => {
                    setRatingComment(e.target.value);
                    if (ratingThanks) setRatingThanks(false);
                  }}
                  placeholder={t("Tell others what you liked")}
                />
                <div className="row" style={{ justifyContent: "flex-end" }}>
                  <button
                    type="button"
                    className="btn"
                    onClick={submitRating}
                    disabled={ratingSubmitting}
                  >
                    {ratingSubmitting ? t("Saving...") : t("Submit rating")}
                  </button>
                </div>
                {ratingThanks && (
                  <div className="muted" style={{ marginTop: 8, fontSize: 13, color: "#059669", fontWeight: 600 }}>
                    {t("Thanks for your review!")}
                  </div>
                )}
              </>
            ) : (
              <div className="muted" style={{ fontSize: 13 }}>
                {isTenant && tenantVerified
                  ? t("Complete your exit before rating this room.")
                  : t("Log in as tenant to leave a rating.")}
              </div>
            )}
          </div>

          {suggestion && suggestion.recommended > 0 ? (
            <div className="card cardPad">
              <div style={{ fontWeight: 900, fontSize: 16 }}>{t("Market Suggestion")}</div>
              <div className="muted" style={{ marginTop: 6, fontSize: 13 }}>
                {t("Recommended")}: <b style={{ color: "#111827" }}>NPR {suggestion.recommended}</b>
              </div>
              <div className="muted" style={{ marginTop: 6, fontSize: 13 }}>
                {t("Range")}: NPR {suggestion.low} – {suggestion.high}
              </div>
              <div style={{ marginTop: 8, display: "flex", gap: 8, flexWrap: "wrap" }}>
                <span className="badge">{(suggestion.confidence || "low").toUpperCase()}</span>
                <span className="badge">{t("Based on")} {suggestion.basedOn}</span>
              </div>
            </div>
          ) : null}

          <div className="card cardPad">
            <div style={{ fontWeight: 900, fontSize: 16 }}>{t("Owner")}</div>
            <div className="muted" style={{ marginTop: 6, fontSize: 13 }}>
              {room.owner?.fullName || t("Owner")} • {room.owner?.phone || t("Phone hidden")}
            </div>
            <div className="row" style={{ marginTop: 8, gap: 8, flexWrap: "wrap" }}>
              {room.owner?.responseStats?.fastResponder ? (
                <span className="badge badgeFast">⚡ {t("Fast Responder")}</span>
              ) : null}
              {(room.owner?.responseStats?.count || 0) > 0 ? (
                <span className="badge">
                  {t("Avg Response Time")}: {formatResponseMinutes(room.owner?.responseStats?.avgMinutes)}
                </span>
              ) : null}
              {(room.owner?.responseStats?.count || 0) > 0 ? (
                <span className="badge">{t("Responses")}: {room.owner?.responseStats?.count}</span>
              ) : null}
            </div>

            <div className="spacer" />

            {!token ? (
              <div>
                <div className="muted" style={{ fontSize: 13 }}>
                  {t("Login as tenant to send request.")}
                </div>
                <div className="spacer" />
                <button className="btn" onClick={() => navigate("/login")}>{t("Login")}</button>
              </div>
            ) : !isTenant ? (
              <div className="muted" style={{ fontSize: 13 }}>
                {t("Only tenants can send requests.")}
              </div>
            ) : !tenantVerified ? (
              <div className="muted" style={{ fontSize: 13 }}>
                {t("Complete KYC to send requests or offers.")}{" "}
                <Link to="/tenant/kyc" style={{ fontWeight: 900, color: "#111827" }}>
                  {t("Go to KYC")}
                </Link>
              </div>
            ) : (
              <div className="row" style={{ justifyContent: "flex-end", flexWrap: "wrap" }}>
                <div className="row">
                  <button
                    className="btn btnOutline"
                    onClick={() => {
                      setOfferedRent(String(room?.monthlyRent || ""));
                      setOpenOffer(true);
                    }}
                    disabled={!tenantVerified}
                  >
                    {t("Make Offer")}
                  </button>
                  <button className="btn btnOutline" onClick={() => setOpenVisit(true)}>
                    {t("Schedule Visit")}
                  </button>
                  <button className="btn" onClick={() => setOpen(true)}>{t("Send Request")}</button>
                </div>
              </div>
            )}
          </div>

          {showMap && room.geo?.lat && room.geo?.lng ? (
            <div className="card cardPad">
              <div style={{ fontWeight: 900, fontSize: 16 }}>{t("Location on Map")}</div>
              <div className="muted" style={{ marginTop: 6, fontSize: 13 }}>
                {t("This is the pin added by the owner.")}
              </div>
              <div className="spacer" />
              <div className="mapCard">
                <MapContainer
                  center={[room.geo.lat, room.geo.lng]}
                  zoom={16}
                  className="mapContainer"
                  scrollWheelZoom={false}
                  zoomControl={false}
                >
                  <MapFocus
                    center={[room.geo.lat, room.geo.lng]}
                    selected={selectedNearby}
                    points={nearbyPoints}
                  />
                  <TileLayer
                    attribution='&copy; OpenStreetMap contributors'
                    url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                  />
                  <Marker position={[room.geo.lat, room.geo.lng]} />
                  {nearbyPoints.map((p, idx) => (
                    <Marker key={`${p.name}-${idx}`} position={[p.lat, p.lng]} />
                  ))}
                  <MapZoomControls />
                </MapContainer>
              </div>
              {nearbyPoints.length > 0 ? (
                <div className="spacer" />
              ) : null}
              <div className="row" style={{ justifyContent: "flex-end", gap: 8 }}>
                <button className="pill" onClick={() => setSelectedNearby(null)} disabled={!nearbyPoints.length}>
                  {t("Show All Pins")}
                </button>
                <button
                  className="pill"
                  onClick={() =>
                    setSelectedNearby({
                      name: room.title || t("Room location"),
                      lat: room.geo.lat,
                      lng: room.geo.lng,
                    })
                  }
                >
                  {t("Pin room location")}
                </button>
              </div>
            </div>
          ) : null}

          <div className="card cardPad">
            <div style={{ fontWeight: 900, fontSize: 16 }}>{t("Nearby Places")}</div>
            <div className="muted" style={{ marginTop: 6, fontSize: 13 }}>
              {t("Hospitals, colleges and bus stops near this location.")}
            </div>
            <div className="spacer" />
            {nearbyLoading ? (
              <div className="muted" style={{ fontSize: 13 }}>{t("Loading nearby places…")}</div>
            ) : !nearby ? (
              <div className="muted" style={{ fontSize: 13 }}>{t("No nearby data.")}</div>
            ) : (
              <div style={{ display: "grid", gap: 10 }}>
                <NearbyList title={t("Hospitals")} items={nearby.hospitals} onPin={setSelectedNearby} />
                <NearbyList title={t("Colleges")} items={nearby.colleges} onPin={setSelectedNearby} />
                <NearbyList title={t("Bus Stops")} items={nearby.busStops} onPin={setSelectedNearby} />
                <NearbyList title={t("Markets")} items={nearby.markets} onPin={setSelectedNearby} />
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Request Modal */}
      <Modal
        open={open}
        title={t("Send Request")}
        subtitle={t("Write a message to the owner. They will review and can create agreement.")}
        onClose={() => setOpen(false)}
      >
        <label className="muted" style={{ fontSize: 13 }}>{t("Message")}</label>
        <textarea
          className="input"
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          placeholder={t("Example: I want to rent from next month...")}
          style={{ minHeight: 120, paddingTop: 12 }}
        />

        <div className="spacer" />
        <div className="row" style={{ justifyContent: "flex-end" }}>
          <button className="btn btnOutline" onClick={() => setOpen(false)}>{t("Cancel")}</button>
          <button className="btn" onClick={submitRequest} disabled={sending}>
            {sending ? t("Sending...") : t("Send")}
          </button>
        </div>
      </Modal>

      <Modal
        open={openOffer}
        title={t("Make an Offer")}
        subtitle={t("Offer your preferred rent price.")}
        onClose={() => setOpenOffer(false)}
      >
        <div className="muted" style={{ fontSize: 13 }}>{t("Offered Rent (NPR)")}</div>
        <input className="input" value={offeredRent} onChange={(e) => setOfferedRent(e.target.value)} />

        <div className="spacer" />
        <div className="muted" style={{ fontSize: 13 }}>{t("Message")}</div>
        <textarea
          className="input"
          value={offerMessage}
          onChange={(e) => setOfferMessage(e.target.value)}
          style={{ minHeight: 100, paddingTop: 12 }}
        />

        <div className="spacer" />
        <div className="row" style={{ justifyContent: "flex-end" }}>
          <button className="btn btnOutline" onClick={() => setOpenOffer(false)}>{t("Cancel")}</button>
          <button className="btn" onClick={sendOffer} disabled={sendingOffer}>
            {sendingOffer ? t("Sending...") : t("Send Offer")}
          </button>
        </div>
      </Modal>

      <Modal
        open={openVisit}
        title={t("Schedule Visit")}
        subtitle={t("Select date & time for the visit.")}
        onClose={() => setOpenVisit(false)}
      >
        <div className="muted" style={{ fontSize: 13 }}>{t("Visit time")}</div>
        <input
          type="datetime-local"
          className="input"
          value={visitAt}
          onChange={(e) => setVisitAt(e.target.value)}
          min={minVisitAt}
        />

        <div className="spacer" />
        <div className="muted" style={{ fontSize: 13 }}>{t("Visit note (optional)")}</div>
        <textarea
          className="input"
          value={visitNote}
          onChange={(e) => setVisitNote(e.target.value)}
          placeholder={t("e.g. I can visit after 5 PM")}
          style={{ minHeight: 90, paddingTop: 12 }}
        />

        <div className="spacer" />
        <div className="row" style={{ justifyContent: "flex-end" }}>
          <button className="btn btnOutline" onClick={() => setOpenVisit(false)}>{t("Cancel")}</button>
          <button className="btn" onClick={submitVisit} disabled={sendingVisit}>
            {sendingVisit ? t("Saving...") : t("Schedule")}
          </button>
        </div>
      </Modal>

      {/* Image Viewer */}
      {viewerOpen && photos.length ? (
        <div className="modalBg" onMouseDown={() => setViewerOpen(false)}>
          <div className="modal" onMouseDown={(e) => e.stopPropagation()} style={{ maxWidth: 900 }}>
            <div className="row" style={{ justifyContent: "space-between" }}>
              <div style={{ fontWeight: 900 }}>{t("Room Photo")}</div>
              <button className="pill" onClick={() => setViewerOpen(false)} style={{ padding: "4px 10px" }}>
                ✕
              </button>
            </div>
            <div className="spacer" />
            <div className="card" style={{ borderRadius: 16, overflow: "hidden", boxShadow: "none" }}>
              <img src={photos[activeImg]} alt="room" style={{ width: "100%", display: "block" }} />
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function MapFocus({ center, selected, points }) {
  const map = useMap();

  useEffect(() => {
    if (selected?.lat && selected?.lng) {
      map.setView([selected.lat, selected.lng], 17);
      return;
    }

    if (points && points.length) {
      const latLngs = points.map((p) => [p.lat, p.lng]);
      latLngs.push(center);
      map.fitBounds(latLngs, { padding: [20, 20] });
    } else {
      map.setView(center, 16);
    }
  }, [map, center, selected, points]);

  return null;
}

function MapZoomControls() {
  const map = useMap();
  return (
    <div className="mapZoomControls">
      <button type="button" onClick={() => map.zoomIn()} aria-label="Zoom in">
        +
      </button>
      <button type="button" onClick={() => map.zoomOut()} aria-label="Zoom out">
        −
      </button>
    </div>
  );
}
