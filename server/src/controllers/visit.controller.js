import mongoose from "mongoose";
import Visit from "../models/Visit.js";
import Room from "../models/Room.js";
import Agreement from "../models/Agreement.js";
import { notifyUser } from "../services/notify.service.js";
import { emitVisitUpdate } from "../services/visitRealtime.service.js";
import { recordOwnerResponse } from "../services/responseStats.service.js";

const parseFutureDate = (value) => {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  if (d.getTime() < Date.now()) return null;
  return d;
};

const createVisit = async (req, res) => {
  try {
    if (req.user.role !== "tenant") {
      return res.status(403).json({ message: "Tenant access only" });
    }
    if (req.user.kyc?.status !== "approved") {
      return res.status(403).json({
        message: "KYC not verified. Please complete KYC to schedule visits.",
        kycStatus: req.user.kyc?.status || "not_submitted",
      });
    }

    const { roomId, scheduledAt, note } = req.body || {};
    if (!roomId) return res.status(400).json({ message: "roomId is required" });
    if (!mongoose.Types.ObjectId.isValid(roomId)) {
      return res.status(400).json({ message: "Invalid roomId" });
    }
    if (!scheduledAt) return res.status(400).json({ message: "scheduledAt is required" });

    const visitDate = parseFutureDate(scheduledAt);
    if (!visitDate) {
      return res.status(400).json({ message: "Visit time must be in the future" });
    }

    const room = await Room.findById(roomId);
    if (!room || !room.isPublished) {
      return res.status(404).json({ message: "Room not found" });
    }

    const active = await Agreement.findOne({ room: roomId, status: "active" });
    if (active) {
      return res.status(400).json({ message: "Room already has an active agreement" });
    }

    const existing = await Visit.findOne({
      room: roomId,
      tenant: req.user._id,
      status: "pending",
    });
    if (existing) {
      return res.status(409).json({ message: "You already have a pending visit for this room" });
    }

    let visitDoc;
    try {
      visitDoc = await Visit.create({
        room: roomId,
        tenant: req.user._id,
        owner: room.owner,
        scheduledAt: visitDate,
        note: String(note || "").trim(),
      });
    } catch (err) {
      if (err.code === 11000) {
        return res.status(409).json({ message: "You already have a pending visit for this room" });
      }
      throw err;
    }

    notifyUser({
      userId: room.owner,
      title: "New visit request",
      message: `Visit scheduled for ${visitDate.toLocaleString()}`,
      type: "visit",
      data: { roomId, visitId: visitDoc._id, url: "/owner/visits" },
    });

    await emitVisitUpdate(visitDoc, "created");

    res.status(201).json({ message: "Visit scheduled", visit: visitDoc });
  } catch (err) {
    console.log("Create visit error:", err.message);
    res.status(500).json({ message: "Server error" });
  }
};

const myVisits = async (req, res) => {
  try {
    if (req.user.role !== "tenant") {
      return res.status(403).json({ message: "Tenant access only" });
    }
    const visits = await Visit.find({ tenant: req.user._id })
      .populate("room", "title location monthlyRent photos")
      .populate("owner", "fullName phone")
      .sort({ scheduledAt: 1, createdAt: -1 });
    res.json({ count: visits.length, visits });
  } catch (err) {
    console.log("My visits error:", err.message);
    res.status(500).json({ message: "Server error" });
  }
};

const incomingVisits = async (req, res) => {
  try {
    if (req.user.role !== "owner") {
      return res.status(403).json({ message: "Owner access only" });
    }
    const visits = await Visit.find({ owner: req.user._id })
      .populate("room", "title location monthlyRent photos")
      .populate("tenant", "fullName phone email")
      .sort({ scheduledAt: 1, createdAt: -1 });
    res.json({ count: visits.length, visits });
  } catch (err) {
    console.log("Incoming visits error:", err.message);
    res.status(500).json({ message: "Server error" });
  }
};

const updateVisitStatus = async (req, res) => {
  try {
    if (req.user.role !== "owner") {
      return res.status(403).json({ message: "Owner access only" });
    }
    const { status } = req.body || {};
    if (!["approved", "rejected"].includes(status)) {
      return res.status(400).json({ message: "Invalid status" });
    }

    const visit = await Visit.findById(req.params.id);
    if (!visit) return res.status(404).json({ message: "Visit not found" });
    if (String(visit.owner) !== String(req.user._id)) {
      return res.status(403).json({ message: "Not your visit" });
    }
    if (visit.status !== "pending") {
      return res.status(400).json({ message: `Cannot update a ${visit.status} visit` });
    }

    const responseFrom = visit.createdAt;
    visit.status = status;
    await visit.save();

    recordOwnerResponse({ ownerId: visit.owner, createdAt: responseFrom }).catch((err) => {
      console.log("Record owner response error:", err.message);
    });

    if (status === "rejected") {
      await emitVisitUpdate(visit, "deleted");
      await Visit.deleteOne({ _id: visit._id });
      notifyUser({
        userId: visit.tenant,
        title: "Visit rejected",
        message: "Your visit request was rejected and removed",
        type: "visit",
        data: { visitId: visit._id, roomId: visit.room, url: "/tenant/visits" },
      });
      return res.json({ message: "Visit rejected and removed", visitId: visit._id });
    }

    notifyUser({
      userId: visit.tenant,
      title: `Visit ${status}`,
      message: `Your visit request was ${status}`,
      type: "visit",
      data: { visitId: visit._id, roomId: visit.room, url: "/tenant/visits" },
    });

    await emitVisitUpdate(visit, "updated");

    res.json({ message: "Visit updated", visit });
  } catch (err) {
    console.log("Update visit status error:", err.message);
    res.status(500).json({ message: "Server error" });
  }
};

const cancelVisit = async (req, res) => {
  try {
    if (req.user.role !== "tenant") {
      return res.status(403).json({ message: "Tenant access only" });
    }

    const visit = await Visit.findById(req.params.id);
    if (!visit) return res.status(404).json({ message: "Visit not found" });
    if (String(visit.tenant) !== String(req.user._id)) {
      return res.status(403).json({ message: "Not your visit" });
    }
    if (!["pending", "approved"].includes(visit.status)) {
      return res.status(400).json({ message: `Cannot cancel a ${visit.status} visit` });
    }

    await emitVisitUpdate(visit, "deleted");
    await Visit.deleteOne({ _id: visit._id });

    notifyUser({
      userId: visit.owner,
      title: "Visit cancelled",
      message: "A tenant cancelled a scheduled visit",
      type: "visit",
      data: { visitId: visit._id, roomId: visit.room, url: "/owner/visits" },
    });

    res.json({ message: "Visit cancelled", visitId: visit._id });
  } catch (err) {
    console.log("Cancel visit error:", err.message);
    res.status(500).json({ message: "Server error" });
  }
};

const requestReschedule = async (req, res) => {
  try {
    if (req.user.role !== "tenant") {
      return res.status(403).json({ message: "Tenant access only" });
    }
    const visit = await Visit.findById(req.params.id);
    if (!visit) return res.status(404).json({ message: "Visit not found" });
    if (String(visit.tenant) !== String(req.user._id)) {
      return res.status(403).json({ message: "Not your visit" });
    }
    if (!["pending", "approved"].includes(visit.status)) {
      return res.status(400).json({ message: `Cannot reschedule a ${visit.status} visit` });
    }

    const proposed = parseFutureDate(req.body?.scheduledAt);
    if (!proposed) {
      return res.status(400).json({ message: "Visit time must be in the future" });
    }

    visit.rescheduleProposedAt = proposed;
    visit.rescheduleNote = String(req.body?.note || "").trim();
    visit.rescheduleStatus = "pending";
    visit.rescheduleRequestedBy = "tenant";
    visit.rescheduleRequestedAt = new Date();
    await visit.save();

    notifyUser({
      userId: visit.owner,
      title: "Reschedule request",
      message: `Tenant requested to reschedule to ${proposed.toLocaleString()}`,
      type: "visit",
      data: { visitId: visit._id, roomId: visit.room, url: "/owner/visits" },
    });

    await emitVisitUpdate(visit, "updated");

    res.json({ message: "Reschedule requested", visit });
  } catch (err) {
    console.log("Request reschedule error:", err.message);
    res.status(500).json({ message: "Server error" });
  }
};

const decideReschedule = async (req, res) => {
  try {
    if (req.user.role !== "owner") {
      return res.status(403).json({ message: "Owner access only" });
    }
    const { action } = req.body || {};
    if (!["approve", "reject"].includes(action)) {
      return res.status(400).json({ message: "Invalid action" });
    }

    const visit = await Visit.findById(req.params.id);
    if (!visit) return res.status(404).json({ message: "Visit not found" });
    if (String(visit.owner) !== String(req.user._id)) {
      return res.status(403).json({ message: "Not your visit" });
    }
    if (visit.rescheduleStatus !== "pending") {
      return res.status(400).json({ message: "No pending reschedule request" });
    }

    const responseFrom =
      visit.rescheduleRequestedBy === "tenant"
        ? visit.rescheduleRequestedAt || visit.updatedAt
        : null;

    if (action === "approve") {
      const proposed = parseFutureDate(visit.rescheduleProposedAt);
      if (!proposed) {
        return res.status(400).json({ message: "Proposed time is invalid" });
      }
      visit.scheduledAt = proposed;
      visit.rescheduleStatus = "none";
      visit.rescheduleProposedAt = null;
      visit.rescheduleNote = "";
      visit.rescheduleRequestedBy = "";
      visit.rescheduleRequestedAt = null;
      visit.reminderSentAt = null;
      await visit.save();

      notifyUser({
        userId: visit.tenant,
        title: "Reschedule approved",
        message: `Your visit was rescheduled to ${proposed.toLocaleString()}`,
        type: "visit",
        data: { visitId: visit._id, roomId: visit.room, url: "/tenant/visits" },
      });
    } else {
      await emitVisitUpdate(visit, "deleted");
      await Visit.deleteOne({ _id: visit._id });

      notifyUser({
        userId: visit.tenant,
        title: "Reschedule rejected",
        message: "Your reschedule request was rejected and the visit was removed",
        type: "visit",
        data: { visitId: visit._id, roomId: visit.room, url: "/tenant/visits" },
      });
    }

    if (action === "approve") {
      await emitVisitUpdate(visit, "updated");
      if (responseFrom) {
        recordOwnerResponse({ ownerId: visit.owner, createdAt: responseFrom }).catch((err) => {
          console.log("Record owner response error:", err.message);
        });
      }
      return res.json({ message: "Reschedule updated", visit });
    }
    if (responseFrom) {
      recordOwnerResponse({ ownerId: visit.owner, createdAt: responseFrom }).catch((err) => {
        console.log("Record owner response error:", err.message);
      });
    }
    return res.json({ message: "Reschedule rejected and visit removed", visitId: visit._id });
  } catch (err) {
    console.log("Decide reschedule error:", err.message);
    res.status(500).json({ message: "Server error" });
  }
};

export {
  createVisit,
  myVisits,
  incomingVisits,
  updateVisitStatus,
  cancelVisit,
  requestReschedule,
  decideReschedule,
};
