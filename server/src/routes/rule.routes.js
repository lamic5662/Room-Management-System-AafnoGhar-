import { Router } from "express";
import { protect } from "../middleware/auth.middleware.js";
import {
  createRule,
  ownerRoomRules,
  updateRule,
  tenantAgreementRules,
} from "../controllers/rule.controller.js";

const router = Router();

router.post("/", protect, createRule);
router.get("/owner/room/:roomId", protect, ownerRoomRules);
router.patch("/:id", protect, updateRule);
router.get("/tenant/agreement/:agreementId", protect, tenantAgreementRules);

export default router;
