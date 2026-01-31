import { Router } from "express";
import { protect } from "../middleware/auth.middleware.js";
import { getMe, updateMe, updatePassword, updateAvatar, removeAvatar } from "../controllers/user.controller.js";
import { uploadAvatar } from "../middleware/avatarUpload.middleware.js";

const router = Router();

router.get("/me", protect, getMe);
router.patch("/me", protect, updateMe);
router.patch("/me/password", protect, updatePassword);
router.post("/me/avatar", protect, uploadAvatar.single("avatar"), updateAvatar);
router.delete("/me/avatar", protect, removeAvatar);

export default router;
