import mongoose from "mongoose";

const agreementSchema = new mongoose.Schema(
    {
        room: { type: mongoose.Schema.Types.ObjectId, ref: "Room", required: true },
        request: { type: mongoose.Schema.Types.ObjectId, ref: "Request", default: null },

        owner: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
        tenant: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },

        monthlyRent: { type: Number, required: true, min: 0 },
        securityDeposit: { type: Number, required: true, min: 0 },

        startDate: { type: Date, required: true },
        endDate: { type: Date, required: true },

        status: { type: String, enum: ["active", "ended"], default: "active" },

        // later: digital signatures
        ownerSignatureUrl: { type: String, default: "" },
        tenantSignatureUrl: { type: String, default: "" },
        rentReminderPeriod: { type: String, default: "" },
        carryOverCredit: { type: Number, default: 0 },
        carryOverCreditPeriod: { type: String, default: "" },
        firstMonthProrated: { type: Boolean, default: false },
    },
    { timestamps: true }
);

export default mongoose.model("Agreement", agreementSchema);
