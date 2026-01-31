import { Router } from "express";
import { protect } from "../middleware/auth.middleware.js";
import { predictPrice } from "../controllers/ml.controller.js";

const router = Router();

router.post("/price-predict", protect, predictPrice);

export default router;
