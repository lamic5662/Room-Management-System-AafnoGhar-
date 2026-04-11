import axios from "axios";
import mongoose from "mongoose";
import Payment from "../models/payment.js";
import Agreement from "../models/Agreement.js";
import Room from "../models/Room.js";
import ElectricityBill from "../models/ElectricityBill.js";
import ExitRequest from "../models/ExitRequest.js";
import { getExitUnpaid, getPeriodDue } from "../utils/paymentDue.js";
import { ensureActiveAgreementOrApprovedExit } from "../utils/exitPaymentGuard.js";
import { notifyUser } from "../services/notify.service.js";
import { sendExitReviewReminder } from "../utils/reviewReminder.js";
import { parseElectricityInput, createElectricityBillFromUnits } from "../utils/electricityInput.js";

const khaltiClient = axios.create({
  baseURL: process.env.KHALTI_BASE_URL,
  headers: {
    Authorization: `Key ${process.env.KHALTI_SECRET_KEY}`,
    "Content-Type": "application/json",
  },
});

const initKhaltiPayment = async (req, res) => {
  try {
    if (req.user.role !== "tenant") return res.status(403).json({ message: "Tenant access only" });

    const { agreementId, amountNpr, period, exitId } = req.body || {};
    if (!agreementId || !period) {
      return res.status(400).json({ message: "agreementId and period are required" });
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
        exitId,
      });
    } catch (err) {
      return res.status(400).json({ message: err.message });
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
      if (amountNpr !== undefined) {
        const amountNprNum = Number(amountNpr);
        if (!Number.isFinite(amountNprNum) || amountNprNum <= 0) {
          return res.status(400).json({ message: "Invalid amountNpr" });
        }
        if (Math.abs(amountNprNum - expectedTotal) > 1) {
          return res.status(400).json({ message: `amountNpr should be ${expectedTotal} for this exit` });
        }
      }

      const amount = Math.round(expectedTotal * 100);
      if (!Number.isFinite(amount) || amount <= 0) {
        return res.status(400).json({ message: "Invalid amount" });
      }

      const purchase_order_id = `AG-${agreementId.slice(-6)}-${Date.now()}`;
      const purchase_order_name = `Exit ${period}`;

      const pay = await Payment.create({
        agreement: agreementId,
        room: agreement.room,
        owner: agreement.owner,
        tenant: agreement.tenant,
        period,
        amount: expectedTotal,
        rentAmount: 0,
        exitAmount: expectedTotal,
        electricityAmount: exitElec,
        electricityBill: due.electricityBill?._id || null,
        exitRequest: exitReq._id,
        method: "khalti",
        status: "pending",
        khalti: {
          purchase_order_id,
          purchase_order_name,
          total_amount: amount,
        },
      });

      notifyUser({
        userId: agreement.owner,
        title: "Payment submitted",
        message: `Tenant submitted exit payment for ${period}`,
        type: "payment",
        data: { paymentId: pay._id, agreementId: agreement._id, url: "/owner/payments" },
      });

      const return_url = `${process.env.API_URL}/api/khalti/return?paymentId=${pay._id}`;
      const website_url = process.env.APP_URL;

      const initiatePayload = {
        return_url,
        website_url,
        amount,
        purchase_order_id,
        purchase_order_name,
        customer_info: {
          name: req.user.fullName || "Tenant",
          email: req.user.email || "tenant@example.com",
          phone: req.user.phone || "9800000000",
        },
      };

      const { data } = await khaltiClient.post("/epayment/initiate/", initiatePayload);

      await Payment.findByIdAndUpdate(pay._id, {
        "khalti.pidx": data.pidx,
        "khalti.payment_url": data.payment_url,
        "khalti.status": data.status || "Initiated",
      });

      return res.json({
        paymentId: pay._id,
        pidx: data.pidx,
        payment_url: data.payment_url,
        expires_in: data.expires_in,
      });
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

    if (amountNpr !== undefined) {
      const amountNprNum = Number(amountNpr);
      if (!Number.isFinite(amountNprNum) || amountNprNum <= 0) {
        return res.status(400).json({ message: "Invalid amountNpr" });
      }
      if (Math.abs(amountNprNum - expectedTotal) > 1) {
        return res.status(400).json({ message: `amountNpr should be ${expectedTotal} for this period` });
      }
    }

    const amount = Math.round(expectedTotal * 100);
    if (!Number.isFinite(amount) || amount <= 0) {
      return res.status(400).json({ message: "Invalid amount" });
    }

    const purchase_order_id = `AG-${agreementId.slice(-6)}-${Date.now()}`;
    const purchase_order_name = `Rent ${period}`;

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

    const pay = await Payment.create({
      agreement: agreementId,
      room: agreement.room,
      owner: agreement.owner,
      tenant: agreement.tenant,
      period,
      amount: expectedTotal,
      rentAmount: due.dueRent,
      electricityAmount,
      electricityBill: electricityBillId,
      exitRequest: mongoose.Types.ObjectId.isValid(exitId) ? exitId : null,
      method: "khalti",
      status: "pending",
      khalti: {
        purchase_order_id,
        purchase_order_name,
        total_amount: amount,
      },
    });

    notifyUser({
      userId: agreement.owner,
      title: "Payment submitted",
      message: `Tenant submitted Khalti payment for ${period}`,
      type: "payment",
      data: { paymentId: pay._id, agreementId: agreement._id, url: "/owner/payments" },
    });

    const return_url = `${process.env.API_URL}/api/khalti/return?paymentId=${pay._id}`;
    const website_url = process.env.APP_URL;

    const initiatePayload = {
      return_url,
      website_url,
      amount,
      purchase_order_id,
      purchase_order_name,
      customer_info: {
        name: req.user.fullName || "Tenant",
        email: req.user.email || "tenant@example.com",
        phone: req.user.phone || "9800000000",
      },
    };

    const { data } = await khaltiClient.post("/epayment/initiate/", initiatePayload);

    await Payment.findByIdAndUpdate(pay._id, {
      "khalti.pidx": data.pidx,
      "khalti.payment_url": data.payment_url,
      "khalti.status": data.status || "Initiated",
    });

    return res.json({
      paymentId: pay._id,
      pidx: data.pidx,
      payment_url: data.payment_url,
      expires_in: data.expires_in,
    });
  } catch (e) {
    console.error("initKhaltiPayment error:", e?.response?.data || e.message);
    res.status(500).json({ message: "Server error" });
  }
};

const khaltiReturn = async (req, res) => {
  const qs = new URLSearchParams(req.query).toString();
  return res.redirect(`${process.env.APP_URL}/payment/khalti/return?${qs}`);
};

const khaltiLookupAndVerify = async (req, res) => {
  try {
    if (req.user.role !== "tenant") return res.status(403).json({ message: "Tenant access only" });

    const { paymentId, pidx } = req.body || {};
    if (!paymentId || !pidx) return res.status(400).json({ message: "paymentId and pidx are required" });

    const payment = await Payment.findById(paymentId);
    if (!payment) return res.status(404).json({ message: "Payment not found" });
    if (String(payment.tenant) !== String(req.user._id)) {
      return res.status(403).json({ message: "Not your payment" });
    }

    const { data } = await khaltiClient.post("/epayment/lookup/", { pidx });

    await Payment.findByIdAndUpdate(paymentId, {
      "khalti.status": data.status,
      "khalti.transaction_id": data.transaction_id || "",
      "khalti.total_amount": data.total_amount || 0,
      "khalti.pidx": data.pidx,
    });

    if (data.status !== "Completed") {
      return res.status(400).json({ message: "Payment not completed", status: data.status, khalti: data });
    }

    const updated = await Payment.findByIdAndUpdate(
      paymentId,
      { status: "confirmed", paidAt: new Date() },
      { new: true }
    );

    if (updated?.electricityBill) {
      await ElectricityBill.findByIdAndUpdate(updated.electricityBill, { status: "paid" });
    }
    if (updated?.exitRequest) {
      const exitReq = await ExitRequest.findById(updated.exitRequest);
      if (exitReq) {
        exitReq.settlementPaid = true;
        exitReq.settlementPaidAt = new Date();
        exitReq.settlementPayment = updated._id;
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

    return res.json({ message: "Khalti payment verified", payment: updated, khalti: data });
  } catch (e) {
    console.error("khaltiLookupAndVerify error:", e?.response?.data || e.message);
    res.status(500).json({ message: "Server error" });
  }
};

export { initKhaltiPayment, khaltiReturn, khaltiLookupAndVerify };
