import mongoose from "mongoose";
import Complaint from "../models/Complaint.js";
import Agreement from "../models/Agreement.js";
import { notifyUser } from "../services/notify.service.js";

const CATEGORY_VALUES = ["plumbing", "electrical", "internet", "cleaning", "structural", "other"];
const PRIORITY_VALUES = ["low", "medium", "high", "urgent"];
const PRIORITY_WEIGHT = { urgent: 0, high: 1, medium: 2, low: 3 };

// TENANT: create complaint
const createComplaint = async (req, res) => {
    try {
        if (req.user.role !== "tenant") {
            return res.status(403).json({ message: "Tenant access only" });
        }

        let { agreementId, title, description, message, category, priority } = req.body || {};
        if (!title || !description) {
            if (message) {
                if (!title) title = "Complaint";
                if (!description) description = message;
            }
        }
        if (!agreementId || !title || !description) {
            return res.status(400).json({ message: "agreementId, title, description are required" });
        }
        if (category && !CATEGORY_VALUES.includes(category)) {
            return res.status(400).json({ message: "Invalid category" });
        }
        if (priority && !PRIORITY_VALUES.includes(priority)) {
            return res.status(400).json({ message: "Invalid priority" });
        }
        if (!mongoose.Types.ObjectId.isValid(agreementId)) {
            return res.status(400).json({ message: "Invalid agreementId" });
        }

        const agreement = await Agreement.findById(agreementId);
        if (!agreement) return res.status(404).json({ message: "Agreement not found" });

        if (String(agreement.tenant) !== String(req.user._id)) {
            return res.status(403).json({ message: "Not your agreement" });
        }
        if (agreement.status !== "active") {
            return res.status(400).json({ message: "Agreement is not active" });
        }

        const complaint = await Complaint.create({
            agreement: agreement._id,
            room: agreement.room,
            owner: agreement.owner,
            tenant: agreement.tenant,
            title,
            description,
            category: category || "other",
            priority: priority || "medium",
        });

        notifyUser({
            userId: agreement.owner,
            title: "New maintenance request",
            message: `Maintenance request from ${req.user.fullName || "tenant"}`,
            type: "complaint",
            data: { complaintId: complaint._id, agreementId: agreement._id, url: "/owner/complaints" },
        });

        res.status(201).json({ message: "Complaint submitted", complaint });
    } catch (err) {
        console.log("Create complaint error:", err.message);
        res.status(500).json({ message: "Server error" });
    }
};

// TENANT: list my complaints
const myComplaints = async (req, res) => {
    try {
        if (req.user.role !== "tenant") {
            return res.status(403).json({ message: "Tenant access only" });
        }

        const complaints = await Complaint.find({ tenant: req.user._id })
            .populate("room", "title location photos")
            .populate("owner", "fullName phone email")
            .populate("agreement", "monthlyRent status")
            .sort({ createdAt: -1 });

        const sorted = complaints.sort((a, b) => {
            const pa = PRIORITY_WEIGHT[a.priority || "medium"] ?? 2;
            const pb = PRIORITY_WEIGHT[b.priority || "medium"] ?? 2;
            if (pa !== pb) return pa - pb;
            return new Date(b.createdAt) - new Date(a.createdAt);
        });
        res.json({ count: sorted.length, complaints: sorted });
    } catch (err) {
        console.log("My complaints error:", err.message);
        res.status(500).json({ message: "Server error" });
    }
};

// OWNER: list incoming complaints
const incomingComplaints = async (req, res) => {
    try {
        if (req.user.role !== "owner") {
            return res.status(403).json({ message: "Owner access only" });
        }

        const complaints = await Complaint.find({ owner: req.user._id })
            .populate("room", "title location photos")
            .populate("tenant", "fullName phone email")
            .populate("agreement", "monthlyRent status")
            .sort({ createdAt: -1 });

        const sorted = complaints.sort((a, b) => {
            const pa = PRIORITY_WEIGHT[a.priority || "medium"] ?? 2;
            const pb = PRIORITY_WEIGHT[b.priority || "medium"] ?? 2;
            if (pa !== pb) return pa - pb;
            return new Date(b.createdAt) - new Date(a.createdAt);
        });
        res.json({ count: sorted.length, complaints: sorted });
    } catch (err) {
        console.log("Incoming complaints error:", err.message);
        res.status(500).json({ message: "Server error" });
    }
};

// OWNER: update complaint status + reply
const ownerUpdateComplaint = async (req, res) => {
    try {
        if (req.user.role !== "owner") {
            return res.status(403).json({ message: "Owner access only" });
        }

        const { id } = req.params;
        const { status, ownerReply } = req.body || {};

        if (status && !["open", "in_progress", "resolved", "rejected"].includes(status)) {
            return res.status(400).json({ message: "Invalid status" });
        }
        const complaint = await Complaint.findById(id);
        if (!complaint) return res.status(404).json({ message: "Complaint not found" });

        if (String(complaint.owner) !== String(req.user._id)) {
            return res.status(403).json({ message: "Not your complaint" });
        }

        if (status) complaint.status = status;
        if (ownerReply !== undefined) complaint.ownerReply = ownerReply;
        await complaint.save();

        notifyUser({
            userId: complaint.tenant,
            title: "Complaint updated",
            message: "Owner updated your maintenance request",
            type: "complaint",
            data: { complaintId: complaint._id, agreementId: complaint.agreement, url: "/tenant/complaints" },
        });

        res.json({ message: "Complaint updated", complaint });
    } catch (err) {
        console.log("Owner update complaint error:", err.message);
        res.status(500).json({ message: "Server error" });
    }
};

export { createComplaint, myComplaints, incomingComplaints, ownerUpdateComplaint };
