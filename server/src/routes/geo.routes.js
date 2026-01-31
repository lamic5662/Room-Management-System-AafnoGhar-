import { Router } from "express";
import { protect } from "../middleware/auth.middleware.js";
import { reverseGeocode, forwardGeocode, nearbyByCoords } from "../controllers/geo.controller.js";

const router = Router();

router.get("/reverse", protect, reverseGeocode);
router.get("/search", protect, forwardGeocode);
router.get("/nearby", protect, nearbyByCoords);

export default router;
