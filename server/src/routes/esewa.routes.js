import { Router } from "express";
import { protect } from "../middleware/auth.middleware.js";
import {
  initEsewaPayment,
  esewaSuccess,
  esewaFailure,
  verifyEsewaPayment,
} from "../controllers/esewa.controller.js";

const router = Router();

router.post("/init", protect, initEsewaPayment);

// callback URLs (public)
router.get("/success", esewaSuccess);
router.get("/failure", esewaFailure);

// verify from frontend (protected)
router.post("/verify", protect, verifyEsewaPayment);

export default router;
