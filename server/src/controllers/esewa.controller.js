import axios from "axios";
import Payment from "../models/payment.js";
import Agreement from "../models/Agreement.js";
import { generateEsewaSignature } from "../utils/esewaSignature.js";
import { getPeriodDue } from "../utils/paymentDue.js";
import { notifyUser } from "../services/notify.service.js";

function decodeEsewaData(base64) {
  const json = Buffer.from(base64, "base64").toString("utf8");
  return JSON.parse(json);
}

const initEsewaPayment = async (req, res) => {
  try {
    if (req.user.role !== "tenant") {
      return res.status(403).json({ message: "Tenant access only" });
    }

    const { agreementId, amount, period } = req.body || {};
    if (!agreementId || !period) {
      return res.status(400).json({ message: "agreementId and period are required" });
    }

    const agreement = await Agreement.findById(agreementId);
    if (!agreement) return res.status(404).json({ message: "Agreement not found" });

    if (String(agreement.tenant) !== String(req.user._id)) {
      return res.status(403).json({ message: "Not your agreement" });
    }
    if (agreement.status !== "active") {
      return res.status(400).json({ message: "Agreement is not active" });
    }

    const product_code = process.env.ESEWA_PRODUCT_CODE;
    const secret = process.env.ESEWA_SECRET_KEY;
    if (!product_code || !secret) {
      return res.status(500).json({ message: "eSewa config missing" });
    }

    const transaction_uuid = `${Date.now()}-${agreementId.slice(-6)}`;

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

    if (amount !== undefined) {
      const amountNum = Number(amount);
      if (!Number.isFinite(amountNum) || amountNum <= 0) {
        return res.status(400).json({ message: "amount must be a valid number" });
      }
      if (Math.abs(amountNum - expectedTotal) > 1) {
        return res.status(400).json({ message: `amount should be ${expectedTotal} for this period` });
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
      electricityAmount: due.dueElectricity,
      electricityBill: due.bill?._id || null,
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

    let statusData = { status: "COMPLETE", ref_id: "SKIP" };
    if (process.env.ESEWA_SKIP_STATUS !== "1") {
      const statusResp = await axios.get(statusUrl);
      statusData = statusResp.data || {};
    }

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

    return res.json({ message: "eSewa payment verified", payment: updated });
  } catch (e) {
    console.error("verifyEsewaPayment error:", e?.response?.data || e);
    res.status(500).json({ message: "Server error" });
  }
};

export { initEsewaPayment, esewaSuccess, esewaFailure, verifyEsewaPayment };
