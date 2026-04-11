import fs from "fs";
import path from "path";
import multer from "multer";

const hasSupabase = Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);
const signaturesDir = path.join(process.cwd(), "uploads", "signatures");
if (!hasSupabase) {
    fs.mkdirSync(signaturesDir, { recursive: true });
}

const storage = hasSupabase ? multer.memoryStorage() : multer.diskStorage({
    destination: (req, file, cb) => cb(null, signaturesDir),
    filename: (req, file, cb) => {
        const ext = path.extname(file.originalname) || ".png";
        cb(null, `${Date.now()}-${Math.random().toString(16).slice(2)}${ext}`);
    },
});

const fileFilter = (req, file, cb) => {
    const ok = ["image/png", "image/jpeg", "image/jpg", "image/webp"].includes(file.mimetype);
    cb(ok ? null : new Error("Only PNG/JPG/WEBP allowed"), ok);
};

const uploadSignature = multer({ storage, fileFilter });

export { uploadSignature };
