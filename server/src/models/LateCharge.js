import mongoose from "mongoose";

const lateChargeSchema = new mongoose.Schema(
  {
    agreement: { type: mongoose.Schema.Types.ObjectId, ref: "Agreement", required: true },
    room: { type: mongoose.Schema.Types.ObjectId, ref: "Room", required: true },
    owner: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    tenant: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    period: { type: String, required: true }, // YYYY-MM
    amount: { type: Number, required: true, min: 0 },
    note: { type: String, trim: true, default: "" },
    appliedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  },
  { timestamps: true }
);

lateChargeSchema.index({ agreement: 1, period: 1 }, { unique: true });

export default mongoose.model("LateCharge", lateChargeSchema);
