import { Router } from "express";
import { protect } from "../middleware/auth.middleware.js";
import { requireAdmin } from "../middleware/admin.middleware.js";
import {
  flaggedRooms,
  unflagRoom,
  disableRoom,
  enableRoom,
  requestImprovement,
  approveImprovement,
  deleteFlaggedRoom,
  recalcFraud,
  fraudSummary,
  fraudTrend,
} from "../controllers/fraud.controller.js";

const router = Router();

router.get("/rooms/flagged", protect, requireAdmin, flaggedRooms);
router.get("/summary", protect, requireAdmin, fraudSummary);
router.get("/trend", protect, requireAdmin, fraudTrend);
router.patch("/rooms/:id/unflag", protect, requireAdmin, unflagRoom);
router.patch("/rooms/:id/disable", protect, requireAdmin, disableRoom);
router.patch("/rooms/:id/enable", protect, requireAdmin, enableRoom);
router.post("/rooms/:id/request-improvement", protect, requireAdmin, requestImprovement);
router.patch("/rooms/:id/approve-improvement", protect, requireAdmin, approveImprovement);
router.delete("/rooms/:id", protect, requireAdmin, deleteFlaggedRoom);
router.patch("/rooms/:id/recalc", protect, requireAdmin, recalcFraud);

export default router;
