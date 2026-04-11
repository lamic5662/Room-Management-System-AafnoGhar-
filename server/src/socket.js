import { Server } from "socket.io";
import jwt from "jsonwebtoken";
import Agreement from "./models/Agreement.js";

let io;

export const initSocket = (httpServer) => {
  io = new Server(httpServer, {
    cors: {
      origin: "*",
      methods: ["GET", "POST"],
      credentials: true,
    },
  });

  io.use((socket, next) => {
    const token = socket.handshake.auth?.token;
    if (!token) return next(new Error("unauthorized"));
    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      socket.userId = decoded.id;
      return next();
    } catch {
      return next(new Error("unauthorized"));
    }
  });

  io.on("connection", (socket) => {
    if (socket.userId) {
      socket.join(`user:${socket.userId}`);
    }

    socket.on("chat:typing", async (payload) => {
      try {
        const agreementId = payload?.agreementId;
        if (!agreementId || !socket.userId) return;
        const agreement = await Agreement.findById(agreementId).select("owner tenant");
        if (!agreement) return;
        const uid = String(socket.userId);
        if (uid !== String(agreement.owner) && uid !== String(agreement.tenant)) return;
        const otherUserId = uid === String(agreement.owner) ? agreement.tenant : agreement.owner;
        if (!otherUserId) return;
        io.to(`user:${otherUserId}`).emit("chat:typing", {
          agreementId: String(agreement._id),
          userId: uid,
          isTyping: !!payload?.isTyping,
        });
      } catch {
        // ignore
      }
    });
  });

  return io;
};

export const emitToUser = (userId, event, payload) => {
  if (!io || !userId) return;
  io.to(`user:${userId}`).emit(event, payload);
};
