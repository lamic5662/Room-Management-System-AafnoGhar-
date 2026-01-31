import Room from "../models/Room.js";

function normalizeLocation(s = "") {
  return String(s).toLowerCase().replace(/\s+/g, " ").trim();
}

function median(arr) {
  const a = [...arr].sort((x, y) => x - y);
  const n = a.length;
  if (!n) return 0;
  return n % 2 ? a[(n - 1) / 2] : (a[n / 2 - 1] + a[n / 2]) / 2;
}

function percentile(arr, p) {
  const a = [...arr].sort((x, y) => x - y);
  if (!a.length) return 0;
  const idx = (a.length - 1) * p;
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  if (lo === hi) return a[lo];
  return a[lo] + (a[hi] - a[lo]) * (idx - lo);
}

function amenityScore(room, wanted = {}) {
  let score = 0;
  let total = 0;

  const keys = ["wifi", "parking", "waterSupply", "kitchen", "electricityBackup", "furnished"];
  keys.forEach((k) => {
    if (wanted[k] === undefined) return;
    total += 1;
    const rv = room?.facilities ? room.facilities[k] : room[k];
    if (typeof rv === "boolean") {
      if (rv === wanted[k]) score += 1;
    } else if (Array.isArray(room.features)) {
      const has = room.features.map(String).includes(k);
      if (has === wanted[k]) score += 1;
    }
  });

  if (!total) return 0;
  return score / total;
}

function toRad(v) {
  return (v * Math.PI) / 180;
}

function distanceKm(a, b) {
  const R = 6371;
  const dLat = toRad(b.lat - a.lat);
  const dLon = toRad(b.lng - a.lng);
  const sa = Math.sin(dLat / 2) ** 2;
  const sb = Math.sin(dLon / 2) ** 2;
  const c = 2 * Math.asin(Math.min(1, Math.sqrt(sa + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * sb)));
  return R * c;
}

const suggestPrice = async (req, res) => {
  try {
    const { location = "", wanted = {}, lat, lng, roomType } = req.body || {};
    const hasCoords = Number.isFinite(Number(lat)) && Number.isFinite(Number(lng));

    if (!hasCoords && (!location || String(location).trim().length < 3)) {
      return res.status(400).json({ message: "location is required" });
    }

    const loc = normalizeLocation(location);

    let rooms = await Room.find({ isPublished: true, monthlyRent: { $gt: 0 } })
      .select("monthlyRent location facilities features geo")
      .limit(800);

    if (!rooms.length) {
      rooms = await Room.find({ monthlyRent: { $gt: 0 } })
        .select("monthlyRent location facilities features geo")
        .limit(800);
    }

    let candidates = [];

    if (hasCoords) {
      const origin = { lat: Number(lat), lng: Number(lng) };
      candidates = rooms.filter((r) => {
        const g = r.geo;
        if (!g || !Number.isFinite(Number(g.lat)) || !Number.isFinite(Number(g.lng))) return false;
        return distanceKm(origin, { lat: Number(g.lat), lng: Number(g.lng) }) <= 5;
      });
    }

    if (candidates.length < 8 && loc) {
      const byLoc = rooms.filter((r) => {
        const rl = normalizeLocation(r.location || "");
        if (!rl) return false;
        if (rl.includes(loc) || loc.includes(rl)) return true;
        const a = new Set(loc.split(" "));
        const b = new Set(rl.split(" "));
        let overlap = 0;
        a.forEach((w) => {
          if (b.has(w)) overlap += 1;
        });
        return overlap >= 1;
      });
      candidates = byLoc.length ? byLoc : candidates;
    }

    const pool = candidates.length >= 8 ? candidates : rooms;

    const ranked = pool
      .map((r) => ({ r, s: amenityScore(r, wanted) }))
      .sort((x, y) => y.s - x.s)
      .slice(0, 60)
      .map((x) => x.r);

    const rents = ranked.map((r) => Number(r.monthlyRent)).filter((n) => Number.isFinite(n) && n > 0);

    if (rents.length < 3) {
      const cityDefaults = {
        kathmandu: 15000,
        lalitpur: 14000,
        bhaktapur: 12000,
        pokhara: 13000,
        biratnagar: 10000,
        birgunj: 10000,
        butwal: 10000,
        chitwan: 11000,
        nepalgunj: 9500,
        dharan: 9500,
        hetauda: 9500,
      };

      const cityFromCoords = () => {
        if (!hasCoords) return "";
        const latNum = Number(lat);
        const lngNum = Number(lng);

        const cities = [
          { key: "kathmandu", lat: 27.7172, lng: 85.3240 },
          { key: "lalitpur", lat: 27.6644, lng: 85.3188 },
          { key: "bhaktapur", lat: 27.6710, lng: 85.4298 },
          { key: "pokhara", lat: 28.2096, lng: 83.9856 },
          { key: "biratnagar", lat: 26.4525, lng: 87.2718 },
          { key: "birgunj", lat: 27.0120, lng: 84.8800 },
          { key: "butwal", lat: 27.7000, lng: 83.4480 },
          { key: "chitwan", lat: 27.6900, lng: 84.4300 },
          { key: "nepalgunj", lat: 28.0500, lng: 81.6200 },
          { key: "dharan", lat: 26.8070, lng: 87.2840 },
          { key: "hetauda", lat: 27.4280, lng: 85.0320 },
        ];

        let best = { key: "", d: Infinity };
        for (const c of cities) {
          const d = distanceKm({ lat: latNum, lng: lngNum }, { lat: c.lat, lng: c.lng });
          if (d < best.d) best = { key: c.key, d };
        }

        // If far from all known cities, fall back to location text
        if (best.d > 35) return "";
        return best.key;
      };

      const cityFromLocation = () => {
        const raw = String(location || "").toLowerCase();
        const lastPart = raw.split(",").pop()?.trim() || "";
        const parts = [raw, lastPart].filter(Boolean);
        for (const p of parts) {
          const key = Object.keys(cityDefaults).find((k) => p.includes(k));
          if (key) return key;
        }
        return "";
      };

      const cityKey = cityFromCoords() || cityFromLocation() || "kathmandu";
      const baseCity = cityDefaults[cityKey] || 12000;

      const typeKey = String(roomType || "").toLowerCase();
      const typeRanges = {
        single: { low: 5000, high: 7000 },
        studio: { low: 9000, high: 11000 },
        "1bhk": { low: 12000, high: 15000 },
        "2bhk": { low: 16000, high: 20000 },
        "3bhk": { low: 21000, high: 25000 },
        other: { low: 7000, high: 9000 },
      };

      const range = typeRanges[typeKey] || null;
      let base = range ? Math.round((range.low + range.high) / 2) : baseCity;

      const w = wanted || {};
      let low;
      let high;
      if (range) {
        low = range.low;
        high = range.high;
      } else {
        low = Math.max(0, Math.round(base * 0.85));
        high = Math.round(base * 1.15);
      }

      return res.json({
        recommended: Math.round(base),
        low,
        high,
        confidence: "low",
        basedOn: rents.length,
        baselineCity: cityKey,
        message: "Limited data; using city baseline. Add more listings for better accuracy.",
      });
    }

    const med = median(rents);
    const q1 = percentile(rents, 0.25);
    const q3 = percentile(rents, 0.75);
    const iqr = Math.max(1000, q3 - q1);

    const low = Math.max(0, Math.round(med - iqr / 2));
    const high = Math.round(med + iqr / 2);

    let confidence = "low";
    if (rents.length >= 30) confidence = "high";
    else if (rents.length >= 12) confidence = "medium";

    return res.json({
      recommended: Math.round(med),
      low,
      high,
      confidence,
      basedOn: rents.length,
    });
  } catch (err) {
    console.error("suggestPrice error:", err.message);
    return res.status(500).json({ message: "Server error" });
  }
};

export { suggestPrice };
