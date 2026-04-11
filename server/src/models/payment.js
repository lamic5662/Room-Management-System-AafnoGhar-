import mongoose from "mongoose";

const paymentSchema = new mongoose.Schema(
    {
        agreement: { type: mongoose.Schema.Types.ObjectId, ref: "Agreement", required: true },
        room: { type: mongoose.Schema.Types.ObjectId, ref: "Room", required: true },

        owner: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
        tenant: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },

        // which month this rent is for (YYYY-MM)
        period: { type: String, required: true }, // e.g. "2026-01"

        amount: { type: Number, required: true, min: 0 }, // total paid (rent + electricity)
        rentAmount: { type: Number, default: 0, min: 0 },
        exitAmount: { type: Number, default: 0, min: 0 },
        carryCreditApplied: { type: Number, default: 0, min: 0 },
        electricityAmount: { type: Number, default: 0, min: 0 },
        electricityBill: { type: mongoose.Schema.Types.ObjectId, ref: "ElectricityBill", default: null },
        exitRequest: { type: mongoose.Schema.Types.ObjectId, ref: "ExitRequest", default: null },

        method: {
            type: String,
            enum: ["cash", "bank", "esewa", "khalti", "other"],
            default: "cash",
        },

        note: { type: String, trim: true, default: "" },

        // Safe metadata for bank transfer (no card number or CVV stored)
        cardName: { type: String, trim: true, default: "" },
        cardExpiry: { type: String, trim: true, default: "" }, // "MM/YY"

        // eSewa metadata
        esewa: {
            product_code: { type: String, default: "" },
            transaction_uuid: { type: String, default: "" },
            transaction_code: { type: String, default: "" },
            ref_id: { type: String, default: "" },
            status: { type: String, default: "" },
            total_amount: { type: String, default: "" },
        },

        // Khalti metadata
        khalti: {
            pidx: { type: String, default: "" },
            payment_url: { type: String, default: "" },
            status: { type: String, default: "" },
            transaction_id: { type: String, default: "" },
            total_amount: { type: Number, default: 0 }, // paisa
            purchase_order_id: { type: String, default: "" },
            purchase_order_name: { type: String, default: "" },
        },

        status: {
            type: String,
            enum: ["pending", "confirmed", "rejected"],
            default: "pending",
        },

        paidAt: { type: Date, default: null },
        generatedCarryCredit: { type: Number, default: 0, min: 0 },
        generatedCarryCreditPeriod: { type: String, default: "" },
    },
    { timestamps: true }
);

// One rent payment per agreement+period (rentAmount > 0)
paymentSchema.index(
    { agreement: 1, period: 1 },
    { unique: true, partialFilterExpression: { rentAmount: { $gt: 0 } } }
);
// One electricity payment per bill (if bill exists)
paymentSchema.index(
    { electricityBill: 1 },
    { unique: true, sparse: true }
);

export default mongoose.model("Payment", paymentSchema);
