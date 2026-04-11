import { Router } from "express";
import { protect } from "../middleware/auth.middleware.js";
import { listMyNotifications, markRead, markAllRead, deleteRead, deleteAllRead } from "../controllers/notification.controller.js";

const router = Router();

router.get("/", protect, listMyNotifications);
router.patch("/:id/read", protect, markRead);
router.patch("/read-all", protect, markAllRead);
router.delete("/read-all", protect, deleteAllRead);
router.delete("/:id", protect, deleteRead);

export default router;
