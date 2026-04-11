import { Router } from "express";
import { protect } from "../middleware/auth.middleware.js";
import { requireSuperAdmin } from "../middleware/admin.middleware.js";
import {
  listUsers,
  listAuditLogs,
  exportAuditLogs,
  cleanupAuditLogs,
  createStaffUser,
  updateUserRole,
  resetStaffPassword,
  deleteUser,
  userSummary,
  userRoomStats,
  recomputeResponseStats,
  listFeatureFlagsController,
  updateFeatureFlagController,
} from "../controllers/admin.controller.js";

const router = Router();

router.get("/users", protect, requireSuperAdmin, listUsers);
router.post("/staff", protect, requireSuperAdmin, createStaffUser);
router.get("/audit-logs", protect, requireSuperAdmin, listAuditLogs);
router.get("/audit-logs/export", protect, requireSuperAdmin, exportAuditLogs);
router.post("/audit-logs/cleanup", protect, requireSuperAdmin, cleanupAuditLogs);
router.get("/summary", protect, requireSuperAdmin, userSummary);
router.patch("/users/:id/role", protect, requireSuperAdmin, updateUserRole);
router.patch("/users/:id/password", protect, requireSuperAdmin, resetStaffPassword);
router.delete("/users/:id", protect, requireSuperAdmin, deleteUser);
router.get("/user-room-stats", protect, requireSuperAdmin, userRoomStats);
router.post("/response-stats/recompute", protect, requireSuperAdmin, recomputeResponseStats);
router.get("/feature-flags", protect, requireSuperAdmin, listFeatureFlagsController);
router.patch("/feature-flags/:key", protect, requireSuperAdmin, updateFeatureFlagController);

export default router;
