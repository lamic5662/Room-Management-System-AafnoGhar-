import { Router } from "express";
import { protect } from "../middleware/auth.middleware.js";
import {
  createVisit,
  myVisits,
  incomingVisits,
  updateVisitStatus,
  cancelVisit,
  requestReschedule,
  decideReschedule,
} from "../controllers/visit.controller.js";

const router = Router();

router.post("/", protect, createVisit);
router.get("/my", protect, myVisits);
router.get("/incoming", protect, incomingVisits);
router.patch("/:id/status", protect, updateVisitStatus);
router.patch("/:id/cancel", protect, cancelVisit);
router.patch("/:id/reschedule", protect, requestReschedule);
router.patch("/:id/reschedule/decision", protect, decideReschedule);

export default router;
