import fs from "fs";
import path from "path";
import multer from "multer";

const roomsDir = path.join(process.cwd(), "uploads", "rooms");
fs.mkdirSync(roomsDir, { recursive: true });

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, roomsDir),
  filename: (req, file, cb) => {
    let ext = path.extname(file.originalname);
    if (!ext) {
      const map = {
        "image/jpeg": ".jpg",
        "image/png": ".png",
        "image/webp": ".webp",
      };
      ext = map[file.mimetype] || "";
    }
    cb(null, `room-${Date.now()}-${Math.round(Math.random() * 1e9)}${ext}`);
  },
});

const fileFilter = (req, file, cb) => {
  const ok = ["image/jpeg", "image/png", "image/webp"].includes(file.mimetype);
  cb(ok ? null : new Error("Only jpg/png/webp allowed"), ok);
};

const uploadRoomPhotos = multer({
  storage,
  fileFilter,
  limits: { fileSize: 3 * 1024 * 1024 }, // 3MB each
}).array("photos", 5);

export { uploadRoomPhotos };
