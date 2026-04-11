import mongoose from "mongoose";
import Offer from "../models/Offer.js";
import Room from "../models/Room.js";
import Agreement from "../models/Agreement.js";
import Visit from "../models/Visit.js";
import { emitVisitDeletesByRoom } from "../services/visitRealtime.service.js";
import { notifyUser } from "../services/notify.service.js";
import { recordOwnerResponse } from "../services/responseStats.service.js";

const createOffer = async (req, res) => {
  try {
    if (req.user.role !== "tenant") {
      return res.status(403).json({ message: "Tenant access only" });
    }
    if (req.user.kyc?.status !== "approved") {
      return res.status(403).json({
        message: "KYC not verified. Please complete KYC to make offers.",
        kycStatus: req.user.kyc?.status || "not_submitted",
      });
    }

    const { roomId, offeredRent, message = "" } = req.body;
    if (!roomId || offeredRent === undefined) {
      return res.status(400).json({ message: "roomId and offeredRent required" });
    }
    if (!mongoose.Types.ObjectId.isValid(roomId)) {
      return res.status(400).json({ message: "Invalid roomId" });
    }

    const room = await Room.findById(roomId).populate("owner", "kyc");
    if (!room || !room.isPublished) {
      return res.status(404).json({ message: "Room not found" });
    }

    const active = await Agreement.findOne({ room: room._id, status: "active" });
    if (active) {
      return res.status(400).json({ message: "Room already has an active agreement" });
    }

    if (room.owner?.kyc?.status !== "approved") {
      return res.status(403).json({ message: "This owner is not verified yet." });
    }

    const ownerId = room.owner?._id || room.owner;

    const rentNum = Number(offeredRent);
    if (!Number.isFinite(rentNum) || rentNum <= 0) {
      return res.status(400).json({ message: "offeredRent must be a valid number" });
    }

    const existing = await Offer.findOne({
      room: room._id,
      tenant: req.user._id,
      status: { $in: ["pending", "countered", "accepted"] },
    });
    if (existing) {
      return res.status(409).json({ message: "You already have an active offer for this room" });
    }

    const offer = await Offer.create({
      room: room._id,
      tenant: req.user._id,
      owner: ownerId,
      offeredRent: rentNum,
      message,
      lastTenantActionAt: new Date(),
    });

    notifyUser({
      userId: ownerId,
      title: "New offer received",
      message: `Offer from ${req.user.fullName || "tenant"}`,
      type: "offer",
      data: { offerId: offer._id, roomId: room._id, url: "/owner/offers" },
    });

    res.status(201).json({ message: "Offer sent", offer });
  } catch {
    res.status(500).json({ message: "Server error" });
  }
};

const tenantMyOffers = async (req, res) => {
  try {
    if (req.user.role !== "tenant") {
      return res.status(403).json({ message: "Tenant access only" });
    }

    const offers = await Offer.find({ tenant: req.user._id })
      .populate("room", "title location monthlyRent photos")
      .sort({ createdAt: -1 });

    res.json({ count: offers.length, offers });
  } catch {
    res.status(500).json({ message: "Server error" });
  }
};

const ownerIncomingOffers = async (req, res) => {
  try {
    if (req.user.role !== "owner") {
      return res.status(403).json({ message: "Owner access only" });
    }

    const offers = await Offer.find({ owner: req.user._id })
      .populate("tenant", "fullName email phone")
      .populate("room", "title location monthlyRent photos")
      .sort({ createdAt: -1 });

    res.json({ count: offers.length, offers });
  } catch {
    res.status(500).json({ message: "Server error" });
  }
};

const ownerAcceptOffer = async (req, res) => {
  try {
    if (req.user.role !== "owner") {
      return res.status(403).json({ message: "Owner access only" });
    }

    const offer = await Offer.findOne({ _id: req.params.id, owner: req.user._id });
    if (!offer) return res.status(404).json({ message: "Offer not found" });

    if (offer.status !== "pending" && offer.status !== "countered") {
      return res.status(400).json({ message: "Offer already processed" });
    }

    const responseFrom = offer.status === "pending" ? offer.lastTenantActionAt || offer.createdAt : null;
    const prevStatus = offer.status;
    offer.status = "accepted";
    // If owner is accepting their own counter, use ownerCounterRent.
    // Otherwise (pending), use latest tenant offeredRent.
    if (prevStatus === "countered" && offer.ownerCounterRent > 0) {
      offer.acceptedRent = offer.ownerCounterRent;
    } else {
      offer.acceptedRent = offer.offeredRent;
    }
    offer.ownerReply = "Accepted";
    await offer.save();

    notifyUser({
      userId: offer.tenant,
      title: "Offer accepted",
      message: "Owner accepted your offer",
      type: "offer",
      data: { offerId: offer._id, roomId: offer.room, url: "/tenant/offers" },
    });

    if (responseFrom) {
      recordOwnerResponse({ ownerId: offer.owner, createdAt: responseFrom }).catch((err) => {
        console.log("Record owner response error:", err.message);
      });
    }

    res.json({ message: "Offer accepted", offer });
  } catch {
    res.status(500).json({ message: "Server error" });
  }
};

const ownerRejectOffer = async (req, res) => {
  try {
    if (req.user.role !== "owner") {
      return res.status(403).json({ message: "Owner access only" });
    }

    const { ownerReply = "Rejected" } = req.body;

    const offer = await Offer.findOne({ _id: req.params.id, owner: req.user._id });
    if (!offer) return res.status(404).json({ message: "Offer not found" });

    if (offer.status !== "pending" && offer.status !== "countered") {
      return res.status(400).json({ message: "Offer already processed" });
    }

    const responseFrom = offer.status === "pending" ? offer.lastTenantActionAt || offer.createdAt : null;
    offer.status = "rejected";
    offer.ownerReply = ownerReply;
    await offer.save();

    notifyUser({
      userId: offer.tenant,
      title: "Offer rejected",
      message: "Owner rejected your offer",
      type: "offer",
      data: { offerId: offer._id, roomId: offer.room, url: "/tenant/offers" },
    });

    if (responseFrom) {
      recordOwnerResponse({ ownerId: offer.owner, createdAt: responseFrom }).catch((err) => {
        console.log("Record owner response error:", err.message);
      });
    }

    res.json({ message: "Offer rejected", offer });
  } catch {
    res.status(500).json({ message: "Server error" });
  }
};

const ownerCounterOffer = async (req, res) => {
  try {
    if (req.user.role !== "owner") {
      return res.status(403).json({ message: "Owner access only" });
    }

    const { ownerCounterRent, ownerReply = "Counter offer" } = req.body;
    if (ownerCounterRent === undefined || ownerCounterRent === null || ownerCounterRent === "") {
      return res.status(400).json({ message: "ownerCounterRent required" });
    }
    const counterNum = Number(ownerCounterRent);
    if (!Number.isFinite(counterNum) || counterNum <= 0) {
      return res.status(400).json({ message: "ownerCounterRent must be a valid number" });
    }

    const offer = await Offer.findOne({ _id: req.params.id, owner: req.user._id });
    if (!offer) return res.status(404).json({ message: "Offer not found" });

    if (offer.status !== "pending" && offer.status !== "countered") {
      return res.status(400).json({ message: "Offer already processed" });
    }

    const responseFrom = offer.status === "pending" ? offer.lastTenantActionAt || offer.createdAt : null;
    offer.status = "countered";
    offer.ownerCounterRent = counterNum;
    offer.acceptedRent = 0;
    offer.ownerReply = ownerReply;
    await offer.save();

    notifyUser({
      userId: offer.tenant,
      title: "Counter offer",
      message: "Owner sent a counter offer",
      type: "offer",
      data: { offerId: offer._id, roomId: offer.room, url: "/tenant/offers" },
    });

    if (responseFrom) {
      recordOwnerResponse({ ownerId: offer.owner, createdAt: responseFrom }).catch((err) => {
        console.log("Record owner response error:", err.message);
      });
    }

    res.json({ message: "Counter offer sent", offer });
  } catch {
    res.status(500).json({ message: "Server error" });
  }
};

// TENANT: counter back to owner
const tenantCounterOffer = async (req, res) => {
  try {
    if (req.user.role !== "tenant") {
      return res.status(403).json({ message: "Tenant access only" });
    }
    if (req.user.kyc?.status !== "approved") {
      return res.status(403).json({
        message: "KYC not verified. Please complete KYC to counter offers.",
        kycStatus: req.user.kyc?.status || "not_submitted",
      });
    }

    const { offeredRent, message = "Counter offer" } = req.body;
    if (offeredRent === undefined || offeredRent === null || offeredRent === "") {
      return res.status(400).json({ message: "offeredRent required" });
    }
    const rentNum = Number(offeredRent);
    if (!Number.isFinite(rentNum) || rentNum <= 0) {
      return res.status(400).json({ message: "offeredRent must be a valid number" });
    }

    const offer = await Offer.findOne({ _id: req.params.id, tenant: req.user._id });
    if (!offer) return res.status(404).json({ message: "Offer not found" });

    if (offer.status !== "pending" && offer.status !== "countered") {
      return res.status(400).json({ message: "Offer already processed" });
    }

    offer.status = "pending";
    offer.offeredRent = rentNum;
    offer.message = message;
    offer.ownerCounterRent = 0;
    offer.lastTenantActionAt = new Date();
    offer.acceptedRent = 0;
    await offer.save();

    notifyUser({
      userId: offer.owner,
      title: "Offer updated",
      message: "Tenant sent a counter offer",
      type: "offer",
      data: { offerId: offer._id, roomId: offer.room, url: "/owner/offers" },
    });

    res.json({ message: "Counter sent", offer });
  } catch {
    res.status(500).json({ message: "Server error" });
  }
};

// TENANT: accept owner's counter
const tenantAcceptCounter = async (req, res) => {
  try {
    if (req.user.role !== "tenant") {
      return res.status(403).json({ message: "Tenant access only" });
    }

    const offer = await Offer.findOne({ _id: req.params.id, tenant: req.user._id });
    if (!offer) return res.status(404).json({ message: "Offer not found" });

    if (offer.status !== "countered") {
      return res.status(400).json({ message: "No counter to accept" });
    }
    if (!offer.ownerCounterRent || offer.ownerCounterRent <= 0) {
      return res.status(400).json({ message: "Invalid counter rent" });
    }

    offer.status = "accepted";
    offer.acceptedRent = offer.ownerCounterRent;
    offer.ownerReply = "Accepted by tenant";
    await offer.save();

    notifyUser({
      userId: offer.owner,
      title: "Counter accepted",
      message: "Tenant accepted your counter offer",
      type: "offer",
      data: { offerId: offer._id, roomId: offer.room, url: "/owner/offers" },
    });

    res.json({ message: "Counter accepted", offer });
  } catch {
    res.status(500).json({ message: "Server error" });
  }
};

// TENANT: reject owner's counter
const tenantRejectCounter = async (req, res) => {
  try {
    if (req.user.role !== "tenant") {
      return res.status(403).json({ message: "Tenant access only" });
    }

    const offer = await Offer.findOne({ _id: req.params.id, tenant: req.user._id });
    if (!offer) return res.status(404).json({ message: "Offer not found" });

    if (offer.status !== "countered") {
      return res.status(400).json({ message: "No counter to reject" });
    }

    offer.status = "rejected";
    offer.ownerReply = "Counter rejected by tenant";
    await offer.save();

    notifyUser({
      userId: offer.owner,
      title: "Counter rejected",
      message: "Tenant rejected your counter offer",
      type: "offer",
      data: { offerId: offer._id, roomId: offer.room, url: "/owner/offers" },
    });

    res.json({ message: "Counter rejected", offer });
  } catch {
    res.status(500).json({ message: "Server error" });
  }
};

const createAgreementFromOffer = async (req, res) => {
  try {
    if (req.user.role !== "owner") {
      return res.status(403).json({ message: "Owner access only" });
    }

    const offer = await Offer.findOne({ _id: req.params.id, owner: req.user._id });
    if (!offer) return res.status(404).json({ message: "Offer not found" });

    if (offer.status !== "accepted") {
      return res.status(400).json({ message: "Only accepted offers can create agreement" });
    }

    if (offer.agreement) {
      return res.status(400).json({ message: "Agreement already created for this offer" });
    }

    const room = await Room.findById(offer.room);
    if (!room) return res.status(404).json({ message: "Room not found" });

    const active = await Agreement.findOne({ room: room._id, status: "active" });
    if (active) {
      return res.status(400).json({ message: "Room already has an active agreement" });
    }

    room.isPublished = false;
    await room.save();

    const monthlyRent = offer.acceptedRent || offer.offeredRent;

    const startDate = new Date();
    const endDate = new Date();
    endDate.setMonth(endDate.getMonth() + 11);

    const agreement = await Agreement.create({
      room: offer.room,
      owner: offer.owner,
      tenant: offer.tenant,
      request: null,
      monthlyRent,
      securityDeposit: monthlyRent,
      startDate,
      endDate,
      status: "active",
      ownerSignatureUrl: "",
      tenantSignatureUrl: "",
    });

    offer.agreement = agreement._id;
    await offer.save();

    await emitVisitDeletesByRoom(room._id);
    await Visit.deleteMany({ room: room._id });

    notifyUser({
      userId: offer.tenant,
      title: "Agreement created",
      message: "Owner created an agreement from your offer",
      type: "agreement",
      data: { agreementId: agreement._id, url: "/tenant/agreements" },
    });

    res.status(201).json({ message: "Agreement created from offer", agreement });
  } catch (e) {
    console.error("createAgreementFromOffer error:", e.message);
    res.status(500).json({ message: "Server error" });
  }
};

export {
  createOffer,
  tenantMyOffers,
  ownerIncomingOffers,
  ownerAcceptOffer,
  ownerRejectOffer,
  ownerCounterOffer,
  tenantCounterOffer,
  tenantAcceptCounter,
  tenantRejectCounter,
  createAgreementFromOffer,
};
