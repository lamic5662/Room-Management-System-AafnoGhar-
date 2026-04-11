import mongoose from "mongoose";

const visitSchema = new mongoose.Schema(
  {
    room: { type: mongoose.Schema.Types.ObjectId, ref: "Room", required: true },
    tenant: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    owner: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    scheduledAt: { type: Date, required: true },
    note: { type: String, trim: true, default: "" },
    status: {
      type: String,
      enum: ["pending", "approved", "rejected", "cancelled"],
      default: "pending",
    },
    rescheduleProposedAt: { type: Date, default: null },
    rescheduleNote: { type: String, trim: true, default: "" },
    rescheduleRequestedAt: { type: Date, default: null },
    rescheduleStatus: {
      type: String,
      enum: ["none", "pending", "approved", "rejected"],
      default: "none",
    },
    rescheduleRequestedBy: { type: String, enum: ["tenant", "owner", ""], default: "" },
    reminderSentAt: { type: Date, default: null },
  },
  { timestamps: true }
);

visitSchema.index(
  { room: 1, tenant: 1 },
  {
    unique: true,
    partialFilterExpression: { status: "pending" },
  }
);

visitSchema.index({ owner: 1, scheduledAt: 1 });

export default mongoose.model("Visit", visitSchema);
