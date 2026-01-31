import { Router } from "express";
import { protect } from "../middleware/auth.middleware.js";
import { suggestPrice } from "../controllers/price.controller.js";

const router = Router();

router.post("/suggest", protect, suggestPrice);

export default router;
