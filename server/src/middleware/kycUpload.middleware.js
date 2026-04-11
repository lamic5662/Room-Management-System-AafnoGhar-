import fs from "fs";
import path from "path";
import multer from "multer";

const hasSupabase = Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);
const kycDir = path.join(process.cwd(), "uploads", "kyc");
if (!hasSupabase) {
    fs.mkdirSync(kycDir, { recursive: true });
}

const storage = hasSupabase ? multer.memoryStorage() : multer.diskStorage({
    destination: (req, file, cb) => cb(null, kycDir),
    filename: (req, file, cb) => {
        const ext = path.extname(file.originalname) || ".png";
        cb(null, `${Date.now()}-${Math.random().toString(16).slice(2)}${ext}`);
    },
});

// allow images + pdf
const fileFilter = (req, file, cb) => {
    const ok = ["image/png", "image/jpeg", "image/jpg", "image/webp", "application/pdf"].includes(file.mimetype);
    cb(ok ? null : new Error("Only PNG/JPG/WEBP/PDF allowed"), ok);
};

const uploadKyc = multer({ storage, fileFilter });

export { uploadKyc };
