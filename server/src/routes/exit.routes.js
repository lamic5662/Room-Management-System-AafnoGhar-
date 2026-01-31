import { Router } from "express";
import { protect } from "../middleware/auth.middleware.js";
import {
  createExitRequest,
  tenantMyExitRequests,
  ownerIncomingExitRequests,
  ownerApproveExit,
  ownerRejectExit,
  ownerSettleExit,
  ownerPurgeExitData,
} from "../controllers/exit.controller.js";

const router = Router();

router.post("/", protect, createExitRequest);

router.get("/my", protect, tenantMyExitRequests);

router.get("/incoming", protect, ownerIncomingExitRequests);
router.patch("/:id/approve", protect, ownerApproveExit);
router.patch("/:id/reject", protect, ownerRejectExit);
router.patch("/:id/settle", protect, ownerSettleExit);
router.delete("/:id/purge", protect, ownerPurgeExitData);

export default router;
