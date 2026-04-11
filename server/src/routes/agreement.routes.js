import { Router } from "express";
import { protect } from "../middleware/auth.middleware.js";
import { uploadSignature } from "../middleware/upload.middleware.js";
import {
    createFromRequest,
    myAgreements,
    myTenantAgreements,
    updateReminderDay,
    signTenant,
    signOwner,
} from "../controllers/agreement.controller.js";
import { generateAgreementPdf } from "../controllers/agreementPdf.controller.js";
import { listAgreementMessages, sendAgreementMessage, markAgreementMessagesRead, deleteAgreementMessage, toggleAgreementMessageReaction } from "../controllers/agreementChat.controller.js";

const router = Router();

router.post("/from-request/:requestId", protect, createFromRequest);
router.get("/my", protect, myAgreements);
router.get("/my-tenant", protect, myTenantAgreements);
router.get("/:id/messages", protect, listAgreementMessages);
router.post("/:id/messages", protect, sendAgreementMessage);
router.patch("/:id/messages/read", protect, markAgreementMessagesRead);
router.delete("/:id/messages/:messageId", protect, deleteAgreementMessage);
router.patch("/:id/messages/:messageId/reactions", protect, toggleAgreementMessageReaction);
router.patch("/:id/reminder", protect, updateReminderDay);
router.get("/:id/pdf", protect, generateAgreementPdf);
router.post("/:id/sign/tenant", protect, uploadSignature.single("signature"), signTenant);
router.post("/:id/sign/owner", protect, uploadSignature.single("signature"), signOwner);

export default router;
