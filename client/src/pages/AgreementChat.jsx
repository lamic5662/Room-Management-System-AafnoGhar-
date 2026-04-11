import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { io } from "socket.io-client";
import http from "../api/http";
import Spinner from "../components/Spinner";
import { useToast } from "../context/ToastContext";
import { useI18n } from "../context/I18nContext";

const API = `http://${window.location.hostname}:5001`;
const REACTIONS = ["👍", "❤️", "😂", "😮"];

export default function AgreementChat() {
  const { agreementId } = useParams();
  const { showToast } = useToast();
  const { t } = useI18n();
  const [loading, setLoading] = useState(true);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [agreement, setAgreement] = useState(null);
  const [otherTyping, setOtherTyping] = useState(false);
  const [search, setSearch] = useState("");
  const [deleteMenuId, setDeleteMenuId] = useState(null);
  const [swipedMessageId, setSwipedMessageId] = useState(null);
  const scrollRef = useRef(null);
  const socketRef = useRef(null);
  const typingTimerRef = useRef(null);
  const longPressTimerRef = useRef(null);
  const longPressTriggeredRef = useRef(false);
  const lastTypingStateRef = useRef(false);
  const [activeReactionId, setActiveReactionId] = useState(null);
  const swipeStateRef = useRef({ id: null, startX: 0, startY: 0, moved: false });

  const user = useMemo(() => {
    try {
      return JSON.parse(localStorage.getItem("user") || "null");
    } catch {
      return null;
    }
  }, []);

  const myId = user?._id;
  const isOwner = user?.role === "owner";
  const otherUserId = isOwner
    ? (agreement?.tenant?._id || agreement?.tenant)
    : (agreement?.owner?._id || agreement?.owner);
  const otherName = isOwner
    ? (agreement?.tenant?.fullName || t("Tenant"))
    : (agreement?.owner?.fullName || t("Owner"));
  const backLink = isOwner ? "/owner/agreements" : "/tenant/agreements";

  const appendMessage = (msg) => {
    if (!msg?._id) return;
    setMessages((prev) => {
      if (prev.some((m) => m._id === msg._id)) return prev;
      return [...prev, msg];
    });
  };

  const loadAgreementMeta = async () => {
    if (!user?.role) return;
    try {
      const url = isOwner ? "/api/agreements/my" : "/api/agreements/my-tenant";
      const res = await http.get(url);
      const found = (res.data?.agreements || []).find((a) => a._id === agreementId);
      setAgreement(found || null);
    } catch {
      // ignore
    }
  };

  const loadMessages = async () => {
    try {
      setLoading(true);
      const res = await http.get(`/api/agreements/${agreementId}/messages`);
      setMessages(res.data.messages || []);
    } catch (e) {
      showToast("error", e?.response?.data?.message || t("Failed to load messages"));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAgreementMeta();
    loadMessages();
    // eslint-disable-next-line
  }, [agreementId]);

  useEffect(() => {
    const token = localStorage.getItem("token");
    if (!token) return;
    const socket = io(API, { auth: { token } });
    socketRef.current = socket;
    socket.on("chat:new", (payload) => {
      const msg = payload?.message;
      if (msg?.agreement && String(msg.agreement) !== String(agreementId)) return;
      appendMessage(msg);
      const senderId = msg?.sender?._id || msg?.sender;
      if (senderId && String(senderId) !== String(myId)) {
        http.patch(`/api/agreements/${agreementId}/messages/read`).catch(() => {});
      }
    });
    socket.on("chat:read", (payload) => {
      if (!payload || String(payload.agreementId) !== String(agreementId)) return;
      const readerId = payload.readerId;
      if (!readerId) return;
      setMessages((prev) =>
        prev.map((m) => {
          const senderId = m.sender?._id || m.sender;
          if (String(senderId) !== String(myId)) return m;
          const readBy = Array.isArray(m.readBy) ? m.readBy : [];
          if (readBy.some((id) => String(id) === String(readerId))) return m;
          return { ...m, readBy: [...readBy, readerId] };
        })
      );
    });
    socket.on("chat:typing", (payload) => {
      if (!payload || String(payload.agreementId) !== String(agreementId)) return;
      if (String(payload.userId) === String(myId)) return;
      setOtherTyping(!!payload.isTyping);
      if (payload.isTyping) {
        window.setTimeout(() => setOtherTyping(false), 2000);
      }
    });
    socket.on("chat:reaction", (payload) => {
      if (!payload || String(payload.agreementId) !== String(agreementId)) return;
      const messageId = payload.messageId;
      if (!messageId) return;
      setMessages((prev) =>
        prev.map((m) => (String(m._id) === String(messageId) ? { ...m, reactions: payload.reactions || [] } : m))
      );
    });
    socket.on("chat:deleted", (payload) => {
      if (!payload || String(payload.agreementId) !== String(agreementId)) return;
      const messageId = payload.messageId;
      if (!messageId) return;
      setMessages((prev) => prev.filter((m) => String(m._id) !== String(messageId)));
    });
    return () => {
      socket.disconnect();
      socketRef.current = null;
    };
  }, [agreementId]);

  useEffect(() => {
    if (!scrollRef.current) return;
    scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages]);

  useEffect(() => {
    const onDocClick = (e) => {
      if (!activeReactionId) return;
      if (e.target.closest(".chatBubble")) return;
      setActiveReactionId(null);
    };
    document.addEventListener("click", onDocClick);
    return () => document.removeEventListener("click", onDocClick);
  }, [activeReactionId]);

  useEffect(() => {
    const onDocClick = (e) => {
      if (!deleteMenuId) return;
      if (e.target.closest(".chatDeleteMenu")) return;
      if (e.target.closest(".chatMoreBtn")) return;
      if (e.target.closest(".chatSwipeActions")) return;
      setDeleteMenuId(null);
    };
    document.addEventListener("click", onDocClick);
    return () => document.removeEventListener("click", onDocClick);
  }, [deleteMenuId]);

  useEffect(() => {
    const onDocClick = (e) => {
      if (!swipedMessageId) return;
      if (e.target.closest(".chatBubbleWrap")) return;
      setSwipedMessageId(null);
    };
    document.addEventListener("click", onDocClick);
    return () => document.removeEventListener("click", onDocClick);
  }, [swipedMessageId]);

  const filteredMessages = useMemo(() => {
    if (!search.trim()) return messages;
    const q = search.trim().toLowerCase();
    return messages.filter((m) => String(m.text || "").toLowerCase().includes(q));
  }, [messages, search]);

  const renderHighlighted = (text) => {
    const raw = String(text || "");
    const q = search.trim();
    if (!q) return raw;
    const lower = raw.toLowerCase();
    const qLower = q.toLowerCase();
    const parts = [];
    let idx = 0;
    while (idx < raw.length) {
      const next = lower.indexOf(qLower, idx);
      if (next === -1) {
        parts.push({ text: raw.slice(idx), hit: false });
        break;
      }
      if (next > idx) {
        parts.push({ text: raw.slice(idx, next), hit: false });
      }
      parts.push({ text: raw.slice(next, next + q.length), hit: true });
      idx = next + q.length;
    }
    return parts.map((p, i) =>
      p.hit ? (
        <mark key={`${i}-${p.text}`} style={{ background: "rgba(255, 107, 107, 0.25)", padding: "0 2px", borderRadius: 4 }}>
          {p.text}
        </mark>
      ) : (
        <span key={`${i}-${p.text}`}>{p.text}</span>
      )
    );
  };

  const lastMyMessageId = useMemo(() => {
    for (let i = messages.length - 1; i >= 0; i -= 1) {
      const senderId = messages[i]?.sender?._id || messages[i]?.sender;
      if (String(senderId) === String(myId)) return messages[i]._id;
    }
    return null;
  }, [messages, myId]);

  const isSeenByOther = (msg) => {
    if (!otherUserId) return false;
    const readBy = Array.isArray(msg.readBy) ? msg.readBy : [];
    return readBy.some((id) => String(id) === String(otherUserId));
  };

  const deleteMessage = async (msgId, scope = "self") => {
    if (!msgId) return;
    if (scope === "all") {
      const ok = window.confirm(t("Delete for everyone?"));
      if (!ok) return;
    }
    try {
      await http.delete(`/api/agreements/${agreementId}/messages/${msgId}`, {
        params: { scope },
      });
      setMessages((prev) => prev.filter((m) => m._id !== msgId));
      setDeleteMenuId(null);
    } catch (e) {
      showToast("error", e?.response?.data?.message || t("Failed to delete message"));
    }
  };

  const toggleReaction = async (msgId, emoji) => {
    if (!msgId || !emoji) return;
    try {
      const res = await http.patch(`/api/agreements/${agreementId}/messages/${msgId}/reactions`, { emoji });
      const updated = res.data?.chatMessage;
      if (updated?._id) {
        setMessages((prev) =>
          prev.map((m) => (String(m._id) === String(updated._id) ? { ...m, reactions: updated.reactions || [] } : m))
        );
      }
      setActiveReactionId(null);
    } catch (e) {
      showToast("error", e?.response?.data?.message || t("Failed to react"));
    }
  };

  const startSwipe = (msgId, event) => {
    const point = event?.touches?.[0] || event;
    if (!point) return;
    swipeStateRef.current = {
      id: msgId,
      startX: point.clientX,
      startY: point.clientY,
      moved: false,
    };
  };

  const moveSwipe = (event) => {
    const state = swipeStateRef.current;
    if (!state?.id) return;
    const point = event?.touches?.[0] || event;
    if (!point) return;
    const dx = point.clientX - state.startX;
    const dy = point.clientY - state.startY;
    if (Math.abs(dy) > Math.abs(dx)) return;
    if (Math.abs(dx) > 8) {
      state.moved = true;
      if (longPressTimerRef.current) clearTimeout(longPressTimerRef.current);
    }
    if (dx < -35) {
      setSwipedMessageId(state.id);
    } else if (dx > 35) {
      setSwipedMessageId(null);
    }
  };

  const endSwipe = () => {
    swipeStateRef.current = { id: null, startX: 0, startY: 0, moved: false };
  };

  const startLongPress = (msgId) => {
    if (!msgId) return;
    longPressTriggeredRef.current = false;
    if (longPressTimerRef.current) clearTimeout(longPressTimerRef.current);
    longPressTimerRef.current = window.setTimeout(() => {
      longPressTriggeredRef.current = true;
      setActiveReactionId(msgId);
    }, 200);
  };

  const endLongPress = () => {
    if (longPressTimerRef.current) clearTimeout(longPressTimerRef.current);
  };

  const handleTextClick = () => {
    if (longPressTriggeredRef.current) {
      longPressTriggeredRef.current = false;
    }
  };

  const emitTyping = (isTyping) => {
    if (!socketRef.current) return;
    if (lastTypingStateRef.current === isTyping) return;
    socketRef.current.emit("chat:typing", { agreementId, isTyping });
    lastTypingStateRef.current = isTyping;
  };

  const handleInputChange = (e) => {
    const val = e.target.value;
    setInput(val);
    if (!val.trim()) {
      if (typingTimerRef.current) clearTimeout(typingTimerRef.current);
      emitTyping(false);
      return;
    }
    emitTyping(true);
    if (typingTimerRef.current) clearTimeout(typingTimerRef.current);
    typingTimerRef.current = window.setTimeout(() => emitTyping(false), 1400);
  };

  const send = async () => {
    const text = input.trim();
    if (!text) return;
    try {
      setSending(true);
      const res = await http.post(`/api/agreements/${agreementId}/messages`, { text });
      if (res.data?.chatMessage) {
        appendMessage(res.data.chatMessage);
      }
      setInput("");
      emitTyping(false);
      http.patch(`/api/agreements/${agreementId}/messages/read`).catch(() => {});
    } catch (e) {
      showToast("error", e?.response?.data?.message || t("Failed to send message"));
    } finally {
      setSending(false);
    }
  };

  const onKeyDown = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  };

  if (loading) return <Spinner text={t("Loading messages...")} />;

  return (
    <div>
      <div className="row" style={{ justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}>
        <div>
          <h1 className="h1">{t("Agreement Chat")}</h1>
          <p className="muted" style={{ marginTop: 6 }}>
            {agreement?.room?.title || t("Chat with the other party.")}
          </p>
        </div>
        <Link className="btn btnOutline" to={backLink}>{t("Back to Agreements")}</Link>
      </div>

      <div className="spacer" />

      <div className="row" style={{ justifyContent: "space-between", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        <input
          className="input"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={t("Search messages")}
          style={{ maxWidth: 320 }}
        />
        {search ? (
          <button className="pill" type="button" onClick={() => setSearch("")}>
            {t("Clear")}
          </button>
        ) : null}
      </div>

      <div className="spacer" />

      <div className="card" style={{ overflow: "hidden" }}>
        <div className="chatMessages" ref={scrollRef} style={{ height: 420 }}>
          {filteredMessages.length === 0 ? (
            <div className="muted" style={{ fontSize: 13 }}>
              {search ? t("No messages found.") : t("No messages yet. Start the conversation.")}
            </div>
          ) : (
            filteredMessages.map((m) => {
              const senderId = m.sender?._id || m.sender;
              const isMe = String(senderId) === String(myId);
              const isLastMine = isMe && lastMyMessageId && String(m._id) === String(lastMyMessageId);
              const reactions = Array.isArray(m.reactions) ? m.reactions : [];
              const canDeleteForEveryone = isMe && otherUserId && !isSeenByOther(m);
              const reactionMeta = (emoji) => {
                const rec = reactions.find((r) => r.emoji === emoji);
                const users = Array.isArray(rec?.users) ? rec.users : [];
                const count = users.length;
                const active = users.some((u) => String(u) === String(myId));
                return { count, active };
              };
              const reactionSummary = reactions
                .map((r) => ({ emoji: r.emoji, count: (r.users || []).length }))
                .filter((r) => r.count > 0);
              const showPicker = activeReactionId === m._id;
              return (
                <div key={m._id} className={`chatBubbleWrap ${isMe ? "mine" : ""} ${swipedMessageId === m._id ? "swiped" : ""}`}>
                  <div className="chatSwipeActions">
                    <button
                      type="button"
                      className="chatSwipeDelete"
                      onClick={(e) => {
                        e.stopPropagation();
                        setDeleteMenuId((prev) => (prev === m._id ? null : m._id));
                      }}
                      title={t("Delete")}
                      aria-label={t("Delete")}
                    >
                      🗑
                    </button>
                  </div>
                  <div className={`chatBubble chatBubbleInner ${isMe ? "chatUser" : "chatBot"}`}>
                    <div className="chatHeaderRow">
                      <div className="chatHeaderText">
                        {isMe ? t("You") : (m.sender?.fullName || t("User"))} • {new Date(m.createdAt).toLocaleTimeString()}
                      </div>
                      <button
                        type="button"
                        className="chatMoreBtn"
                        onClick={(e) => {
                          e.stopPropagation();
                          setDeleteMenuId((prev) => (prev === m._id ? null : m._id));
                        }}
                        title={t("Delete")}
                        aria-label={t("Delete")}
                      >
                        ⋯
                      </button>
                    </div>
                    <div
                      className="chatText"
                      onMouseDown={(e) => {
                        startSwipe(m._id, e);
                        startLongPress(m._id);
                      }}
                      onMouseMove={moveSwipe}
                      onMouseUp={() => {
                        endLongPress();
                        endSwipe();
                      }}
                      onMouseLeave={() => {
                        endLongPress();
                        endSwipe();
                      }}
                      onTouchStart={(e) => {
                        startSwipe(m._id, e);
                        startLongPress(m._id);
                      }}
                      onTouchMove={moveSwipe}
                      onTouchEnd={() => {
                        endLongPress();
                        endSwipe();
                      }}
                      onClick={handleTextClick}
                    >
                      {renderHighlighted(m.text)}
                      {reactionSummary.length > 0 && (
                        <span className={`chatInlineReactions ${isMe ? "mine" : ""}`}>
                          {reactionSummary.map((r) => (
                            <span key={`${m._id}-${r.emoji}`} className="chatInlineChip">
                              {r.emoji} {r.count}
                            </span>
                          ))}
                        </span>
                      )}
                    </div>
                    {showPicker && (
                      <div className={`chatReactionPicker ${isMe ? "mine" : ""}`}>
                        {REACTIONS.map((emoji) => {
                          const meta = reactionMeta(emoji);
                          return (
                            <button
                              key={`${m._id}-${emoji}`}
                              type="button"
                              className={`chatReactionBtn ${meta.active ? "active" : ""}`}
                              onClick={() => toggleReaction(m._id, emoji)}
                              aria-label={`${t("React")} ${emoji}`}
                              title={t("React")}
                            >
                              <span>{emoji}</span>
                            </button>
                          );
                        })}
                      </div>
                    )}
                    {isLastMine && (
                      <div style={{ fontSize: 11, opacity: 0.7, marginTop: 4 }}>
                      {isSeenByOther(m) ? t("Seen") : t("Sent")}
                    </div>
                  )}
                  </div>
                  {deleteMenuId === m._id && (
                    <div className="chatDeleteMenu">
                      <button type="button" className="chatDeleteOption" onClick={() => deleteMessage(m._id, "self")}>
                        {t("Delete for me")}
                      </button>
                      {canDeleteForEveryone && (
                        <button type="button" className="chatDeleteOption danger" onClick={() => deleteMessage(m._id, "all")}>
                          {t("Delete for everyone")}
                        </button>
                      )}
                    </div>
                  )}
                </div>
              );
            })
          )}
          {otherTyping && (
            <div className="chatBubble chatBot">
              {t("Typing...")} {otherName ? `• ${otherName}` : ""}
            </div>
          )}
        </div>
        <div className="chatInputWrap">
          <textarea
            className="chatInput"
            rows={2}
            value={input}
            onChange={handleInputChange}
            onKeyDown={onKeyDown}
            placeholder={t("Type a message")}
          />
          <button className="chatSend" onClick={send} disabled={sending || !input.trim()}>
            {sending ? t("Sending...") : t("Send")}
          </button>
        </div>
      </div>
    </div>
  );
}
