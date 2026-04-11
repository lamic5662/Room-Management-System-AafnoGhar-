import mongoose from "mongoose";
import PDFDocument from "pdfkit";
import fs from "fs";
import path from "path";
import QRCode from "qrcode";
import ExitRequest from "../models/ExitRequest.js";
import Agreement from "../models/Agreement.js";
import Room from "../models/Room.js";
import Payment from "../models/payment.js";
import Complaint from "../models/Complaint.js";
import ElectricityBill from "../models/ElectricityBill.js";
import Request from "../models/Request.js";
import Offer from "../models/Offer.js";
import { notifyUser } from "../services/notify.service.js";
import { getExitUnpaid } from "../utils/paymentDue.js";
import { sendExitReviewReminder } from "../utils/reviewReminder.js";
import { drawStamp } from "../utils/pdfStamp.js";

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
    if (!agreement.ownerSignatureUrl || !agreement.tenantSignatureUrl) {
      return res.status(400).json({ message: "Both owner and tenant must sign the agreement before exiting" });
    }

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

    const rawItems = await ExitRequest.find({ tenant: req.user._id })
      .populate("room", "title location")
      .populate("agreement")
      .sort({ createdAt: -1 });

    const items = await Promise.all(rawItems.map((x) => computeExitDue(x)));
    res.json({ count: items.length, exitRequests: items });
  } catch (err) {
    console.log("Tenant exit list error:", err.message);
    res.status(500).json({ message: "Server error" });
  }
};

const formatPeriod = (date) => {
  if (!date || Number.isNaN(new Date(date).getTime())) return "";
  const d = new Date(date);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
};

async function computeExitDue(exitReq) {
  const next = exitReq.toObject();
  const period = formatPeriod(exitReq.moveOutDate);
  next.computedPeriod = period;
  let computedUnpaidRent = 0;
  let rentPerDay = 0;
  let daysCharged = 0;
  let daysInMonth = 0;
  let proratedFirstMonth = false;
  let hasPaidRent = false;
  let isEarlyExit = false;
  let electricityAmount = 0;
  let electricityUnits = 0;
  let electricityBillId = null;
  let depositPaid = null;
  let exitDue = 0;
  let settlementDue = 0;
  const hasSettlement = ["settlement_pending", "settled"].includes(exitReq.status) || !!exitReq.settlementAt;

  if (period && exitReq.agreement) {
    try {
      const due = await getExitUnpaid({
        agreement: exitReq.agreement,
        moveOutDate: exitReq.moveOutDate,
        tenantId: exitReq.tenant,
      });
      computedUnpaidRent = due?.unpaidRent || 0;
      rentPerDay = due?.avgRentPerDay || 0;
      daysCharged = due?.totalDays || 0;
      daysInMonth = due?.totalDays || 0;
      proratedFirstMonth = false;
      electricityAmount = due?.electricityAmount || 0;
      electricityBillId = due?.electricityBill?._id || null;
      const secDep = Number(exitReq.securityDeposit || exitReq.agreement?.securityDeposit || 0);
      const paidDep = Number(due?.depositPaid || 0);
      depositPaid = Number.isFinite(paidDep) ? Math.min(secDep, paidDep) : secDep;
      exitDue = Number(((computedUnpaidRent || 0) + (electricityAmount || 0)).toFixed(2));
    } catch (err) {
      console.log("Exit due lookup failed:", err?.message || err);
    }
  }
  try {
    const paid = await Payment.findOne({
      agreement: exitReq.agreement?._id || exitReq.agreement,
      tenant: exitReq.tenant,
      rentAmount: { $gt: 0 },
      status: "confirmed",
    }).select("_id");
    hasPaidRent = !!paid;
  } catch (err) {
    console.log("Exit paid lookup failed:", err?.message || err);
  }
  try {
    const startDate = exitReq.agreement?.startDate ? new Date(exitReq.agreement.startDate) : null;
    const moveOutDate = exitReq.moveOutDate ? new Date(exitReq.moveOutDate) : null;
    if (startDate && moveOutDate && !Number.isNaN(startDate.getTime()) && !Number.isNaN(moveOutDate.getTime())) {
      const oneMonthLater = new Date(startDate);
      oneMonthLater.setMonth(oneMonthLater.getMonth() + 1);
      isEarlyExit = moveOutDate < oneMonthLater;
    }
  } catch (err) {
    console.log("Exit early check failed:", err?.message || err);
  }

  next.computedUnpaidRent = computedUnpaidRent;
  next.rentPerDay = rentPerDay;
  next.daysCharged = daysCharged;
  next.daysInMonth = daysInMonth;
  next.proratedFirstMonth = proratedFirstMonth;
  next.hasPaidRent = hasPaidRent;
  next.isEarlyExit = isEarlyExit;
  next.electricityAmount = exitReq.electricityAmount || electricityAmount;
  next.electricityUnits = exitReq.electricityUnits || 0;
  next.electricityBillId = electricityBillId;
  next.depositPaid = exitReq.depositPaid ?? depositPaid ?? exitReq.securityDeposit ?? 0;
  if (hasSettlement) {
    const baseDeposit = Number(next.depositPaid || 0);
    const baseUnpaid = Number(exitReq.unpaidRent ?? computedUnpaidRent ?? 0);
    const baseElectricity = Number(exitReq.electricityAmount ?? electricityAmount ?? 0);
    const totalDeduction = baseUnpaid + Number(exitReq.damagesCost || 0) + Number(exitReq.otherDeductions || 0) + baseElectricity;
    settlementDue = Math.max(0, Number((totalDeduction - baseDeposit).toFixed(2)));
  }
  next.exitDue = hasSettlement ? 0 : exitDue;
  next.settlementDue = hasSettlement ? settlementDue : 0;
  return next;
}

const ownerIncomingExitRequests = async (req, res) => {
  try {
    if (req.user.role !== "owner") {
      return res.status(403).json({ message: "Owner access only" });
    }

    const rawItems = await ExitRequest.find({ owner: req.user._id })
      .populate("tenant", "fullName email phone")
      .populate("room", "title location")
      .populate("agreement")
      .sort({ createdAt: -1 });

    const items = await Promise.all(rawItems.map((x) => computeExitDue(x)));
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

    const { unpaidRent = 0, damagesCost = 0, otherDeductions = 0, ownerNote = "", electricityUnits = 0, electricityUnitRate = 0, electricityAmount = 0 } = req.body || {};

    const exitReq = await ExitRequest.findOne({ _id: req.params.id, owner: req.user._id })
      .populate("agreement");

    if (!exitReq) return res.status(404).json({ message: "Exit request not found" });

    if (exitReq.status !== "approved") {
      return res.status(400).json({ message: "Only approved exit can be settled" });
    }

    let deposit = Number(exitReq.securityDeposit || 0);
    let computedUnpaidRent = 0;
  const period = formatPeriod(exitReq.moveOutDate);
  if (period && exitReq.agreement) {
    try {
      const due = await getExitUnpaid({
        agreement: exitReq.agreement,
        moveOutDate: exitReq.moveOutDate,
        tenantId: exitReq.tenant,
      });
      computedUnpaidRent = due?.unpaidRent || 0;
      const paidDep = Number(due?.depositPaid || 0);
      if (Number.isFinite(paidDep) && paidDep >= 0) {
        deposit = Math.min(deposit, paidDep);
      }
    } catch (err) {
      console.log("Exit settlement due calculation failed:", err?.message || err);
    }
  }
    const manualUnpaid = typeof unpaidRent !== "undefined" && unpaidRent !== null && String(unpaidRent).trim() !== ""
      ? Number(unpaidRent)
      : NaN;
    const u = Number.isFinite(manualUnpaid) ? manualUnpaid : computedUnpaidRent;
    const d = Number(damagesCost || 0);
    const o = Number(otherDeductions || 0);
    const eUnits = Number(electricityUnits || 0);
    const eRate = Number(electricityUnitRate || 0);
    const eAmt = Number(electricityAmount || 0);

    if (![deposit, u, d, o, eUnits, eRate, eAmt].every((v) => Number.isFinite(v) && v >= 0)) {
      return res.status(400).json({ message: "All settlement amounts must be valid non-negative numbers" });
    }

    const totalDeduction = u + d + o + eAmt;
    const settlementDue = Math.max(0, totalDeduction - deposit);
    const refundable = Math.max(0, deposit - totalDeduction);

    exitReq.unpaidRent = u;
    exitReq.damagesCost = d;
    exitReq.otherDeductions = o;
    exitReq.electricityUnits = eUnits;
    exitReq.electricityUnitRate = eRate;
    exitReq.electricityAmount = eAmt;
    exitReq.ownerNote = ownerNote;
    exitReq.depositPaid = deposit;
    exitReq.refundableAmount = refundable;
    const settledNow = settlementDue <= 0;
    if (settledNow) {
      exitReq.status = "settled";
      exitReq.settlementPaid = true;
      exitReq.settlementPaidAt = new Date();
    } else {
      exitReq.status = "settlement_pending";
      exitReq.settlementPaid = false;
      exitReq.settlementPaidAt = null;
    }
    exitReq.settlementAt = new Date();

    await exitReq.save();
    if (settledNow) {
      await sendExitReviewReminder(exitReq);
    }

    if (settledNow) {
      await Agreement.findByIdAndUpdate(exitReq.agreement._id, { status: "ended" });

      if (exitReq.room) {
        const room = await Room.findById(exitReq.room);
        if (room) {
          room.isPublished = !room.requiresImprovement && !room.isFlagged;
          await room.save();
        }
      }
    }

    notifyUser({
      userId: exitReq.tenant,
      title: settledNow ? "Exit settled" : "Settlement sent",
      message: settledNow ? "Owner settled your exit request" : "Owner sent a settlement request",
      type: "exit",
      data: { exitId: exitReq._id, agreementId: exitReq.agreement._id, url: "/tenant/exits" },
    });

    const refreshed = await ExitRequest.findById(exitReq._id).populate("agreement");
    res.json({ message: settledNow ? "Exit settled" : "Settlement sent", exitRequest: refreshed || exitReq });
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

    await Agreement.findByIdAndDelete(agreementId);
    await ExitRequest.findByIdAndDelete(exitReq._id);
    const resRequests = await Request.deleteMany({ room: agreement.room });

    res.json({
      message: "Owner data deleted",
      deleted: {
        agreement: 1,
        exitRequest: 1,
        requests: resRequests.deletedCount || 0,
      },
    });
  } catch (err) {
    console.log("Purge exit data error:", err.message);
    res.status(500).json({ message: "Server error" });
  }
};

const tenantPurgeExitData = async (req, res) => {
  try {
    if (req.user.role !== "tenant") {
      return res.status(403).json({ message: "Tenant access only" });
    }

    const exitReq = await ExitRequest.findOne({ _id: req.params.id, tenant: req.user._id });
    if (!exitReq) return res.status(404).json({ message: "Exit request not found" });
    if (exitReq.status !== "settled") {
      return res.status(400).json({ message: "Only settled exit can be purged by tenant" });
    }

    const agreement = await Agreement.findById(exitReq.agreement);
    if (!agreement) return res.status(404).json({ message: "Agreement not found" });

    const agreementId = agreement._id;
    const resPayments = await Payment.deleteMany({ agreement: agreementId, tenant: req.user._id });
    const resComplaints = await Complaint.deleteMany({ agreement: agreementId, tenant: req.user._id });
    const resOffers = await Offer.deleteMany({ agreement: agreementId, tenant: req.user._id });
    const resRequests = await Request.deleteMany({ room: agreement.room, tenant: req.user._id });
    await ExitRequest.findByIdAndDelete(exitReq._id);

    res.json({
      message: "Tenant data deleted",
      deleted: {
        payments: resPayments.deletedCount || 0,
        complaints: resComplaints.deletedCount || 0,
        offers: resOffers.deletedCount || 0,
        requests: resRequests.deletedCount || 0,
        exitRequest: 1,
      },
    });
  } catch (err) {
    console.log("Tenant purge error:", err.message);
    res.status(500).json({ message: "Server error" });
  }
};

const generateExitSummaryPdf = async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: "Invalid exit id" });
    }

    const exitReq = await ExitRequest.findById(id)
      .populate("tenant", "fullName email phone kyc")
      .populate("owner", "fullName email phone kyc")
      .populate("room", "title location monthlyRent")
      .populate("agreement", "monthlyRent startDate endDate")
      .populate("settlementPayment", "amount status method paidAt createdAt period");

    if (!exitReq) return res.status(404).json({ message: "Exit request not found" });

    const uid = String(req.user._id);
    const isOwner = uid === String(exitReq.owner?._id ?? exitReq.owner);
    const isTenant = uid === String(exitReq.tenant?._id ?? exitReq.tenant);
    const isAdmin = ["admin", "super_admin"].includes(req.user.role);
    if (!isOwner && !isTenant && !isAdmin) {
      return res.status(403).json({ message: "Forbidden" });
    }

    const computed = await computeExitDue(exitReq);
    const useSettlement = ["settlement_pending", "settled"].includes(exitReq.status) || !!exitReq.settlementAt;

    const baseDeposit = Number(
      useSettlement
        ? (exitReq.depositPaid ?? exitReq.securityDeposit ?? 0)
        : (computed?.depositPaid ?? exitReq.securityDeposit ?? 0)
    );
    const unpaidRent = Number(useSettlement ? exitReq.unpaidRent : (computed.computedUnpaidRent ?? exitReq.unpaidRent ?? 0)) || 0;
    const damages = Number(exitReq.damagesCost || 0) || 0;
    const others = Number(exitReq.otherDeductions || 0) || 0;
    const electricityUnits = Number(exitReq.electricityUnits || 0) || 0;
    const electricityUnitRate = Number(exitReq.electricityUnitRate || 0) || 0;
    const electricityAmount = Number(useSettlement ? exitReq.electricityAmount : (computed.electricityAmount ?? exitReq.electricityAmount ?? 0)) || 0;
    const totalDeduction = Number((unpaidRent + damages + others + electricityAmount).toFixed(2));
    const refundable = Number(
      useSettlement
        ? exitReq.refundableAmount
        : Math.max(0, Number((baseDeposit - totalDeduction).toFixed(2)))
    );
    const toNpr = (value) => Math.ceil(Number(value || 0));
    const displayDeposit = toNpr(baseDeposit);
    const displayUnpaid = toNpr(unpaidRent);
    const displayDamages = toNpr(damages);
    const displayOthers = toNpr(others);
    const displayElectricity = toNpr(electricityAmount);
    const displayTotalDeduction = toNpr(totalDeduction);
    const displayRefundable = toNpr(refundable);

    const doc = new PDFDocument({ size: "A4", margin: 36 });
    const filename = `exit-summary-${exitReq._id}.pdf`;
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    doc.pipe(res);

    const resolveLogoPath = () => {
      const candidates = [];
      if (process.env.PDF_LOGO_PATH) candidates.push(process.env.PDF_LOGO_PATH);
      candidates.push(path.join(process.cwd(), "assets", "logo.png"));
      candidates.push(path.join(process.cwd(), "server", "assets", "logo.png"));
      for (const p of candidates) {
        if (p && fs.existsSync(p)) return p;
      }
      return null;
    };

    const resolveNepaliFont = () => {
      const candidates = [];
      if (process.env.PDF_NEPALI_FONT) candidates.push(process.env.PDF_NEPALI_FONT);
      candidates.push(path.join(process.cwd(), "assets", "NotoSansDevanagari-Regular.ttf"));
      candidates.push(path.join(process.cwd(), "server", "assets", "NotoSansDevanagari-Regular.ttf"));
      for (const p of candidates) {
        if (p && fs.existsSync(p)) return p;
      }
      return null;
    };

    const nepFont = resolveNepaliFont();
    if (nepFont) {
      doc.registerFont("NotoSansDevanagari", nepFont);
    }

    const drawLogo = (x, y) => {
      const logoPath = resolveLogoPath();
      if (logoPath) {
        doc.image(logoPath, x, y, { width: 44 });
        return;
      }
      doc.save();
      doc.roundedRect(x, y, 34, 34, 6).fill("#111827");
      doc.fillColor("#ffffff").fontSize(14).font("Helvetica-Bold").text("A", x, y + 7, { width: 34, align: "center" });
      doc.restore();
    };

    const sectionTitle = (label) => {
      doc.moveDown(0.35);
      doc.fontSize(11).font("Helvetica-Bold").text(label);
      doc.moveDown(0.15);
      doc.moveTo(36, doc.y).lineTo(560, doc.y).strokeColor("#111827").stroke();
      doc.moveDown(0.25);
      doc.font("Helvetica").fillColor("#111827");
    };

    const isNepaliChar = (ch) => /[\u0900-\u097F]/.test(ch);
    const splitByScript = (text) => {
      const out = [];
      let buf = "";
      let lastNep = null;
      for (const ch of String(text || "")) {
        const nep = isNepaliChar(ch);
        if (lastNep === null) {
          buf = ch;
          lastNep = nep;
          continue;
        }
        if (nep === lastNep) {
          buf += ch;
        } else {
          out.push({ text: buf, nep: lastNep });
          buf = ch;
          lastNep = nep;
        }
      }
      if (buf) out.push({ text: buf, nep: lastNep });
      return out.length ? out : [{ text: String(text || "-"), nep: false }];
    };
    const writeMixedLine = (label, value) => {
      const text = String(value ?? "-");
      doc.font("Helvetica").text(`${label}: `, { continued: true });
      if (!nepFont) {
        doc.text(text);
        return;
      }
      const parts = splitByScript(text);
      parts.forEach((p, idx) => {
        doc.font(p.nep ? "NotoSansDevanagari" : "Helvetica").text(p.text, { continued: idx !== parts.length - 1 });
      });
      doc.text("");
      doc.font("Helvetica");
    };

    const appUrl = process.env.APP_URL || "http://localhost:5173";
    const qrUrl = `${appUrl}/tenant/exits?exitId=${exitReq._id}`;
    const qrBuf = await QRCode.toBuffer(qrUrl, { type: "png", width: 88, margin: 1 });
    const headerY = doc.y;
    drawLogo(36, headerY);
    const qrX = doc.page.width - doc.page.margins.right - 64;
    doc.image(qrBuf, qrX, headerY, { width: 64 });
    doc.moveDown(2.2);

    doc.fontSize(16).font("Helvetica-Bold").text("EXIT SETTLEMENT SUMMARY", { align: "center" });
    doc.moveDown(0.1);
    doc.fontSize(9).font("Helvetica").fillColor("#6b7280").text("AafnoGhar - Official Summary", { align: "center" });
    doc.moveDown(0.3);
    doc.fontSize(9).fillColor("#111827");
    doc.text(`Exit ID: ${exitReq._id}`);
    doc.text(`Agreement ID: ${exitReq.agreement?._id || exitReq.agreement}`);
    doc.text(`Status: ${(exitReq.status || "-").toUpperCase()}`);
    doc.text(`Generated: ${new Date().toLocaleString()}`);

    sectionTitle("Property");
    doc.fontSize(9);
    if (exitReq.room?._id) doc.text(`Room ID: ${exitReq.room._id}`);
    writeMixedLine("Room", exitReq.room?.title || "-");
    writeMixedLine("Location", exitReq.room?.location || "-");
    doc.text(`Monthly Rent: NPR ${exitReq.room?.monthlyRent ?? exitReq.agreement?.monthlyRent ?? "-"}`);

    sectionTitle("Move-out");
    doc.fontSize(9);
    doc.text(`Move-out Date: ${exitReq.moveOutDate ? new Date(exitReq.moveOutDate).toDateString() : "-"}`);
    doc.text(`Requested At: ${exitReq.createdAt ? new Date(exitReq.createdAt).toLocaleString() : "-"}`);
    if (exitReq.settlementAt) {
      doc.text(`Settlement At: ${new Date(exitReq.settlementAt).toLocaleString()}`);
    }
    if (exitReq.settlementPaidAt) {
      doc.text(`Settlement Paid At: ${new Date(exitReq.settlementPaidAt).toLocaleString()}`);
    }
    if (exitReq.reason) {
      doc.text(`Reason: ${exitReq.reason}`);
    }

    sectionTitle("Parties");
    doc.fontSize(9);
    const ownerKycName = exitReq.owner?.kyc?.fields?.fullName || "";
    const tenantKycName = exitReq.tenant?.kyc?.fields?.fullName || "";
    writeMixedLine("Owner", exitReq.owner?.fullName || "-");
    if (ownerKycName && ownerKycName !== exitReq.owner?.fullName) {
      writeMixedLine("Owner (KYC)", ownerKycName);
    }
    doc.text(`Owner Email: ${exitReq.owner?.email || "-"}`);
    doc.text(`Owner Phone: ${exitReq.owner?.phone || "-"}`);
    doc.moveDown(0.35);
    writeMixedLine("Tenant", exitReq.tenant?.fullName || "-");
    if (tenantKycName && tenantKycName !== exitReq.tenant?.fullName) {
      writeMixedLine("Tenant (KYC)", tenantKycName);
    }
    doc.text(`Tenant Email: ${exitReq.tenant?.email || "-"}`);
    doc.text(`Tenant Phone: ${exitReq.tenant?.phone || "-"}`);

    sectionTitle("Settlement Details");
    doc.fontSize(9);
    doc.text(`Security Deposit: NPR ${displayDeposit}`);
    doc.text(`Unpaid Rent: NPR ${displayUnpaid}`);
    doc.text(`Damages Cost: NPR ${displayDamages}`);
    doc.text(`Other Deductions: NPR ${displayOthers}`);
    if (electricityAmount > 0 || electricityUnits > 0) {
      const unitText = electricityUnits > 0 ? `${electricityUnits} units @ NPR ${electricityUnitRate}` : "-";
      doc.text(`Electricity (${unitText}): NPR ${displayElectricity}`);
    }
    doc.moveDown(0.2);
    doc.fontSize(10).font("Helvetica-Bold").text(`Total Deductions: NPR ${displayTotalDeduction}`);
    doc.font("Helvetica").fontSize(9).text(`Refundable Amount: NPR ${displayRefundable}`);
    if (!useSettlement) {
      doc.fillColor("#6b7280").text("Note: This is an estimated summary before settlement.");
      doc.fillColor("#111827");
    }

    sectionTitle("Payment");
    doc.fontSize(9);
    if (exitReq.settlementPayment) {
      const p = exitReq.settlementPayment;
      doc.text(`Payment ID: ${p._id}`);
      doc.text(`Period: ${p.period || "-"}`);
      doc.text(`Amount: NPR ${toNpr(p.amount)}`);
      doc.text(`Method: ${p.method || "-"}`);
      doc.text(`Status: ${(p.status || "-").toUpperCase()}`);
      doc.text(`Paid At: ${p.paidAt ? new Date(p.paidAt).toLocaleString() : "-"}`);
    } else {
      doc.text(`Settlement Payment: ${exitReq.settlementPaid ? "PAID" : "PENDING"}`);
    }

    if (exitReq.ownerNote) {
      sectionTitle("Owner Note");
      doc.fontSize(9).text(exitReq.ownerNote);
    }

    drawStamp(doc, {
      text: "AafnoGhar Official",
      tagline: "Verified exit",
    });

    doc.end();
  } catch (err) {
    console.log("Exit summary PDF error:", err.message);
    if (!res.headersSent) {
      res.status(500).json({ message: "Server error" });
    }
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
  tenantPurgeExitData,
  generateExitSummaryPdf,
};
