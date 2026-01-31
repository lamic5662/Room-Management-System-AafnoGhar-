import mongoose from "mongoose";

const complaintSchema = new mongoose.Schema(
    {
        agreement: { type: mongoose.Schema.Types.ObjectId, ref: "Agreement", required: true },
        room: { type: mongoose.Schema.Types.ObjectId, ref: "Room", required: true },

        owner: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
        tenant: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },

        title: { type: String, required: true, trim: true },
        description: { type: String, required: true, trim: true },

        status: {
            type: String,
            enum: ["open", "in_progress", "resolved", "rejected"],
            default: "open",
        },

        ownerReply: { type: String, trim: true, default: "" },
    },
    { timestamps: true }
);

export default mongoose.model("Complaint", complaintSchema);
