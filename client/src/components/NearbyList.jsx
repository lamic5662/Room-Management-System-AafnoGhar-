import React from "react";

export default function NearbyList({ title, items, onPin }) {
  if (!items || items.length === 0) {
    return (
      <div className="muted" style={{ fontSize: 13 }}>
        {title}: not found
      </div>
    );
  }

  return (
    <div>
      <div style={{ fontWeight: 900, fontSize: 13 }}>{title}</div>
      <div style={{ display: "grid", gap: 6 }}>
        {items.slice(0, 6).map((i, idx) => {
          const canPin = Number.isFinite(i.lat) && Number.isFinite(i.lng);
          return (
            <div key={`${i.name}-${idx}`} className="muted" style={{ fontSize: 13, lineHeight: 1.6 }}>
              <span>
                {i.name}
                {i.distance ? ` • ${i.distance}m` : ""}
              </span>
              {onPin ? (
                <button
                  type="button"
                  className={"pill " + (canPin ? "" : "muted")}
                  onClick={() => canPin && onPin({ name: i.name, lat: i.lat, lng: i.lng })}
                  style={{ marginLeft: 8, padding: "2px 8px" }}
                  disabled={!canPin}
                  title={canPin ? "Pin on map" : "No coordinates"}
                >
                  📍
                </button>
              ) : null}
            </div>
          );
        })}
      </div>
    </div>
  );
}
