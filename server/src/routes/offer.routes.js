import express from "express";
import { protect } from "../middleware/auth.middleware.js";
import {
  createOffer,
  tenantMyOffers,
  ownerIncomingOffers,
  ownerAcceptOffer,
  ownerRejectOffer,
  ownerCounterOffer,
  tenantCounterOffer,
  tenantAcceptCounter,
  tenantRejectCounter,
  createAgreementFromOffer,
} from "../controllers/offer.controller.js";

const router = express.Router();

router.post("/", protect, createOffer);

router.get("/my", protect, tenantMyOffers);
router.get("/incoming", protect, ownerIncomingOffers);

router.patch("/:id/accept", protect, ownerAcceptOffer);
router.patch("/:id/reject", protect, ownerRejectOffer);
router.patch("/:id/counter", protect, ownerCounterOffer);
router.patch("/:id/tenant-counter", protect, tenantCounterOffer);
router.patch("/:id/tenant-accept", protect, tenantAcceptCounter);
router.patch("/:id/tenant-reject", protect, tenantRejectCounter);
router.post("/:id/create-agreement", protect, createAgreementFromOffer);

export default router;
