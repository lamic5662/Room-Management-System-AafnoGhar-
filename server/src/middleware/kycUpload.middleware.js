import fs from "fs";
import path from "path";
import multer from "multer";

const kycDir = path.join(process.cwd(), "uploads", "kyc");
fs.mkdirSync(kycDir, { recursive: true });

const storage = multer.diskStorage({
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
