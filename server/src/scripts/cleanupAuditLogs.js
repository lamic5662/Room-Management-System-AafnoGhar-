import dotenv from "dotenv";
import mongoose from "mongoose";
import AuditLog from "../models/AuditLog.js";

dotenv.config();

async function run() {
  try {
    await mongoose.connect(process.env.MONGO_URI);

    const rawDays = Number(process.argv[2] || 180);
    if (!Number.isFinite(rawDays) || rawDays < 30) {
      console.log("Please provide days >= 30.");
      process.exit(1);
    }

    const days = Math.min(3650, Math.floor(rawDays));
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - days);

    const result = await AuditLog.deleteMany({ createdAt: { $lt: cutoff } });
    console.log(`✅ Deleted ${result.deletedCount} audit logs older than ${days} days.`);
    process.exit(0);
  } catch (err) {
    console.error("❌ Error:", err.message);
    process.exit(1);
  }
}

run();
