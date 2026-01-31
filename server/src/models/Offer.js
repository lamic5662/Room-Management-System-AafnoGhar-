import mongoose from "mongoose";

const offerSchema = new mongoose.Schema(
  {
    room: { type: mongoose.Schema.Types.ObjectId, ref: "Room", required: true },
    tenant: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    owner: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },

    offeredRent: { type: Number, required: true },
    message: { type: String, default: "", trim: true },

    status: {
      type: String,
      enum: ["pending", "accepted", "rejected", "countered"],
      default: "pending",
    },

    acceptedRent: { type: Number, default: 0 },
    agreement: { type: mongoose.Schema.Types.ObjectId, ref: "Agreement", default: null },

    ownerCounterRent: { type: Number, default: 0 },
    ownerReply: { type: String, default: "", trim: true },
  },
  { timestamps: true }
);

export default mongoose.model("Offer", offerSchema);
