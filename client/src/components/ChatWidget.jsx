import { useEffect, useMemo, useRef, useState } from "react";
import http from "../api/http";
import { useI18n } from "../context/I18nContext";

const MAX_HISTORY = 8;

export default function ChatWidget() {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState([
    { role: "assistant", text: t("Hi! Ask me about rooms, rent, or how to use AafnoGhar.") },
  ]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const scrollRef = useRef(null);

  const userRole = useMemo(() => {
    try {
      const u = JSON.parse(localStorage.getItem("user") || "null");
      return u?.role || "";
    } catch {
      return "";
    }
  }, []);

  useEffect(() => {
    if (!scrollRef.current) return;
    scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages, sending]);

  const send = async () => {
    const text = input.trim();
    if (!text || sending) return;

    const nextMessages = [...messages, { role: "user", text }];
    setMessages(nextMessages);
    setInput("");
    setSending(true);

    const history = nextMessages
      .filter((m) => m.role === "user" || m.role === "assistant")
      .slice(-MAX_HISTORY)
      .map((m) => ({ role: m.role, content: m.text }));

    try {
      const res = await http.post("/api/chat", {
        message: text,
        history,
        userRole,
      });
      setMessages((prev) => [...prev, { role: "assistant", text: res.data?.reply || t("No reply") }]);
    } catch (e) {
      const msg = e?.response?.data?.message || t("Sorry, I couldn't respond. Please try again.");
      setMessages((prev) => [...prev, { role: "assistant", text: msg }]);
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="chatWidget">
      {open ? (
        <div className="chatPanel">
          <div className="chatHeader">
            <div>
              <div className="chatTitle">{t("AafnoGhar Assistant")}</div>
              <div className="chatSubtitle">{t("Ask about rooms, rent, agreements, or payments.")}</div>
            </div>
            <button className="chatClose" onClick={() => setOpen(false)}>✕</button>
          </div>

          <div className="chatMessages" ref={scrollRef}>
            {messages.map((m, idx) => (
              <div key={idx} className={`chatBubble ${m.role === "user" ? "chatUser" : "chatBot"}`}>
                {m.text}
              </div>
            ))}
            {sending ? <div className="chatBubble chatBot">{t("Typing...")}</div> : null}
          </div>

          <div className="chatInputWrap">
            <input
              className="chatInput"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder={t("Type a message...")}
              onKeyDown={(e) => {
                if (e.key === "Enter") send();
              }}
            />
            <button className="chatSend" onClick={send} disabled={sending || !input.trim()}>
              {t("Send")}
            </button>
          </div>
        </div>
      ) : (
        <button className="chatToggle" onClick={() => setOpen(true)}>
          💬 {t("Chat")}
        </button>
      )}
    </div>
  );
}
