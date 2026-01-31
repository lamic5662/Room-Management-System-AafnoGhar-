import fs from "fs";
import path from "path";
import User from "../models/User.js";
import Room from "../models/Room.js";
import Request from "../models/Request.js";
import Agreement from "../models/Agreement.js";
import Payment from "../models/payment.js";
import Complaint from "../models/Complaint.js";
import ExitRequest from "../models/ExitRequest.js";
import Offer from "../models/Offer.js";
import Rule from "../models/Rule.js";

// GET /api/admin/users?search=...&role=...
const listUsers = async (req, res) => {
    try {
        if (req.user.role !== "admin") {
            return res.status(403).json({ message: "Admin access only" });
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

// PATCH /api/admin/users/:id/role { role: "tenant"|"owner"|"admin" }
const updateUserRole = async (req, res) => {
    try {
        if (req.user.role !== "admin") {
            return res.status(403).json({ message: "Admin access only" });
        }

        const { role } = req.body || {};
        if (!["tenant", "owner", "admin"].includes(role)) {
            return res.status(400).json({ message: "Invalid role" });
        }

        // prevent admin from removing their own access
        if (String(req.user._id) === String(req.params.id) && role !== "admin") {
            return res.status(400).json({ message: "You cannot remove your own admin role" });
        }

        const user = await User.findByIdAndUpdate(
            req.params.id,
            { role },
            { new: true }
        ).select("-password");

        if (!user) return res.status(404).json({ message: "User not found" });

        res.json({ message: "Role updated", user });
    } catch (err) {
        console.log("Update user role error:", err.message);
        res.status(500).json({ message: "Server error" });
    }
};

const userSummary = async (req, res) => {
    try {
        if (req.user.role !== "admin") {
            return res.status(403).json({ message: "Admin access only" });
        }

        const [ownerCount, tenantCount, adminCount] = await Promise.all([
            User.countDocuments({ role: "owner" }),
            User.countDocuments({ role: "tenant" }),
            User.countDocuments({ role: "admin" }),
        ]);

        res.json({ owner: ownerCount, tenant: tenantCount, admin: adminCount });
    } catch (err) {
        console.log("User summary error:", err.message);
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
        if (req.user.role !== "admin") {
            return res.status(403).json({ message: "Admin access only" });
        }

        const userId = req.params.id;

        if (String(req.user._id) === String(userId)) {
            return res.status(400).json({ message: "You cannot delete your own account" });
        }

        const user = await User.findById(userId);
        if (!user) return res.status(404).json({ message: "User not found" });

        // remove user KYC files (if any)
        safeUnlink(user.kyc?.docFrontUrl);
        safeUnlink(user.kyc?.docBackUrl);
        safeUnlink(user.kyc?.selfieUrl);

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

export { listUsers, updateUserRole, deleteUser, userSummary };
