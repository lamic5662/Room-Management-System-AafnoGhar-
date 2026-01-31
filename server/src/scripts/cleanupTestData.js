import dotenv from "dotenv";
import mongoose from "mongoose";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import User from "../models/User.js";
import Room from "../models/Room.js";
import Request from "../models/Request.js";
import Agreement from "../models/Agreement.js";
import Payment from "../models/Payment.js";
import Complaint from "../models/Complaint.js";
import ExitRequest from "../models/ExitRequest.js";
import Offer from "../models/Offer.js";
import Rule from "../models/Rule.js";
import ElectricityBill from "../models/ElectricityBill.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, "..", "..", ".env") });

const TEST_EMAILS = [
  "owner1@test.com",
  "tenant1@test.com",
  "admin@test.com",
];

const safeUnlink = (p) => {
  if (!p) return;
  const uploadsRoot = path.join(process.cwd(), "uploads");
  let rel = "";

  if (p.startsWith("http://") || p.startsWith("https://")) return;
  if (path.isAbsolute(p)) {
    if (p.includes(`${path.sep}uploads${path.sep}`) || p.includes("/uploads/")) {
      const idx = p.lastIndexOf(`${path.sep}uploads${path.sep}`);
      const idx2 = p.lastIndexOf("/uploads/");
      const cut = idx >= 0 ? idx + 1 : idx2 + 1;
      rel = p.slice(cut);
    } else {
      return;
    }
  } else if (p.startsWith("/uploads/")) {
    rel = p.slice(1);
  } else if (p.startsWith("uploads/")) {
    rel = p;
  } else if (p.includes("uploads/")) {
    rel = p.slice(p.indexOf("uploads/"));
  } else {
    return;
  }

  const full = path.normalize(path.join(process.cwd(), rel));
  if (!full.startsWith(uploadsRoot)) return;
  fs.unlink(full, () => {});
};

async function run() {
  try {
    await mongoose.connect(process.env.MONGO_URI);

    const users = await User.find({ email: { $in: TEST_EMAILS } }).select("_id email");
    const userIds = users.map((u) => u._id);

    if (userIds.length === 0) {
      console.log("No test users found.");
      process.exit(0);
    }

    const rooms = await Room.find({ owner: { $in: userIds } }).select("_id photos");
    const roomIds = rooms.map((r) => r._id);
    rooms.forEach((r) => (r.photos || []).forEach((p) => safeUnlink(p)));

    users.forEach((u) => {
      safeUnlink(u.kyc?.docFrontUrl);
      safeUnlink(u.kyc?.docBackUrl);
      safeUnlink(u.kyc?.selfieUrl);
    });

    const results = await Promise.all([
      Request.deleteMany({ $or: [{ owner: { $in: userIds } }, { tenant: { $in: userIds } }] }),
      Agreement.deleteMany({ $or: [{ owner: { $in: userIds } }, { tenant: { $in: userIds } }] }),
      Payment.deleteMany({ $or: [{ owner: { $in: userIds } }, { tenant: { $in: userIds } }] }),
      Complaint.deleteMany({ $or: [{ owner: { $in: userIds } }, { tenant: { $in: userIds } }] }),
      ExitRequest.deleteMany({ $or: [{ owner: { $in: userIds } }, { tenant: { $in: userIds } }] }),
      Offer.deleteMany({ $or: [{ owner: { $in: userIds } }, { tenant: { $in: userIds } }] }),
      Rule.deleteMany({ owner: { $in: userIds } }),
      ElectricityBill.deleteMany({ $or: [{ owner: { $in: userIds } }, { tenant: { $in: userIds } }] }),
      Room.deleteMany({ owner: { $in: userIds } }),
    ]);

    const [
      reqRes,
      agrRes,
      payRes,
      comRes,
      exitRes,
      offerRes,
      ruleRes,
      elecRes,
      roomRes,
    ] = results;

    const userRes = await User.deleteMany({ _id: { $in: userIds } });

    console.log("Deleted test data:");
    console.log("  users:", userRes.deletedCount);
    console.log("  rooms:", roomRes.deletedCount);
    console.log("  requests:", reqRes.deletedCount);
    console.log("  agreements:", agrRes.deletedCount);
    console.log("  payments:", payRes.deletedCount);
    console.log("  complaints:", comRes.deletedCount);
    console.log("  exits:", exitRes.deletedCount);
    console.log("  offers:", offerRes.deletedCount);
    console.log("  rules:", ruleRes.deletedCount);
    console.log("  electricity bills:", elecRes.deletedCount);

    if (roomIds.length) {
      console.log("  roomIds removed:", roomIds.length);
    }

    process.exit(0);
  } catch (err) {
    console.error("Cleanup error:", err.message);
    process.exit(1);
  }
}

run();
