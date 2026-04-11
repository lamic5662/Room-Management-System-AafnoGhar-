import { useEffect, useState } from "react";
import http from "../api/http";
import Spinner from "../components/Spinner";
import Modal from "../components/Modal";
import { useToast } from "../context/ToastContext";
import { useI18n } from "../context/I18nContext";

export default function OwnerOffers() {
  const { showToast } = useToast();
  const { t } = useI18n();
  const [loading, setLoading] = useState(true);
  const [offers, setOffers] = useState([]);
  const [busy, setBusy] = useState("");

  const [openCounter, setOpenCounter] = useState(false);
  const [selected, setSelected] = useState(null);
  const [counterRent, setCounterRent] = useState("");
  const [ownerReply, setOwnerReply] = useState("Can you do this price?");
  const [sendingCounter, setSendingCounter] = useState(false);
  const [showHistory, setShowHistory] = useState({});

  const load = async () => {
    try {
      setLoading(true);
      const res = await http.get("/api/offers/incoming");
      setOffers(res.data.offers || []);
    } catch (e) {
      showToast("error", e?.response?.data?.message || t("Failed to load offers"));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);
  useEffect(() => {
    setShowHistory((prev) => {
      const next = { ...prev };
      offers.forEach((o) => {
        if (o.status === "accepted" && next[o._id] === undefined) {
          next[o._id] = true;
        }
      });
      return next;
    });
  }, [offers]);

  const accept = async (id) => {
    try {
      setBusy(id + "a");
      const res = await http.patch(`/api/offers/${id}/accept`);
      showToast("success", res.data.message || t("Offer accepted ✅"));
      load();
    } catch (e) {
      showToast("error", e?.response?.data?.message || t("Accept failed"));
    } finally {
      setBusy("");
    }
  };

  const reject = async (id) => {
    try {
      setBusy(id + "r");
      const res = await http.patch(`/api/offers/${id}/reject`, { ownerReply: t("Sorry, not possible.") });
      showToast("success", res.data.message || t("Offer rejected ✅"));
      load();
    } catch (e) {
      showToast("error", e?.response?.data?.message || t("Reject failed"));
    } finally {
      setBusy("");
    }
  };

  const openCounterModal = (o) => {
    setSelected(o);
    setCounterRent(String(o.room?.monthlyRent || o.offeredRent || ""));
    setOwnerReply(t("Can you do this price?"));
    setOpenCounter(true);
  };

  const createAgreement = async (offerId) => {
    try {
      setBusy(offerId + "g");
      const res = await http.post(`/api/offers/${offerId}/create-agreement`);
      showToast("success", res.data.message || t("Agreement created ✅"));
      load();
    } catch (e) {
      showToast("error", e?.response?.data?.message || t("Failed to create agreement"));
    } finally {
      setBusy("");
    }
  };

  const counter = async () => {
    if (!counterRent) return showToast("error", t("Enter counter rent"));

    try {
      setSendingCounter(true);
      const res = await http.patch(`/api/offers/${selected._id}/counter`, {
        ownerCounterRent: Number(counterRent),
        ownerReply,
      });
      showToast("success", res.data.message || t("Counter sent ✅"));
      setOpenCounter(false);
      load();
    } catch (e) {
      showToast("error", e?.response?.data?.message || t("Counter failed"));
    } finally {
      setSendingCounter(false);
    }
  };

  if (loading) return <Spinner text={t("Loading incoming offers...")} />;

  return (
    <div>
      <div className="row" style={{ justifyContent: "space-between", flexWrap: "wrap" }}>
        <div>
          <h1 className="h1">{t("Incoming Offers")}</h1>
          <p className="muted" style={{ marginTop: 6 }}>{t("Accept, reject, or counter tenant offers.")}</p>
        </div>
        <button className="btn btnOutline" onClick={load}>{t("Refresh")}</button>
      </div>

      <div className="spacer" />

      {offers.length === 0 ? (
        <div className="card cardPad">{t("No offers yet.")}</div>
      ) : (
        <div className="gridCards">
          {offers.map((o) => {
            const canAct = o.status === "pending" || o.status === "countered";
            return (
              <div key={o._id} className="card cardPad">
                <div className="row" style={{ justifyContent: "space-between", alignItems: "flex-start" }}>
                  <div>
                    <div style={{ fontWeight: 1000 }}>{o.room?.title}</div>
                    <div className="muted" style={{ marginTop: 4 }}>{o.room?.location}</div>
                    <div className="muted" style={{ marginTop: 6, fontSize: 13 }}>
                      {t("Tenant")}: <b style={{ color: "#111827" }}>{o.tenant?.fullName}</b> • {o.tenant?.phone}
                    </div>
                  </div>
                  <span className="badge">{(o.status || "").toUpperCase()}</span>
                </div>

                <div className="spacer" />
                <div className="muted" style={{ fontSize: 13, lineHeight: 1.7 }}>
                  {t("Listed rent")}: <b style={{ color: "#111827" }}>NPR {o.room?.monthlyRent}</b><br/>
                  {o.status === "accepted" ? t("Tenant final offer") : t("Tenant offer")}:{" "}
                  <b style={{ color: "#111827" }}>NPR {o.acceptedRent || o.offeredRent}</b>
                  {o.status === "accepted" && showHistory[o._id] && (
                    <>
                      <br/>
                      {t("Original offer")}: <b style={{ color: "#111827" }}>NPR {o.offeredRent}</b>
                    </>
                  )}
                </div>
                {o.status === "accepted" && (
                  <button
                    type="button"
                    className="btn btnOutline btnSm"
                    style={{ marginTop: 8 }}
                    onClick={() => setShowHistory((prev) => ({ ...prev, [o._id]: !prev[o._id] }))}
                  >
                    {showHistory[o._id] ? t("Hide history") : t("Show history")}
                  </button>
                )}

                {o.status === "countered" ? (
                  <div className="muted" style={{ marginTop: 10, fontSize: 13 }}>
                    {t("Your counter")}: <b style={{ color: "#111827" }}>NPR {o.ownerCounterRent}</b>
                  </div>
                ) : null}
                {o.status === "accepted" && (
                  <div className="muted" style={{ marginTop: 10, fontSize: 13 }}>
                    {t("Accepted rent")}: <b style={{ color: "#111827" }}>NPR {o.acceptedRent || o.ownerCounterRent || o.offeredRent}</b>
                  </div>
                )}

                {o.message ? (
                  <div className="muted" style={{ marginTop: 10, fontSize: 13 }}>
                    <b style={{ color: "#111827" }}>{t("Message")}:</b> {o.message}
                  </div>
                ) : null}

                {o.ownerReply ? (
                  <div className="muted" style={{ marginTop: 10, fontSize: 13 }}>
                    <b style={{ color: "#111827" }}>{t("Your reply")}:</b> {o.ownerReply}
                  </div>
                ) : null}

                <div className="spacer" />

                <div className="cardActions">
                  <button
                    className="btn btnOutline"
                    onClick={() => openCounterModal(o)}
                    disabled={!canAct}
                  >
                    {t("Counter")}
                  </button>

                  <button
                    className="btn btnOutline"
                    onClick={() => reject(o._id)}
                    disabled={!canAct || busy === o._id + "r"}
                  >
                    {busy === o._id + "r" ? t("Rejecting...") : t("Reject")}
                  </button>

                  <button
                    className="btn"
                    onClick={() => accept(o._id)}
                    disabled={!canAct || busy === o._id + "a"}
                  >
                    {busy === o._id + "a" ? t("Accepting...") : t("Accept")}
                  </button>

                  {o.status === "accepted" && (
                    <button
                      className="btn"
                      onClick={() => createAgreement(o._id)}
                      disabled={busy === o._id + "g" || o.agreement}
                    >
                      {o.agreement ? t("Agreement Created") : (busy === o._id + "g" ? t("Creating...") : t("Create Agreement"))}
                    </button>
                  )}
                </div>

                <div className="spacer" />
                <div className="muted" style={{ fontSize: 13 }}>
                  {t("Received")}: {new Date(o.createdAt).toLocaleString()}
                </div>
              </div>
            );
          })}
        </div>
      )}

      <Modal
        open={openCounter}
        title={t("Send Counter Offer")}
        subtitle={t("Set your counter rent and message.")}
        onClose={() => setOpenCounter(false)}
      >
        <div className="muted" style={{ fontSize: 13, lineHeight: 1.7 }}>
          {t("Listed rent")}: <b style={{ color: "#111827" }}>NPR {selected?.room?.monthlyRent ?? "-"}</b><br/>
          {t("Tenant offer")}: <b style={{ color: "#111827" }}>NPR {selected?.offeredRent ?? "-"}</b>
        </div>

        <div className="spacer" />
        <div className="muted" style={{ fontSize: 13 }}>{t("Counter rent (NPR)")}</div>
        <input className="input" value={counterRent} onChange={(e) => setCounterRent(e.target.value)} />

        <div className="spacer" />
        <div className="muted" style={{ fontSize: 13 }}>{t("Message")}</div>
        <textarea className="input" value={ownerReply} onChange={(e) => setOwnerReply(e.target.value)} style={{ minHeight: 100, paddingTop: 12 }} />

        <div className="spacer" />
        <div className="row" style={{ justifyContent: "flex-end" }}>
          <button className="btn btnOutline" onClick={() => setOpenCounter(false)}>{t("Cancel")}</button>
          <button className="btn" onClick={counter} disabled={sendingCounter}>
            {sendingCounter ? t("Sending...") : t("Send Counter")}
          </button>
        </div>
      </Modal>
    </div>
  );
}
