import FeatureFlag from "../models/FeatureFlag.js";

const AUTO_FRAUD_FLAG_KEY = "auto_fraud_unpublish";
const FEATURE_FLAG_DEFINITIONS = {
  [AUTO_FRAUD_FLAG_KEY]: {
    description: "Automatically unpublish rooms that are flagged by fraud detection.",
    enabled: false,
  },
};

const CACHE_TTL = 30 * 1000;
const cache = new Map();

const refreshCache = (key, value) => {
  cache.set(key, { value, updatedAt: Date.now() });
};

const getCachedValue = (key) => {
  const entry = cache.get(key);
  if (!entry) return null;
  if (Date.now() - entry.updatedAt > CACHE_TTL) {
    cache.delete(key);
    return null;
  }
  return entry.value;
};

const ensureFlags = async () => {
  const keys = Object.keys(FEATURE_FLAG_DEFINITIONS);
  await Promise.all(
    keys.map((key) =>
      FeatureFlag.findOneAndUpdate(
        { key },
        {
          $setOnInsert: {
            description: FEATURE_FLAG_DEFINITIONS[key].description,
            enabled: FEATURE_FLAG_DEFINITIONS[key].enabled,
          },
        },
        { upsert: true, new: false }
      )
    )
  );
};

const getFeatureFlag = async (key) => {
  if (!FEATURE_FLAG_DEFINITIONS[key]) {
    return null;
  }
  await ensureFlags();
  const doc = await FeatureFlag.findOne({ key });
  if (!doc) return null;
  refreshCache(key, doc.enabled);
  return doc;
};

const listFeatureFlags = async () => {
  await ensureFlags();
  const keys = Object.keys(FEATURE_FLAG_DEFINITIONS);
  const docs = await FeatureFlag.find({ key: { $in: keys } });
  docs.forEach((doc) => refreshCache(doc.key, doc.enabled));
  return docs;
};

const setFeatureFlag = async (key, enabled) => {
  if (!FEATURE_FLAG_DEFINITIONS[key]) {
    throw new Error("Invalid feature flag");
  }
  const updated = await FeatureFlag.findOneAndUpdate(
    { key },
    { enabled, description: FEATURE_FLAG_DEFINITIONS[key].description },
    { new: true, upsert: true, setDefaultsOnInsert: true }
  );
  refreshCache(key, enabled);
  return updated;
};

const isFeatureEnabled = async (key) => {
  const cached = getCachedValue(key);
  if (cached !== null) return cached;
  const flag = await getFeatureFlag(key);
  return flag ? flag.enabled : FEATURE_FLAG_DEFINITIONS[key]?.enabled ?? false;
};

export {
  AUTO_FRAUD_FLAG_KEY,
  listFeatureFlags,
  setFeatureFlag,
  isFeatureEnabled,
  FEATURE_FLAG_DEFINITIONS,
};
