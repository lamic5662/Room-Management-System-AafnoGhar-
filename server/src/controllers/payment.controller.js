import mongoose from "mongoose";
import PDFDocument from "pdfkit";
import fs from "fs";
import path from "path";
import QRCode from "qrcode";
import Payment from "../models/payment.js";
import Agreement from "../models/Agreement.js";
import Room from "../models/Room.js";
import ExitRequest from "../models/ExitRequest.js";
import ElectricityBill from "../models/ElectricityBill.js";
import LateCharge from "../models/LateCharge.js";
import { getExitUnpaid, getPeriodDue, isValidPeriod } from "../utils/paymentDue.js";
import { ensureActiveAgreementOrApprovedExit } from "../utils/exitPaymentGuard.js";
import { notifyUser } from "../services/notify.service.js";
import { sendExitReviewReminder } from "../utils/reviewReminder.js";
import { drawStamp } from "../utils/pdfStamp.js";
import { parseElectricityInput, createElectricityBillFromUnits } from "../utils/electricityInput.js";

const formatPeriod = (date) => {
    if (!date || Number.isNaN(new Date(date).getTime())) return "";
    const d = new Date(date);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
};

const buildPeriods = (startDate, endDate) => {
    if (!startDate || !endDate) return [];
    const start = new Date(startDate.getFullYear(), startDate.getMonth(), 1);
    const end = new Date(endDate.getFullYear(), endDate.getMonth(), 1);
    const periods = [];
    for (let d = new Date(start); d <= end; d.setMonth(d.getMonth() + 1)) {
        periods.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
    }
    return periods;
};

// TENANT: create payment record for a period (pending)
const createPayment = async (req, res) => {
    try {
        if (req.user.role !== "tenant") {
            return res.status(403).json({ message: "Tenant access only" });
        }

        const { agreementId, period, amount, method, note, cardName, cardExpiry, exitId } = req.body || {};
        if (!agreementId || !period) {
            return res.status(400).json({ message: "agreementId and period (YYYY-MM) are required" });
        }
        if (!mongoose.Types.ObjectId.isValid(agreementId)) {
            return res.status(400).json({ message: "Invalid agreementId" });
        }
        if (!isValidPeriod(period)) {
            return res.status(400).json({ message: "period must be in YYYY-MM format" });
        }
        const amountNum = amount === undefined ? null : Number(amount);
        if (amountNum !== null && (!Number.isFinite(amountNum) || amountNum <= 0)) {
            return res.status(400).json({ message: "amount must be a valid number" });
        }

        const allowedMethods = ["cash", "bank", "esewa", "khalti", "other"];
        if (method && !allowedMethods.includes(method)) {
            return res.status(400).json({ message: "Invalid payment method" });
        }
        const methodFinal = method || "cash";
        if (methodFinal === "bank") {
            if (!cardName || String(cardName).trim().length < 2) {
                return res.status(400).json({ message: "cardName is required for bank transfer" });
            }
            if (!cardExpiry || !/^\d{2}\/\d{2}$/.test(String(cardExpiry).trim())) {
                return res.status(400).json({ message: "cardExpiry must be in MM/YY format" });
            }
        }

        const agreement = await Agreement.findById(agreementId);
        if (!agreement) return res.status(404).json({ message: "Agreement not found" });

        if (String(agreement.tenant) !== String(req.user._id)) {
            return res.status(403).json({ message: "Not your agreement" });
        }
        try {
            await ensureActiveAgreementOrApprovedExit({
                agreement,
                tenantId: req.user._id,
                exitId: req.body?.exitId,
            });
        } catch (err) {
            return res.status(400).json({ message: err.message });
        }
        if (!agreement.ownerSignatureUrl || !agreement.tenantSignatureUrl) {
            return res.status(400).json({ message: "Both parties must sign the agreement before making payments" });
        }

        let electricityInput = { hasInput: false, units: 0, rate: 0 };
        try {
            electricityInput = parseElectricityInput(req.body || {});
        } catch (err) {
            return res.status(400).json({ message: err.message });
        }

        if (exitId) {
            if (!mongoose.Types.ObjectId.isValid(exitId)) {
                return res.status(400).json({ message: "Invalid exitId" });
            }
            const exitReq = await ExitRequest.findOne({
                _id: exitId,
                agreement: agreement._id,
                tenant: req.user._id,
                status: { $in: ["approved", "settlement_pending", "settled"] },
            });
            if (!exitReq) return res.status(404).json({ message: "Exit request not found" });
            if (exitReq.settlementPaid) {
                return res.status(400).json({ message: "Exit settlement already paid" });
            }
            const due = await getExitUnpaid({
                agreement,
                moveOutDate: exitReq.moveOutDate,
                tenantId: req.user._id,
            });
            const existingExitPay = await Payment.findOne({
                exitRequest: exitReq._id,
                status: { $in: ["pending", "confirmed"] },
            }).select("_id");
            if (existingExitPay) {
                return res.status(409).json({ message: "Exit payment already exists" });
            }
            const exitElec = Number(exitReq.electricityAmount || due.electricityAmount || 0);
            const hasSettlement = ["settlement_pending", "settled"].includes(exitReq.status) || exitReq.settlementAt;
            let expectedTotal = 0;
            if (hasSettlement) {
                const depositPaid = Number(exitReq.depositPaid ?? exitReq.securityDeposit ?? 0);
                const totalDeduction = Number(exitReq.unpaidRent || 0)
                    + Number(exitReq.damagesCost || 0)
                    + Number(exitReq.otherDeductions || 0)
                    + exitElec;
                expectedTotal = Number(Math.max(0, totalDeduction - depositPaid).toFixed(2));
            } else {
                expectedTotal = Number(((due.unpaidRent || 0) + exitElec).toFixed(2));
            }
            if (expectedTotal <= 0) {
                return res.status(400).json({ message: "Nothing due for this exit" });
            }
            if (amountNum !== null && Math.abs(amountNum - expectedTotal) > 1) {
                return res.status(400).json({
                    message: `amount should be ${expectedTotal} for this exit`,
                });
            }
            const payment = await Payment.create({
                agreement: agreement._id,
                room: agreement.room,
                owner: agreement.owner,
                tenant: agreement.tenant,
                period,
                amount: expectedTotal,
                rentAmount: 0,
                exitAmount: expectedTotal,
                carryCreditApplied: 0,
                electricityAmount: exitElec,
                electricityBill: due.electricityBill?._id || null,
                exitRequest: exitReq._id,
                method: methodFinal,
                note: note || "",
                status: "pending",
                cardName: methodFinal === "bank" ? String(cardName || "").trim() : "",
                cardExpiry: methodFinal === "bank" ? String(cardExpiry || "").trim() : "",
                generatedCarryCredit: 0,
                generatedCarryCreditPeriod: "",
            });

            notifyUser({
                userId: agreement.owner,
                title: "Payment submitted",
                message: `Tenant submitted exit payment for ${period}`,
                type: "payment",
                data: { paymentId: payment._id, agreementId: agreement._id, url: "/owner/payments" },
            });

            return res.status(201).json({ message: "Payment submitted (pending owner confirmation)", payment });
        }

        // fallback: if exitId not provided but exit request matches this period, treat as exit payment
        const exitReq = await ExitRequest.findOne({
            agreement: agreement._id,
            tenant: req.user._id,
            status: { $in: ["approved", "settlement_pending"] },
        }).sort({ createdAt: -1 });
        if (exitReq) {
            const exitPeriod = formatPeriod(exitReq.moveOutDate);
            if (exitPeriod && exitPeriod === period && !exitReq.settlementPaid) {
                const due = await getExitUnpaid({
                    agreement,
                    moveOutDate: exitReq.moveOutDate,
                    tenantId: req.user._id,
                });
                const exitElec = Number(exitReq.electricityAmount || due.electricityAmount || 0);
                const hasSettlement = ["settlement_pending", "settled"].includes(exitReq.status) || exitReq.settlementAt;
                let expectedTotal = 0;
                if (hasSettlement) {
                    const depositPaid = Number(exitReq.depositPaid ?? exitReq.securityDeposit ?? 0);
                    const totalDeduction = Number(exitReq.unpaidRent || 0)
                        + Number(exitReq.damagesCost || 0)
                        + Number(exitReq.otherDeductions || 0)
                        + exitElec;
                    expectedTotal = Number(Math.max(0, totalDeduction - depositPaid).toFixed(2));
                } else {
                    expectedTotal = Number(((due.unpaidRent || 0) + exitElec).toFixed(2));
                }
                if (expectedTotal > 0) {
                    if (amountNum !== null && Math.abs(amountNum - expectedTotal) > 1) {
                        return res.status(400).json({
                            message: `amount should be ${expectedTotal} for this exit`,
                        });
                    }
                    const existingExitPay = await Payment.findOne({
                        exitRequest: exitReq._id,
                        status: { $in: ["pending", "confirmed"] },
                    }).select("_id");
                    if (!existingExitPay) {
                        const payment = await Payment.create({
                            agreement: agreement._id,
                            room: agreement.room,
                            owner: agreement.owner,
                            tenant: agreement.tenant,
                            period,
                            amount: expectedTotal,
                            rentAmount: 0,
                            exitAmount: expectedTotal,
                            carryCreditApplied: 0,
                            electricityAmount: exitElec,
                            electricityBill: due.electricityBill?._id || null,
                            exitRequest: exitReq._id,
                            method: methodFinal,
                            note: note || "",
                            status: "pending",
                            cardName: methodFinal === "bank" ? String(cardName || "").trim() : "",
                            cardExpiry: methodFinal === "bank" ? String(cardExpiry || "").trim() : "",
                            generatedCarryCredit: 0,
                            generatedCarryCreditPeriod: "",
                        });
                        notifyUser({
                            userId: agreement.owner,
                            title: "Payment submitted",
                            message: `Tenant submitted exit payment for ${period}`,
                            type: "payment",
                            data: { paymentId: payment._id, agreementId: agreement._id, url: "/owner/payments" },
                        });
                        return res.status(201).json({ message: "Payment submitted (pending owner confirmation)", payment });
                    }
                }
            }
        }

        const due = await getPeriodDue(agreement, period);

        if (due.rentPending) {
            return res.status(409).json({ message: "Rent payment is already pending for this period" });
        }

        if (due.rentPaid && !due.bill) {
            return res.status(400).json({ message: "Rent already paid and no electricity bill for this period" });
        }

        if (due.bill && electricityInput.hasInput) {
            return res.status(409).json({ message: "Electricity bill already exists for this period" });
        }

        if (due.bill) {
            const existingElec = await Payment.findOne({
                electricityBill: due.bill._id,
                status: { $in: ["pending", "confirmed"] },
            }).select("_id");
            if (existingElec) {
                return res.status(409).json({ message: "Electricity bill payment already exists" });
            }
        }

        let electricityAmount = due.dueElectricity || 0;
        let electricityBillId = due.bill?._id || null;
        if (!due.bill && electricityInput.hasInput) {
            const existingBill = await ElectricityBill.findOne({ agreement: agreement._id, period }).select("_id");
            if (existingBill) {
                return res.status(409).json({ message: "Electricity bill already exists for this period" });
            }
            electricityAmount = Math.round(electricityInput.units * electricityInput.rate);
        }

        const expectedTotal = (due.dueRent || 0) + electricityAmount + (due.lateFee || 0);
        if (expectedTotal <= 0) {
            return res.status(400).json({ message: "Nothing due for this period" });
        }

        if (amountNum !== null && Math.abs(amountNum - expectedTotal) > 1) {
            return res.status(400).json({
                message: `amount should be ${expectedTotal} for this period`,
            });
        }

        if (!due.bill && electricityInput.hasInput) {
            try {
                const created = await createElectricityBillFromUnits({
                    agreement,
                    period,
                    units: electricityInput.units,
                    rate: electricityInput.rate,
                });
                electricityAmount = created.amount;
                electricityBillId = created.bill._id;
            } catch (err) {
                return res.status(400).json({ message: err.message });
            }
        }

        // create payment
        const payment = await Payment.create({
            agreement: agreement._id,
            room: agreement.room,
            owner: agreement.owner,
            tenant: agreement.tenant,
            period,
            amount: expectedTotal,
            rentAmount: due.dueRent,
            carryCreditApplied: due.carryCreditApplied || 0,
            electricityAmount,
            electricityBill: electricityBillId,
            exitRequest: mongoose.Types.ObjectId.isValid(exitId) ? exitId : null,
            method: methodFinal,
            note: note || "",
            status: "pending",
            cardName: methodFinal === "bank" ? String(cardName || "").trim() : "",
            cardExpiry: methodFinal === "bank" ? String(cardExpiry || "").trim() : "",
            generatedCarryCredit: due.generatedCarryCredit || 0,
            generatedCarryCreditPeriod: due.generatedCarryCreditPeriod || "",
        });

        notifyUser({
            userId: agreement.owner,
            title: "Payment submitted",
            message: `Tenant submitted payment for ${period}`,
            type: "payment",
            data: { paymentId: payment._id, agreementId: agreement._id, url: "/owner/payments" },
        });

        res.status(201).json({ message: "Payment submitted (pending owner confirmation)", payment });
    } catch (err) {
        // duplicate unique index error
        if (err.code === 11000) {
            return res.status(409).json({ message: "Payment for this period already exists" });
        }
        console.log("Create payment error:", err.message);
        res.status(500).json({ message: "Server error" });
    }
};

// OWNER: confirm/reject payment
const updatePaymentStatus = async (req, res) => {
    try {
        if (req.user.role !== "owner") {
            return res.status(403).json({ message: "Owner access only" });
        }

        const { id } = req.params; // payment id
        const { status } = req.body || {};

        if (!["confirmed", "rejected"].includes(status)) {
            return res.status(400).json({ message: "status must be confirmed or rejected" });
        }

        const payment = await Payment.findById(id);
        if (!payment) return res.status(404).json({ message: "Payment not found" });

        if (String(payment.owner) !== String(req.user._id)) {
            return res.status(403).json({ message: "Not your payment" });
        }

        if (payment.status !== "pending") {
            return res.status(400).json({ message: `Payment already ${payment.status}` });
        }

        payment.status = status;
        payment.paidAt = status === "confirmed" ? new Date() : null;
        await payment.save();

        if (status === "confirmed" && payment.electricityBill) {
            await ElectricityBill.findByIdAndUpdate(payment.electricityBill, { status: "paid" });
        }

        if (status === "confirmed") {
            const agreementDoc = await Agreement.findById(payment.agreement);
            if (agreementDoc) {
                let agreementDirty = false;

                if (payment.generatedCarryCredit > 0 && !agreementDoc.firstMonthProrated) {
                    agreementDoc.carryOverCredit = Number(
                        (Number(agreementDoc.carryOverCredit || 0) + payment.generatedCarryCredit).toFixed(2)
                    );
                    agreementDoc.carryOverCreditPeriod = payment.generatedCarryCreditPeriod || "";
                    agreementDoc.firstMonthProrated = true;
                    agreementDirty = true;
                }

                if (payment.carryCreditApplied > 0 && agreementDoc.carryOverCredit > 0) {
                    agreementDoc.carryOverCredit = Number(
                        Math.max(0, agreementDoc.carryOverCredit - payment.carryCreditApplied).toFixed(2)
                    );
                    if (agreementDoc.carryOverCredit <= 0) {
                        agreementDoc.carryOverCredit = 0;
                        agreementDoc.carryOverCreditPeriod = "";
                    }
                    agreementDirty = true;
                }

                if (agreementDirty) {
                    await agreementDoc.save();
                }
            }
        }
        if (status === "confirmed" && payment.exitRequest) {
            const exitReq = await ExitRequest.findById(payment.exitRequest);
            if (exitReq) {
                exitReq.settlementPaid = true;
                exitReq.settlementPaidAt = new Date();
                exitReq.settlementPayment = payment._id;
                if (exitReq.status === "settlement_pending") {
                    exitReq.status = "settled";
                }
                await exitReq.save();
                if (exitReq.status === "settled") {
                    await sendExitReviewReminder(exitReq);
                    if (exitReq.agreement) {
                        await Agreement.findByIdAndUpdate(exitReq.agreement, { status: "ended" });
                    }
                    if (exitReq.room) {
                        const room = await Room.findById(exitReq.room);
                        if (room) {
                            room.isPublished = !room.requiresImprovement && !room.isFlagged;
                            await room.save();
                        }
                    }
                }
            }
        }

        notifyUser({
            userId: payment.tenant,
            title: `Payment ${status}`,
            message: `Owner ${status} your payment for ${payment.period}`,
            type: "payment",
            data: { paymentId: payment._id, agreementId: payment.agreement, url: "/tenant/payments" },
        });

        res.json({ message: `Payment ${status}`, payment });
    } catch (err) {
        console.log("Update payment status error:", err.message);
        res.status(500).json({ message: "Server error" });
    }
};

// TENANT: list my payments
const myPayments = async (req, res) => {
    try {
        if (req.user.role !== "tenant") {
            return res.status(403).json({ message: "Tenant access only" });
        }

        const payments = await Payment.find({ tenant: req.user._id })
            .populate("room", "title location monthlyRent photos")
            .populate("owner", "fullName phone email")
            .populate("agreement", "monthlyRent status startDate")
            .sort({ createdAt: -1 });

        res.json({ count: payments.length, payments });
    } catch (err) {
        console.log("My payments error:", err.message);
        res.status(500).json({ message: "Server error" });
    }
};

// OWNER: list incoming payments for my rooms/agreements
const incomingPayments = async (req, res) => {
    try {
        if (req.user.role !== "owner") {
            return res.status(403).json({ message: "Owner access only" });
        }

        const payments = await Payment.find({ owner: req.user._id })
            .populate("tenant", "fullName phone email")
            .populate("room", "title location monthlyRent photos")
            .populate("agreement", "monthlyRent status startDate")
            .sort({ createdAt: -1 });

        res.json({ count: payments.length, payments });
    } catch (err) {
        console.log("Incoming payments error:", err.message);
        res.status(500).json({ message: "Server error" });
    }
};

// BOTH: get due status for a specific agreement + period
const dueStatus = async (req, res) => {
    try {
        const { agreementId, period } = req.query;

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
        const isOwner = me === String(agreement.owner);
        const isTenant = me === String(agreement.tenant);

        if (!isOwner && !isTenant) {
            return res.status(403).json({ message: "Not your agreement" });
        }

        const due = await getPeriodDue(agreement, period);
        const rentPayment = await Payment.findOne({
            agreement: agreementId,
            period,
            rentAmount: { $gt: 0 },
        }).sort({ createdAt: -1 });
        const elecPayment = due.bill
            ? await Payment.findOne({ electricityBill: due.bill._id }).sort({ createdAt: -1 })
            : null;

        if (!rentPayment && !elecPayment) {
            return res.json({
                period,
                status: "unpaid",
                expected: due.totalAmount,
                electricityAmount: due.electricityAmount,
                rentPaid: due.rentPaid,
            });
        }

        const [yearStr, monthStr] = period.split("-");
        const year = Number(yearStr);
        const month = Number(monthStr) - 1;
        const reminderDayRaw = agreement.rentReminderDay || agreement.startDate?.getDate?.() || 1;
        const reminderDay = Math.min(Math.max(1, Number(reminderDayRaw) || 1), 31);
        const lastDay = new Date(year, month + 1, 0).getDate();
        const reminderDate = new Date(year, month, Math.min(reminderDay, lastDay));
        const now = new Date();
        if (!due.rentPaid && now >= reminderDate && agreement.rentReminderPeriod !== period) {
            await Promise.all([
                notifyUser({
                    userId: agreement.tenant,
                    title: "Rent due reminder",
                    message: `Rent for ${period} is due. Please pay on time.`,
                    type: "payment",
                    data: { agreementId: agreement._id, period, url: "/tenant/payments" },
                }),
                notifyUser({
                    userId: agreement.owner,
                    title: "Tenant rent reminder",
                    message: `Rent for ${period} is still outstanding.`,
                    type: "payment",
                    data: { agreementId: agreement._id, period, url: "/owner/payments" },
                }),
            ]);
            agreement.rentReminderPeriod = period;
            await agreement.save();
        }

        return res.json({
            period,
            status: rentPayment?.status || elecPayment?.status || "unpaid",
            amount: (rentPayment?.amount || 0) + (elecPayment?.amount || 0),
            method: rentPayment?.method || elecPayment?.method || "",
            paidAt: rentPayment?.paidAt || elecPayment?.paidAt || null,
            electricityAmount: due.electricityAmount,
            rentPaid: due.rentPaid,
            lateFee: due.lateFee || 0,
            lateCharges: due.lateCharges || [],
        });
    } catch (err) {
        console.log("Due status error:", err.message);
        res.status(500).json({ message: "Server error" });
    }
};

// BOTH: payment timeline by agreement
const paymentTimeline = async (req, res) => {
    try {
        const { agreementId } = req.query;
        if (!agreementId || !mongoose.Types.ObjectId.isValid(agreementId)) {
            return res.status(400).json({ message: "Valid agreementId is required" });
        }

        const agreement = await Agreement.findById(agreementId)
            .populate("room", "title location monthlyRent")
            .populate("owner", "fullName email phone")
            .populate("tenant", "fullName email phone");
        if (!agreement) return res.status(404).json({ message: "Agreement not found" });

        const me = String(req.user._id);
        const isOwner = me === String(agreement.owner?._id || agreement.owner);
        const isTenant = me === String(agreement.tenant?._id || agreement.tenant);
        if (!isOwner && !isTenant) {
            return res.status(403).json({ message: "Not your agreement" });
        }

        const start = agreement.startDate ? new Date(agreement.startDate) : new Date(agreement.createdAt);
        const endRaw = agreement.status === "ended" ? agreement.endDate : new Date();
        const end = endRaw ? new Date(endRaw) : new Date();
        if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
            return res.json({ agreement, periods: [] });
        }

        const periods = buildPeriods(start, end);
        const payments = await Payment.find({ agreement: agreementId })
            .select("period status amount rentAmount electricityAmount exitAmount method paidAt createdAt")
            .sort({ createdAt: -1 });

        const rentMap = new Map();
        const elecMap = new Map();
        payments.forEach((p) => {
            if (p.exitAmount > 0) return;
            if (p.rentAmount > 0 && !rentMap.has(p.period)) rentMap.set(p.period, p);
            if (p.rentAmount <= 0 && p.electricityAmount > 0 && !elecMap.has(p.period)) elecMap.set(p.period, p);
        });

        const timeline = await Promise.all(
            periods.map(async (period) => {
                const due = await getPeriodDue(agreement, period);
                const rentPayment = rentMap.get(period) || null;
                const electricityPayment = elecMap.get(period) || null;
                const status = rentPayment?.status || (due.rentPending ? "pending" : due.rentPaid ? "confirmed" : "unpaid");

                return {
                    period,
                    dueRent: Number(due.dueRent || 0),
                    dueElectricity: Number(due.dueElectricity || 0),
                    lateFee: Number(due.lateFee || 0),
                    totalDue: Number(due.totalAmount || 0),
                    rentPerDay: Number(due.rentPerDay || 0),
                    daysCharged: Number(due.daysCharged || 0),
                    daysInMonth: Number(due.daysInMonth || 0),
                    proratedFirstMonth: Boolean(due.proratedFirstMonth),
                    rentPaid: Boolean(due.rentPaid),
                    rentPending: Boolean(due.rentPending),
                    status,
                    rentPayment: rentPayment
                        ? {
                              id: rentPayment._id,
                              status: rentPayment.status,
                              amount: rentPayment.amount,
                              rentAmount: rentPayment.rentAmount,
                              electricityAmount: rentPayment.electricityAmount,
                              method: rentPayment.method,
                              paidAt: rentPayment.paidAt,
                              createdAt: rentPayment.createdAt,
                          }
                        : null,
                    electricityPayment: electricityPayment
                        ? {
                              id: electricityPayment._id,
                              status: electricityPayment.status,
                              amount: electricityPayment.amount,
                              electricityAmount: electricityPayment.electricityAmount,
                              method: electricityPayment.method,
                              paidAt: electricityPayment.paidAt,
                              createdAt: electricityPayment.createdAt,
                          }
                        : null,
                };
            })
        );

        res.json({
            agreement: {
                id: agreement._id,
                status: agreement.status,
                startDate: agreement.startDate,
                endDate: agreement.endDate,
                monthlyRent: agreement.monthlyRent,
                room: agreement.room,
                owner: agreement.owner,
                tenant: agreement.tenant,
                rentReminderDay: agreement.rentReminderDay || null,
            },
            periods: timeline.reverse(),
        });
    } catch (err) {
        console.log("Payment timeline error:", err.message);
        res.status(500).json({ message: "Server error" });
    }
};

const generatePaymentBill = async (req, res) => {
    try {
        const { id } = req.params;
        if (!mongoose.Types.ObjectId.isValid(id)) {
            return res.status(400).json({ message: "Invalid payment id" });
        }
        const payment = await Payment.findById(id)
            .populate("room", "title location monthlyRent")
            .populate("owner", "fullName phone email")
            .populate("tenant", "fullName phone email")
            .populate("agreement", "monthlyRent startDate endDate")
            .populate("electricityBill");
        if (!payment) return res.status(404).json({ message: "Payment not found" });

        const me = String(req.user._id);
        const isOwner = me === String(payment.owner._id ?? payment.owner);
        const isTenant = me === String(payment.tenant._id ?? payment.tenant);
        if (!isOwner && !isTenant) {
            return res.status(403).json({ message: "Not your payment" });
        }

        if (payment.status !== "confirmed") {
            return res.status(400).json({ message: "Bill available after confirmation only" });
        }

        const electricityBill = payment.electricityBill || null;
        const due = payment.agreement ? await getPeriodDue(payment.agreement, payment.period) : null;
        const doc = new PDFDocument({ size: "A4", margin: 36 });
        const filename = `rent-bill-${payment.period}.pdf`;
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
        const toNpr = (value) => {
            const num = Number(value);
            return Number.isFinite(num) ? Math.ceil(num) : "-";
        };

        const appUrl = process.env.APP_URL || "http://localhost:5173";
        const qrUrl = `${appUrl}/tenant/payments?paymentId=${payment._id}`;
        const qrBuf = await QRCode.toBuffer(qrUrl, { type: "png", width: 88, margin: 1 });
        const headerY = doc.y;
        drawLogo(40, headerY);
        const qrX = doc.page.width - doc.page.margins.right - 64;
        doc.image(qrBuf, qrX, headerY, { width: 64 });
        doc.moveDown(2.2);

        const sectionTitle = (label) => {
            doc.moveDown(0.35);
            doc.fontSize(11).font("Helvetica-Bold").text(label);
            doc.moveDown(0.15);
            doc.moveTo(40, doc.y).lineTo(555, doc.y).strokeColor("#111827").stroke();
            doc.moveDown(0.25);
            doc.font("Helvetica").fillColor("#111827");
        };

        doc.fontSize(16).font("Helvetica-Bold").text("PAYMENT RECEIPT", { align: "center" });
        doc.moveDown(0.1);
        doc.fontSize(9).font("Helvetica").fillColor("#6b7280").text("AafnoGhar • Official Receipt", { align: "center" });
        doc.moveDown(0.3);
        doc.fontSize(9).fillColor("#111827").text(`Payment ID: ${payment._id}`);
        doc.text(`Period: ${payment.period}`);
        doc.text(`Generated: ${new Date().toLocaleString()}`);

        sectionTitle("Parties");
        doc.fontSize(9).font("Helvetica").text(`${payment.tenant.fullName} • ${payment.tenant.email || ""} • ${payment.tenant.phone || ""}`);
        doc.text(`${payment.owner.fullName} • ${payment.owner.email || ""} • ${payment.owner.phone || ""}`);

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

        sectionTitle("Property");
        doc.fontSize(9).font("Helvetica").text(`Room ID: ${payment.room._id}`);
        writeMixedLine("Room", `${payment.room.title} • ${payment.room.location}`);
        doc.text(`Monthly Rent: NPR ${toNpr(payment.room.monthlyRent || payment.rentAmount)}`);

        sectionTitle("Payment Details");
        if (payment.exitRequest) {
            const exitRent = payment.exitAmount > 0
                ? payment.exitAmount
                : Math.max(0, Number(payment.amount || 0) - Number(payment.electricityAmount || 0));
            doc.fontSize(9).font("Helvetica").text(`Exit unpaid rent: NPR ${toNpr(exitRent)}`);
        } else {
            doc.fontSize(9).font("Helvetica").text(`Rent: NPR ${toNpr(payment.rentAmount)}`);
        }
        if (due?.rentPerDay && due?.daysCharged && due?.daysInMonth && !payment.exitRequest) {
            const perDay = toNpr(due.rentPerDay || 0);
            const calcLine = `Rent calc: NPR ${perDay}/day × ${due.daysCharged}/${due.daysInMonth} days`;
            const prorationNote = due.proratedFirstMonth ? " (prorated)" : "";
            doc.text(`${calcLine} = NPR ${toNpr(payment.rentAmount)}${prorationNote}`);
        }
        if (payment.electricityAmount > 0 || electricityBill) {
            const units = electricityBill?.unitsUsed ?? "-";
            const rate = electricityBill?.unitRate ?? "-";
            doc.text(`Electricity (${units} units @ NPR ${rate}): NPR ${toNpr(payment.electricityAmount)}`);
        }
        doc.moveDown(0.2);
        doc.fontSize(11).font("Helvetica-Bold").text(`Total paid: NPR ${toNpr(payment.amount)}`);
        doc.fontSize(9).font("Helvetica").text(`Payment method: ${payment.method}`);
        if (payment.note) {
            doc.text(`Note: ${payment.note}`);
        }
        if (electricityBill?.note) {
            doc.text(`Electricity note: ${electricityBill.note}`);
        }
        doc.moveDown(0.2);
        doc.text(`Paid at: ${payment.paidAt ? new Date(payment.paidAt).toLocaleString() : "-"}`);

        sectionTitle("Declaration");
        doc.fontSize(9).font("Helvetica").text(
            "1. This receipt confirms that the stated amount has been received.\n" +
            "2. This document is electronically generated and valid without physical signature.\n" +
            "3. Any disputes must be raised in accordance with the agreement terms.",
            { lineGap: 2 }
        );

        drawStamp(doc, {
            text: "AafnoGhar Official",
            tagline: "Verified payment",
        });

        doc.end();
    } catch (err) {
        console.log("Generate payment bill error:", err.message);
        if (!res.headersSent) {
            res.status(500).json({ message: "Server error" });
        }
    }
};

const applyLateFee = async (req, res) => {
    try {
        if (req.user.role !== "owner") {
            return res.status(403).json({ message: "Owner access only" });
        }

        const { agreementId, period, amount, note } = req.body || {};
        if (!agreementId || !period || amount === undefined) {
            return res.status(400).json({ message: "agreementId, period, and amount are required" });
        }
        if (!mongoose.Types.ObjectId.isValid(agreementId)) {
            return res.status(400).json({ message: "Invalid agreementId" });
        }
        if (!isValidPeriod(period)) {
            return res.status(400).json({ message: "period must be YYYY-MM" });
        }

        const agreement = await Agreement.findById(agreementId);
        if (!agreement) return res.status(404).json({ message: "Agreement not found" });
        if (String(agreement.owner) !== String(req.user._id)) {
            return res.status(403).json({ message: "Not your agreement" });
        }

        const due = await getPeriodDue(agreement, period);
        if (due.rentPaid) {
            return res.status(400).json({ message: "Rent already paid for this period" });
        }

        const amt = Number(amount);
        if (!Number.isFinite(amt) || amt <= 0) {
            return res.status(400).json({ message: "amount must be a positive number" });
        }

        const charge = await LateCharge.findOneAndUpdate(
            { agreement: agreementId, period },
            {
                agreement: agreement._id,
                room: agreement.room,
                owner: agreement.owner,
                tenant: agreement.tenant,
                period,
                amount: amt,
                note: note || "",
                appliedBy: req.user._id,
            },
            { upsert: true, new: true, setDefaultsOnInsert: true }
        );

        notifyUser({
            userId: agreement.tenant,
            title: "Late fee applied",
            message: `A late fee of NPR ${amt.toFixed(2)} was added for ${period}`,
            type: "payment",
            data: { agreementId: agreement._id, period, url: "/tenant/payments" },
        });

        res.json({ message: "Late fee applied", charge });
    } catch (err) {
        if (err.code === 11000) {
            return res.status(409).json({ message: "Late fee already applied for this period" });
        }
        console.log("Apply late fee error:", err.message);
        res.status(500).json({ message: "Server error" });
    }
};

const removeLateFee = async (req, res) => {
    try {
        if (req.user.role !== "owner") {
            return res.status(403).json({ message: "Owner access only" });
        }

        const { agreementId, period } = req.body || {};
        if (!agreementId || !period) {
            return res.status(400).json({ message: "agreementId and period are required" });
        }
        if (!mongoose.Types.ObjectId.isValid(agreementId)) {
            return res.status(400).json({ message: "Invalid agreementId" });
        }
        if (!isValidPeriod(period)) {
            return res.status(400).json({ message: "period must be YYYY-MM" });
        }

        const agreement = await Agreement.findById(agreementId);
        if (!agreement) return res.status(404).json({ message: "Agreement not found" });
        if (String(agreement.owner) !== String(req.user._id)) {
            return res.status(403).json({ message: "Not your agreement" });
        }

        const result = await LateCharge.findOneAndDelete({ agreement: agreementId, period });
        if (!result) {
            return res.status(404).json({ message: "No late fee for this period" });
        }

        notifyUser({
            userId: agreement.tenant,
            title: "Late fee removed",
            message: `Late fee was removed for ${period}`,
            type: "payment",
            data: { agreementId: agreement._id, period, url: "/tenant/payments" },
        });

        res.json({ message: "Late fee removed" });
    } catch (err) {
        console.log("Remove late fee error:", err.message);
        res.status(500).json({ message: "Server error" });
    }
};

export { createPayment, updatePaymentStatus, myPayments, incomingPayments, dueStatus, paymentTimeline, generatePaymentBill, applyLateFee, removeLateFee };
