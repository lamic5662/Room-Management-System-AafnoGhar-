import mongoose from "mongoose";

const featureFlagSchema = new mongoose.Schema(
  {
    key: { type: String, required: true, unique: true },
    description: { type: String, default: "" },
    enabled: { type: Boolean, default: false },
  },
  { timestamps: true }
);

export default mongoose.model("FeatureFlag", featureFlagSchema);
