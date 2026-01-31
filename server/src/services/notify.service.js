import Notification from "../models/Notification.js";
import { emitToUser } from "../socket.js";

export const notifyUser = async ({ userId, title, message = "", type = "general", data = {} }) => {
  if (!userId) return null;
  const notif = await Notification.create({
    user: userId,
    title,
    message,
    type,
    data,
  });
  emitToUser(String(userId), "notification:new", notif);
  return notif;
};
