import mongoose from "mongoose";

const savedSearchSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    name: { type: String, trim: true, default: "" },
    search: { type: String, trim: true, default: "" },
    minRent: { type: Number, default: null },
    maxRent: { type: Number, default: null },
    roomType: { type: String, trim: true, default: "" },
    sort: { type: String, trim: true, default: "" },
    lastMatchedAt: { type: Date, default: null },
    facilities: {
      wifi: { type: Boolean, default: false },
      parking: { type: Boolean, default: false },
      waterSupply: { type: Boolean, default: false },
      electricityBackup: { type: Boolean, default: false },
      kitchen: { type: Boolean, default: false },
      furnished: { type: Boolean, default: false },
    },
  },
  { timestamps: true }
);

savedSearchSchema.index({ user: 1, createdAt: -1 });

export default mongoose.model("SavedSearch", savedSearchSchema);
