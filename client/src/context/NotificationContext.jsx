import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { io } from "socket.io-client";
import http from "../api/http";

const NotificationContext = createContext(null);
const API = `http://${window.location.hostname}:5001`;

export function NotificationProvider({ children }) {
  const [items, setItems] = useState([]);
  const [unread, setUnread] = useState(0);
  const [connected, setConnected] = useState(false);

  const token = localStorage.getItem("token");

  const load = async () => {
    if (!token) {
      setItems([]);
      setUnread(0);
      return;
    }
    try {
      const res = await http.get("/api/notifications");
      setItems(res.data.notifications || []);
      setUnread(res.data.unread || 0);
    } catch {
      // ignore
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line
  }, [token]);

  useEffect(() => {
    const sync = () => load();
    window.addEventListener("storage", sync);
    window.addEventListener("auth:updated", sync);
    return () => {
      window.removeEventListener("storage", sync);
      window.removeEventListener("auth:updated", sync);
    };
    // eslint-disable-next-line
  }, []);

  useEffect(() => {
    if (!token) return;
    const socket = io(API, { auth: { token } });
    socket.on("connect", () => setConnected(true));
    socket.on("disconnect", () => setConnected(false));
    socket.on("notification:new", (n) => {
      setItems((prev) => [n, ...prev].slice(0, 50));
      setUnread((u) => u + 1);
    });
    return () => socket.disconnect();
  }, [token]);

  const markRead = async (id) => {
    setItems((prev) => prev.map((n) => (n._id === id ? { ...n, read: true } : n)));
    setUnread((u) => Math.max(0, u - 1));
    try {
      await http.patch(`/api/notifications/${id}/read`);
    } catch {
      // ignore
    }
  };

  const markAllRead = async () => {
    setItems((prev) => prev.map((n) => ({ ...n, read: true })));
    setUnread(0);
    try {
      await http.patch("/api/notifications/read-all");
    } catch {
      // ignore
    }
  };

  const deleteNotification = async (id) => {
    setItems((prev) => prev.filter((n) => n._id !== id));
    try {
      await http.delete(`/api/notifications/${id}`);
    } catch {
      load();
    }
  };

  const value = useMemo(
    () => ({ items, unread, connected, load, markRead, markAllRead, deleteNotification }),
    [items, unread, connected]
  );

  return <NotificationContext.Provider value={value}>{children}</NotificationContext.Provider>;
}

export function useNotifications() {
  return useContext(NotificationContext);
}
