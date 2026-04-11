import Room from "../models/Room.js";
import Request from "../models/Request.js";
import Agreement from "../models/Agreement.js";
import Payment from "../models/payment.js";
import Complaint from "../models/Complaint.js";
import User from "../models/User.js";
import ExitRequest from "../models/ExitRequest.js";

const ownerStats = async (req, res) => {
    try {
        if (req.user.role !== "owner") {
            return res.status(403).json({ message: "Owner access only" });
        }

        const ownerId = req.user._id;

        const [
            rooms,
            pendingRequests,
            activeAgreements,
            pendingPayments,
            openComplaints,
            ownerProfile,
            recentMaintenance,
        ] = await Promise.all([
            Room.countDocuments({ owner: ownerId }),
            Request.countDocuments({ owner: ownerId, status: "pending" }),
            Agreement.countDocuments({ owner: ownerId, status: "active" }),
            Payment.countDocuments({ owner: ownerId, status: "pending" }),
            Complaint.countDocuments({ owner: ownerId, status: { $ne: "resolved" } }),
            User.findById(ownerId).select("responseStats"),
            Complaint.find({ owner: ownerId })
                .populate("room", "title")
                .populate("agreement", "_id")
                .sort({ createdAt: -1 })
                .limit(6),
        ]);

        const responseStats = ownerProfile?.responseStats || {};

        res.json({
            rooms,
            pendingRequests,
            activeAgreements,
            pendingPayments,
            openComplaints,
            responseCount: responseStats.count || 0,
            responseAvgMinutes: responseStats.avgMinutes || 0,
            fastResponder: Boolean(responseStats.fastResponder),
            recentMaintenance: (recentMaintenance || []).map((c) => ({
                _id: c._id,
                roomTitle: c.room?.title || "Room",
                agreementId: c.agreement?._id || c.agreement,
                status: c.status,
                priority: c.priority || "medium",
                category: c.category || "other",
                createdAt: c.createdAt,
            })),
        });
    } catch (err) {
        console.log("Owner stats error:", err.message);
        res.status(500).json({ message: "Server error" });
    }
};

const tenantStats = async (req, res) => {
    try {
        if (req.user.role !== "tenant") {
            return res.status(403).json({ message: "Tenant access only" });
        }

        const tenantId = req.user._id;

        const [
            myRequests,
            myAgreements,
            pendingPayments,
            openComplaints,
        ] = await Promise.all([
            Request.countDocuments({ tenant: tenantId }),
            Agreement.countDocuments({ tenant: tenantId, status: "active" }),
            Payment.countDocuments({ tenant: tenantId, status: "pending" }),
            Complaint.countDocuments({ tenant: tenantId, status: { $ne: "resolved" } }),
        ]);

        const recentExits = await ExitRequest.find({ tenant: tenantId, status: "settled" })
            .populate("room", "title")
            .sort({ settlementPaidAt: -1, updatedAt: -1, createdAt: -1 })
            .limit(10);

        let ratePrompt = null;
        if (recentExits.length) {
            const roomIds = [...new Set(recentExits.map((e) => String(e.room?._id || e.room || "")).filter(Boolean))];
            const rooms = await Room.find({ _id: { $in: roomIds } }).select("title ratings");
            const roomMap = new Map(rooms.map((r) => [String(r._id), r]));

            for (const exit of recentExits) {
                const roomId = String(exit.room?._id || exit.room || "");
                const room = roomMap.get(roomId);
                if (!room) continue;
                const alreadyRated = (room.ratings || []).some((r) => String(r.user) === String(tenantId));
                if (!alreadyRated) {
                    ratePrompt = {
                        roomId,
                        roomTitle: room.title || exit.room?.title || "Room",
                    };
                    break;
                }
            }
        }

        res.json({
            myRequests,
            myAgreements,
            pendingPayments,
            openComplaints,
            ratePrompt,
        });
    } catch (err) {
        console.log("Tenant stats error:", err.message);
        res.status(500).json({ message: "Server error" });
    }
};

const adminStats = async (req, res) => {
    try {
        if (!["admin", "super_admin"].includes(req.user.role)) {
            return res.status(403).json({ message: "Admin access only" });
        }

        const [
            totalUsers,
            owners,
            tenants,
            rooms,
            pendingKyc,
        ] = await Promise.all([
            User.countDocuments({}),
            User.countDocuments({ role: "owner" }),
            User.countDocuments({ role: "tenant" }),
            Room.countDocuments({}),
            User.countDocuments({ "kyc.status": "pending" }),
        ]);

        res.json({
            totalUsers,
            owners,
            tenants,
            rooms,
            pendingKyc,
        });
    } catch (err) {
        console.log("Admin stats error:", err.message);
        res.status(500).json({ message: "Server error" });
    }
};

export { ownerStats, tenantStats, adminStats };
