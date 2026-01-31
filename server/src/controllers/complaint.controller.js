import mongoose from "mongoose";
import Complaint from "../models/Complaint.js";
import Agreement from "../models/Agreement.js";
import { notifyUser } from "../services/notify.service.js";

// TENANT: create complaint
const createComplaint = async (req, res) => {
    try {
        if (req.user.role !== "tenant") {
            return res.status(403).json({ message: "Tenant access only" });
        }

        let { agreementId, title, description, message } = req.body || {};
        if (!title || !description) {
            if (message) {
                if (!title) title = "Complaint";
                if (!description) description = message;
            }
        }
        if (!agreementId || !title || !description) {
            return res.status(400).json({ message: "agreementId, title, description are required" });
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
        });

        notifyUser({
            userId: agreement.owner,
            title: "New complaint",
            message: `Complaint from ${req.user.fullName || "tenant"}`,
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

        res.json({ count: complaints.length, complaints });
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

        res.json({ count: complaints.length, complaints });
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
            message: "Owner replied to your complaint",
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
