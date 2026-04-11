import mongoose from "mongoose";

const agreementMessageSchema = new mongoose.Schema(
    {
        agreement: { type: mongoose.Schema.Types.ObjectId, ref: "Agreement", required: true },
        room: { type: mongoose.Schema.Types.ObjectId, ref: "Room", required: true },
        owner: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
        tenant: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },

        sender: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
        senderRole: { type: String, enum: ["owner", "tenant"], required: true },

        text: { type: String, required: true, trim: true, maxlength: 1000 },
        readBy: { type: [mongoose.Schema.Types.ObjectId], ref: "User", default: [] },
        deletedFor: { type: [mongoose.Schema.Types.ObjectId], ref: "User", default: [] },
        reactions: {
            type: [
                {
                    emoji: { type: String, trim: true },
                    users: { type: [mongoose.Schema.Types.ObjectId], ref: "User", default: [] },
                },
            ],
            default: [],
        },
    },
    { timestamps: true }
);

agreementMessageSchema.index({ agreement: 1, createdAt: -1 });

export default mongoose.model("AgreementMessage", agreementMessageSchema);
