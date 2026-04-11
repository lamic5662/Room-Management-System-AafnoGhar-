import { Router } from "express";
import { protect } from "../middleware/auth.middleware.js";
import { requireStaff } from "../middleware/admin.middleware.js";
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

router.get("/rooms/flagged", protect, requireStaff, flaggedRooms);
router.get("/summary", protect, requireStaff, fraudSummary);
router.get("/trend", protect, requireStaff, fraudTrend);
router.patch("/rooms/:id/unflag", protect, requireStaff, unflagRoom);
router.patch("/rooms/:id/disable", protect, requireStaff, disableRoom);
router.patch("/rooms/:id/enable", protect, requireStaff, enableRoom);
router.post("/rooms/:id/request-improvement", protect, requireStaff, requestImprovement);
router.patch("/rooms/:id/approve-improvement", protect, requireStaff, approveImprovement);
router.delete("/rooms/:id", protect, requireStaff, deleteFlaggedRoom);
router.patch("/rooms/:id/recalc", protect, requireStaff, recalcFraud);

export default router;
