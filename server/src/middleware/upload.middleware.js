import fs from "fs";
import path from "path";
import multer from "multer";

const signaturesDir = path.join(process.cwd(), "uploads", "signatures");
fs.mkdirSync(signaturesDir, { recursive: true });

const storage = multer.diskStorage({
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

export { uploadSignature, signaturesDir };
