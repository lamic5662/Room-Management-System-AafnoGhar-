import { Router } from "express";
import { protect } from "../middleware/auth.middleware.js";
import {
  createElectricityBill,
  ownerBills,
  tenantBills,
  billForPayment,
} from "../controllers/electricity.controller.js";

const router = Router();

router.post("/", protect, createElectricityBill); // owner creates bill
router.get("/owner", protect, ownerBills);
router.get("/tenant", protect, tenantBills);
router.get("/for-payment", protect, billForPayment);

export default router;
