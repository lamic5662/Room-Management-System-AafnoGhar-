import { Router } from "express";
import { protect } from "../middleware/auth.middleware.js";
import {
    createPayment,
    updatePaymentStatus,
    myPayments,
    incomingPayments,
    dueStatus,
    generatePaymentBill,
} from "../controllers/payment.controller.js";

const router = Router();

router.post("/", protect, createPayment);               // tenant creates payment
router.patch("/:id/status", protect, updatePaymentStatus); // owner confirm/reject
router.get("/:id/bill", protect, generatePaymentBill);
router.get("/incoming", protect, incomingPayments);     // owner incoming payments
router.get("/my", protect, myPayments);                 // owner/tenant list
router.get("/due", protect, dueStatus);                 // check due for a period

export default router;
