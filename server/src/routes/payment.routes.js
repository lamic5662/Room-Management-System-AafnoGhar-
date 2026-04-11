import { Router } from "express";
import { protect } from "../middleware/auth.middleware.js";
import {
    createPayment,
    updatePaymentStatus,
    myPayments,
    incomingPayments,
    dueStatus,
    paymentTimeline,
    generatePaymentBill,
    applyLateFee,
    removeLateFee,
} from "../controllers/payment.controller.js";

const router = Router();

router.post("/", protect, createPayment);               // tenant creates payment
router.patch("/:id/status", protect, updatePaymentStatus); // owner confirm/reject
router.get("/:id/bill", protect, generatePaymentBill);
router.get("/incoming", protect, incomingPayments);     // owner incoming payments
router.get("/my", protect, myPayments);                 // owner/tenant list
router.get("/due", protect, dueStatus);                 // check due for a period
router.get("/timeline", protect, paymentTimeline);      // payment timeline by agreement
router.post("/late-fee", protect, applyLateFee);        // owner apply late fee
router.post("/late-fee/remove", protect, removeLateFee);// owner remove late fee

export default router;
