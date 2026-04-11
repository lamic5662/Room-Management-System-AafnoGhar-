export const nearbyKeys = ["hospitals", "colleges", "busStops", "markets"];

export function hasNearbyEntries(data) {
  if (!data) return false;
  return nearbyKeys.some((key) => Array.isArray(data[key]) && data[key].length > 0);
}
