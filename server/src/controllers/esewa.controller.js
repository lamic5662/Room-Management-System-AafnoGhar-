import axios from "axios";
import mongoose from "mongoose";
import Payment from "../models/payment.js";
import Agreement from "../models/Agreement.js";
import Room from "../models/Room.js";
import ElectricityBill from "../models/ElectricityBill.js";
import ExitRequest from "../models/ExitRequest.js";
import { generateEsewaSignature } from "../utils/esewaSignature.js";
import { getExitUnpaid, getPeriodDue } from "../utils/paymentDue.js";
import { ensureActiveAgreementOrApprovedExit } from "../utils/exitPaymentGuard.js";
import { notifyUser } from "../services/notify.service.js";
import { sendExitReviewReminder } from "../utils/reviewReminder.js";
import { parseElectricityInput, createElectricityBillFromUnits } from "../utils/electricityInput.js";

function decodeEsewaData(base64) {
  const json = Buffer.from(base64, "base64").toString("utf8");
  return JSON.parse(json);
}

const initEsewaPayment = async (req, res) => {
  try {
    if (req.user.role !== "tenant") {
      return res.status(403).json({ message: "Tenant access only" });
    }

    const { agreementId, amount, period, exitId } = req.body || {};
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

    const product_code = process.env.ESEWA_PRODUCT_CODE;
    const secret = process.env.ESEWA_SECRET_KEY;
    if (!product_code || !secret) {
      return res.status(500).json({ message: "eSewa config missing" });
    }

    const transaction_uuid = `${Date.now()}-${agreementId.slice(-6)}`;

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
      if (amount !== undefined) {
        const amountNum = Number(amount);
        if (!Number.isFinite(amountNum) || amountNum <= 0) {
          return res.status(400).json({ message: "amount must be a valid number" });
        }
        if (Math.abs(amountNum - expectedTotal) > 1) {
          return res.status(400).json({ message: `amount should be ${expectedTotal} for this exit` });
        }
      }

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
        method: "esewa",
        status: "pending",
        esewa: {
          product_code,
          transaction_uuid,
        },
      });

      notifyUser({
        userId: agreement.owner,
        title: "Payment submitted",
        message: `Tenant submitted exit payment for ${period}`,
        type: "payment",
        data: { paymentId: pay._id, agreementId: agreement._id, url: "/owner/payments" },
      });

      const payload = {
        amount: String(expectedTotal),
        tax_amount: "0",
        total_amount: String(expectedTotal),
        transaction_uuid,
        product_code,
        product_service_charge: "0",
        product_delivery_charge: "0",
        success_url: `${process.env.API_URL}/api/esewa/success?paymentId=${pay._id}`,
        failure_url: `${process.env.API_URL}/api/esewa/failure?paymentId=${pay._id}`,
      };

      const signed_field_names = "total_amount,transaction_uuid,product_code";
      const signature = generateEsewaSignature(payload, signed_field_names, secret);

      return res.json({
        epayUrl: process.env.ESEWA_EPAY_URL,
        form: {
          ...payload,
          signed_field_names,
          signature,
        },
        paymentId: pay._id,
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

    if (amount !== undefined) {
      const amountNum = Number(amount);
      if (!Number.isFinite(amountNum) || amountNum <= 0) {
        return res.status(400).json({ message: "amount must be a valid number" });
      }
      if (Math.abs(amountNum - expectedTotal) > 1) {
        return res.status(400).json({ message: `amount should be ${expectedTotal} for this period` });
      }
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
      method: "esewa",
      status: "pending",
      esewa: {
        product_code,
        transaction_uuid,
      },
    });

    notifyUser({
      userId: agreement.owner,
      title: "Payment submitted",
      message: `Tenant submitted eSewa payment for ${period}`,
      type: "payment",
      data: { paymentId: pay._id, agreementId: agreement._id, url: "/owner/payments" },
    });

    const payload = {
      amount: String(expectedTotal),
      tax_amount: "0",
      total_amount: String(expectedTotal),
      transaction_uuid,
      product_code,
      product_service_charge: "0",
      product_delivery_charge: "0",
      success_url: `${process.env.API_URL}/api/esewa/success?paymentId=${pay._id}`,
      failure_url: `${process.env.API_URL}/api/esewa/failure?paymentId=${pay._id}`,
    };

    const signed_field_names = "total_amount,transaction_uuid,product_code";
    const signature = generateEsewaSignature(payload, signed_field_names, secret);

    return res.json({
      epayUrl: process.env.ESEWA_EPAY_URL,
      form: {
        ...payload,
        signed_field_names,
        signature,
      },
      paymentId: pay._id,
    });
  } catch (e) {
    console.error("initEsewaPayment error:", e);
    res.status(500).json({ message: "Server error" });
  }
};

const esewaSuccess = async (req, res) => {
  const { data, paymentId } = req.query;
  return res.redirect(
    `${process.env.APP_URL}/payment/esewa/success?paymentId=${paymentId}&data=${encodeURIComponent(data || "")}`
  );
};

const esewaFailure = async (req, res) => {
  const { paymentId } = req.query;
  return res.redirect(`${process.env.APP_URL}/payment/esewa/failure?paymentId=${paymentId}`);
};

const verifyEsewaPayment = async (req, res) => {
  try {
    if (req.user.role !== "tenant") {
      return res.status(403).json({ message: "Tenant access only" });
    }

    const { paymentId, data } = req.body || {};
    if (!paymentId || !data) return res.status(400).json({ message: "paymentId and data are required" });

    const payment = await Payment.findById(paymentId);
    if (!payment) return res.status(404).json({ message: "Payment not found" });

    if (String(payment.tenant) !== String(req.user._id)) {
      return res.status(403).json({ message: "Not your payment" });
    }

    const decoded = decodeEsewaData(data);

    const secret = process.env.ESEWA_SECRET_KEY;
    const signedFields = decoded.signed_field_names;
    const expectedSig = generateEsewaSignature(decoded, signedFields, secret);

    if (expectedSig !== decoded.signature) {
      return res.status(400).json({ message: "Invalid signature from eSewa" });
    }

    const statusUrl = `${process.env.ESEWA_STATUS_URL}?product_code=${encodeURIComponent(decoded.product_code)}&total_amount=${encodeURIComponent(decoded.total_amount)}&transaction_uuid=${encodeURIComponent(decoded.transaction_uuid)}`;

    if (!process.env.ESEWA_STATUS_URL) {
      return res.status(500).json({ message: "eSewa status URL missing" });
    }
    const statusResp = await axios.get(statusUrl);
    const statusData = statusResp.data || {};

    if (statusData.status !== "COMPLETE") {
      await Payment.findByIdAndUpdate(paymentId, {
        status: "rejected",
        "esewa.status": statusData.status || "FAILED",
        "esewa.ref_id": statusData.ref_id || "",
      });

      return res.status(400).json({ message: "Payment not complete", status: statusData.status });
    }

    const updated = await Payment.findByIdAndUpdate(
      paymentId,
      {
        status: "confirmed",
        paidAt: new Date(),
        "esewa.status": statusData.status,
        "esewa.ref_id": statusData.ref_id || "",
        "esewa.transaction_code": decoded.transaction_code || "",
        "esewa.transaction_uuid": decoded.transaction_uuid || "",
        "esewa.product_code": decoded.product_code || "",
        "esewa.total_amount": decoded.total_amount || "",
      },
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

    return res.json({ message: "eSewa payment verified", payment: updated });
  } catch (e) {
    console.error("verifyEsewaPayment error:", e?.response?.data || e);
    res.status(500).json({ message: "Server error" });
  }
};

export { initEsewaPayment, esewaSuccess, esewaFailure, verifyEsewaPayment };
