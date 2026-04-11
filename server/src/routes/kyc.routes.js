import { Router } from "express";
import { protect } from "../middleware/auth.middleware.js";
import { requireAdmin } from "../middleware/admin.middleware.js";
import { uploadKyc } from "../middleware/kycUpload.middleware.js";
import {
    submitKyc,
    updateKyc,
    myKyc,
    listPending,
    listApproved,
    kycSummary,
    reviewKyc,
    approveKyc,
    rejectKyc,
} from "../controllers/kyc.controller.js";

const router = Router();

// user
router.get("/me", protect, myKyc);
router.post(
    "/submit",
    protect,
    uploadKyc.fields([
        { name: "front", maxCount: 1 },
        { name: "back", maxCount: 1 },
        { name: "selfie", maxCount: 1 },
    ]),
    submitKyc
);

// admin
router.get("/pending", protect, requireAdmin, listPending);
router.get("/approved", protect, requireAdmin, listApproved);
router.get("/summary", protect, requireAdmin, kycSummary);
router.patch("/review/:userId", protect, requireAdmin, reviewKyc);
router.patch("/:userId/approve", protect, requireAdmin, approveKyc);
router.patch("/:userId/reject", protect, requireAdmin, rejectKyc);
router.put(
    "/update",
    protect,
    uploadKyc.fields([
        { name: "front", maxCount: 1 },
        { name: "back", maxCount: 1 },
        { name: "selfie", maxCount: 1 },
    ]),
    updateKyc
);

export default router;
