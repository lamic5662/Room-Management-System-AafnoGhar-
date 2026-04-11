import { useEffect, useMemo, useState } from "react";
import http from "../api/http";
import { useI18n } from "../context/I18nContext";

const toDate = (v) => {
  if (!v) return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
};

const addDays = (d, n) => {
  const next = new Date(d);
  next.setDate(next.getDate() + n);
  return next;
};

const daysInMonth = (d) => new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
const toInputDate = (v) => {
  if (!v) return "";
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return "";
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
};

export default function DailyRent() {
  const { t } = useI18n();
  const [monthlyRent, setMonthlyRent] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [agreements, setAgreements] = useState([]);
  const [agreementId, setAgreementId] = useState("");
  const [showExact, setShowExact] = useState(false);

  const user = useMemo(() => {
    try {
      return JSON.parse(localStorage.getItem("user") || "null");
    } catch {
      return null;
    }
  }, []);

  useEffect(() => {
    if (!user?.role) return;
    const load = async () => {
      try {
        const url = user.role === "owner" ? "/api/agreements/my" : "/api/agreements/my-tenant";
        const res = await http.get(url);
        setAgreements(res.data?.agreements || []);
      } catch {
        // ignore
      }
    };
    load();
  }, [user?.role]);

  const calc = useMemo(() => {
    const rentNum = Number(monthlyRent);
    const start = toDate(startDate);
    const end = toDate(endDate);
    if (!Number.isFinite(rentNum) || rentNum <= 0 || !start || !end || end < start) {
      return {
        valid: false,
        total: 0,
        days: 0,
        avgPerDay: 0,
        byMonth: [],
      };
    }

    let total = 0;
    let days = 0;
    const byMonthMap = new Map();
    for (let d = new Date(start); d <= end; d = addDays(d, 1)) {
      const perDay = rentNum / daysInMonth(d);
      total += perDay;
      days += 1;
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      byMonthMap.set(key, (byMonthMap.get(key) || 0) + perDay);
    }

    const byMonth = Array.from(byMonthMap.entries()).map(([month, amt]) => ({
      month,
      amount: Number(amt.toFixed(2)),
      rounded: Math.ceil(amt),
    }));

    const avgPerDay = Number((total / days).toFixed(2));
    return {
      valid: true,
      total: Number(total.toFixed(2)),
      days,
      avgPerDay,
      totalRounded: Math.ceil(total),
      avgPerDayRounded: Math.ceil(avgPerDay),
      byMonth,
    };
  }, [monthlyRent, startDate, endDate]);

  return (
    <div>
      <div className="row" style={{ justifyContent: "space-between", flexWrap: "wrap" }}>
        <div>
          <h1 className="h1">{t("Daily Rent Calculator")}</h1>
          <p className="muted" style={{ marginTop: 6 }}>
            {t("Calculate rent day-by-day based on monthly rent.")}
          </p>
        </div>
      </div>

      <div className="spacer" />

      <div className="card cardPad">
        {agreements.length > 0 && (
          <>
            <label className="muted" style={{ fontSize: 13 }}>{t("Use agreement (optional)")}</label>
            <select
              className="input"
              value={agreementId}
              onChange={(e) => {
                const nextId = e.target.value;
                setAgreementId(nextId);
                const selected = agreements.find((a) => a._id === nextId);
                if (selected) {
                  const rentVal = selected.monthlyRent ?? selected.room?.monthlyRent ?? "";
                  setMonthlyRent(String(rentVal || ""));
                  setStartDate(toInputDate(selected.startDate));
                  setEndDate(toInputDate(new Date()));
                }
              }}
            >
              <option value="">{t("Select agreement")}</option>
              {agreements.map((a) => (
                <option key={a._id} value={a._id}>
                  {(a.room?.title || t("Room"))} — NPR {a.monthlyRent ?? a.room?.monthlyRent ?? "-"}
                </option>
              ))}
            </select>
            <div className="spacer" />
          </>
        )}

        <div className="row" style={{ flexWrap: "wrap", gap: 12 }}>
          <div style={{ flex: 1, minWidth: 220 }}>
            <label className="muted" style={{ fontSize: 13 }}>{t("Monthly rent (NPR)")}</label>
            <input
              className="input"
              value={monthlyRent}
              onChange={(e) => setMonthlyRent(e.target.value)}
              placeholder="12000"
            />
          </div>
          <div style={{ flex: 1, minWidth: 220 }}>
            <label className="muted" style={{ fontSize: 13 }}>{t("Start date")}</label>
            <input
              className="input"
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
            />
          </div>
          <div style={{ flex: 1, minWidth: 220 }}>
            <div className="row" style={{ justifyContent: "space-between", alignItems: "center" }}>
              <label className="muted" style={{ fontSize: 13 }}>{t("End date")}</label>
              <button
                type="button"
                className="pill"
                onClick={() => setEndDate(toInputDate(new Date()))}
                style={{ padding: "4px 10px" }}
              >
                {t("Today")}
              </button>
            </div>
            <input
              className="input"
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
            />
          </div>
        </div>

        <div className="spacer" />

        {!calc.valid ? (
          <div className="muted" style={{ fontSize: 13 }}>
            {t("Enter monthly rent and a valid date range to calculate.")}
          </div>
        ) : (
          <>
            <div className="row" style={{ justifyContent: "space-between", flexWrap: "wrap" }}>
              <div>
                <div className="muted" style={{ fontSize: 13 }}>{t("Days")}</div>
                <div style={{ fontWeight: 1000, fontSize: 20 }}>{calc.days}</div>
              </div>
              <div>
                <div className="muted" style={{ fontSize: 13 }}>{t("Average per-day")}</div>
                <div style={{ fontWeight: 1000, fontSize: 20 }}>NPR {calc.avgPerDayRounded}</div>
              </div>
              <div>
                <div className="muted" style={{ fontSize: 13 }}>{t("Total")}</div>
                <div style={{ fontWeight: 1000, fontSize: 22 }}>NPR {calc.totalRounded}</div>
              </div>
            </div>
            <div className="row" style={{ justifyContent: "flex-end", marginTop: 6 }}>
              <button
                type="button"
                className={"pill " + (showExact ? "" : "muted")}
                onClick={() => setShowExact((v) => !v)}
              >
                {showExact ? t("Hide exact") : t("Show exact")}
              </button>
            </div>
            {showExact && (
              <div className="muted" style={{ marginTop: 6, fontSize: 13 }}>
                {t("Exact per-day")}: NPR {calc.avgPerDay} • {t("Exact total")}: NPR {calc.total}
              </div>
            )}

            {calc.byMonth.length > 1 && (
              <>
                <div className="spacer" />
                <div className="muted" style={{ fontSize: 13, marginBottom: 6 }}>
                  {t("Monthly breakdown")}
                </div>
                <div className="gridCards">
                  {calc.byMonth.map((m) => (
                    <div key={m.month} className="card cardPad" style={{ boxShadow: "none" }}>
                      <div style={{ fontWeight: 900 }}>{m.month}</div>
                      <div className="muted" style={{ marginTop: 6 }}>
                        NPR {m.rounded}
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}
