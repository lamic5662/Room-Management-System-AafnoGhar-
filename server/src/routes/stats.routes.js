import { Router } from "express";
import { protect } from "../middleware/auth.middleware.js";
import { ownerStats, tenantStats, adminStats } from "../controllers/stats.controller.js";

const router = Router();

router.get("/owner", protect, ownerStats);
router.get("/tenant", protect, tenantStats);
router.get("/admin", protect, adminStats);

export default router;
