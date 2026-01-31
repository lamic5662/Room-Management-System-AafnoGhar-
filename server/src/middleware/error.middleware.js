// Centralized error handler (especially for multer/file uploads)
export default function errorHandler(err, req, res, next) {
  if (res.headersSent) return next(err);

  // Mongoose validation errors
  if (err?.name === "ValidationError") {
    return res.status(400).json({ message: err.message || "Validation error" });
  }

  // Duplicate key (unique index)
  if (err?.code === 11000) {
    return res.status(409).json({ message: "Duplicate key error" });
  }

  // Multer/file upload errors
  if (err?.name === "MulterError") {
    return res.status(400).json({ message: err.message });
  }

  if (err?.message && /only .* allowed/i.test(err.message)) {
    return res.status(400).json({ message: err.message });
  }

  console.error("Unhandled error:", err);
  return res.status(500).json({ message: "Server error" });
}
