import dotenv from "dotenv";
dotenv.config();
import express from "express";
import mongoose from "mongoose";
import cors from "cors";
import healthRoutes from "./routes/health.routes.js";
import authRoutes from "./routes/auth.routes.js";
import privateRoutes from "./routes/private.route.js";
import roomRoutes from "./routes/room.routes.js";
import requestRoutes from "./routes/request.routes.js";
import agreementRoutes from "./routes/agreement.routes.js";
import path from "path";
import { fileURLToPath } from "url";
import paymentRoutes from "./routes/payment.routes.js";
import complaintRoutes from "./routes/complaint.routes.js";
import exitRoutes from "./routes/exit.routes.js";
import kycRoutes from "./routes/kyc.routes.js";
import adminRoutes from "./routes/admin.routes.js";
import statsRoutes from "./routes/stats.routes.js";
import ruleRoutes from "./routes/rule.routes.js";
import fraudRoutes from "./routes/fraud.routes.js";
import offerRoutes from "./routes/offer.routes.js";
import mlRoutes from "./routes/ml.routes.js";
import priceRoutes from "./routes/price.routes.js";
import esewaRoutes from "./routes/esewa.routes.js";
import khaltiRoutes from "./routes/khalti.routes.js";
import userRoutes from "./routes/user.routes.js";
import geoRoutes from "./routes/geo.routes.js";
import electricityRoutes from "./routes/electricity.routes.js";
import notificationRoutes from "./routes/notification.routes.js";
import errorHandler from "./middleware/error.middleware.js";

const app = express();
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

app.use(cors());
app.use(express.json()); // ✅ MUST be here (before routes)

// Validate common Mongo ObjectId params early to avoid CastError 500s
const ensureObjectId = (req, res, next, id) => {
  if (!mongoose.Types.ObjectId.isValid(id)) {
    return res.status(400).json({ message: "Invalid id" });
  }
  next();
};
app.param("id", ensureObjectId);
app.param("userId", ensureObjectId);
app.param("requestId", ensureObjectId);
app.param("agreementId", ensureObjectId);
app.param("roomId", ensureObjectId);

app.use("/api/health", healthRoutes);
app.use("/api/auth", authRoutes);
app.use("/api/private", privateRoutes);
app.use("/api/rooms", roomRoutes);
app.use("/api/requests", requestRoutes);
app.use("/api/agreements", agreementRoutes);
app.use("/api/payments", paymentRoutes);
app.use("/api/complaints", complaintRoutes);
app.use("/api/exits", exitRoutes);
app.use("/api/kyc", kycRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/stats", statsRoutes);
app.use("/api/rules", ruleRoutes);
app.use("/api/fraud", fraudRoutes);
app.use("/api/offers", offerRoutes);
app.use("/api/ml", mlRoutes);
app.use("/api/price", priceRoutes);
app.use("/api/esewa", esewaRoutes);
app.use("/api/khalti", khaltiRoutes);
app.use("/api/users", userRoutes);
app.use("/api/geo", geoRoutes);
app.use("/api/electricity", electricityRoutes);
app.use("/api/notifications", notificationRoutes);
// Serve files from project-root /uploads (matches storage in upload middlewares)
app.use("/uploads", express.static(path.join(process.cwd(), "uploads")));

// Error handler (must be last)
app.use(errorHandler);

export default app;
