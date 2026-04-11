import { AUTO_FRAUD_FLAG_KEY, isFeatureEnabled } from "./featureFlag.service.js";

const applyAutoFraudPolicy = async (room, isFlagged) => {
  if (!room || typeof room !== "object") return;
  if (!isFlagged) {
    room.autoDisabledByFraud = false;
    room.autoDisabledAt = undefined;
    return;
  }

  const enabled = await isFeatureEnabled(AUTO_FRAUD_FLAG_KEY);
  if (!enabled) return;

  room.isPublished = false;
  room.autoDisabledByFraud = true;
  room.autoDisabledAt = new Date();
};

export { applyAutoFraudPolicy };
