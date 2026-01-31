import Room from "../models/Room.js";
import Request from "../models/Request.js";
import Agreement from "../models/Agreement.js";
import Payment from "../models/payment.js";
import Complaint from "../models/Complaint.js";
import User from "../models/User.js";

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
        ] = await Promise.all([
            Room.countDocuments({ owner: ownerId }),
            Request.countDocuments({ owner: ownerId, status: "pending" }),
            Agreement.countDocuments({ owner: ownerId, status: "active" }),
            Payment.countDocuments({ owner: ownerId, status: "pending" }),
            Complaint.countDocuments({ owner: ownerId, status: { $ne: "resolved" } }),
        ]);

        res.json({
            rooms,
            pendingRequests,
            activeAgreements,
            pendingPayments,
            openComplaints,
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

        res.json({
            myRequests,
            myAgreements,
            pendingPayments,
            openComplaints,
        });
    } catch (err) {
        console.log("Tenant stats error:", err.message);
        res.status(500).json({ message: "Server error" });
    }
};

const adminStats = async (req, res) => {
    try {
        if (req.user.role !== "admin") {
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
