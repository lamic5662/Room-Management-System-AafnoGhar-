import axios from "axios";

const haversineMeters = (lat1, lon1, lat2, lon2) => {
  const toRad = (v) => (v * Math.PI) / 180;
  const R = 6371e3;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
};

const reverseGeocode = async (req, res) => {
  try {
    const { lat, lng } = req.query;
    const latNum = Number(lat);
    const lngNum = Number(lng);
    if (!Number.isFinite(latNum) || !Number.isFinite(lngNum)) {
      return res.status(400).json({ message: "Invalid lat/lng" });
    }

    const url = "https://nominatim.openstreetmap.org/reverse";
    const resp = await axios.get(url, {
      params: { format: "jsonv2", lat: latNum, lon: lngNum },
      headers: { "User-Agent": "AafnoGhar/1.0 (support@aafnoghar.local)" },
      timeout: 12000,
    });

    const data = resp.data || {};
    const locationText = data.display_name || "";
    res.json({ locationText, address: data.address || {} });
  } catch (e) {
    res.status(500).json({ message: "Server error" });
  }
};

const forwardGeocode = async (req, res) => {
  try {
    const { q } = req.query;
    const query = String(q || "").trim();
    if (query.length < 3) {
      return res.status(400).json({ message: "Query too short" });
    }

    const url = "https://nominatim.openstreetmap.org/search";
    const resp = await axios.get(url, {
      params: { format: "jsonv2", q: query, limit: 1 },
      headers: { "User-Agent": "AafnoGhar/1.0 (support@aafnoghar.local)" },
      timeout: 12000,
    });

    const item = (resp.data || [])[0];
    if (!item) return res.json({ found: false });

    return res.json({
      found: true,
      lat: Number(item.lat),
      lng: Number(item.lon),
      display_name: item.display_name,
    });
  } catch (e) {
    return res.status(500).json({ message: "Server error" });
  }
};

const nearbyByCoords = async (req, res) => {
  try {
    const { lat, lng, radius } = req.query;
    const latNum = Number(lat);
    const lngNum = Number(lng);
    if (!Number.isFinite(latNum) || !Number.isFinite(lngNum)) {
      return res.status(400).json({ message: "Invalid lat/lng" });
    }

    const rad = Number(radius || 1200);
    const query = `
[out:json];
(
  node(around:${rad},${latNum},${lngNum})["amenity"="hospital"];
  node(around:${rad},${latNum},${lngNum})["amenity"="college"];
  node(around:${rad},${latNum},${lngNum})["amenity"="university"];
  node(around:${rad},${latNum},${lngNum})["highway"="bus_stop"];
  node(around:${rad},${latNum},${lngNum})["public_transport"="platform"];
  node(around:${rad},${latNum},${lngNum})["amenity"="marketplace"];
  node(around:${rad},${latNum},${lngNum})["shop"="supermarket"];
);
out tags center 60;
`;

    const resp = await axios.post("https://overpass-api.de/api/interpreter", query, {
      headers: {
        "Content-Type": "text/plain",
        "User-Agent": "AafnoGhar/1.0 (support@aafnoghar.local)",
      },
      timeout: 12000,
    });

    const elements = resp.data?.elements || [];
    const hospitals = [];
    const colleges = [];
    const busStops = [];
    const markets = [];

    for (const el of elements) {
      const name = el.tags?.name || "Unnamed";
      const lat2 = el.lat ?? el.center?.lat;
      const lng2 = el.lon ?? el.center?.lon;
      const dist = (lat2 && lng2) ? Math.round(haversineMeters(latNum, lngNum, lat2, lng2)) : null;

      const payload = { name, distance: dist, lat: lat2, lng: lng2 };
      if (el.tags?.amenity === "hospital") hospitals.push(payload);
      else if (el.tags?.amenity === "college" || el.tags?.amenity === "university") colleges.push(payload);
      else if (el.tags?.highway === "bus_stop" || el.tags?.public_transport === "platform") busStops.push(payload);
      else if (el.tags?.amenity === "marketplace" || el.tags?.shop === "supermarket") markets.push(payload);
    }

    return res.json({
      hospitals: hospitals.slice(0, 6),
      colleges: colleges.slice(0, 6),
      busStops: busStops.slice(0, 6),
      markets: markets.slice(0, 6),
    });
  } catch (e) {
    return res.json({
      hospitals: [],
      colleges: [],
      busStops: [],
      markets: [],
      message: "Nearby lookup failed",
    });
  }
};

export { reverseGeocode, forwardGeocode, nearbyByCoords };
