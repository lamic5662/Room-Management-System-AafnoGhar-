import mongoose from "mongoose";
import ElectricityBill from "../models/ElectricityBill.js";
import Agreement from "../models/Agreement.js";
import ExitRequest from "../models/ExitRequest.js";
import { getPeriodDue, isValidPeriod } from "../utils/paymentDue.js";
import { notifyUser } from "../services/notify.service.js";

const createElectricityBill = async (req, res) => {
  try {
    if (req.user.role !== "owner") {
      return res.status(403).json({ message: "Owner access only" });
    }

    const { agreementId, period, currentReading, unitRate, previousReading, note } = req.body || {};
    if (!agreementId || !period || currentReading === undefined || unitRate === undefined) {
      return res.status(400).json({ message: "agreementId, period, currentReading, unitRate are required" });
    }
    if (!mongoose.Types.ObjectId.isValid(agreementId)) {
      return res.status(400).json({ message: "Invalid agreementId" });
    }
    if (!isValidPeriod(period)) {
      return res.status(400).json({ message: "period must be in YYYY-MM format" });
    }

    const agreement = await Agreement.findById(agreementId);
    if (!agreement) return res.status(404).json({ message: "Agreement not found" });
    if (String(agreement.owner) !== String(req.user._id)) {
      return res.status(403).json({ message: "Not your agreement" });
    }
    if (agreement.status !== "active") {
      return res.status(400).json({ message: "Agreement is not active" });
    }
    if (!agreement.ownerSignatureUrl || !agreement.tenantSignatureUrl) {
      return res.status(400).json({ message: "Both owner and tenant must sign the agreement before billing" });
    }

    const existing = await ElectricityBill.findOne({ agreement: agreementId, period });
    if (existing) {
      return res.status(409).json({ message: "Electricity bill for this period already exists" });
    }

    const [yearStr, monthStr] = period.split("-");
    const monetYear = Number(yearStr);
    const monetMonth = Number(monthStr);
    const endOfPeriod = new Date(monetYear, monetMonth, 0, 23, 59, 59);
    const now = new Date();
    let allowedBeforeEnd = false;
    if (now >= endOfPeriod) {
      allowedBeforeEnd = true;
    } else {
      const exit = await ExitRequest.findOne({
        agreement: agreementId,
        status: { $in: ["approved", "settled"] },
      }).sort({ moveOutDate: -1 });
      if (exit && exit.moveOutDate) {
        const exitDate = new Date(exit.moveOutDate);
        if (exitDate <= endOfPeriod) {
          allowedBeforeEnd = true;
        }
      }
    }
    if (!allowedBeforeEnd) {
      return res.status(400).json({
        message: "Electricity bill can be generated only after the billing month ends or when an approved exit falls within that period",
      });
    }

    let prev = Number(previousReading);
    if (!Number.isFinite(prev)) {
      const last = await ElectricityBill.findOne({ agreement: agreementId })
        .sort({ createdAt: -1 })
        .select("currentReading");
      prev = Number(last?.currentReading || 0);
    }

    const curr = Number(currentReading);
    if (!Number.isFinite(curr) || curr < 0) {
      return res.status(400).json({ message: "currentReading must be a valid number" });
    }
    if (!Number.isFinite(prev) || prev < 0) {
      return res.status(400).json({ message: "previousReading must be a valid number" });
    }
    if (curr < prev) {
      return res.status(400).json({ message: "currentReading must be >= previousReading" });
    }

    const rate = Number(unitRate);
    if (!Number.isFinite(rate) || rate <= 0) {
      return res.status(400).json({ message: "unitRate must be a valid number" });
    }

    const unitsUsed = Math.max(0, curr - prev);
    const amount = Math.round(unitsUsed * rate);

    const bill = await ElectricityBill.create({
      agreement: agreement._id,
      room: agreement.room,
      owner: agreement.owner,
      tenant: agreement.tenant,
      period,
      previousReading: prev,
      currentReading: curr,
      unitsUsed,
      unitRate: rate,
      amount,
      note: note || "",
      status: "pending",
    });

    notifyUser({
      userId: agreement.tenant,
      title: "Electricity bill added",
      message: `Bill added for ${period}`,
      type: "electricity",
      data: { billId: bill._id, agreementId: agreement._id, url: "/tenant/payments" },
    });

    res.status(201).json({ message: "Electricity bill created", bill });
  } catch (err) {
    if (err.code === 11000) {
      return res.status(409).json({ message: "Electricity bill for this period already exists" });
    }
    console.log("Create electricity bill error:", err.message);
    res.status(500).json({ message: "Server error" });
  }
};

const ownerBills = async (req, res) => {
  try {
    if (req.user.role !== "owner") {
      return res.status(403).json({ message: "Owner access only" });
    }

    const bills = await ElectricityBill.find({ owner: req.user._id })
      .populate("room", "title location")
      .populate("tenant", "fullName phone email")
      .sort({ createdAt: -1 });

    res.json({ count: bills.length, bills });
  } catch (err) {
    console.log("Owner bills error:", err.message);
    res.status(500).json({ message: "Server error" });
  }
};

const tenantBills = async (req, res) => {
  try {
    if (req.user.role !== "tenant") {
      return res.status(403).json({ message: "Tenant access only" });
    }

    const bills = await ElectricityBill.find({ tenant: req.user._id })
      .populate("room", "title location")
      .populate("owner", "fullName phone email")
      .sort({ createdAt: -1 });

    res.json({ count: bills.length, bills });
  } catch (err) {
    console.log("Tenant bills error:", err.message);
    res.status(500).json({ message: "Server error" });
  }
};

const billForPayment = async (req, res) => {
  try {
    const { agreementId, period } = req.query || {};
    if (!agreementId || !period) {
      return res.status(400).json({ message: "agreementId and period are required" });
    }
    if (!mongoose.Types.ObjectId.isValid(agreementId)) {
      return res.status(400).json({ message: "Invalid agreementId" });
    }
    if (!isValidPeriod(period)) {
      return res.status(400).json({ message: "period must be in YYYY-MM format" });
    }

    const agreement = await Agreement.findById(agreementId);
    if (!agreement) return res.status(404).json({ message: "Agreement not found" });

    const me = String(req.user._id);
    if (me !== String(agreement.owner) && me !== String(agreement.tenant)) {
      return res.status(403).json({ message: "Not your agreement" });
    }

    const due = await getPeriodDue(agreement, period);

    res.json({
      rentAmount: due.rentAmount,
      electricityAmount: due.electricityAmount,
      totalAmount: due.totalAmount,
      rentPaid: due.rentPaid,
      rentPending: due.rentPending,
      dueRent: due.dueRent,
      dueElectricity: due.dueElectricity,
      bill: due.bill,
      payable: due.totalAmount > 0 && !due.rentPending,
    });
  } catch (err) {
    console.log("Bill for payment error:", err.message);
    res.status(500).json({ message: "Server error" });
  }
};

export { createElectricityBill, ownerBills, tenantBills, billForPayment };
