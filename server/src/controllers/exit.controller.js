import mongoose from "mongoose";
import ExitRequest from "../models/ExitRequest.js";
import Agreement from "../models/Agreement.js";
import Room from "../models/Room.js";
import Payment from "../models/payment.js";
import Complaint from "../models/Complaint.js";
import ElectricityBill from "../models/ElectricityBill.js";
import Request from "../models/Request.js";
import Offer from "../models/Offer.js";
import { notifyUser } from "../services/notify.service.js";

const createExitRequest = async (req, res) => {
  try {
    if (req.user.role !== "tenant") {
      return res.status(403).json({ message: "Tenant access only" });
    }

    const { agreementId, moveOutDate, reason = "" } = req.body || {};
    if (!agreementId || !moveOutDate) {
      return res.status(400).json({ message: "agreementId and moveOutDate required" });
    }
    if (!mongoose.Types.ObjectId.isValid(agreementId)) {
      return res.status(400).json({ message: "Invalid agreementId" });
    }
    const moveOut = new Date(moveOutDate);
    if (Number.isNaN(moveOut.getTime())) {
      return res.status(400).json({ message: "moveOutDate must be a valid date" });
    }

    const agreement = await Agreement.findOne({
      _id: agreementId,
      tenant: req.user._id,
      status: "active",
    });

    if (!agreement) return res.status(404).json({ message: "Active agreement not found" });

    const existing = await ExitRequest.findOne({
      agreement: agreementId,
      status: { $in: ["requested", "approved"] },
    });
    if (existing) return res.status(400).json({ message: "Exit request already exists" });

    const exitReq = await ExitRequest.create({
      agreement: agreement._id,
      room: agreement.room,
      tenant: agreement.tenant,
      owner: agreement.owner,
      moveOutDate: moveOut,
      reason,
      securityDeposit: agreement.securityDeposit || 0,
      refundableAmount: agreement.securityDeposit || 0,
    });

    notifyUser({
      userId: agreement.owner,
      title: "Exit requested",
      message: `Tenant requested exit for ${moveOut.toDateString()}`,
      type: "exit",
      data: { exitId: exitReq._id, agreementId: agreement._id, url: "/owner/exits" },
    });

    res.status(201).json({ message: "Exit requested", exitRequest: exitReq });
  } catch (err) {
    console.log("Create exit request error:", err.message);
    res.status(500).json({ message: "Server error" });
  }
};

const tenantMyExitRequests = async (req, res) => {
  try {
    if (req.user.role !== "tenant") {
      return res.status(403).json({ message: "Tenant access only" });
    }

    const items = await ExitRequest.find({ tenant: req.user._id })
      .populate("room", "title location")
      .populate("agreement", "monthlyRent status")
      .sort({ createdAt: -1 });

    res.json({ count: items.length, exitRequests: items });
  } catch (err) {
    console.log("Tenant exit list error:", err.message);
    res.status(500).json({ message: "Server error" });
  }
};

const ownerIncomingExitRequests = async (req, res) => {
  try {
    if (req.user.role !== "owner") {
      return res.status(403).json({ message: "Owner access only" });
    }

    const items = await ExitRequest.find({ owner: req.user._id })
      .populate("tenant", "fullName email phone")
      .populate("room", "title location")
      .populate("agreement", "monthlyRent securityDeposit status")
      .sort({ createdAt: -1 });

    res.json({ count: items.length, exitRequests: items });
  } catch (err) {
    console.log("Owner incoming exits error:", err.message);
    res.status(500).json({ message: "Server error" });
  }
};

const ownerApproveExit = async (req, res) => {
  try {
    if (req.user.role !== "owner") {
      return res.status(403).json({ message: "Owner access only" });
    }

    const exitReq = await ExitRequest.findOne({ _id: req.params.id, owner: req.user._id });
    if (!exitReq) return res.status(404).json({ message: "Exit request not found" });

    if (exitReq.status === "rejected") {
      return res.status(400).json({ message: "Exit already rejected" });
    }
    if (exitReq.status === "settled") {
      return res.status(400).json({ message: "Exit already settled" });
    }
    if (exitReq.status !== "requested") {
      return res.status(400).json({ message: "Only requested exit can be approved" });
    }

    exitReq.status = "approved";
    await exitReq.save();

    notifyUser({
      userId: exitReq.tenant,
      title: "Exit approved",
      message: "Owner approved your exit request",
      type: "exit",
      data: { exitId: exitReq._id, agreementId: exitReq.agreement, url: "/tenant/exits" },
    });

    res.json({ message: "Exit approved", exitRequest: exitReq });
  } catch (err) {
    console.log("Approve exit error:", err.message);
    res.status(500).json({ message: "Server error" });
  }
};

const ownerRejectExit = async (req, res) => {
  try {
    if (req.user.role !== "owner") {
      return res.status(403).json({ message: "Owner access only" });
    }

    const { ownerNote = "Rejected by owner." } = req.body || {};

    const exitReq = await ExitRequest.findOne({ _id: req.params.id, owner: req.user._id });
    if (!exitReq) return res.status(404).json({ message: "Exit request not found" });

    if (exitReq.status === "settled") {
      return res.status(400).json({ message: "Exit already settled" });
    }
    if (exitReq.status !== "requested") {
      return res.status(400).json({ message: "Only requested exit can be rejected" });
    }

    exitReq.status = "rejected";
    exitReq.ownerNote = ownerNote;
    await exitReq.save();

    notifyUser({
      userId: exitReq.tenant,
      title: "Exit rejected",
      message: "Owner rejected your exit request",
      type: "exit",
      data: { exitId: exitReq._id, agreementId: exitReq.agreement, url: "/tenant/exits" },
    });

    res.json({ message: "Exit rejected", exitRequest: exitReq });
  } catch (err) {
    console.log("Reject exit error:", err.message);
    res.status(500).json({ message: "Server error" });
  }
};

const ownerSettleExit = async (req, res) => {
  try {
    if (req.user.role !== "owner") {
      return res.status(403).json({ message: "Owner access only" });
    }

    const { unpaidRent = 0, damagesCost = 0, otherDeductions = 0, ownerNote = "" } = req.body || {};

    const exitReq = await ExitRequest.findOne({ _id: req.params.id, owner: req.user._id })
      .populate("agreement");

    if (!exitReq) return res.status(404).json({ message: "Exit request not found" });

    if (exitReq.status !== "approved") {
      return res.status(400).json({ message: "Only approved exit can be settled" });
    }

    const deposit = Number(exitReq.securityDeposit || 0);
    const u = Number(unpaidRent || 0);
    const d = Number(damagesCost || 0);
    const o = Number(otherDeductions || 0);

    if (![deposit, u, d, o].every((v) => Number.isFinite(v) && v >= 0)) {
      return res.status(400).json({ message: "All settlement amounts must be valid non-negative numbers" });
    }

    const totalDeduction = u + d + o;
    const refundable = Math.max(0, deposit - totalDeduction);

    exitReq.unpaidRent = u;
    exitReq.damagesCost = d;
    exitReq.otherDeductions = o;
    exitReq.ownerNote = ownerNote;
    exitReq.refundableAmount = refundable;
    exitReq.status = "settled";
    exitReq.settlementAt = new Date();

    await exitReq.save();

    await Agreement.findByIdAndUpdate(exitReq.agreement._id, { status: "ended" });

    if (exitReq.room) {
      const room = await Room.findById(exitReq.room);
      if (room) {
        room.isPublished = !room.requiresImprovement && !room.isFlagged;
        await room.save();
      }
    }

    notifyUser({
      userId: exitReq.tenant,
      title: "Exit settled",
      message: "Owner settled your exit request",
      type: "exit",
      data: { exitId: exitReq._id, agreementId: exitReq.agreement._id, url: "/tenant/exits" },
    });

    const refreshed = await ExitRequest.findById(exitReq._id).populate("agreement");
    res.json({ message: "Exit settled", exitRequest: refreshed || exitReq });
  } catch (err) {
    console.log("Settle exit error:", err.message);
    res.status(500).json({ message: "Server error" });
  }
};

// OWNER: delete all tenant-related data after exit approved/settled
const ownerPurgeExitData = async (req, res) => {
  try {
    if (req.user.role !== "owner") {
      return res.status(403).json({ message: "Owner access only" });
    }

    const exitReq = await ExitRequest.findOne({ _id: req.params.id, owner: req.user._id });
    if (!exitReq) return res.status(404).json({ message: "Exit request not found" });

    if (!["approved", "settled"].includes(exitReq.status)) {
      return res.status(400).json({ message: "Exit must be approved or settled to purge data" });
    }

    const agreement = await Agreement.findById(exitReq.agreement);
    if (!agreement) {
      await ExitRequest.findByIdAndDelete(exitReq._id);
      return res.json({ message: "Agreement already removed. Exit data cleared." });
    }

    const agreementId = agreement._id;

    const resPayments = await Payment.deleteMany({ agreement: agreementId });
    const resBills = await ElectricityBill.deleteMany({ agreement: agreementId });
    const resComplaints = await Complaint.deleteMany({ agreement: agreementId });
    const resOffers = await Offer.deleteMany({
      $or: [{ agreement: agreementId }, { room: agreement.room, tenant: agreement.tenant, owner: agreement.owner }],
    });
    const resRequests = agreement.request
      ? await Request.deleteMany({ _id: agreement.request })
      : await Request.deleteMany({ room: agreement.room, tenant: agreement.tenant, owner: agreement.owner });
    await Agreement.findByIdAndDelete(agreementId);
    await ExitRequest.findByIdAndDelete(exitReq._id);

    res.json({
      message: "All tenant-related data deleted",
      deleted: {
        payments: resPayments.deletedCount || 0,
        bills: resBills.deletedCount || 0,
        complaints: resComplaints.deletedCount || 0,
        offers: resOffers.deletedCount || 0,
        requests: resRequests?.deletedCount || 0,
        agreement: 1,
        exitRequest: 1,
      },
    });
  } catch (err) {
    console.log("Purge exit data error:", err.message);
    res.status(500).json({ message: "Server error" });
  }
};

export {
  createExitRequest,
  tenantMyExitRequests,
  ownerIncomingExitRequests,
  ownerApproveExit,
  ownerRejectExit,
  ownerSettleExit,
  ownerPurgeExitData,
};
