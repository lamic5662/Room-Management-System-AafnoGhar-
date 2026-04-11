import fs from "fs";
import path from "path";
import mongoose from "mongoose";
import bcrypt from "bcryptjs";
import User from "../models/User.js";
import AuditLog from "../models/AuditLog.js";
import Room from "../models/Room.js";
import Request from "../models/Request.js";
import Agreement from "../models/Agreement.js";
import Payment from "../models/payment.js";
import Complaint from "../models/Complaint.js";
import ExitRequest from "../models/ExitRequest.js";
import Offer from "../models/Offer.js";
import Rule from "../models/Rule.js";
import Visit from "../models/Visit.js";
import { listFeatureFlags, setFeatureFlag, FEATURE_FLAG_DEFINITIONS } from "../services/featureFlag.service.js";
import { getResponseThresholds } from "../services/responseStats.service.js";
import { logAdminAction } from "../services/auditLog.service.js";

// GET /api/admin/users?search=...&role=...
const listUsers = async (req, res) => {
    try {
        if (req.user.role !== "super_admin") {
            return res.status(403).json({ message: "Super admin access only" });
        }

        const { search = "", role = "" } = req.query;

        const q = {};
        if (role) q.role = role;

        if (search) {
            q.$or = [
                { fullName: { $regex: search, $options: "i" } },
                { email: { $regex: search, $options: "i" } },
                { phone: { $regex: search, $options: "i" } },
            ];
        }

        const users = await User.find(q).sort({ createdAt: -1 }).select("-password");
        res.json({ count: users.length, users });
    } catch (err) {
        console.log("List users error:", err.message);
        res.status(500).json({ message: "Server error" });
    }
};

const buildAuditQuery = (query = {}) => {
    const {
        action = "",
        entityType = "",
        adminId = "",
        entityId = "",
        from = "",
        to = "",
    } = query;

    const q = {};
    if (action) q.action = { $regex: action, $options: "i" };
    if (entityType) q.entityType = { $regex: entityType, $options: "i" };
    if (adminId && mongoose.Types.ObjectId.isValid(adminId)) q.admin = adminId;
    if (entityId && mongoose.Types.ObjectId.isValid(entityId)) q.entityId = entityId;

    const createdAt = {};
    if (from) {
        const fromDate = new Date(`${from}T00:00:00`);
        if (!Number.isNaN(fromDate.getTime())) {
            createdAt.$gte = fromDate;
        }
    }
    if (to) {
        const toDate = new Date(`${to}T23:59:59.999`);
        if (!Number.isNaN(toDate.getTime())) {
            createdAt.$lte = toDate;
        }
    }
    if (Object.keys(createdAt).length) {
        q.createdAt = createdAt;
    }

    return q;
};

const listAuditLogs = async (req, res) => {
    try {
        if (req.user.role !== "super_admin") {
            return res.status(403).json({ message: "Super admin access only" });
        }

        const { page = "1", limit = "20" } = req.query;
        const q = buildAuditQuery(req.query);

        const pageNum = Math.max(1, Number(page) || 1);
        const limitNum = Math.min(100, Math.max(5, Number(limit) || 20));
        const skip = (pageNum - 1) * limitNum;

        const [total, logs] = await Promise.all([
            AuditLog.countDocuments(q),
            AuditLog.find(q)
                .sort({ createdAt: -1 })
                .skip(skip)
                .limit(limitNum)
                .populate("admin", "fullName email"),
        ]);

        res.json({
            count: logs.length,
            total,
            page: pageNum,
            limit: limitNum,
            pages: Math.ceil(total / limitNum),
            logs,
        });
    } catch (err) {
        console.log("List audit logs error:", err.message);
        res.status(500).json({ message: "Server error" });
    }
};

const exportAuditLogs = async (req, res) => {
    try {
        if (req.user.role !== "super_admin") {
            return res.status(403).json({ message: "Super admin access only" });
        }

        const { limit = "5000" } = req.query;
        const limitNum = Math.min(20000, Math.max(1, Number(limit) || 5000));
        const q = buildAuditQuery(req.query);

        const logs = await AuditLog.find(q)
            .sort({ createdAt: -1 })
            .limit(limitNum)
            .populate("admin", "fullName email");

        const headers = [
            "Time",
            "Admin Name",
            "Admin Email",
            "Action",
            "Entity Type",
            "Entity Id",
            "IP",
            "User Agent",
            "Meta",
        ];

        const escapeCsv = (value) => {
            if (value === null || value === undefined) return "";
            const str = String(value);
            if (/[",\n]/.test(str)) {
                return `"${str.replace(/"/g, '""')}"`;
            }
            return str;
        };

        const rows = logs.map((log) => [
            escapeCsv(new Date(log.createdAt).toISOString()),
            escapeCsv(log.admin?.fullName || ""),
            escapeCsv(log.admin?.email || ""),
            escapeCsv(log.action || ""),
            escapeCsv(log.entityType || ""),
            escapeCsv(log.entityId || ""),
            escapeCsv(log.ip || ""),
            escapeCsv(log.userAgent || ""),
            escapeCsv(JSON.stringify(log.meta || {})),
        ]);

        const csv = [headers.join(","), ...rows.map((r) => r.join(","))].join("\n");

        res.setHeader("Content-Type", "text/csv; charset=utf-8");
        res.setHeader(
            "Content-Disposition",
            `attachment; filename="audit-logs-${Date.now()}.csv"`
        );
        res.send(csv);
    } catch (err) {
        console.log("Export audit logs error:", err.message);
        res.status(500).json({ message: "Server error" });
    }
};

const cleanupAuditLogs = async (req, res) => {
    try {
        if (req.user.role !== "super_admin") {
            return res.status(403).json({ message: "Super admin access only" });
        }

        const daysRaw = req.body?.days;
        const days = Math.max(30, Math.min(3650, Number(daysRaw || 180)));
        if (!Number.isFinite(days)) {
            return res.status(400).json({ message: "Invalid days value" });
        }

        const cutoff = new Date();
        cutoff.setDate(cutoff.getDate() - Math.floor(days));

        const result = await AuditLog.deleteMany({ createdAt: { $lt: cutoff } });

        logAdminAction({
            adminId: req.user._id,
            action: "audit.cleanup",
            entityType: "audit",
            meta: { days, deleted: result.deletedCount },
            req,
        });

        res.json({ message: "Audit logs cleaned", deleted: result.deletedCount });
    } catch (err) {
        console.log("Cleanup audit logs error:", err.message);
        res.status(500).json({ message: "Server error" });
    }
};

const createStaffUser = async (req, res) => {
    try {
        if (req.user.role !== "super_admin") {
            return res.status(403).json({ message: "Super admin access only" });
        }

        const { fullName, email, phone, password, role } = req.body || {};
        if (!fullName || !email || !phone || !password || !role) {
            return res.status(400).json({ message: "All fields are required" });
        }

        if (!["admin", "moderator"].includes(role)) {
            return res.status(400).json({ message: "Role must be admin or moderator" });
        }

        const emailNorm = String(email).toLowerCase().trim();
        const phoneNorm = String(phone).trim();

        const existingEmail = await User.findOne({ email: emailNorm });
        if (existingEmail) return res.status(409).json({ message: "Email already used" });

        const existingPhone = await User.findOne({ phone: phoneNorm });
        if (existingPhone) return res.status(409).json({ message: "Phone already used" });

        const hashed = await bcrypt.hash(String(password), 10);
        const user = await User.create({
            fullName: String(fullName).trim(),
            email: emailNorm,
            phone: phoneNorm,
            role,
            password: hashed,
        });

        logAdminAction({
            adminId: req.user._id,
            action: "staff.create",
            entityType: "user",
            entityId: user._id,
            meta: { role, email: user.email, name: user.fullName },
            req,
        });

        res.status(201).json({
            message: "Staff account created",
            user: {
                id: user._id,
                fullName: user.fullName,
                email: user.email,
                phone: user.phone,
                role: user.role,
            },
        });
    } catch (err) {
        console.log("Create staff user error:", err.message);
        res.status(500).json({ message: "Server error" });
    }
};

// PATCH /api/admin/users/:id/role { role: "tenant"|"owner"|"admin" }
const updateUserRole = async (req, res) => {
    try {
        if (req.user.role !== "super_admin") {
            return res.status(403).json({ message: "Super admin access only" });
        }

        const { role } = req.body || {};
        if (!["tenant", "owner", "admin", "moderator", "super_admin"].includes(role)) {
            return res.status(400).json({ message: "Invalid role" });
        }

        // prevent admin/super admin from removing their own access
        if (String(req.user._id) === String(req.params.id) && role !== req.user.role) {
            return res.status(400).json({ message: "You cannot change your own admin role" });
        }

        const existing = await User.findById(req.params.id).select("role fullName email");
        if (!existing) return res.status(404).json({ message: "User not found" });

        const user = await User.findByIdAndUpdate(
            req.params.id,
            { role },
            { new: true }
        ).select("-password");

        if (!user) return res.status(404).json({ message: "User not found" });

        logAdminAction({
            adminId: req.user._id,
            action: "user.role.update",
            entityType: "user",
            entityId: user._id,
            meta: { from: existing.role, to: role, name: existing.fullName, email: existing.email },
            req,
        });

        res.json({ message: "Role updated", user });
    } catch (err) {
        console.log("Update user role error:", err.message);
        res.status(500).json({ message: "Server error" });
    }
};

// PATCH /api/admin/users/:id/password { password: "..." }
const resetStaffPassword = async (req, res) => {
    try {
        if (req.user.role !== "super_admin") {
            return res.status(403).json({ message: "Super admin access only" });
        }

        const { password } = req.body || {};
        if (!password) {
            return res.status(400).json({ message: "Password is required" });
        }

        const user = await User.findById(req.params.id).select("role fullName email");
        if (!user) return res.status(404).json({ message: "User not found" });

        if (!["admin", "moderator"].includes(user.role)) {
            return res.status(400).json({ message: "Only admin or moderator passwords can be reset" });
        }

        const hashed = await bcrypt.hash(String(password), 10);
        user.password = hashed;
        await user.save();

        logAdminAction({
            adminId: req.user._id,
            action: "staff.password.reset",
            entityType: "user",
            entityId: user._id,
            meta: { role: user.role, email: user.email, name: user.fullName },
            req,
        });

        res.json({ message: "Password reset" });
    } catch (err) {
        console.log("Reset staff password error:", err.message);
        res.status(500).json({ message: "Server error" });
    }
};

const userSummary = async (req, res) => {
    try {
        if (req.user.role !== "super_admin") {
            return res.status(403).json({ message: "Super admin access only" });
        }

        const [ownerCount, tenantCount, adminCount, moderatorCount, superAdminCount, responseAgg] = await Promise.all([
            User.countDocuments({ role: "owner" }),
            User.countDocuments({ role: "tenant" }),
            User.countDocuments({ role: "admin" }),
            User.countDocuments({ role: "moderator" }),
            User.countDocuments({ role: "super_admin" }),
            User.aggregate([
                { $match: { role: "owner" } },
                {
                    $group: {
                        _id: null,
                        ownersWithResponses: {
                            $sum: {
                                $cond: [
                                    { $gt: ["$responseStats.count", 0] },
                                    1,
                                    0,
                                ],
                            },
                        },
                        fastResponders: {
                            $sum: {
                                $cond: ["$responseStats.fastResponder", 1, 0],
                            },
                        },
                        totalResponses: { $sum: "$responseStats.count" },
                        totalWeightedMinutes: {
                            $sum: { $multiply: ["$responseStats.count", "$responseStats.avgMinutes"] },
                        },
                    },
                },
            ]),
        ]);

        const agg = responseAgg?.[0] || {
            ownersWithResponses: 0,
            fastResponders: 0,
            totalResponses: 0,
            totalWeightedMinutes: 0,
        };
        const avgResponseMinutes = agg.totalResponses
            ? Math.round(agg.totalWeightedMinutes / agg.totalResponses)
            : 0;

        res.json({
            owner: ownerCount,
            tenant: tenantCount,
            admin: adminCount,
            moderator: moderatorCount,
            super_admin: superAdminCount,
            responseOwners: agg.ownersWithResponses || 0,
            fastResponders: agg.fastResponders || 0,
            totalResponses: agg.totalResponses || 0,
            avgResponseMinutes,
        });
    } catch (err) {
        console.log("User summary error:", err.message);
        res.status(500).json({ message: "Server error" });
    }
};

const userRoomStats = async (req, res) => {
    try {
        if (req.user.role !== "super_admin") {
            return res.status(403).json({ message: "Super admin access only" });
        }

        const requestedLimit = parseInt(req.query.limit, 10);
        const limit = Number.isSafeInteger(requestedLimit) ? Math.min(30, Math.max(3, requestedLimit)) : 6;

        const stats = await Room.aggregate([
            {
                $group: {
                    _id: "$owner",
                    totalRooms: { $sum: 1 },
                    publishedRooms: { $sum: { $cond: ["$isPublished", 1, 0] } },
                    latestRoomAt: { $max: "$createdAt" },
                },
            },
            { $sort: { totalRooms: -1 } },
            { $limit: limit },
            {
                $lookup: {
                    from: "users",
                    localField: "_id",
                    foreignField: "_id",
                    as: "owner",
                },
            },
            {
                $unwind: {
                    path: "$owner",
                    preserveNullAndEmptyArrays: true,
                },
            },
            {
                $project: {
                    ownerId: "$_id",
                    totalRooms: 1,
                    publishedRooms: 1,
                    latestRoomAt: 1,
                    ownerName: "$owner.fullName",
                    ownerEmail: "$owner.email",
                    ownerPhone: "$owner.phone",
                    ownerRole: "$owner.role",
                },
            },
        ]);

    res.json({ stats });
  } catch (err) {
    console.log("User room stats error:", err.message);
    res.status(500).json({ message: "Server error" });
  }
};

const diffMinutes = (startAt, endAt) => {
    const start = new Date(startAt);
    const end = new Date(endAt);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return null;
    return Math.max(0, Math.round((end - start) / 60000));
};

const buildResponseStatsForOwner = async (ownerId) => {
    const [requests, offers, visits] = await Promise.all([
        Request.find({ owner: ownerId, status: { $in: ["approved", "rejected"] } }).select("createdAt updatedAt"),
        Offer.find({ owner: ownerId, status: { $in: ["countered", "rejected", "accepted"] } }).select(
            "createdAt updatedAt status ownerReply lastTenantActionAt"
        ),
        Visit.find({ owner: ownerId, status: "approved" }).select("createdAt updatedAt"),
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

const recomputeResponseStats = async (req, res) => {
    try {
        if (req.user.role !== "super_admin") {
            return res.status(403).json({ message: "Super admin access only" });
        }

        const { ownerId, mode = "recompute" } = req.body || {};
        if (ownerId && !mongoose.Types.ObjectId.isValid(ownerId)) {
            return res.status(400).json({ message: "Invalid ownerId" });
        }

        const ownerIds = ownerId
            ? [ownerId]
            : (await User.find({ role: "owner" }).select("_id")).map((u) => u._id);

        if (mode === "reset") {
            await User.updateMany(
                { _id: { $in: ownerIds } },
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
            logAdminAction({
                adminId: req.user._id,
                action: "response_stats.reset",
                entityType: "response_stats",
                entityId: ownerId || null,
                meta: { mode, ownerCount: ownerIds.length },
                req,
            });
            return res.json({
                message: "Response stats reset",
                updated: ownerIds.length,
                thresholds: getResponseThresholds(),
            });
        }

        for (const id of ownerIds) {
            const stats = await buildResponseStatsForOwner(id);
            await User.updateOne({ _id: id }, { $set: { responseStats: stats } });
        }

        logAdminAction({
            adminId: req.user._id,
            action: "response_stats.recompute",
            entityType: "response_stats",
            entityId: ownerId || null,
            meta: { mode, ownerCount: ownerIds.length },
            req,
        });

        res.json({
            message: "Response stats recomputed",
            updated: ownerIds.length,
            thresholds: getResponseThresholds(),
        });
    } catch (err) {
        console.log("Recompute response stats error:", err.message);
        res.status(500).json({ message: "Server error" });
    }
};

const listFeatureFlagsController = async (req, res) => {
  try {
    if (req.user.role !== "super_admin") return res.status(403).json({ message: "Super admin access only" });
    const flags = await listFeatureFlags();
    res.json({ flags });
  } catch (err) {
    console.log("List feature flags error:", err.message);
    res.status(500).json({ message: "Server error" });
  }
};

const updateFeatureFlagController = async (req, res) => {
  try {
    if (req.user.role !== "super_admin") return res.status(403).json({ message: "Super admin access only" });
    const { key } = req.params;
    if (!FEATURE_FLAG_DEFINITIONS[key]) return res.status(400).json({ message: "Invalid feature flag" });
    const { enabled } = req.body || {};
    if (typeof enabled !== "boolean") return res.status(400).json({ message: "Missing enabled boolean" });
    const flag = await setFeatureFlag(key, enabled);
    logAdminAction({
      adminId: req.user._id,
      action: "feature_flag.update",
      entityType: "feature_flag",
      entityId: null,
      meta: { key, enabled: flag?.enabled },
      req,
    });
    res.json({ flag });
  } catch (err) {
    console.log("Update feature flag error:", err.message);
    res.status(500).json({ message: "Server error" });
  }
};

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

// DELETE /api/admin/users/:id
const deleteUser = async (req, res) => {
    try {
        if (req.user.role !== "super_admin") {
            return res.status(403).json({ message: "Super admin access only" });
        }

        const userId = req.params.id;

        if (String(req.user._id) === String(userId)) {
            return res.status(400).json({ message: "You cannot delete your own account" });
        }

        const user = await User.findById(userId);
        if (!user) return res.status(404).json({ message: "User not found" });

        logAdminAction({
            adminId: req.user._id,
            action: "user.delete",
            entityType: "user",
            entityId: user._id,
            meta: { role: user.role, email: user.email, name: user.fullName },
            req,
        });

        // remove user KYC files (if any) plus avatar
        safeUnlink(user.kyc?.docFrontUrl);
        safeUnlink(user.kyc?.docBackUrl);
        safeUnlink(user.kyc?.selfieUrl);
        safeUnlink(user.avatarUrl);

        // collect room ids for owner
        const rooms = await Room.find({ owner: userId }).select("_id photos");
        const roomIds = rooms.map((r) => r._id);
        rooms.forEach((r) => (r.photos || []).forEach((p) => safeUnlink(p)));

        // delete related records
        await Promise.all([
            Room.deleteMany({ owner: userId }),
            Request.deleteMany({ $or: [{ owner: userId }, { tenant: userId }, { room: { $in: roomIds } }] }),
            Agreement.deleteMany({ $or: [{ owner: userId }, { tenant: userId }, { room: { $in: roomIds } }] }),
            Payment.deleteMany({ $or: [{ owner: userId }, { tenant: userId }, { room: { $in: roomIds } }] }),
            Complaint.deleteMany({ $or: [{ owner: userId }, { tenant: userId }, { room: { $in: roomIds } }] }),
            ExitRequest.deleteMany({ $or: [{ owner: userId }, { tenant: userId }, { room: { $in: roomIds } }] }),
            Offer.deleteMany({ $or: [{ owner: userId }, { tenant: userId }, { room: { $in: roomIds } }] }),
            Rule.deleteMany({ $or: [{ owner: userId }, { room: { $in: roomIds } }] }),
        ]);

        await User.deleteOne({ _id: userId });

        // extra safety: remove orphan rooms (owners deleted previously)
        const remainingOwners = await User.find({}).select("_id");
        const ownerIds = remainingOwners.map((u) => u._id);
        await Room.deleteMany({ owner: { $nin: ownerIds } });

        res.json({ message: "User deleted" });
    } catch (err) {
        console.log("Delete user error:", err.message);
        res.status(500).json({ message: "Server error" });
    }
};

export {
  listUsers,
  listAuditLogs,
  exportAuditLogs,
  cleanupAuditLogs,
  createStaffUser,
  updateUserRole,
  resetStaffPassword,
  deleteUser,
  userSummary,
  userRoomStats,
  recomputeResponseStats,
  listFeatureFlagsController,
  updateFeatureFlagController,
};
