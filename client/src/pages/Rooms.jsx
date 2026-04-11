import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import http from "../api/http";
import Spinner from "../components/Spinner";
import Modal from "../components/Modal";
import { useToast } from "../context/ToastContext";
import { getPhotoUrl } from "../utils/photo";
import { useI18n } from "../context/I18nContext";
import { formatRoomLocation } from "../utils/roomLocation";

export default function Rooms() {
  const { showToast } = useToast();
  const { t } = useI18n();
  const [sp] = useSearchParams();
  const [loading, setLoading] = useState(true);
  const [rooms, setRooms] = useState([]);
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  const [total, setTotal] = useState(0);
  const limit = 12;
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [userPos, setUserPos] = useState(null);
  const user = useMemo(() => JSON.parse(localStorage.getItem("user") || "null"), []);
  const isTenant = user?.role === "tenant";
  const [showAllRooms, setShowAllRooms] = useState(false);
  const [showAllLatest, setShowAllLatest] = useState(false);
  const [showAllNearest, setShowAllNearest] = useState(false);
  const skipSearchEffect = useRef(true);
  const skipSortEffect = useRef(true);
  const [suggestions, setSuggestions] = useState([]);
  const [suggestOpen, setSuggestOpen] = useState(false);
  const suggestWrapRef = useRef(null);

  const [search, setSearch] = useState("");
  const [minRent, setMinRent] = useState("");
  const [maxRent, setMaxRent] = useState("");
  const [sort, setSort] = useState("rating");
  const [roomType, setRoomType] = useState("");

  const [wifi, setWifi] = useState(false);
  const [parking, setParking] = useState(false);
  const [waterSupply, setWaterSupply] = useState(false);
  const [electricityBackup, setElectricityBackup] = useState(false);
  const [kitchen, setKitchen] = useState(false);
  const [furnished, setFurnished] = useState(false);
  const [saveOpen, setSaveOpen] = useState(false);
  const [saveName, setSaveName] = useState("");
  const [savingSearch, setSavingSearch] = useState(false);

  const calcKm = (lat1, lon1, lat2, lon2) => {
    const toRad = (v) => (v * Math.PI) / 180;
    const R = 6371;
    const dLat = toRad(lat2 - lat1);
    const dLon = toRad(lon2 - lon1);
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
      Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  };

  const buildQuery = (override = {}) => {
    const s = override.search ?? search;
    const min = override.minRent ?? minRent;
    const max = override.maxRent ?? maxRent;
    const so = override.sort ?? sort;
    const rt = override.roomType ?? roomType;
    const w = override.wifi ?? wifi;
    const p = override.parking ?? parking;
    const ws = override.waterSupply ?? waterSupply;
    const eb = override.electricityBackup ?? electricityBackup;
    const k = override.kitchen ?? kitchen;
    const f = override.furnished ?? furnished;
    const pg = override.page ?? page;

    const params = new URLSearchParams();
    if (String(s || "").trim()) params.set("search", String(s).trim());
    if (min) params.set("minRent", min);
    if (max) params.set("maxRent", max);
    if (so) params.set("sort", so);
    if (rt) params.set("roomType", rt);
    if (w) params.set("wifi", "true");
    if (p) params.set("parking", "true");
    if (ws) params.set("waterSupply", "true");
    if (eb) params.set("electricityBackup", "true");
    if (k) params.set("kitchen", "true");
    if (f) params.set("furnished", "true");
    if (pg) params.set("page", pg);
    params.set("limit", String(limit));
    return params.toString();
  };

  const query = useMemo(
    () =>
      buildQuery({
        search,
        minRent,
        maxRent,
        sort,
        roomType,
        wifi,
        parking,
        waterSupply,
        electricityBackup,
        kitchen,
        furnished,
      }),
    [search, minRent, maxRent, sort, roomType, wifi, parking, waterSupply, electricityBackup, kitchen, furnished]
  );

  const load = async (q = query) => {
    try {
      setLoading(true);
      const res = await http.get(`/api/rooms${q ? `?${q}` : ""}`);
      setRooms(res.data.rooms || []);
      setTotal(res.data.total ?? res.data.count ?? 0);
      setPages(res.data.pages || 1);
      setPage(res.data.page || 1);
    } catch (e) {
      showToast("error", e?.response?.data?.message || "Failed to load rooms");
    } finally {
      setLoading(false);
    }
  };


  useEffect(() => {
    const s = sp.get("search") || "";
    const min = sp.get("minRent");
    const max = sp.get("maxRent");
    const so = sp.get("sort") || "rating";
    const rt = sp.get("roomType") || "";
    const w = sp.get("wifi") === "true";
    const p = sp.get("parking") === "true";
    const ws = sp.get("waterSupply") === "true";
    const eb = sp.get("electricityBackup") === "true";
    const k = sp.get("kitchen") === "true";
    const f = sp.get("furnished") === "true";

    skipSearchEffect.current = true;
    skipSortEffect.current = true;
    setSearch(s);
    setMinRent(min === null ? "" : String(min));
    setMaxRent(max === null ? "" : String(max));
    setSort(so || "rating");
    setRoomType(rt);
    setWifi(w);
    setParking(p);
    setWaterSupply(ws);
    setElectricityBackup(eb);
    setKitchen(k);
    setFurnished(f);
    setPage(1);
    setShowAllRooms(false);
    setShowAllLatest(false);
    setShowAllNearest(false);
    const q = buildQuery({
      search: s,
      minRent: min ?? "",
      maxRent: max ?? "",
      sort: so || "rating",
      roomType: rt,
      wifi: w,
      parking: p,
      waterSupply: ws,
      electricityBackup: eb,
      kitchen: k,
      furnished: f,
      page: 1,
    });
    setTimeout(() => load(q), 0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
    if (skipSearchEffect.current) {
      skipSearchEffect.current = false;
      return;
    }
    const id = setTimeout(() => {
      setPage(1);
      load(buildQuery({ page: 1 }));
    }, 400);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);

  useEffect(() => {
    if (skipSortEffect.current) {
      skipSortEffect.current = false;
      return;
    }
    setPage(1);
    load(buildQuery({ page: 1, sort, roomType }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sort, roomType]);

  useEffect(() => {
    const onClick = (e) => {
      if (!suggestWrapRef.current) return;
      if (!suggestWrapRef.current.contains(e.target)) {
        setSuggestOpen(false);
      }
    };
    window.addEventListener("click", onClick);
    return () => window.removeEventListener("click", onClick);
  }, []);

  useEffect(() => {
    const q = search.trim();
    if (q.length < 2) {
      setSuggestions([]);
      setSuggestOpen(false);
      return;
    }
    const id = setTimeout(async () => {
      try {
        const res = await http.get(`/api/rooms?search=${encodeURIComponent(q)}&page=1&limit=6&sort=newest`);
        const list = res.data.rooms || [];
        setSuggestions(list);
        setSuggestOpen(true);
      } catch {
        setSuggestions([]);
        setSuggestOpen(false);
      }
    }, 250);
    return () => clearTimeout(id);
  }, [search]);

  const viewRooms = useMemo(() => rooms, [rooms]);

  const latestRoomsAll = useMemo(() => {
    return [...rooms].sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
  }, [rooms]);

  const nearestRoomsAll = useMemo(() => {
    if (!isTenant || !userPos) return [];
    const withDistance = rooms.map((r) => {
      const lat = r.geo?.lat;
      const lng = r.geo?.lng;
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) return { r, d: Infinity };
      const d = calcKm(userPos.lat, userPos.lng, Number(lat), Number(lng));
      return { r, d };
    });
    withDistance.sort((a, b) => a.d - b.d);
    return withDistance.filter((x) => x.d <= 5).map((x) => x.r);
  }, [rooms, isTenant, userPos]);

  const allRoomsDisplay = showAllRooms ? viewRooms : viewRooms.slice(0, 6);
  const latestRoomsDisplay = showAllLatest ? latestRoomsAll : latestRoomsAll.slice(0, 6);
  const nearestRoomsDisplay = showAllNearest ? nearestRoomsAll : nearestRoomsAll.slice(0, 6);

  const apply = () => {
    setPage(1);
    load(buildQuery({ page: 1 }));
  };

  const reset = () => {
    setSearch("");
    setMinRent("");
    setMaxRent("");
    setSort("rating");
    setRoomType("");
    setWifi(false);
    setParking(false);
    setWaterSupply(false);
    setElectricityBackup(false);
    setKitchen(false);
    setFurnished(false);
    setPage(1);
    const emptyQuery = buildQuery({
      search: "",
      minRent: "",
      maxRent: "",
      sort: "rating",
      roomType: "",
      wifi: false,
      parking: false,
      waterSupply: false,
      electricityBackup: false,
      kitchen: false,
      furnished: false,
      page: 1,
    });
    load(emptyQuery);
  };

  const buildSavedPayload = () => ({
    name: saveName.trim(),
    search,
    minRent,
    maxRent,
    roomType,
    sort,
    facilities: {
      wifi,
      parking,
      waterSupply,
      electricityBackup,
      kitchen,
      furnished,
    },
  });

  const saveSearch = async () => {
    if (!isTenant || savingSearch) return;
    try {
      setSavingSearch(true);
      await http.post("/api/saved-searches", buildSavedPayload());
      showToast("success", t("Saved search created ✅"));
      setSaveOpen(false);
      setSaveName("");
    } catch (e) {
      showToast("error", e?.response?.data?.message || t("Failed to save search"));
    } finally {
      setSavingSearch(false);
    }
  };

  return (
    <div className="roomsWrap">
      <div className="roomsHeader">
        <div>
          <div className="roomsEyebrow">{t("Rooms")}</div>
          <h1 className="roomsTitle">{t("Find rooms in Nepal with filters.")}</h1>
        </div>
        <div className="roomsHeaderRight">
          <div className="roomsCount">
            <span className="roomsCountNum">{total}</span>
            <span className="roomsCountLabel">{t("Rooms")}</span>
          </div>
          <button className="btn btnOutline" onClick={load}>{t("Refresh")}</button>
        </div>
      </div>

      <div className="filtersPanel">
        <div className="filtersTopBar">
          <div className="searchPill wide suggestWrap" ref={suggestWrapRef}>
            <span className="searchIcon" aria-hidden="true">⌕</span>
            <input
              className="heroInput"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onFocus={() => suggestions.length && setSuggestOpen(true)}
              placeholder={t("Location or title...")}
            />
            {suggestOpen && suggestions.length > 0 && (
              <div className="searchSuggest">
                {suggestions.map((r) => (
                  <button
                    key={r._id}
                    type="button"
                    className="searchSuggestItem"
                    onMouseDown={(e) => {
                      e.preventDefault();
                      setSearch(r.title || "");
                      setSuggestOpen(false);
                      setSuggestions([]);
                      setPage(1);
                      load(buildQuery({ search: r.title || "", page: 1 }));
                    }}
                  >
                    <div className="searchSuggestTitle">{r.title}</div>
                    <div className="searchSuggestMeta">{r.location}</div>
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="filtersSelects">
            <select className="input filterSelect" value={sort} onChange={(e) => setSort(e.target.value)}>
              <option value="rating">{t("Top rated")}</option>
              <option value="newest">{t("Newest")}</option>
              <option value="price_asc">{t("Price: Low → High")}</option>
              <option value="price_desc">{t("Price: High → Low")}</option>
            </select>
            <select className="input filterSelect" value={roomType} onChange={(e) => setRoomType(e.target.value)}>
              <option value="">{t("Any")}</option>
              <option value="Single">{t("Single")}</option>
              <option value="Studio">{t("Studio")}</option>
              <option value="1BHK">1BHK</option>
              <option value="2BHK">2BHK</option>
              <option value="3BHK">3BHK</option>
              <option value="Other">{t("Single + Attached Bathroom")}</option>
            </select>
          </div>

          <button className="filterFab" onClick={() => setFiltersOpen((v) => !v)}>
            <span aria-hidden="true">⚙️</span>
          </button>
        </div>

        {filtersOpen && (
          <div className="filtersDrawer">
            <div className="filtersGrid">
              <div>
                <div className="filtersLabel">{t("Min Rent")}</div>
                <input className="input" value={minRent} onChange={(e) => setMinRent(e.target.value)} placeholder="5000" />
              </div>
              <div>
                <div className="filtersLabel">{t("Max Rent")}</div>
                <input className="input" value={maxRent} onChange={(e) => setMaxRent(e.target.value)} placeholder="20000" />
              </div>
            </div>

            <div className="amenityChips">
              <Check label={t("WiFi")} value={wifi} setValue={setWifi} />
              <Check label={t("Parking")} value={parking} setValue={setParking} />
              <Check label={t("Water")} value={waterSupply} setValue={setWaterSupply} />
              <Check label={t("Backup")} value={electricityBackup} setValue={setElectricityBackup} />
              <Check label={t("Kitchen")} value={kitchen} setValue={setKitchen} />
              <Check label={t("Furnished")} value={furnished} setValue={setFurnished} />
            </div>

            <div className="filtersActions">
              <button className="btn btnOutline" onClick={reset}>{t("Reset")}</button>
              {isTenant ? (
                <button className="btn btnOutline" onClick={() => setSaveOpen(true)}>
                  {t("Save search")}
                </button>
              ) : null}
              <button className="btn" onClick={apply}>{t("Apply")}</button>
            </div>
          </div>
        )}
      </div>

      <div className="spacer" />

      {loading ? (
        <Spinner text={t("Loading rooms...")} />
      ) : viewRooms.length === 0 ? (
        <div className="card cardPad">{t("No rooms found. Try changing filters.")}</div>
      ) : (
        <>
          <div className="featuredWrap roomsSection">
            <div className="featuredHeader row" style={{ justifyContent: "space-between", alignItems: "center", flexWrap: "wrap" }}>
              <h2 className="h3">{t("All Rooms")}</h2>
              <div className="row" style={{ gap: 10, alignItems: "center" }}>
                <div className="muted">{t("Showing filtered results")}</div>
                {viewRooms.length > 6 && (
                  <button
                    type="button"
                    className="btn btnOutline btnSm"
                    onClick={() => setShowAllRooms((v) => !v)}
                  >
                    {showAllRooms ? t("Show less") : t("Show all")}
                  </button>
                )}
              </div>
            </div>
            <div className="spacer" />
            <div className={`featuredGrid roomsGrid ${showAllRooms ? "roomsGridExpanded" : ""}`}>
              {allRoomsDisplay.map((r) => (
                <RoomCard
                  key={r._id}
                  room={r}
                  userPos={userPos}
                  calcKm={calcKm}
                  t={t}
                />
              ))}
            </div>
          </div>

          <div className="spacer" />
          <div className="featuredWrap roomsSection">
            <div className="featuredHeader row" style={{ justifyContent: "space-between", alignItems: "center", flexWrap: "wrap" }}>
              <h2 className="h3">{t("Latest Rooms")}</h2>
              <div className="row" style={{ gap: 10, alignItems: "center" }}>
                <div className="muted">{t("Recently added listings")}</div>
                {latestRoomsAll.length > 6 && (
                  <button
                    type="button"
                    className="btn btnOutline btnSm"
                    onClick={() => setShowAllLatest((v) => !v)}
                  >
                    {showAllLatest ? t("Show less") : t("Show all")}
                  </button>
                )}
              </div>
            </div>
            <div className="spacer" />
            {latestRoomsAll.length === 0 ? (
              <div className="card cardPad">{t("No recent rooms yet.")}</div>
            ) : (
              <div className={`featuredGrid roomsGrid ${showAllLatest ? "roomsGridExpanded" : ""}`}>
                {latestRoomsDisplay.map((r) => (
                  <RoomCard
                    key={`${r._id}-latest`}
                    room={r}
                    userPos={userPos}
                    calcKm={calcKm}
                    t={t}
                  />
                ))}
              </div>
            )}
          </div>

          <div className="spacer" />
          <div className="featuredWrap roomsSection">
            <div className="featuredHeader row" style={{ justifyContent: "space-between", alignItems: "center", flexWrap: "wrap" }}>
              <h2 className="h3">{t("Shortest Distance")}</h2>
              <div className="row" style={{ gap: 10, alignItems: "center" }}>
                <div className="muted">{t("Nearby rooms based on your location")}</div>
                {nearestRoomsAll.length > 6 && (
                  <button
                    type="button"
                    className="btn btnOutline btnSm"
                    onClick={() => setShowAllNearest((v) => !v)}
                  >
                    {showAllNearest ? t("Show less") : t("Show all")}
                  </button>
                )}
              </div>
            </div>
            <div className="spacer" />
            {!isTenant || !userPos ? (
              <div className="card cardPad">{t("Enable location to see nearby rooms.")}</div>
            ) : nearestRoomsAll.length === 0 ? (
              <div className="card cardPad">{t("No nearby rooms found.")}</div>
            ) : (
              <div className={`featuredGrid roomsGrid ${showAllNearest ? "roomsGridExpanded" : ""}`}>
                {nearestRoomsDisplay.map((r) => (
                  <RoomCard
                    key={`${r._id}-near`}
                    room={r}
                    userPos={userPos}
                    calcKm={calcKm}
                    t={t}
                  />
                ))}
              </div>
            )}
          </div>
        </>
      )}

      {pages > 1 && (
        <div className="pagination">
          <button
            className="btn btnOutline"
            onClick={() => load(buildQuery({ page: Math.max(1, page - 1) }))}
            disabled={page <= 1}
          >
            {t("Previous")}
          </button>
          <div className="muted">
            {page} / {pages}
          </div>
          <button
            className="btn"
            onClick={() => load(buildQuery({ page: Math.min(pages, page + 1) }))}
            disabled={page >= pages}
          >
            {t("Next")}
          </button>
        </div>
      )}

      <Modal
        open={saveOpen}
        title={t("Save search")}
        subtitle={t("Save current filters and get alerts for new rooms.")}
        onClose={() => setSaveOpen(false)}
      >
        <label className="muted" style={{ fontSize: 13 }}>{t("Search name (optional)")}</label>
        <input
          className="input"
          value={saveName}
          onChange={(e) => setSaveName(e.target.value)}
          placeholder={t("e.g. Budget 1BHK near city")}
        />
        <div className="spacer" />
        <div className="row" style={{ justifyContent: "flex-end" }}>
          <button className="btn btnOutline" onClick={() => setSaveOpen(false)}>{t("Cancel")}</button>
          <button className="btn" onClick={saveSearch} disabled={savingSearch}>
            {savingSearch ? t("Saving...") : t("Save search")}
          </button>
        </div>
      </Modal>
    </div>
  );
}

function Check({ label, value, setValue }) {
  return (
    <button
      type="button"
      className={"pill " + (value ? "" : "muted")}
      onClick={() => setValue(!value)}
      style={{ fontWeight: 900 }}
    >
      {value ? "✓ " : ""}{label}
    </button>
  );
}

function RoomCard({ room, userPos, calcKm, t }) {
  const img = room.photos?.[0] ? getPhotoUrl(room.photos[0]) : "";
  const isVerified = room.isVerifiedOwner ?? (room.owner?.kyc?.status === "approved");
  const isFastResponder = room.isFastResponder ?? (room.owner?.responseStats?.fastResponder);
  const responseCount = room.owner?.responseStats?.count ?? 0;
  const responseAvg = room.owner?.responseStats?.avgMinutes ?? 0;

  const formatResponseMinutes = (mins) => {
    if (!Number.isFinite(mins) || mins <= 0) return null;
    if (mins < 60) return `${mins} ${t("min")}`;
    const hours = Math.floor(mins / 60);
    const remaining = mins % 60;
    if (remaining === 0) return `${hours} ${t("hr")}`;
    return `${hours} ${t("hr")} ${remaining} ${t("min")}`;
  };
  const responseText = formatResponseMinutes(responseAvg);

  return (
    <Link to={`/rooms/${room._id}`} className="roomCard card">
      <div className="roomImgWrap">
        {img ? (
          <img src={img} alt="room" className="roomImg" />
        ) : (
          <div className="roomImgEmpty">{t("No Photo")}</div>
        )}
        {isVerified ? <div className="vBadge">✓ {t("Verified")}</div> : null}
        <div className="roomPrice">NPR {room.monthlyRent}/mo</div>
      </div>

      <div className="roomBody">
        <div className="roomTitle">{room.title}</div>
        <div className="muted roomLoc">
          <span aria-hidden="true">📍</span>{" "}
          {formatRoomLocation(room.location, room.geo) || t("Location not provided")}
        </div>
        {userPos && room.geo?.lat && room.geo?.lng ? (
          <div className="muted roomLoc" style={{ marginTop: 4 }}>
            <span aria-hidden="true">🧭</span> {t("Distance")}: {calcKm(userPos.lat, userPos.lng, room.geo.lat, room.geo.lng).toFixed(1)} km
          </div>
        ) : null}

        <div className="row" style={{ justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12 }}>
          <div className="roomBadges">
            {isFastResponder ? <span className="badge badgeFast">⚡ {t("Fast Responder")}</span> : null}
            {responseText ? (
              <span className="badge">{t("Avg Response Time")}: {responseText}</span>
            ) : null}
            {responseCount > 0 ? <span className="badge">{t("Responses")}: {responseCount}</span> : null}
            {room.roomType && <span className="badge">{room.roomType}</span>}
            {room.facilities?.wifi && <span className="badge">{t("WiFi")}</span>}
            {room.facilities?.parking && <span className="badge">{t("Parking")}</span>}
            {room.facilities?.waterSupply && <span className="badge">{t("Water")}</span>}
            {room.facilities?.electricityBackup && <span className="badge">{t("Backup")}</span>}
            {room.facilities?.kitchen && <span className="badge">{t("Kitchen")}</span>}
            {room.facilities?.furnished && <span className="badge">{t("Furnished")}</span>}
          </div>
          <div className="roomCardRating">
            <span className="roomCardRatingValue">{room.ratingAvg ? room.ratingAvg.toFixed(1) : "0.0"}</span>
            <div className="ratingStarsSmall">
              {[1, 2, 3, 4, 5].map((value) => (
                <span
                  key={`room-rating-${room._id}-${value}`}
                  style={{ color: value <= Math.round(room.ratingAvg || 0) ? "#fcd34d" : "#e5e7eb" }}
                >
                  ★
                </span>
              ))}
            </div>
          </div>
        </div>
      </div>
    </Link>
  );
}
