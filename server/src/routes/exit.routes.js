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
  tenantPurgeExitData,
  generateExitSummaryPdf,
} from "../controllers/exit.controller.js";

const router = Router();

router.post("/", protect, createExitRequest);

router.get("/my", protect, tenantMyExitRequests);

router.get("/incoming", protect, ownerIncomingExitRequests);
router.patch("/:id/approve", protect, ownerApproveExit);
router.patch("/:id/reject", protect, ownerRejectExit);
router.patch("/:id/settle", protect, ownerSettleExit);
router.get("/:id/summary-pdf", protect, generateExitSummaryPdf);
router.delete("/:id/purge", protect, ownerPurgeExitData);
router.delete("/:id/tenant-purge", protect, tenantPurgeExitData);

export default router;
