import mongoose from "mongoose";
import PDFDocument from "pdfkit";
import Payment from "../models/payment.js";
import Agreement from "../models/Agreement.js";
import ElectricityBill from "../models/ElectricityBill.js";
import LateCharge from "../models/LateCharge.js";
import { getPeriodDue, isValidPeriod } from "../utils/paymentDue.js";
import { notifyUser } from "../services/notify.service.js";
import { drawStamp } from "../utils/pdfStamp.js";

// TENANT: create payment record for a period (pending)
const createPayment = async (req, res) => {
    try {
        if (req.user.role !== "tenant") {
            return res.status(403).json({ message: "Tenant access only" });
        }

        const { agreementId, period, amount, method, note, cardName, cardExpiry } = req.body || {};
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
        if (agreement.status !== "active") {
            return res.status(400).json({ message: "Agreement is not active" });
        }
        if (!agreement.ownerSignatureUrl || !agreement.tenantSignatureUrl) {
            return res.status(400).json({ message: "Both parties must sign the agreement before making payments" });
        }

        const due = await getPeriodDue(agreement, period);

        if (due.rentPending) {
            return res.status(409).json({ message: "Rent payment is already pending for this period" });
        }

        if (due.rentPaid && !due.bill) {
            return res.status(400).json({ message: "Rent already paid and no electricity bill for this period" });
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

        const expectedTotal = due.totalAmount;
        if (expectedTotal <= 0) {
            return res.status(400).json({ message: "Nothing due for this period" });
        }

        if (amountNum !== null && Math.abs(amountNum - expectedTotal) > 1) {
            return res.status(400).json({
                message: `amount should be ${expectedTotal} for this period`,
            });
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
            electricityAmount: due.dueElectricity,
            electricityBill: due.bill?._id || null,
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
            .populate("agreement", "monthlyRent status")
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
            .populate("agreement", "monthlyRent status")
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
        const month = Number(monthStr);
        const reminderDate = new Date(year, month, 1);
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
        const doc = new PDFDocument({ size: "A4", margin: 40 });
        const filename = `rent-bill-${payment.period}.pdf`;
        res.setHeader("Content-Type", "application/pdf");
        res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
        doc.pipe(res);

        doc.fontSize(18).font("Helvetica-Bold").text("AafnoGhar Rent / Electricity Bill", { align: "center" });
        doc.moveDown(0.5);
        doc.fontSize(11).font("Helvetica").text(`Payment ID: ${payment._id}`);
        doc.text(`Period: ${payment.period}`);
        doc.text(`Bill generated: ${new Date().toLocaleString()}`);
        doc.moveDown();

        doc.fontSize(12).font("Helvetica-Bold").text("Tenant");
        doc.fontSize(10).font("Helvetica").text(`${payment.tenant.fullName} • ${payment.tenant.email || ""} • ${payment.tenant.phone || ""}`);
        doc.moveDown(0.3);
        doc.fontSize(12).font("Helvetica-Bold").text("Owner");
        doc.fontSize(10).font("Helvetica").text(`${payment.owner.fullName} • ${payment.owner.email || ""} • ${payment.owner.phone || ""}`);
        doc.moveDown(0.3);
        doc.fontSize(12).font("Helvetica-Bold").text("Property");
        doc.fontSize(10).font("Helvetica").text(`Room ID: ${payment.room._id}`);
        doc.text(`${payment.room.title} • ${payment.room.location}`);
        doc.text(`Monthly Rent: NPR ${payment.room.monthlyRent || payment.rentAmount}`);
        doc.moveDown();

        doc.fontSize(12).font("Helvetica-Bold").text("Breakdown");
        doc.fontSize(10).font("Helvetica").text(`Rent: NPR ${payment.rentAmount.toFixed(2)}`);
        if (payment.electricityAmount > 0 || electricityBill) {
            const units = electricityBill?.unitsUsed ?? 0;
            const rate = electricityBill?.unitRate ?? 0;
            doc.text(`Electricity (${units} units @ NPR ${rate}): NPR ${payment.electricityAmount.toFixed(2)}`);
        }
        doc.moveDown(0.2);
        doc.fontSize(12).font("Helvetica-Bold").text(`Total paid: NPR ${payment.amount.toFixed(2)}`);
        doc.fontSize(10).font("Helvetica").text(`Payment method: ${payment.method}`);
        if (payment.note) {
            doc.text(`Note: ${payment.note}`);
        }
        if (electricityBill?.note) {
            doc.text(`Electricity note: ${electricityBill.note}`);
        }
        doc.moveDown();
        doc.text(`Paid at: ${payment.paidAt ? new Date(payment.paidAt).toLocaleString() : "-"}`);

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

export { createPayment, updatePaymentStatus, myPayments, incomingPayments, dueStatus, generatePaymentBill, applyLateFee };
