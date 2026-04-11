import path from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";
import mongoose from "mongoose";
import { connectDB } from "../config/db.js";
import User from "../models/User.js";
import Request from "../models/Request.js";
import Offer from "../models/Offer.js";
import Visit from "../models/Visit.js";
import { getResponseThresholds } from "../services/responseStats.service.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const envPath = path.resolve(__dirname, "..", "..", ".env");
dotenv.config({ path: envPath });

const args = process.argv.slice(2);
const ownerIdx = args.findIndex((arg) => arg === "--owner");
const ownerId = ownerIdx >= 0 ? args[ownerIdx + 1] : null;
const mode = args.includes("--reset") ? "reset" : "recompute";

const diffMinutes = (startAt, endAt) => {
  const start = new Date(startAt);
  const end = new Date(endAt);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return null;
  return Math.max(0, Math.round((end - start) / 60000));
};

const buildResponseStatsForOwner = async (owner) => {
  const [requests, offers, visits] = await Promise.all([
    Request.find({ owner, status: { $in: ["approved", "rejected"] } }).select("createdAt updatedAt"),
    Offer.find({ owner, status: { $in: ["countered", "rejected", "accepted"] } }).select(
      "createdAt updatedAt status ownerReply lastTenantActionAt"
    ),
    Visit.find({ owner, status: "approved" }).select("createdAt updatedAt"),
  ]);

  const minutes = [];
  const respondedAts = [];

  const pushResponse = (createdAt, respondedAt) => {
    const diff = diffMinutes(createdAt, respondedAt);
    if (diff === null) return;
    minutes.push(diff);
    respondedAts.push(new Date(respondedAt).getTime());
  };

  requests.forEach((r) => pushResponse(r.createdAt, r.updatedAt));

  offers.forEach((o) => {
    const reply = String(o.ownerReply || "").toLowerCase();
    if (o.status === "accepted" && reply.includes("accepted by tenant")) return;
    const base = o.lastTenantActionAt || o.createdAt;
    pushResponse(base, o.updatedAt);
  });

  visits.forEach((v) => pushResponse(v.createdAt, v.updatedAt));

  const count = minutes.length;
  const avgMinutes = count ? Math.round(minutes.reduce((a, b) => a + b, 0) / count) : 0;
  const lastResponseAt = respondedAts.length ? new Date(Math.max(...respondedAts)) : null;
  const { minCount, maxAvgMinutes } = getResponseThresholds();
  const fastResponder = count >= minCount && avgMinutes <= maxAvgMinutes;

  return {
    count,
    avgMinutes,
    lastResponseAt,
    fastResponder,
  };
};

const run = async () => {
  await connectDB();

  const owners = ownerId
    ? [ownerId]
    : (await User.find({ role: "owner" }).select("_id")).map((u) => u._id);

  if (mode === "reset") {
    await User.updateMany(
      { _id: { $in: owners } },
      {
        $set: {
          responseStats: {
            count: 0,
            avgMinutes: 0,
            lastResponseAt: null,
            fastResponder: false,
          },
        },
      }
    );
    console.log(`Response stats reset for ${owners.length} owner(s).`);
  } else {
    for (const id of owners) {
      const stats = await buildResponseStatsForOwner(id);
      await User.updateOne({ _id: id }, { $set: { responseStats: stats } });
    }
    console.log(`Response stats recomputed for ${owners.length} owner(s).`);
  }

  await mongoose.connection.close();
};

run().catch((err) => {
  console.error("Recompute response stats script error:", err.message);
  mongoose.connection.close();
  process.exit(1);
});
