import User from "../models/User.js";

const MIN_FAST_RESPONDER_COUNT = 3;
const FAST_RESPONDER_AVG_MINUTES = 120;

const parseEnvInt = (key, fallback) => {
  const raw = process.env[key];
  if (raw === undefined || raw === null || raw === "") return fallback;
  const num = Number(raw);
  return Number.isFinite(num) && num > 0 ? Math.round(num) : fallback;
};

export const getResponseThresholds = () => ({
  minCount: parseEnvInt("RESPONSE_FAST_MIN_COUNT", MIN_FAST_RESPONDER_COUNT),
  maxAvgMinutes: parseEnvInt("RESPONSE_FAST_MAX_AVG_MINUTES", FAST_RESPONDER_AVG_MINUTES),
});

export const recordOwnerResponse = async ({ ownerId, createdAt, respondedAt = new Date() }) => {
  if (!ownerId || !createdAt) return null;

  const created = new Date(createdAt);
  if (Number.isNaN(created.getTime())) return null;
  const responded = new Date(respondedAt);
  if (Number.isNaN(responded.getTime())) return null;

  const minutes = Math.max(0, Math.round((responded - created) / 60000));

  const owner = await User.findById(ownerId).select("responseStats");
  if (!owner) return null;

  const stats = owner.responseStats || {};
  const count = Number(stats.count || 0);
  const avg = Number(stats.avgMinutes || 0);
  const nextCount = count + 1;
  const nextAvg = count === 0 ? minutes : Math.round(((avg * count) + minutes) / nextCount);

  const { minCount, maxAvgMinutes } = getResponseThresholds();

  owner.responseStats = {
    count: nextCount,
    avgMinutes: nextAvg,
    lastResponseAt: responded,
    fastResponder: nextCount >= minCount && nextAvg <= maxAvgMinutes,
  };
  await owner.save();
  return owner.responseStats;
};
