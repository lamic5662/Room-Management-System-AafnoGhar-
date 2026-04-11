import { useMemo, useState } from "react";

const weekdayLabels = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function toKey(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export default function VisitCalendar({ visits = [], t }) {
  const [month, setMonth] = useState(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  });
  const [selected, setSelected] = useState(() => new Date());

  const byDay = useMemo(() => {
    const map = new Map();
    for (const v of visits) {
      const d = new Date(v.scheduledAt);
      if (Number.isNaN(d.getTime())) continue;
      const key = toKey(d);
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(v);
    }
    for (const list of map.values()) {
      list.sort((a, b) => new Date(a.scheduledAt) - new Date(b.scheduledAt));
    }
    return map;
  }, [visits]);

  const days = useMemo(() => {
    const startDay = new Date(month.getFullYear(), month.getMonth(), 1).getDay();
    const first = new Date(month.getFullYear(), month.getMonth(), 1 - startDay);
    const arr = [];
    for (let i = 0; i < 42; i += 1) {
      arr.push(new Date(first.getFullYear(), first.getMonth(), first.getDate() + i));
    }
    return arr;
  }, [month]);

  const selectedKey = toKey(selected);
  const selectedVisits = byDay.get(selectedKey) || [];
  const monthLabel = month.toLocaleString(undefined, { month: "long", year: "numeric" });

  const goMonth = (delta) => {
    setMonth((m) => new Date(m.getFullYear(), m.getMonth() + delta, 1));
  };

  return (
    <div className="calendar card cardPad">
      <div className="calendarHeader row" style={{ justifyContent: "space-between", alignItems: "center" }}>
        <button className="pill" onClick={() => goMonth(-1)} aria-label="Previous month">‹</button>
        <div style={{ fontWeight: 900 }}>{monthLabel}</div>
        <button className="pill" onClick={() => goMonth(1)} aria-label="Next month">›</button>
      </div>

      <div className="calendarWeekdays">
        {weekdayLabels.map((d) => (
          <div key={d} className="calendarWeekday">{d}</div>
        ))}
      </div>

      <div className="calendarGrid">
        {days.map((d) => {
          const key = toKey(d);
          const isCurrentMonth = d.getMonth() === month.getMonth();
          const isSelected = key === selectedKey;
          const hasEvents = (byDay.get(key) || []).length > 0;
          return (
            <button
              key={key}
              className={`calendarDay${isCurrentMonth ? "" : " muted"}${isSelected ? " selected" : ""}${hasEvents ? " hasEvent" : ""}`}
              onClick={() => setSelected(d)}
              type="button"
            >
              <span>{d.getDate()}</span>
              {hasEvents ? <span className="calendarDot" aria-hidden="true" /> : null}
            </button>
          );
        })}
      </div>

      <div className="calendarList">
        <div style={{ fontWeight: 900 }}>{t("Visits on")}: {selected.toLocaleDateString()}</div>
        {selectedVisits.length === 0 ? (
          <div className="muted" style={{ marginTop: 6 }}>{t("No visits on this day.")}</div>
        ) : (
          <div style={{ display: "grid", gap: 8, marginTop: 10 }}>
            {selectedVisits.map((v) => (
              <div key={v._id} className="calendarEvent">
                <div style={{ fontWeight: 700 }}>
                  {new Date(v.scheduledAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                </div>
                <div className="muted">
                  {v.room?.title || t("Room")}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
