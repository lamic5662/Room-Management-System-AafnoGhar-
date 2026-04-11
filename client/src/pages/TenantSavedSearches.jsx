import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import http from "../api/http";
import Spinner from "../components/Spinner";
import Modal from "../components/Modal";
import { useToast } from "../context/ToastContext";
import { useI18n } from "../context/I18nContext";

export default function TenantSavedSearches() {
  const { t } = useI18n();
  const { showToast } = useToast();
  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState([]);
  const [editOpen, setEditOpen] = useState(false);
  const [editId, setEditId] = useState("");
  const [editName, setEditName] = useState("");
  const [editSearch, setEditSearch] = useState("");
  const [editMinRent, setEditMinRent] = useState("");
  const [editMaxRent, setEditMaxRent] = useState("");
  const [editSort, setEditSort] = useState("rating");
  const [editRoomType, setEditRoomType] = useState("");
  const [editWifi, setEditWifi] = useState(false);
  const [editParking, setEditParking] = useState(false);
  const [editWaterSupply, setEditWaterSupply] = useState(false);
  const [editElectricityBackup, setEditElectricityBackup] = useState(false);
  const [editKitchen, setEditKitchen] = useState(false);
  const [editFurnished, setEditFurnished] = useState(false);
  const [savingEdit, setSavingEdit] = useState(false);

  const load = async () => {
    try {
      setLoading(true);
      const res = await http.get("/api/saved-searches");
      setItems(res.data.searches || []);
    } catch (e) {
      showToast("error", e?.response?.data?.message || t("Failed to load saved searches"));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const buildRoomsUrl = (s) => {
    const params = new URLSearchParams();
    if (String(s.search || "").trim()) params.set("search", String(s.search).trim());
    if (s.minRent !== null && s.minRent !== undefined && s.minRent !== "") params.set("minRent", String(s.minRent));
    if (s.maxRent !== null && s.maxRent !== undefined && s.maxRent !== "") params.set("maxRent", String(s.maxRent));
    if (s.sort) params.set("sort", s.sort);
    if (s.roomType) params.set("roomType", s.roomType);
    if (s.facilities?.wifi) params.set("wifi", "true");
    if (s.facilities?.parking) params.set("parking", "true");
    if (s.facilities?.waterSupply) params.set("waterSupply", "true");
    if (s.facilities?.electricityBackup) params.set("electricityBackup", "true");
    if (s.facilities?.kitchen) params.set("kitchen", "true");
    if (s.facilities?.furnished) params.set("furnished", "true");
    const qs = params.toString();
    return qs ? `/rooms?${qs}` : "/rooms";
  };

  const deleteSavedSearch = async (id) => {
    if (!confirm(t("Delete this saved search?"))) return;
    try {
      await http.delete(`/api/saved-searches/${id}`);
      setItems((prev) => prev.filter((s) => s._id !== id));
      showToast("success", t("Saved search deleted"));
    } catch (e) {
      showToast("error", e?.response?.data?.message || t("Failed to delete saved search"));
    }
  };

  const openEdit = (s) => {
    setEditId(s._id);
    setEditName(s.name || "");
    setEditSearch(s.search || "");
    setEditMinRent(s.minRent ?? "");
    setEditMaxRent(s.maxRent ?? "");
    setEditSort(s.sort || "rating");
    setEditRoomType(s.roomType || "");
    setEditWifi(!!s.facilities?.wifi);
    setEditParking(!!s.facilities?.parking);
    setEditWaterSupply(!!s.facilities?.waterSupply);
    setEditElectricityBackup(!!s.facilities?.electricityBackup);
    setEditKitchen(!!s.facilities?.kitchen);
    setEditFurnished(!!s.facilities?.furnished);
    setEditOpen(true);
  };

  const saveEditedSearch = async () => {
    if (!editId || savingEdit) return;
    try {
      setSavingEdit(true);
      const res = await http.patch(`/api/saved-searches/${editId}`, {
        search: editSearch,
        minRent: editMinRent,
        maxRent: editMaxRent,
        sort: editSort,
        roomType: editRoomType,
        facilities: {
          wifi: editWifi,
          parking: editParking,
          waterSupply: editWaterSupply,
          electricityBackup: editElectricityBackup,
          kitchen: editKitchen,
          furnished: editFurnished,
        },
      });
      setItems((prev) => prev.map((s) => (s._id === editId ? res.data.search : s)));
      showToast("success", t("Saved search updated"));
      setEditOpen(false);
      setEditId("");
      setEditName("");
    } catch (e) {
      showToast("error", e?.response?.data?.message || t("Failed to update saved search"));
    } finally {
      setSavingEdit(false);
    }
  };

  const formatRent = (s) => {
    const min = s.minRent ?? "";
    const max = s.maxRent ?? "";
    if (min && max) return `${t("Min Rent")}: ${min} • ${t("Max Rent")}: ${max}`;
    if (min) return `${t("Min Rent")}: ${min}`;
    if (max) return `${t("Max Rent")}: ${max}`;
    return "";
  };

  const facilityLabels = (s) => {
    const list = [];
    if (s.facilities?.wifi) list.push(t("WiFi"));
    if (s.facilities?.parking) list.push(t("Parking"));
    if (s.facilities?.waterSupply) list.push(t("Water Supply"));
    if (s.facilities?.electricityBackup) list.push(t("Electricity Backup"));
    if (s.facilities?.kitchen) list.push(t("Kitchen"));
    if (s.facilities?.furnished) list.push(t("Furnished"));
    return list;
  };

  const cards = useMemo(() => items || [], [items]);

  if (loading) return <Spinner text={t("Loading...")} />;

  return (
    <div>
      <div className="row" style={{ justifyContent: "space-between", flexWrap: "wrap" }}>
        <div>
          <h1 className="h1">{t("Saved searches")}</h1>
          <p className="muted" style={{ marginTop: 6 }}>
            {t("Manage saved searches and open them in Rooms.")}
          </p>
        </div>
        <div className="row" style={{ gap: 10 }}>
          <Link className="btn btnOutline" to="/rooms">{t("Create from Rooms")}</Link>
          <button className="btn btnOutline" onClick={load}>{t("Refresh")}</button>
        </div>
      </div>

      <div className="spacer" />

      {cards.length === 0 ? (
        <div className="muted">{t("No saved searches yet.")}</div>
      ) : (
        <div className="gridCards">
          {cards.map((s) => {
            const facilities = facilityLabels(s);
            const rentText = formatRent(s);
            return (
              <div className="card cardPad" key={s._id}>
                <div className="row" style={{ justifyContent: "space-between", flexWrap: "wrap" }}>
                  <div>
                    <div style={{ fontWeight: 900 }}>{s.name || t("Saved search")}</div>
                    <div className="muted" style={{ marginTop: 4 }}>
                      {t("Created")}: {new Date(s.createdAt || Date.now()).toLocaleDateString()}
                    </div>
                    {s.lastMatchedAt && (
                      <div className="muted" style={{ marginTop: 4 }}>
                        {t("Last matched")}: {new Date(s.lastMatchedAt).toLocaleDateString()}
                      </div>
                    )}
                  </div>
                  <div className="row" style={{ gap: 8 }}>
                    <Link className="btn btnOutline btnSm" to={buildRoomsUrl(s)}>{t("Open in Rooms")}</Link>
                    <button className="btn btnOutline btnSm" onClick={() => openEdit(s)}>
                      {t("Edit")}
                    </button>
                    <button className="btn btnOutline btnSm" onClick={() => deleteSavedSearch(s._id)}>
                      {t("Delete")}
                    </button>
                  </div>
                </div>

                <div className="spacer" />

                <div className="row" style={{ flexWrap: "wrap" }}>
                  {s.search ? <span className="pill">{t("Search")}: {s.search}</span> : null}
                  {rentText ? <span className="pill">{rentText}</span> : null}
                  {s.roomType ? <span className="pill">{t("Room Type")}: {s.roomType}</span> : null}
                </div>

                {facilities.length > 0 && (
                  <div className="row" style={{ flexWrap: "wrap", marginTop: 10 }}>
                    {facilities.map((label) => (
                      <span className="pill pillInfo" key={label}>{label}</span>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      <Modal open={editOpen} onClose={() => setEditOpen(false)} title={t("Edit saved search")}>
        <div className="col">
          <label className="label">{t("Saved search")}</label>
          <div className="muted" style={{ fontWeight: 700 }}>{editName || t("Saved search")}</div>
          <div className="spacer" />
          <label className="label">{t("Search")}</label>
          <input
            className="input"
            placeholder={t("Location or title...")}
            value={editSearch}
            onChange={(e) => setEditSearch(e.target.value)}
          />

          <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(140px, 1fr))", gap: 10, marginTop: 12 }}>
            <div>
              <label className="label">{t("Min Rent")}</label>
              <input className="input" value={editMinRent} onChange={(e) => setEditMinRent(e.target.value)} />
            </div>
            <div>
              <label className="label">{t("Max Rent")}</label>
              <input className="input" value={editMaxRent} onChange={(e) => setEditMaxRent(e.target.value)} />
            </div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(140px, 1fr))", gap: 10, marginTop: 12 }}>
            <div>
              <label className="label">{t("Sort")}</label>
              <select className="input" value={editSort} onChange={(e) => setEditSort(e.target.value)}>
                <option value="rating">{t("Top rated")}</option>
                <option value="newest">{t("Newest")}</option>
                <option value="price_asc">{t("Price: Low → High")}</option>
                <option value="price_desc">{t("Price: High → Low")}</option>
              </select>
            </div>
            <div>
              <label className="label">{t("Room Type")}</label>
              <select className="input" value={editRoomType} onChange={(e) => setEditRoomType(e.target.value)}>
                <option value="">{t("Any")}</option>
                <option value="Single">{t("Single")}</option>
                <option value="Studio">{t("Studio")}</option>
                <option value="1BHK">1BHK</option>
                <option value="2BHK">2BHK</option>
                <option value="3BHK">3BHK</option>
                <option value="Other">{t("Single + Attached Bathroom")}</option>
              </select>
            </div>
          </div>

          <div className="spacer" />
          <div className="label">{t("Facilities")}</div>
          <div className="row" style={{ flexWrap: "wrap", gap: 10, marginTop: 8 }}>
            <label className="pill" style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <input type="checkbox" checked={editWifi} onChange={(e) => setEditWifi(e.target.checked)} />
              {t("WiFi")}
            </label>
            <label className="pill" style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <input type="checkbox" checked={editParking} onChange={(e) => setEditParking(e.target.checked)} />
              {t("Parking")}
            </label>
            <label className="pill" style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <input type="checkbox" checked={editWaterSupply} onChange={(e) => setEditWaterSupply(e.target.checked)} />
              {t("Water Supply")}
            </label>
            <label className="pill" style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <input type="checkbox" checked={editElectricityBackup} onChange={(e) => setEditElectricityBackup(e.target.checked)} />
              {t("Electricity Backup")}
            </label>
            <label className="pill" style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <input type="checkbox" checked={editKitchen} onChange={(e) => setEditKitchen(e.target.checked)} />
              {t("Kitchen")}
            </label>
            <label className="pill" style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <input type="checkbox" checked={editFurnished} onChange={(e) => setEditFurnished(e.target.checked)} />
              {t("Furnished")}
            </label>
          </div>
          <div className="row" style={{ marginTop: 12, justifyContent: "flex-end" }}>
            <button className="btn btnOutline" onClick={() => setEditOpen(false)}>
              {t("Cancel")}
            </button>
            <button className="btn" onClick={saveEditedSearch} disabled={savingEdit}>
              {savingEdit ? t("Saving...") : t("Save")}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
