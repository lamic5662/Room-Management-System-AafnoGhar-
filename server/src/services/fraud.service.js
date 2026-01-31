import Room from "../models/Room.js";
import User from "../models/User.js";

async function evaluateRoomFraud(room) {
  const flags = [];
  let score = 0;

  const rent = Number(room.monthlyRent || 0);
  const photos = room.photos?.length || 0;

  if (photos === 0) { flags.push("no_photos"); score += 25; }
  if (!room.location || room.location.trim().length < 3) { flags.push("missing_location"); score += 15; }

  if (rent > 0 && rent < 3000) { flags.push("very_low_price"); score += 25; }
  if (rent > 200000) { flags.push("very_high_price"); score += 25; }

  const owner = await User.findById(room.owner).select("createdAt kyc");
  if (owner) {
    const ageDays = (Date.now() - new Date(owner.createdAt).getTime()) / (1000 * 60 * 60 * 24);
    if (ageDays < 7) { flags.push("new_account"); score += 10; }
    if (owner.kyc?.status !== "approved") { flags.push("owner_not_verified"); score += 10; }
  }

  const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const count24h = await Room.countDocuments({ owner: room.owner, createdAt: { $gte: since } });
  if (count24h > 5) { flags.push("too_many_posts_today"); score += 20; }

  if (room.title) {
    const sameTitleCount = await Room.countDocuments({ owner: room.owner, title: room.title });
    if (sameTitleCount > 2) { flags.push("repeated_title"); score += 10; }

    const title = String(room.title);
    const words = title.toLowerCase().match(/[a-z]+/g) || [];
    if (words.length) {
      const vowelWords = words.filter((w) => /[aeiou]/.test(w));
      const randomWords = words.filter((w) => w.length >= 4 && new Set(w).size <= 2);
      if (vowelWords.length / words.length < 0.5) {
        flags.push("title_lacks_vowels");
        score += 15;
      }
      if (randomWords.length) {
        flags.push("random_title_words");
        score += 15;
      }
    }
  }

  score = Math.min(100, score);
  const isFlagged = score >= 50;

  return { score, flags, isFlagged };
}

export { evaluateRoomFraud };
