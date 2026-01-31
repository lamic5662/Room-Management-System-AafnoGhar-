const API =
  import.meta.env.VITE_API_URL ||
  `http://${window.location.hostname}:5001`;

export function getPhotoUrl(p) {
  if (!p) return "";
  if (p.startsWith("http")) return p;
  const idx = p.indexOf("/uploads/");
  if (idx !== -1) return `${API}${p.slice(idx)}`;
  if (p.startsWith("uploads/")) return `${API}/${p}`;
  if (p.startsWith("/uploads/")) return `${API}${p}`;
  return `${API}/${p.replace(/^\/+/, "")}`;
}
