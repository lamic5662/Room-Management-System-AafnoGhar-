import { useEffect, useState } from "react";
import http from "../api/http";
import Spinner from "../components/Spinner";
import Modal from "../components/Modal";
import { useToast } from "../context/ToastContext";
import { useI18n } from "../context/I18nContext";

export default function TenantOffers() {
  const { showToast } = useToast();
  const { t } = useI18n();
  const [loading, setLoading] = useState(true);
  const [offers, setOffers] = useState([]);
  const [openCounter, setOpenCounter] = useState(false);
  const [selected, setSelected] = useState(null);
  const [counterRent, setCounterRent] = useState("");
  const [counterMessage, setCounterMessage] = useState("Can you do this price?");
  const [busy, setBusy] = useState("");

  const load = async () => {
    try {
      setLoading(true);
      const res = await http.get("/api/offers/my");
      setOffers(res.data.offers || []);
    } catch (e) {
      showToast("error", e?.response?.data?.message || t("Failed to load offers"));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const openCounterModal = (o) => {
    setSelected(o);
    setCounterRent(String(o.offeredRent || ""));
    setCounterMessage("Can you do this price?");
    setOpenCounter(true);
  };

  const sendCounter = async () => {
    if (!counterRent) return showToast("error", t("Enter rent"));
    try {
      setBusy("counter");
      const res = await http.patch(`/api/offers/${selected._id}/tenant-counter`, {
        offeredRent: Number(counterRent),
        message: counterMessage,
      });
      showToast("success", res.data.message || t("Counter sent ✅"));
      setOpenCounter(false);
      load();
    } catch (e) {
      showToast("error", e?.response?.data?.message || t("Counter failed"));
    } finally {
      setBusy("");
    }
  };

  const acceptCounter = async (id) => {
    try {
      setBusy(id + "a");
      const res = await http.patch(`/api/offers/${id}/tenant-accept`);
      showToast("success", res.data.message || t("Counter accepted ✅"));
      load();
    } catch (e) {
      showToast("error", e?.response?.data?.message || t("Accept failed"));
    } finally {
      setBusy("");
    }
  };

  const rejectCounter = async (id) => {
    try {
      setBusy(id + "r");
      const res = await http.patch(`/api/offers/${id}/tenant-reject`);
      showToast("success", res.data.message || t("Counter rejected ✅"));
      load();
    } catch (e) {
      showToast("error", e?.response?.data?.message || t("Reject failed"));
    } finally {
      setBusy("");
    }
  };

  const statusBadge = (s) => {
    const t = (s || "").toUpperCase();
    return <span className="badge">{t}</span>;
  };

  if (loading) return <Spinner text={t("Loading your offers...")} />;

  return (
    <div>
      <div className="row" style={{ justifyContent: "space-between", flexWrap: "wrap" }}>
        <div>
          <h1 className="h1">{t("My Offers")}</h1>
          <p className="muted" style={{ marginTop: 6 }}>{t("Track offer status and owner replies.")}</p>
        </div>
        <button className="btn btnOutline" onClick={load}>{t("Refresh")}</button>
      </div>

      <div className="spacer" />

      {offers.length === 0 ? (
        <div className="card cardPad">{t("No offers yet.")}</div>
      ) : (
        <div className="gridCards">
          {offers.map((o) => (
            <div key={o._id} className="card cardPad">
              <div className="row" style={{ justifyContent: "space-between", alignItems: "flex-start" }}>
                <div>
                  <div style={{ fontWeight: 1000 }}>{o.room?.title || t("Room")}</div>
                  <div className="muted" style={{ marginTop: 4 }}>{o.room?.location}</div>
                </div>
                {statusBadge(o.status)}
              </div>

              <div className="spacer" />
              <div className="muted" style={{ fontSize: 13, lineHeight: 1.7 }}>
                {t("Listed rent")}: <b style={{ color: "#111827" }}>NPR {o.room?.monthlyRent ?? "-"}</b><br/>
                {t("Your offer")}: <b style={{ color: "#111827" }}>NPR {o.offeredRent}</b>
              </div>

              {o.status === "countered" ? (
                <div className="muted" style={{ marginTop: 10, fontSize: 13 }}>
                  {t("Owner counter")}: <b style={{ color: "#111827" }}>NPR {o.ownerCounterRent}</b>
                </div>
              ) : null}

              {o.ownerReply ? (
                <div className="muted" style={{ marginTop: 10, fontSize: 13 }}>
                  <b style={{ color: "#111827" }}>{t("Owner reply")}:</b> {o.ownerReply}
                </div>
              ) : null}

              {o.message ? (
                <div className="muted" style={{ marginTop: 10, fontSize: 13 }}>
                  <b style={{ color: "#111827" }}>{t("Your message")}:</b> {o.message}
                </div>
              ) : null}

              {o.agreement ? (
                <div className="muted" style={{ marginTop: 10, fontSize: 13 }}>
                  {t("Agreement")}: <b style={{ color: "#111827" }}>{t("Created")}</b>
                </div>
              ) : null}

              <div className="spacer" />
              <div className="muted" style={{ fontSize: 13 }}>
                {t("Sent")}: {new Date(o.createdAt).toLocaleString()}
              </div>

              {o.status === "countered" ? (
                <>
                  <div className="spacer" />
                  <div className="row" style={{ justifyContent: "flex-end", flexWrap: "wrap" }}>
                    <button
                      className="btn btnOutline"
                      onClick={() => openCounterModal(o)}
                      disabled={busy}
                    >
                      {t("Counter")}
                    </button>
                    <button
                      className="btn btnOutline"
                      onClick={() => rejectCounter(o._id)}
                      disabled={busy === o._id + "r"}
                    >
                      {busy === o._id + "r" ? t("Rejecting...") : t("Reject")}
                    </button>
                    <button
                      className="btn"
                      onClick={() => acceptCounter(o._id)}
                      disabled={busy === o._id + "a"}
                    >
                      {busy === o._id + "a" ? t("Accepting...") : t("Accept")}
                    </button>
                  </div>
                </>
              ) : null}
            </div>
          ))}
        </div>
      )}

      <Modal
        open={openCounter}
        title={t("Counter Offer")}
        subtitle={t("Send a new price to the owner.")}
        onClose={() => setOpenCounter(false)}
      >
        <div className="muted" style={{ fontSize: 13 }}>{t("Your counter rent (NPR)")}</div>
        <input className="input" value={counterRent} onChange={(e) => setCounterRent(e.target.value)} />

        <div className="spacer" />
        <div className="muted" style={{ fontSize: 13 }}>{t("Message")}</div>
        <textarea
          className="input"
          value={counterMessage}
          onChange={(e) => setCounterMessage(e.target.value)}
          style={{ minHeight: 100, paddingTop: 12 }}
        />

        <div className="spacer" />
        <div className="row" style={{ justifyContent: "flex-end" }}>
          <button className="btn btnOutline" onClick={() => setOpenCounter(false)}>{t("Cancel")}</button>
          <button className="btn" onClick={sendCounter} disabled={busy === "counter"}>
            {busy === "counter" ? t("Sending...") : t("Send Counter")}
          </button>
        </div>
      </Modal>
    </div>
  );
}
