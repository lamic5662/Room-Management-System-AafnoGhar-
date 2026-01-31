import { Router } from "express";
import { protect } from "../middleware/auth.middleware.js";
import { requireAdmin } from "../middleware/admin.middleware.js";
import { listUsers, updateUserRole, deleteUser, userSummary } from "../controllers/admin.controller.js";

const router = Router();

router.get("/users", protect, requireAdmin, listUsers);
router.get("/summary", protect, requireAdmin, userSummary);
router.patch("/users/:id/role", protect, requireAdmin, updateUserRole);
router.delete("/users/:id", protect, requireAdmin, deleteUser);

export default router;
