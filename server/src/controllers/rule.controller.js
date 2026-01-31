import mongoose from "mongoose";
import Rule from "../models/Rule.js";
import Room from "../models/Room.js";
import Agreement from "../models/Agreement.js";

// OWNER: create rule for a room
const createRule = async (req, res) => {
  try {
    if (req.user.role !== "owner") {
      return res.status(403).json({ message: "Owner access only" });
    }

    const { roomId, title, description = "", severity = "normal" } = req.body || {};
    if (!roomId || !title) {
      return res.status(400).json({ message: "roomId and title are required" });
    }
    if (!mongoose.Types.ObjectId.isValid(roomId)) {
      return res.status(400).json({ message: "Invalid roomId" });
    }

    const room = await Room.findOne({ _id: roomId, owner: req.user._id });
    if (!room) return res.status(404).json({ message: "Room not found" });

    const rule = await Rule.create({
      owner: req.user._id,
      room: roomId,
      title,
      description,
      severity,
    });

    res.status(201).json({ message: "Rule created", rule });
  } catch (err) {
    console.log("Create rule error:", err.message);
    res.status(500).json({ message: "Server error" });
  }
};

// OWNER: list my rules for a room
const ownerRoomRules = async (req, res) => {
  try {
    if (req.user.role !== "owner") {
      return res.status(403).json({ message: "Owner access only" });
    }

    const { roomId } = req.params;
    if (!mongoose.Types.ObjectId.isValid(roomId)) {
      return res.status(400).json({ message: "Invalid roomId" });
    }
    const room = await Room.findOne({ _id: roomId, owner: req.user._id });
    if (!room) return res.status(404).json({ message: "Room not found" });

    const rules = await Rule.find({ owner: req.user._id, room: roomId }).sort({ createdAt: -1 });
    res.json({ count: rules.length, rules });
  } catch (err) {
    console.log("Owner room rules error:", err.message);
    res.status(500).json({ message: "Server error" });
  }
};

// OWNER: update rule (active / text)
const updateRule = async (req, res) => {
  try {
    if (req.user.role !== "owner") {
      return res.status(403).json({ message: "Owner access only" });
    }

    const rule = await Rule.findOne({ _id: req.params.id, owner: req.user._id });
    if (!rule) return res.status(404).json({ message: "Rule not found" });

    const { title, description, severity, isActive } = req.body || {};

    if (title !== undefined) rule.title = title;
    if (description !== undefined) rule.description = description;
    if (severity !== undefined) rule.severity = severity;
    if (isActive !== undefined) rule.isActive = isActive;

    await rule.save();
    res.json({ message: "Rule updated", rule });
  } catch (err) {
    console.log("Update rule error:", err.message);
    res.status(500).json({ message: "Server error" });
  }
};

// TENANT: list rules for my active agreement
const tenantAgreementRules = async (req, res) => {
  try {
    if (req.user.role !== "tenant") {
      return res.status(403).json({ message: "Tenant access only" });
    }

    const { agreementId } = req.params;
    if (!mongoose.Types.ObjectId.isValid(agreementId)) {
      return res.status(400).json({ message: "Invalid agreementId" });
    }

    const agreement = await Agreement.findOne({
      _id: agreementId,
      tenant: req.user._id,
      status: "active",
    });

    if (!agreement) return res.status(404).json({ message: "Agreement not found" });

    const rules = await Rule.find({ room: agreement.room, isActive: true }).sort({ createdAt: -1 });
    res.json({ count: rules.length, rules });
  } catch (err) {
    console.log("Tenant agreement rules error:", err.message);
    res.status(500).json({ message: "Server error" });
  }
};

export { createRule, ownerRoomRules, updateRule, tenantAgreementRules };
