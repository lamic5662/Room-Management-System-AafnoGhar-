import Room from "../models/Room.js";
import { evaluateRoomFraud } from "../services/fraud.service.js";
import { cleanupRoomResources } from "./room.controller.js";
import { applyAutoFraudPolicy } from "../services/autoFraud.service.js";
import { logAdminAction } from "../services/auditLog.service.js";

const mergeTrendData = (flaggedRows, improvementRows, publishedRows, days, startDate) => {
  const flaggedMap = new Map(flaggedRows.map((row) => [row._id, row.count || 0]));
  const improvementMap = new Map(improvementRows.map((row) => [row._id, row.count || 0]));
  const publishedMap = new Map(publishedRows.map((row) => [row._id, row.count || 0]));

  const trend = [];
  for (let i = 0; i < days; i += 1) {
    const date = new Date(startDate);
    date.setDate(startDate.getDate() + i);
    const iso = date.toISOString().slice(0, 10);
    const label = date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
    trend.push({
      date: iso,
      label,
      flagged: flaggedMap.get(iso) || 0,
      improvement: improvementMap.get(iso) || 0,
      publishedFlagged: publishedMap.get(iso) || 0,
    });
  }
  return trend;
};

const FRAUD_TREND_DAYS = 7;

const fraudSummary = async (req, res) => {
  try {
    if (!["admin", "super_admin", "moderator"].includes(req.user.role)) {
      return res.status(403).json({ message: "Admin access only" });
    }

    const [flagged, improvement, publishedFlagged] = await Promise.all([
      Room.countDocuments({ isFlagged: true }),
      Room.countDocuments({ requiresImprovement: true }),
      Room.countDocuments({ isFlagged: true, isPublished: true }),
    ]);

    res.json({
      flaggedRooms: flagged,
      improvementRequests: improvement,
      publishedFlaggedRooms: publishedFlagged,
    });
  } catch (err) {
    console.log("Fraud summary error:", err.message);
    res.status(500).json({ message: "Server error" });
  }
};

const fraudTrend = async (req, res) => {
  try {
    if (!["admin", "super_admin", "moderator"].includes(req.user.role)) {
      return res.status(403).json({ message: "Admin access only" });
    }

    const now = new Date();
    const startDate = new Date(now);
    startDate.setHours(0, 0, 0, 0);
    startDate.setDate(startDate.getDate() - (FRAUD_TREND_DAYS - 1));

    const flaggedPipeline = [
      { $match: { isFlagged: true, createdAt: { $gte: startDate } } },
      {
        $group: {
          _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } },
          count: { $sum: 1 },
        },
      },
      { $sort: { _id: 1 } },
    ];

    const improvementPipeline = [
      {
        $match: {
          requiresImprovement: true,
          improvementRequestedAt: { $gte: startDate },
        },
      },
      {
        $group: {
          _id: { $dateToString: { format: "%Y-%m-%d", date: "$improvementRequestedAt" } },
          count: { $sum: 1 },
        },
      },
      { $sort: { _id: 1 } },
    ];

    const publishedPipeline = [
      {
        $match: {
          isFlagged: true,
          isPublished: true,
          createdAt: { $gte: startDate },
        },
      },
      {
        $group: {
          _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } },
          count: { $sum: 1 },
        },
      },
      { $sort: { _id: 1 } },
    ];

    const [flaggedRows, improvementRows, publishedRows] = await Promise.all([
      Room.aggregate(flaggedPipeline),
      Room.aggregate(improvementPipeline),
      Room.aggregate(publishedPipeline),
    ]);

    const trend = mergeTrendData(flaggedRows, improvementRows, publishedRows, FRAUD_TREND_DAYS, startDate);

    res.json({
      trend,
      periodStart: startDate.toISOString().slice(0, 10),
      periodEnd: now.toISOString().slice(0, 10),
    });
  } catch (err) {
    console.log("Fraud trend error:", err.message);
    res.status(500).json({ message: "Server error" });
  }
};

const flaggedRooms = async (req, res) => {
  try {
    if (!["admin", "super_admin", "moderator"].includes(req.user.role)) {
      return res.status(403).json({ message: "Admin access only" });
    }

    const rooms = await Room.find({ isFlagged: true })
      .sort({ fraudScore: -1, createdAt: -1 })
      .populate("owner", "fullName email phone kyc");

    res.json({ count: rooms.length, rooms });
  } catch (err) {
    console.log("Flagged rooms error:", err.message);
    res.status(500).json({ message: "Server error" });
  }
};

const unflagRoom = async (req, res) => {
  try {
    if (!["admin", "super_admin", "moderator"].includes(req.user.role)) {
      return res.status(403).json({ message: "Admin access only" });
    }

    const room = await Room.findById(req.params.id);
    if (!room) return res.status(404).json({ message: "Room not found" });

    room.isFlagged = false;
    room.fraudScore = 0;
    room.fraudFlags = [];
    room.autoDisabledByFraud = false;
    room.autoDisabledAt = undefined;
    await room.save();

    logAdminAction({
      adminId: req.user._id,
      action: "room.unflag",
      entityType: "room",
      entityId: room._id,
      meta: { title: room.title },
      req,
    });

    res.json({ message: "Room unflagged", room });
  } catch (err) {
    console.log("Unflag room error:", err.message);
    res.status(500).json({ message: "Server error" });
  }
};

const disableRoom = async (req, res) => {
  try {
    if (!["admin", "super_admin", "moderator"].includes(req.user.role)) {
      return res.status(403).json({ message: "Admin access only" });
    }

    const room = await Room.findById(req.params.id);
    if (!room) return res.status(404).json({ message: "Room not found" });

    room.isPublished = false;
    room.autoDisabledByFraud = false;
    room.autoDisabledAt = undefined;
    room.autoDisabledByFraud = false;
    room.autoDisabledAt = undefined;
    await room.save();

    logAdminAction({
      adminId: req.user._id,
      action: "room.disable",
      entityType: "room",
      entityId: room._id,
      meta: { title: room.title },
      req,
    });

    res.json({ message: "Room disabled", room });
  } catch (err) {
    console.log("Disable room error:", err.message);
    res.status(500).json({ message: "Server error" });
  }
};

const enableRoom = async (req, res) => {
  try {
    if (!["admin", "super_admin", "moderator"].includes(req.user.role)) {
      return res.status(403).json({ message: "Admin access only" });
    }

    const room = await Room.findById(req.params.id);
    if (!room) return res.status(404).json({ message: "Room not found" });

    room.isPublished = true;
    room.autoDisabledByFraud = false;
    room.autoDisabledAt = undefined;
    await room.save();

    logAdminAction({
      adminId: req.user._id,
      action: "room.enable",
      entityType: "room",
      entityId: room._id,
      meta: { title: room.title },
      req,
    });

    res.json({ message: "Room enabled", room });
  } catch (err) {
    console.log("Enable room error:", err.message);
    res.status(500).json({ message: "Server error" });
  }
};

const requestImprovement = async (req, res) => {
  try {
    if (!["admin", "super_admin", "moderator"].includes(req.user.role)) {
      return res.status(403).json({ message: "Admin access only" });
    }
    const { id } = req.params;
    const { note } = req.body || {};
    if (!note || !note.trim()) {
      return res.status(400).json({ message: "Improvement note is required" });
    }
    const room = await Room.findById(id);
    if (!room) return res.status(404).json({ message: "Room not found" });

    room.isPublished = false;
    room.requiresImprovement = true;
    room.improvementNote = note.trim();
    room.improvementRequestedAt = new Date();
    await room.save();

    logAdminAction({
      adminId: req.user._id,
      action: "room.improvement.request",
      entityType: "room",
      entityId: room._id,
      meta: { note: note.trim(), title: room.title },
      req,
    });

    res.json({ message: "Improvement requested", room });
  } catch (err) {
    console.log("Request improvement error:", err.message);
    res.status(500).json({ message: "Server error" });
  }
};

const approveImprovement = async (req, res) => {
  try {
    if (!["admin", "super_admin", "moderator"].includes(req.user.role)) {
      return res.status(403).json({ message: "Admin access only" });
    }
    const { id } = req.params;
    const room = await Room.findById(id);
    if (!room) return res.status(404).json({ message: "Room not found" });
    if (!room.requiresImprovement) {
      return res.status(400).json({ message: "No improvement request pending" });
    }

    room.requiresImprovement = false;
    room.improvementNote = "";
    room.improvementRequestedAt = undefined;
    room.isPublished = true;
    room.isFlagged = false;
    room.fraudFlags = [];
    room.fraudScore = 0;
    room.autoDisabledByFraud = false;
    room.autoDisabledAt = undefined;
    await room.save();

    logAdminAction({
      adminId: req.user._id,
      action: "room.improvement.approve",
      entityType: "room",
      entityId: room._id,
      meta: { title: room.title },
      req,
    });

    res.json({ message: "Room approved", room });
  } catch (err) {
    console.log("Approve improvement error:", err.message);
    res.status(500).json({ message: "Server error" });
  }
};

const deleteFlaggedRoom = async (req, res) => {
  try {
    if (!["admin", "super_admin", "moderator"].includes(req.user.role)) {
      return res.status(403).json({ message: "Admin access only" });
    }
    const { id } = req.params;
    const room = await Room.findById(id);
    if (!room) return res.status(404).json({ message: "Room not found" });

    await cleanupRoomResources(room);

    logAdminAction({
      adminId: req.user._id,
      action: "room.delete",
      entityType: "room",
      entityId: room._id,
      meta: { title: room.title },
      req,
    });

    res.json({ message: "Room deleted" });
  } catch (err) {
    console.log("Delete flagged room error:", err.message);
    res.status(500).json({ message: "Server error" });
  }
};

const recalcFraud = async (req, res) => {
  try {
    if (!["admin", "super_admin", "moderator"].includes(req.user.role)) {
      return res.status(403).json({ message: "Admin access only" });
    }

    const room = await Room.findById(req.params.id);
    if (!room) return res.status(404).json({ message: "Room not found" });

    const { score, flags, isFlagged } = await evaluateRoomFraud(room);

    room.fraudScore = score;
    room.fraudFlags = flags;
    room.isFlagged = isFlagged;
    await applyAutoFraudPolicy(room, isFlagged);
    await room.save();

    logAdminAction({
      adminId: req.user._id,
      action: "room.fraud.recalc",
      entityType: "room",
      entityId: room._id,
      meta: { score, isFlagged },
      req,
    });

    res.json({ message: "Fraud score recalculated", room });
  } catch (err) {
    console.log("Recalc fraud error:", err.message);
    res.status(500).json({ message: "Server error" });
  }
};

export {
  flaggedRooms,
  unflagRoom,
  disableRoom,
  enableRoom,
  fraudSummary,
  fraudTrend,
  requestImprovement,
  approveImprovement,
  deleteFlaggedRoom,
  recalcFraud,
};
