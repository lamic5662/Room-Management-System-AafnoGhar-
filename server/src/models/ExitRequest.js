import mongoose from "mongoose";

const exitRequestSchema = new mongoose.Schema(
  {
    agreement: { type: mongoose.Schema.Types.ObjectId, ref: "Agreement", required: true },
    room: { type: mongoose.Schema.Types.ObjectId, ref: "Room", required: true },

    tenant: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    owner: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },

    moveOutDate: { type: Date, required: true },
    reason: { type: String, default: "", trim: true },

    status: {
      type: String,
      enum: ["requested", "approved", "rejected", "settled"],
      default: "requested",
    },

    securityDeposit: { type: Number, default: 0 },
    unpaidRent: { type: Number, default: 0 },
    damagesCost: { type: Number, default: 0 },
    otherDeductions: { type: Number, default: 0 },
    ownerNote: { type: String, default: "", trim: true },

    refundableAmount: { type: Number, default: 0 },
    settlementAt: { type: Date },
  },
  { timestamps: true }
);

exitRequestSchema.index({ agreement: 1, status: 1 });

export default mongoose.model("ExitRequest", exitRequestSchema);
