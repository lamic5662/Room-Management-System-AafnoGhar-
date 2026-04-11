import SavedSearch from "../models/SavedSearch.js";
import { notifyUser } from "./notify.service.js";

const matchRoom = (room, search) => {
  if (!room || !search) return false;
  if (!room.isPublished) return false;

  const q = String(search.search || "").trim().toLowerCase();
  if (q) {
    const title = String(room.title || "").toLowerCase();
    const location = String(room.location || "").toLowerCase();
    if (!title.includes(q) && !location.includes(q)) return false;
  }

  const min = search.minRent !== null && search.minRent !== undefined ? Number(search.minRent) : null;
  const max = search.maxRent !== null && search.maxRent !== undefined ? Number(search.maxRent) : null;
  if (min !== null && Number.isFinite(min) && room.monthlyRent < min) return false;
  if (max !== null && Number.isFinite(max) && room.monthlyRent > max) return false;

  if (search.roomType) {
    if (search.roomType === "1BHK") {
      if (room.roomType && room.roomType !== "1BHK") return false;
    } else if (room.roomType !== search.roomType) {
      return false;
    }
  }

  const f = search.facilities || {};
  if (f.wifi && !room.facilities?.wifi) return false;
  if (f.parking && !room.facilities?.parking) return false;
  if (f.waterSupply && !room.facilities?.waterSupply) return false;
  if (f.electricityBackup && !room.facilities?.electricityBackup) return false;
  if (f.kitchen && !room.facilities?.kitchen) return false;
  if (f.furnished && !room.facilities?.furnished) return false;

  return true;
};

const notifySavedSearchMatches = async (room) => {
  if (!room?.isPublished) return;

  const searches = await SavedSearch.find({});
  if (!searches.length) return;

  const matches = searches.filter((s) => matchRoom(room, s));
  if (!matches.length) return;

  const now = new Date();
  await SavedSearch.updateMany(
    { _id: { $in: matches.map((m) => m._id) } },
    { $set: { lastMatchedAt: now } }
  );

  const notified = new Set();
  for (const s of matches) {
    const userId = String(s.user);
    if (notified.has(userId)) continue;
    await notifyUser({
      userId: s.user,
      title: "New room matches your search",
      message: `${room.title} • NPR ${room.monthlyRent}`,
      type: "saved_search",
      data: { roomId: room._id, url: `/rooms/${room._id}` },
    });
    notified.add(userId);
  }
};

export { notifySavedSearchMatches };
