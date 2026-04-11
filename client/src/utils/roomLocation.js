export function formatRoomLocation(location, geo) {
  const text = (location || "").trim();
  if (text) return text;
  if (geo?.lat && geo?.lng) {
    return `Lat ${geo.lat.toFixed(4)}, Lng ${geo.lng.toFixed(4)}`;
  }
  return "";
}
