import { Router } from "express";
import { protect } from "../middleware/auth.middleware.js";

const router = Router();

router.get("/me", protect, (req, res) => {
    res.json({ message: "You are authenticated", user: req.user });
});

export default router;
