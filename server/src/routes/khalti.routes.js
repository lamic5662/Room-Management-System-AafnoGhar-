import { Router } from "express";
import { protect } from "../middleware/auth.middleware.js";
import {
  initKhaltiPayment,
  khaltiReturn,
  khaltiLookupAndVerify,
} from "../controllers/khalti.controller.js";

const router = Router();

router.post("/init", protect, initKhaltiPayment);
router.get("/return", khaltiReturn);
router.post("/verify", protect, khaltiLookupAndVerify);

export default router;
