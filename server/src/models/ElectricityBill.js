import mongoose from "mongoose";

const electricityBillSchema = new mongoose.Schema(
  {
    agreement: { type: mongoose.Schema.Types.ObjectId, ref: "Agreement", required: true },
    room: { type: mongoose.Schema.Types.ObjectId, ref: "Room", required: true },
    owner: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    tenant: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },

    period: { type: String, required: true }, // YYYY-MM

    previousReading: { type: Number, required: true, min: 0 },
    currentReading: { type: Number, required: true, min: 0 },
    unitsUsed: { type: Number, required: true, min: 0 },
    unitRate: { type: Number, required: true, min: 0 },
    amount: { type: Number, required: true, min: 0 },

    note: { type: String, trim: true, default: "" },

    status: {
      type: String,
      enum: ["pending", "paid", "cancelled"],
      default: "pending",
    },
  },
  { timestamps: true }
);

electricityBillSchema.index({ agreement: 1, period: 1 }, { unique: true });

export default mongoose.model("ElectricityBill", electricityBillSchema);
