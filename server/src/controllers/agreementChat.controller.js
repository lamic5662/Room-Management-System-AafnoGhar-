import mongoose from "mongoose";
import Agreement from "../models/Agreement.js";
import AgreementMessage from "../models/AgreementMessage.js";
import { emitToUser } from "../socket.js";
import { notifyUser } from "../services/notify.service.js";

const ALLOWED_REACTIONS = ["👍", "❤️", "😂", "😮"];

const loadAgreementForUser = async (agreementId, user) => {
    if (!mongoose.Types.ObjectId.isValid(agreementId)) {
        return { error: { status: 400, message: "Invalid agreementId" } };
    }
    const agreement = await Agreement.findById(agreementId);
    if (!agreement) {
        return { error: { status: 404, message: "Agreement not found" } };
    }
    const uid = String(user._id);
    const isOwner = uid === String(agreement.owner);
    const isTenant = uid === String(agreement.tenant);
    if (!isOwner && !isTenant) {
        return { error: { status: 403, message: "Forbidden" } };
    }
    return { agreement, isOwner, isTenant };
};

const listAgreementMessages = async (req, res) => {
    try {
        if (!["owner", "tenant"].includes(req.user.role)) {
            return res.status(403).json({ message: "Owner or tenant access only" });
        }

        const { id } = req.params;
        const { agreement, isOwner, error } = await loadAgreementForUser(id, req.user);
        if (error) return res.status(error.status).json({ message: error.message });

        const limitRaw = Number(req.query.limit);
        const limit = Number.isFinite(limitRaw) ? Math.min(Math.max(limitRaw, 1), 200) : 50;
        const before = req.query.before ? new Date(req.query.before) : null;

        const query = { agreement: agreement._id, deletedFor: { $nin: [req.user._id] } };
        if (before && !Number.isNaN(before.getTime())) {
            query.createdAt = { $lt: before };
        }

        const messages = await AgreementMessage.find(query)
            .sort({ createdAt: -1 })
            .limit(limit)
            .populate("sender", "fullName role");

        const ordered = messages.reverse();

        const readResult = await AgreementMessage.updateMany(
            {
                agreement: agreement._id,
                sender: { $ne: req.user._id },
                readBy: { $ne: req.user._id },
                deletedFor: { $nin: [req.user._id] },
            },
            { $addToSet: { readBy: req.user._id } }
        );
        const modified = readResult?.modifiedCount ?? readResult?.nModified ?? 0;
        if (modified > 0) {
            const otherUserId = isOwner ? agreement.tenant : agreement.owner;
            if (otherUserId) {
                emitToUser(String(otherUserId), "chat:read", {
                    agreementId: agreement._id,
                    readerId: req.user._id,
                });
            }
        }

        res.json({ count: ordered.length, messages: ordered });
    } catch (err) {
        console.log("List agreement messages error:", err.message);
        res.status(500).json({ message: "Server error" });
    }
};

const sendAgreementMessage = async (req, res) => {
    try {
        if (!["owner", "tenant"].includes(req.user.role)) {
            return res.status(403).json({ message: "Owner or tenant access only" });
        }

        const { id } = req.params;
        const { agreement, isOwner, error } = await loadAgreementForUser(id, req.user);
        if (error) return res.status(error.status).json({ message: error.message });

        const text = String(req.body?.text || "").trim();
        if (!text) {
            return res.status(400).json({ message: "Message text is required" });
        }
        if (text.length > 1000) {
            return res.status(400).json({ message: "Message too long (max 1000 chars)" });
        }

        const msg = await AgreementMessage.create({
            agreement: agreement._id,
            room: agreement.room,
            owner: agreement.owner,
            tenant: agreement.tenant,
            sender: req.user._id,
            senderRole: req.user.role,
            text,
            readBy: [req.user._id],
        });

        const populated = await AgreementMessage.findById(msg._id).populate("sender", "fullName role");

        emitToUser(String(agreement.owner), "chat:new", { message: populated });
        emitToUser(String(agreement.tenant), "chat:new", { message: populated });

        const otherUserId = isOwner ? agreement.tenant : agreement.owner;
        const otherUrl = isOwner
            ? `/tenant/agreements/${agreement._id}/chat`
            : `/owner/agreements/${agreement._id}/chat`;

        if (String(otherUserId) !== String(req.user._id)) {
            await notifyUser({
                userId: otherUserId,
                title: "New message",
                message: text.length > 80 ? `${text.slice(0, 77)}...` : text,
                type: "chat",
                data: { agreementId: agreement._id, roomId: agreement.room, url: otherUrl },
            });
        }

        res.status(201).json({ message: "Message sent", chatMessage: populated });
    } catch (err) {
        console.log("Send agreement message error:", err.message);
        res.status(500).json({ message: "Server error" });
    }
};

const markAgreementMessagesRead = async (req, res) => {
    try {
        if (!["owner", "tenant"].includes(req.user.role)) {
            return res.status(403).json({ message: "Owner or tenant access only" });
        }

        const { id } = req.params;
        const { agreement, isOwner, error } = await loadAgreementForUser(id, req.user);
        if (error) return res.status(error.status).json({ message: error.message });

        const result = await AgreementMessage.updateMany(
            {
                agreement: agreement._id,
                sender: { $ne: req.user._id },
                readBy: { $ne: req.user._id },
                deletedFor: { $nin: [req.user._id] },
            },
            { $addToSet: { readBy: req.user._id } }
        );

        const otherUserId = isOwner ? agreement.tenant : agreement.owner;
        const modified = result?.modifiedCount ?? result?.nModified ?? 0;
        if (modified > 0 && otherUserId) {
            emitToUser(String(otherUserId), "chat:read", {
                agreementId: agreement._id,
                readerId: req.user._id,
            });
        }

        res.json({ updated: modified });
    } catch (err) {
        console.log("Mark messages read error:", err.message);
        res.status(500).json({ message: "Server error" });
    }
};

const deleteAgreementMessage = async (req, res) => {
    try {
        if (!["owner", "tenant"].includes(req.user.role)) {
            return res.status(403).json({ message: "Owner or tenant access only" });
        }

        const { id, messageId } = req.params;
        const { agreement, error } = await loadAgreementForUser(id, req.user);
        if (error) return res.status(error.status).json({ message: error.message });

        if (!mongoose.Types.ObjectId.isValid(messageId)) {
            return res.status(400).json({ message: "Invalid messageId" });
        }

        const scope = req.query?.scope === "all" ? "all" : "self";

        const msg = await AgreementMessage.findOne({ _id: messageId, agreement: agreement._id }).select("sender readBy");
        if (!msg) return res.status(404).json({ message: "Message not found" });

        const uid = String(req.user._id);
        const senderId = String(msg.sender);

        if (scope === "all") {
            if (senderId !== uid) {
                return res.status(403).json({ message: "Only sender can delete for everyone" });
            }
            const otherUserId = uid === String(agreement.owner) ? agreement.tenant : agreement.owner;
            const readBy = Array.isArray(msg.readBy) ? msg.readBy.map((r) => String(r)) : [];
            if (otherUserId && readBy.includes(String(otherUserId))) {
                return res.status(400).json({ message: "Message already seen" });
            }

            await AgreementMessage.updateOne(
                { _id: msg._id },
                { $addToSet: { deletedFor: { $each: [agreement.owner, agreement.tenant] } } }
            );
            emitToUser(String(agreement.owner), "chat:deleted", {
                agreementId: agreement._id,
                messageId: msg._id,
                scope: "all",
            });
            emitToUser(String(agreement.tenant), "chat:deleted", {
                agreementId: agreement._id,
                messageId: msg._id,
                scope: "all",
            });

            return res.json({ message: "Message deleted for everyone" });
        }

        await AgreementMessage.updateOne(
            { _id: msg._id },
            { $addToSet: { deletedFor: req.user._id } }
        );
        emitToUser(uid, "chat:deleted", {
            agreementId: agreement._id,
            messageId: msg._id,
            scope: "self",
        });

        res.json({ message: "Message deleted" });
    } catch (err) {
        console.log("Delete agreement message error:", err.message);
        res.status(500).json({ message: "Server error" });
    }
};

const toggleAgreementMessageReaction = async (req, res) => {
    try {
        if (!["owner", "tenant"].includes(req.user.role)) {
            return res.status(403).json({ message: "Owner or tenant access only" });
        }

        const { id, messageId } = req.params;
        const { agreement, error } = await loadAgreementForUser(id, req.user);
        if (error) return res.status(error.status).json({ message: error.message });

        if (!mongoose.Types.ObjectId.isValid(messageId)) {
            return res.status(400).json({ message: "Invalid messageId" });
        }

        const emoji = String(req.body?.emoji || "").trim();
        if (!ALLOWED_REACTIONS.includes(emoji)) {
            return res.status(400).json({ message: "Invalid reaction" });
        }

        const msg = await AgreementMessage.findOne({
            _id: messageId,
            agreement: agreement._id,
            deletedFor: { $nin: [req.user._id] },
        });
        if (!msg) return res.status(404).json({ message: "Message not found" });

        const uid = String(req.user._id);
        const rawReactions = Array.isArray(msg.reactions) ? msg.reactions : [];
        let hadSelected = false;

        let reactions = rawReactions
            .map((r) => ({
                emoji: String(r.emoji || ""),
                users: Array.isArray(r.users) ? r.users.map((u) => String(u)) : [],
            }))
            .filter((r) => r.emoji);

        reactions = reactions
            .map((r) => {
                const hadUser = r.users.includes(uid);
                if (r.emoji === emoji && hadUser) {
                    hadSelected = true;
                }
                const users = r.users.filter((u) => u !== uid);
                return { emoji: r.emoji, users };
            })
            .filter((r) => r.users.length > 0);

        if (!hadSelected) {
            const target = reactions.find((r) => r.emoji === emoji);
            if (target) {
                target.users.push(uid);
            } else {
                reactions.push({ emoji, users: [uid] });
            }
        }

        msg.reactions = reactions.map((r) => ({
            emoji: r.emoji,
            users: r.users.map((u) => new mongoose.Types.ObjectId(u)),
        }));

        await msg.save();
        const populated = await AgreementMessage.findById(msg._id).populate("sender", "fullName role");

        emitToUser(String(agreement.owner), "chat:reaction", {
            agreementId: agreement._id,
            messageId: msg._id,
            reactions: populated?.reactions || [],
        });
        emitToUser(String(agreement.tenant), "chat:reaction", {
            agreementId: agreement._id,
            messageId: msg._id,
            reactions: populated?.reactions || [],
        });

        res.json({ message: "Reaction updated", chatMessage: populated });
    } catch (err) {
        console.log("Toggle reaction error:", err.message);
        res.status(500).json({ message: "Server error" });
    }
};

export { listAgreementMessages, sendAgreementMessage, markAgreementMessagesRead, deleteAgreementMessage, toggleAgreementMessageReaction };
