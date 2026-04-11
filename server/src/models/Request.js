import mongoose from "mongoose";

const requestSchema = new mongoose.Schema(
    {
        room: { type: mongoose.Schema.Types.ObjectId, ref: "Room", required: true },

        tenant: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
        owner: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },

        message: { type: String, trim: true, default: "" },

        status: {
            type: String,
            enum: ["pending", "approved", "rejected", "cancelled"],
            default: "pending",
        },
    },
    { timestamps: true }
);

// optional but useful: only 1 pending request per tenant per room
requestSchema.index(
    { room: 1, tenant: 1 },
    {
        unique: true,
        partialFilterExpression: { status: "pending" },
    }
);

export default mongoose.model("Request", requestSchema);
