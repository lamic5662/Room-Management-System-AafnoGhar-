import { Router } from "express";
const router = Router();

router.get("/", (req, res) => {
    res.json({ ok: true, message: "AafnoGhar API is running" });
});

export default router;
