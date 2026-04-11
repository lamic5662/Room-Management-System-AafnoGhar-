import fs from "fs";
import path from "path";
import multer from "multer";

const hasSupabase = Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);
const avatarsDir = path.join(process.cwd(), "uploads", "avatars");
if (!hasSupabase) {
  fs.mkdirSync(avatarsDir, { recursive: true });
}

const storage = hasSupabase ? multer.memoryStorage() : multer.diskStorage({
  destination: (req, file, cb) => cb(null, avatarsDir),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname) || ".png";
    cb(null, `${Date.now()}-${Math.random().toString(16).slice(2)}${ext}`);
  },
});

const fileFilter = (req, file, cb) => {
  const ok = ["image/png", "image/jpeg", "image/jpg", "image/webp"].includes(file.mimetype);
  cb(ok ? null : new Error("Only PNG/JPG/WEBP allowed"), ok);
};

const uploadAvatar = multer({ storage, fileFilter, limits: { fileSize: 2 * 1024 * 1024 } });

export { uploadAvatar };
