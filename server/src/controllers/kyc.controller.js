import User from "../models/User.js";
import Room from "../models/Room.js";
import { evaluateRoomFraud } from "../services/fraud.service.js";
import { notifyUser } from "../services/notify.service.js";
import { logAdminAction } from "../services/auditLog.service.js";

const updateKycStatus = async (userId, status, adminNote = "", checks = {}, adminId = null) => {
    if (!["approved", "rejected"].includes(status)) {
        throw new Error("status must be approved or rejected");
    }

    const user = await User.findById(userId);
    if (!user) {
        const err = new Error("User not found");
        err.status = 404;
        throw err;
    }

    if (user.kyc.status !== "pending") {
        const err = new Error(`KYC is already ${user.kyc.status}`);
        err.status = 400;
        throw err;
    }

    user.kyc.status = status;
    user.kyc.adminNote = adminNote || "";
    if (checks && typeof checks === "object") {
        user.kyc.checks = {
            docClear: !!checks.docClear,
            nameMatch: !!checks.nameMatch,
            dobMatch: !!checks.dobMatch,
            faceMatch: !!checks.faceMatch,
            notReused: !!checks.notReused,
        };
    }
    user.kyc.checkedBy = adminId || user.kyc.checkedBy;
    user.kyc.checkedAt = new Date();
    user.kyc.resubmitted = false;
    await user.save();

    return user;
};

const normalizePath = (p) => {
    if (!p) return "";
    return p.startsWith("/") ? p : `/${p}`;
};

const KYC_HISTORY_LIMIT = 12;

const snapshotFields = (fields) => {
    if (!fields || typeof fields !== "object") return {};
    return JSON.parse(JSON.stringify(fields));
};

const appendKycHistory = (user, action) => {
    user.kyc.history = user.kyc.history || [];
    const entry = {
        action,
        actor: {
            id: user._id,
            role: user.role,
            name: user.fullName,
        },
        docType: user.kyc.docType,
        fields: snapshotFields(user.kyc.fields),
        attachments: {
            front: Boolean(user.kyc.docFrontUrl),
            back: Boolean(user.kyc.docBackUrl),
            selfie: Boolean(user.kyc.selfieUrl),
        },
        createdAt: new Date(),
    };
    user.kyc.history.unshift(entry);
    if (user.kyc.history.length > KYC_HISTORY_LIMIT) {
        user.kyc.history = user.kyc.history.slice(0, KYC_HISTORY_LIMIT);
    }
};

// USER: submit KYC (front/back + optional selfie)
const submitKyc = async (req, res) => {
    try {
        const { docType, fields } = req.body || {};

        if (!docType) return res.status(400).json({ message: "docType is required" });
        if (!["citizenship", "house_paper", "college_id", "job_id", "other"].includes(docType)) {
            return res.status(400).json({ message: "Invalid docType" });
        }

        // multer fields
        const front = req.files?.front?.[0];
        const back = req.files?.back?.[0];
        const selfie = req.files?.selfie?.[0];

        if (!front) return res.status(400).json({ message: "front file is required" });

        const user = await User.findById(req.user._id);
        if (!user) return res.status(404).json({ message: "User not found" });

        user.kyc.docType = docType;
        if (fields) {
            try {
                user.kyc.fields = typeof fields === "string" ? JSON.parse(fields) : fields;
            } catch {
                user.kyc.fields = {};
            }
        }
        user.kyc.docFrontUrl = front ? `/uploads/kyc/${front.filename}` : user.kyc.docFrontUrl;
        user.kyc.docBackUrl = back ? `/uploads/kyc/${back.filename}` : user.kyc.docBackUrl;
        user.kyc.selfieUrl = selfie ? `/uploads/kyc/${selfie.filename}` : user.kyc.selfieUrl;

    user.kyc.status = "pending";
    user.kyc.adminNote = "";
    user.kyc.submittedAt = new Date();
    user.kyc.resubmitted = false;
    appendKycHistory(user, "submitted");

        await user.save();

        // while KYC is pending, keep listings unpublished
        await Room.updateMany({ owner: user._id }, { isPublished: false });

        const admins = await User.find({ role: "admin" }).select("_id");
        admins.forEach((a) => {
            notifyUser({
                userId: a._id,
                title: "New KYC submission",
                message: `${user.fullName || "User"} submitted KYC`,
                type: "kyc",
                data: { userId: user._id, url: "/admin/kyc" },
            });
        });

res.json({
            message: "KYC submitted (pending)",
            kyc: {
                status: user.kyc.status,
                docType: user.kyc.docType,
                fields: user.kyc.fields || {},
                docFrontUrl: normalizePath(user.kyc.docFrontUrl),
                docBackUrl: normalizePath(user.kyc.docBackUrl),
                selfieUrl: normalizePath(user.kyc.selfieUrl),
            },
        });
    } catch (err) {
        console.log("Submit KYC error:", err.message);
        res.status(500).json({ message: "Server error" });
    }
};

// USER: update existing KYC (resubmit docs/fields)
const updateKyc = async (req, res) => {
    try {
        const { docType, fields } = req.body || {};

        if (!docType) return res.status(400).json({ message: "docType is required" });
        if (!["citizenship", "house_paper", "college_id", "job_id", "other"].includes(docType)) {
            return res.status(400).json({ message: "Invalid docType" });
        }

        const front = req.files?.front?.[0];
        const back = req.files?.back?.[0];
        const selfie = req.files?.selfie?.[0];

        const user = await User.findById(req.user._id);
        if (!user) return res.status(404).json({ message: "User not found" });

        if (!front && !user.kyc.docFrontUrl) {
            return res.status(400).json({ message: "front file is required" });
        }

        user.kyc.docType = docType;
        if (fields) {
            try {
                user.kyc.fields = typeof fields === "string" ? JSON.parse(fields) : fields;
            } catch {
                user.kyc.fields = {};
            }
        }
        user.kyc.docFrontUrl = front ? `/uploads/kyc/${front.filename}` : user.kyc.docFrontUrl;
        user.kyc.docBackUrl = back ? `/uploads/kyc/${back.filename}` : user.kyc.docBackUrl;
        user.kyc.selfieUrl = selfie ? `/uploads/kyc/${selfie.filename}` : user.kyc.selfieUrl;

        user.kyc.status = "pending";
        user.kyc.adminNote = "";
        user.kyc.submittedAt = new Date();
        user.kyc.resubmitted = true;
        user.kyc.checkedAt = undefined;
        appendKycHistory(user, "updated");

        await user.save();

        await Room.updateMany({ owner: user._id }, { isPublished: false });

        const admins = await User.find({ role: "admin" }).select("_id");
        admins.forEach((a) => {
            notifyUser({
                userId: a._id,
                title: "KYC resubmitted",
                message: `${user.fullName || "User"} resubmitted their KYC details`,
                type: "kyc",
                data: { userId: user._id, url: "/admin/kyc" },
            });
        });

        res.json({
            message: "KYC resubmitted (pending)",
            kyc: {
                status: user.kyc.status,
                docType: user.kyc.docType,
                fields: user.kyc.fields || {},
                docFrontUrl: normalizePath(user.kyc.docFrontUrl),
                docBackUrl: normalizePath(user.kyc.docBackUrl),
                selfieUrl: normalizePath(user.kyc.selfieUrl),
            },
        });
    } catch (err) {
        console.log("Update KYC error:", err.message);
        res.status(500).json({ message: "Server error" });
    }
};

// USER: view my kyc status
const myKyc = async (req, res) => {
    try {
        const user = await User.findById(req.user._id).select("kyc fullName email phone role");
        if (!user) return res.status(404).json({ message: "User not found" });
        const u = user.toObject();
        if (u.kyc) {
            u.kyc.docFrontUrl = normalizePath(u.kyc.docFrontUrl);
            u.kyc.docBackUrl = normalizePath(u.kyc.docBackUrl);
            u.kyc.selfieUrl = normalizePath(u.kyc.selfieUrl);
        }
        res.json({ user: u });
    } catch (err) {
        console.log("My KYC error:", err.message);
        res.status(500).json({ message: "Server error" });
    }
};

// ADMIN: list pending KYC
const listPending = async (req, res) => {
    try {
        const users = await User.find({ "kyc.status": "pending" })
            .select("fullName email phone role kyc")
            .sort({ "kyc.submittedAt": -1 });

        const normalized = users.map((u) => {
            const obj = u.toObject();
            if (obj.kyc) {
                obj.kyc.docFrontUrl = normalizePath(obj.kyc.docFrontUrl);
                obj.kyc.docBackUrl = normalizePath(obj.kyc.docBackUrl);
        obj.kyc.selfieUrl = normalizePath(obj.kyc.selfieUrl);
        if (Array.isArray(obj.kyc.docs)) {
            obj.kyc.docs = obj.kyc.docs.map((p) => normalizePath(p));
        }
            }
            return obj;
        });

        res.json({ count: normalized.length, users: normalized });
    } catch (err) {
        console.log("List pending KYC error:", err.message);
        res.status(500).json({ message: "Server error" });
    }
};

// ADMIN: list approved KYC
const listApproved = async (req, res) => {
    try {
        const users = await User.find({ "kyc.status": "approved" })
            .select("fullName email phone role kyc")
            .sort({ "kyc.checkedAt": -1 });

        const normalized = users.map((u) => {
            const obj = u.toObject();
            if (obj.kyc) {
                obj.kyc.docFrontUrl = normalizePath(obj.kyc.docFrontUrl);
                obj.kyc.docBackUrl = normalizePath(obj.kyc.docBackUrl);
                obj.kyc.selfieUrl = normalizePath(obj.kyc.selfieUrl);
                if (Array.isArray(obj.kyc.docs)) {
                    obj.kyc.docs = obj.kyc.docs.map((p) => normalizePath(p));
                }
            }
            return obj;
        });

        res.json({ count: normalized.length, users: normalized });
    } catch (err) {
        console.log("List approved KYC error:", err.message);
        res.status(500).json({ message: "Server error" });
    }
};
const kycSummary = async (req, res) => {
    try {
        const pending = await User.countDocuments({ "kyc.status": "pending" });
        const approved = await User.countDocuments({ "kyc.status": "approved" });
        res.json({ pending, approved });
    } catch (err) {
        console.log("KYC summary error:", err.message);
        res.status(500).json({ message: "Server error" });
    }
};

// ADMIN: approve/reject KYC
const reviewKyc = async (req, res) => {
    try {
        const { userId } = req.params;
        const { status, adminNote, checks } = req.body || {};

        const user = await updateKycStatus(userId, status, adminNote, checks, req.user?._id);
        const action = status === "approved" ? "kyc.approve" : "kyc.reject";
        logAdminAction({
            adminId: req.user?._id,
            action,
            entityType: "kyc",
            entityId: user?._id,
            meta: { status, note: adminNote || "" },
            req,
        });
        res.json({ message: `KYC ${status}`, user: { id: user._id, kyc: user.kyc } });
    } catch (err) {
        console.log("Review KYC error:", err.message);
        const statusCode = err.status || (err.message?.includes("status must be approved") ? 400 : 500);
        res.status(statusCode).json({ message: err.message || "Server error" });
    }
};

// ADMIN: approve KYC (shortcut)
const approveKyc = async (req, res) => {
    try {
        const { userId } = req.params;
        const { adminNote, checks } = req.body || {};
        const user = await updateKycStatus(userId, "approved", adminNote, checks, req.user?._id);

        // re-evaluate fraud flags for this owner's rooms after approval
        const rooms = await Room.find({ owner: user._id });
        for (const room of rooms) {
            const { score, flags, isFlagged } = await evaluateRoomFraud(room);
            room.fraudScore = score;
            room.fraudFlags = flags;
            room.isFlagged = isFlagged;
            await room.save();
        }

        res.json({ message: "KYC approved", user: { id: user._id, kyc: user.kyc } });

        logAdminAction({
            adminId: req.user?._id,
            action: "kyc.approve",
            entityType: "kyc",
            entityId: user?._id,
            meta: { note: adminNote || "" },
            req,
        });

        notifyUser({
            userId: user._id,
            title: "KYC approved",
            message: "Your KYC was approved",
            type: "kyc",
            data: { url: "/owner/kyc" },
        });
    } catch (err) {
        console.log("Approve KYC error:", err.message);
        const statusCode = err.status || 500;
        res.status(statusCode).json({ message: err.message || "Server error" });
    }
};

// ADMIN: reject KYC (shortcut)
const rejectKyc = async (req, res) => {
    try {
        const { userId } = req.params;
        const { reason, checks } = req.body || {};
        const user = await updateKycStatus(userId, "rejected", reason, checks, req.user?._id);

        // auto-unpublish all rooms of this owner
        await Room.updateMany({ owner: user._id }, { isPublished: false });

        res.json({ message: "KYC rejected", user: { id: user._id, kyc: user.kyc } });

        logAdminAction({
            adminId: req.user?._id,
            action: "kyc.reject",
            entityType: "kyc",
            entityId: user?._id,
            meta: { reason: reason || "" },
            req,
        });

        notifyUser({
            userId: user._id,
            title: "KYC rejected",
            message: "Your KYC was rejected",
            type: "kyc",
            data: { url: "/owner/kyc" },
        });
    } catch (err) {
        console.log("Reject KYC error:", err.message);
        const statusCode = err.status || 500;
        res.status(statusCode).json({ message: err.message || "Server error" });
    }
};

export { submitKyc, updateKyc, myKyc, listPending, listApproved, kycSummary, reviewKyc, approveKyc, rejectKyc };
