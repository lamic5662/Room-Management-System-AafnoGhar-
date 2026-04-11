import mongoose from "mongoose";

const userSchema = new mongoose.Schema(
    {
        fullName: { type: String, required: true, trim: true },
        email: { type: String, required: true, unique: true, lowercase: true, trim: true },
        phone: { type: String, required: true, unique: true, trim: true },

        // owner / tenant / admin / moderator / super_admin
        role: { type: String, enum: ["owner", "tenant", "admin", "moderator", "super_admin"], required: true },

        kyc: {
            status: {
                type: String,
                enum: ["not_submitted", "pending", "approved", "rejected"],
                default: "not_submitted",
            },
            checks: {
                docClear: { type: Boolean, default: false },
                nameMatch: { type: Boolean, default: false },
                dobMatch: { type: Boolean, default: false },
                faceMatch: { type: Boolean, default: false },
                notReused: { type: Boolean, default: false },
            },
            docType: {
                type: String,
                enum: ["citizenship", "house_paper", "college_id", "job_id", "other"],
                default: "citizenship",
            },
            fields: { type: mongoose.Schema.Types.Mixed, default: {} },
            docFrontUrl: { type: String, default: "" },
            docBackUrl: { type: String, default: "" },
            selfieUrl: { type: String, default: "" }, // optional
            adminNote: { type: String, default: "" },
            checkedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
            checkedAt: { type: Date },
            submittedAt: { type: Date },
            resubmitted: { type: Boolean, default: false },
            history: [
                {
                    action: { type: String, enum: ["submitted", "updated"], required: true },
                    actor: {
                        id: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
                        role: { type: String, enum: ["owner", "tenant", "admin", "moderator", "super_admin"] },
                        name: { type: String, trim: true },
                    },
                    docType: {
                        type: String,
                        enum: ["citizenship", "house_paper", "college_id", "job_id", "other"],
                    },
                    fields: { type: mongoose.Schema.Types.Mixed, default: {} },
                    attachments: {
                        front: { type: Boolean, default: false },
                        back: { type: Boolean, default: false },
                        selfie: { type: Boolean, default: false },
                    },
                    createdAt: { type: Date, default: Date.now },
                },
            ],
        },

        password: { type: String, required: true, minlength: 6 },
        avatarUrl: { type: String, default: "" },
        resetPasswordToken: { type: String, default: "" },
        resetPasswordExpires: { type: Date },
        responseStats: {
            count: { type: Number, default: 0 },
            avgMinutes: { type: Number, default: 0 },
            lastResponseAt: { type: Date, default: null },
            fastResponder: { type: Boolean, default: false },
        },
    },
    { timestamps: true }
);

export default mongoose.model("User", userSchema);
