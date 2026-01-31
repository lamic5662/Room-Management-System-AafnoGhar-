import mongoose from "mongoose";
import Request from "../models/Request.js";
import Room from "../models/Room.js";
import Agreement from "../models/Agreement.js";
import { notifyUser } from "../services/notify.service.js";

// Tenant: send request for a room
const createRequest = async (req, res) => {
    try {
        // Only tenant can request
        if (req.user.role !== "tenant") {
            return res.status(403).json({ message: "Tenant access only" });
        }
        if (req.user.kyc?.status !== "approved") {
            return res.status(403).json({
                message: "KYC not verified. Please complete KYC to send requests.",
                kycStatus: req.user.kyc?.status || "not_submitted",
            });
        }

        const { roomId, message } = req.body || {};
        if (!roomId) return res.status(400).json({ message: "roomId is required" });
        if (!mongoose.Types.ObjectId.isValid(roomId)) {
            return res.status(400).json({ message: "Invalid roomId" });
        }

        const room = await Room.findById(roomId);
        if (!room || !room.isPublished) {
            return res.status(404).json({ message: "Room not found" });
        }

        const active = await Agreement.findOne({ room: roomId, status: "active" });
        if (active) {
            return res.status(400).json({ message: "Room already has an active agreement" });
        }

        // prevent duplicate pending request
        const existing = await Request.findOne({
            room: roomId,
            tenant: req.user._id,
            status: "pending",
        });
        if (existing) {
            return res.status(409).json({ message: "You already have a pending request for this room" });
        }

        const reqDoc = await Request.create({
            room: roomId,
            tenant: req.user._id,
            owner: room.owner,
            message: message || "",
        });

        notifyUser({
            userId: room.owner,
            title: "New room request",
            message: `New request from ${req.user.fullName || "tenant"}`,
            type: "request",
            data: { roomId, requestId: reqDoc._id, url: "/owner/requests" },
        });

        res.status(201).json({ message: "Request sent", request: reqDoc });
    } catch (err) {
        console.log("Create request error:", err.message);
        res.status(500).json({ message: "Server error" });
    }
};

// Tenant: view my requests
const myRequests = async (req, res) => {
    try {
        if (req.user.role !== "tenant") {
            return res.status(403).json({ message: "Tenant access only" });
        }

        const requests = await Request.find({ tenant: req.user._id })
            .populate("room", "title location monthlyRent photos")
            .populate("owner", "fullName phone")
            .sort({ createdAt: -1 });

        res.json({ count: requests.length, requests });
    } catch (err) {
        res.status(500).json({ message: "Server error" });
    }
};

const incomingRequests = async (req, res) => {
    try {
        if (req.user.role !== "owner") {
            return res.status(403).json({ message: "Owner access only" });
        }

        const requests = await Request.find({ owner: req.user._id })
            .populate("room", "title location monthlyRent photos")
            .populate("tenant", "fullName phone email")
            .sort({ createdAt: -1 });

        res.json({ count: requests.length, requests });
    } catch (err) {
        res.status(500).json({ message: "Server error" });
    }
};

const updateRequestStatus = async (req, res) => {
    try {
        if (req.user.role !== "owner") {
            return res.status(403).json({ message: "Owner access only" });
        }

        const { status } = req.body;
        if (!["approved", "rejected"].includes(status)) {
            return res.status(400).json({ message: "Invalid status" });
        }

        const request = await Request.findById(req.params.id);
        if (!request) return res.status(404).json({ message: "Request not found" });

        if (String(request.owner) !== String(req.user._id)) {
            return res.status(403).json({ message: "Not your request" });
        }

        if (request.status !== "pending") {
            return res.status(400).json({ message: `Cannot update a ${request.status} request` });
        }

        if (status === "approved") {
            const active = await Agreement.findOne({ room: request.room, status: "active" });
            if (active) {
                return res.status(400).json({ message: "Room already has an active agreement" });
            }
        }

        request.status = status;
        await request.save();

        notifyUser({
            userId: request.tenant,
            title: `Request ${status}`,
            message: `Your room request was ${status}`,
            type: "request",
            data: { requestId: request._id, roomId: request.room, url: "/tenant/requests" },
        });

        res.json({ message: "Request updated", request });
    } catch (err) {
        res.status(500).json({ message: "Server error" });
    }
};

// Tenant: cancel my pending request
const cancelRequest = async (req, res) => {
    try {
        if (req.user.role !== "tenant") {
            return res.status(403).json({ message: "Tenant access only" });
        }

        const { id } = req.params;
        const reqDoc = await Request.findById(id);
        if (!reqDoc) return res.status(404).json({ message: "Request not found" });

        if (String(reqDoc.tenant) !== String(req.user._id)) {
            return res.status(403).json({ message: "Not your request" });
        }

        if (reqDoc.status !== "pending") {
            return res.status(400).json({ message: `Cannot cancel a ${reqDoc.status} request` });
        }

        reqDoc.status = "cancelled";
        await reqDoc.save();

        res.json({ message: "Request cancelled", request: reqDoc });
    } catch (err) {
        console.log("Cancel request error:", err.message);
        res.status(500).json({ message: "Server error" });
    }
};

export {
    createRequest,
    myRequests,
    incomingRequests,
    updateRequestStatus,
    cancelRequest,
};
