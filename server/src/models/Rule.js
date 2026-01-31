import mongoose from "mongoose";

const ruleSchema = new mongoose.Schema(
  {
    owner: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    room: { type: mongoose.Schema.Types.ObjectId, ref: "Room", required: true },

    title: { type: String, required: true, trim: true },
    description: { type: String, default: "", trim: true },

    severity: { type: String, enum: ["normal", "important"], default: "normal" },

    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

export default mongoose.model("Rule", ruleSchema);
