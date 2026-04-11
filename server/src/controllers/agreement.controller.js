import PDFDocument from "pdfkit";
import fs from "fs";
import path from "path";
import Agreement from "../models/Agreement.js";
import Request from "../models/Request.js";
import Room from "../models/Room.js";
import Visit from "../models/Visit.js";
import { emitVisitDeletesByRoom } from "../services/visitRealtime.service.js";
import { notifyUser } from "../services/notify.service.js";
import { isSupabaseEnabled, uploadSignatureImage } from "../utils/supabaseStorage.js";

// helper
const addMonths = (date, months) => {
    const d = new Date(date);
    d.setMonth(d.getMonth() + months);
    return d;
};

// OWNER: create agreement from an approved request
// POST /api/agreements/from-request/:requestId
const createFromRequest = async (req, res) => {
    try {
        if (req.user.role !== "owner") {
            return res.status(403).json({ message: "Owner access only" });
        }

        const { requestId } = req.params;

        const reqDoc = await Request.findById(requestId);
        if (!reqDoc) return res.status(404).json({ message: "Request not found" });

        if (String(reqDoc.owner) !== String(req.user._id)) {
            return res.status(403).json({ message: "Not your request" });
        }

        if (reqDoc.status !== "approved") {
            return res.status(400).json({ message: "Request must be approved to create agreement" });
        }

        // prevent duplicate agreement for same request
        const existing = await Agreement.findOne({ request: requestId });
        if (existing) return res.status(409).json({ message: "Agreement already exists", agreement: existing });

        const room = await Room.findById(reqDoc.room);
        if (!room) return res.status(404).json({ message: "Room not found" });

        const active = await Agreement.findOne({ room: room._id, status: "active" });
        if (active) {
            return res.status(400).json({ message: "Room already has an active agreement" });
        }

        room.isPublished = false;
        await room.save();

        const startDate = new Date();                // default: today
        const endDate = addMonths(startDate, 11);    // default: 11 months
        const monthlyRent = room.monthlyRent;
        const securityDeposit = room.monthlyRent;    // default: 1 month rent

        const agreement = await Agreement.create({
            room: room._id,
            request: reqDoc._id,
            owner: reqDoc.owner,
            tenant: reqDoc.tenant,
            monthlyRent,
            securityDeposit,
            startDate,
            endDate,
            rentReminderDay: startDate.getDate(),
        });

        await emitVisitDeletesByRoom(room._id);
        await Visit.deleteMany({ room: room._id });

        notifyUser({
            userId: reqDoc.tenant,
            title: "Agreement created",
            message: "Owner created an agreement for your request",
            type: "agreement",
            data: { agreementId: agreement._id, url: "/tenant/agreements" },
        });

        res.status(201).json({ message: "Agreement created", agreement });
    } catch (err) {
        console.log("Create agreement error:", err.message);
        res.status(500).json({ message: "Server error" });
    }
};

// OWNER: update rent reminder day for agreement
// PATCH /api/agreements/:id/reminder { day }
const updateReminderDay = async (req, res) => {
    try {
        if (req.user.role !== "owner") {
            return res.status(403).json({ message: "Owner access only" });
        }

        const { id } = req.params;
        if (!id) return res.status(400).json({ message: "Agreement id required" });

        const dayRaw = Number(req.body?.day);
        if (!Number.isFinite(dayRaw)) {
            return res.status(400).json({ message: "day must be a number" });
        }
        const day = Math.min(31, Math.max(1, Math.floor(dayRaw)));

        const agreement = await Agreement.findById(id);
        if (!agreement) return res.status(404).json({ message: "Agreement not found" });
        if (String(agreement.owner) !== String(req.user._id)) {
            return res.status(403).json({ message: "Not your agreement" });
        }

        agreement.rentReminderDay = day;
        await agreement.save();

        res.json({ message: "Reminder day updated", rentReminderDay: day });
    } catch (err) {
        console.log("Update reminder day error:", err.message);
        res.status(500).json({ message: "Server error" });
    }
};

const myAgreements = async (req, res) => {
    try {
        if (req.user.role !== "owner") {
            return res.status(403).json({ message: "Owner access only" });
        }

        const agreements = await Agreement.find({ owner: req.user._id })
            .populate("tenant", "fullName phone email")
            .populate("room", "title location monthlyRent photos")
            .sort({ createdAt: -1 });

        res.json({ count: agreements.length, agreements });
    } catch (err) {
        res.status(500).json({ message: "Server error" });
    }
};

const myTenantAgreements = async (req, res) => {
    try {
        if (req.user.role !== "tenant") {
            return res.status(403).json({ message: "Tenant access only" });
        }

        const agreements = await Agreement.find({ tenant: req.user._id })
            .populate("owner", "fullName phone email")
            .populate("room", "title location monthlyRent photos")
            .sort({ createdAt: -1 });

        res.json({ count: agreements.length, agreements });
    } catch (err) {
        res.status(500).json({ message: "Server error" });
    }
};

// BOTH: download agreement PDF
// GET /api/agreements/:id/pdf
const downloadAgreementPdf = async (req, res) => {
    try {
        const { id } = req.params;

        const agreement = await Agreement.findById(id)
            .populate("room", "title location")
            .populate("owner", "fullName phone email")
            .populate("tenant", "fullName phone email");

        if (!agreement) return res.status(404).json({ message: "Agreement not found" });

        // Only owner or tenant can download
        const me = String(req.user._id);
        if (me !== String(agreement.owner._id) && me !== String(agreement.tenant._id)) {
            return res.status(403).json({ message: "Not allowed" });
        }

        res.setHeader("Content-Type", "application/pdf");
        res.setHeader("Content-Disposition", `inline; filename="agreement-${agreement._id}.pdf"`);

        const doc = new PDFDocument({ margin: 50 });
        doc.pipe(res);

        doc.fontSize(18).text("AafnoGhar Room Rental Agreement", { align: "center" });
        doc.moveDown();

        doc.fontSize(12).text(`Agreement ID: ${agreement._id}`);
        doc.text(`Created At: ${new Date(agreement.createdAt).toDateString()}`);
        doc.moveDown();

        doc.fontSize(14).text("Parties");
        doc.fontSize(12).text(`Owner: ${agreement.owner.fullName} | Phone: ${agreement.owner.phone}`);
        doc.text(`Tenant: ${agreement.tenant.fullName} | Phone: ${agreement.tenant.phone}`);
        doc.moveDown();

        doc.fontSize(14).text("Room Details");
        doc.fontSize(12).text(`Title: ${agreement.room.title}`);
        doc.text(`Location: ${agreement.room.location}`);
        doc.moveDown();

        doc.fontSize(14).text("Payment Terms");
        doc.fontSize(12).text(`Monthly Rent: NPR ${agreement.monthlyRent}`);
        doc.text(`Security Deposit: NPR ${agreement.securityDeposit}`);
        doc.moveDown();

        doc.fontSize(14).text("Duration");
        doc.fontSize(12).text(`Start Date: ${new Date(agreement.startDate).toDateString()}`);
        doc.text(`End Date: ${new Date(agreement.endDate).toDateString()}`);
        doc.moveDown();

        doc.fontSize(14).text("Terms (Simple)");
        doc.fontSize(12).text("1. Tenant will pay rent monthly on time.");
        doc.text("2. Tenant will take care of the room and property.");
        doc.text("3. Owner will provide agreed facilities as mentioned in listing.");
        doc.text("4. Any disputes will be handled mutually first.");
        doc.moveDown(2);

        doc.fontSize(14).text("Signatures");
        doc.moveDown();

        const signYStart = doc.y;
        doc.fontSize(12).text("Owner Signature:", 50, signYStart);
        if (agreement.ownerSignatureUrl) {
            const rel = agreement.ownerSignatureUrl.replace(/^\/+/, "");
            const p = path.join(process.cwd(), rel);
            try {
                doc.image(p, 180, signYStart - 5, { width: 150 });
            } catch {}
        } else {
            doc.text("________________________", 180, signYStart);
        }

        doc.moveDown(3);
        const signY2 = doc.y;
        doc.text("Tenant Signature:", 50, signY2);
        if (agreement.tenantSignatureUrl) {
            const rel = agreement.tenantSignatureUrl.replace(/^\/+/, "");
            const p = path.join(process.cwd(), rel);
            try {
                doc.image(p, 180, signY2 - 5, { width: 150 });
            } catch {}
        } else {
            doc.text("________________________", 180, signY2);
        }

        doc.end();
    } catch (err) {
        console.log("PDF error:", err.message);
        res.status(500).json({ message: "Server error" });
    }
};

const signTenant = async (req, res) => {
    try {
        const { id } = req.params;

        const agreement = await Agreement.findById(id);
        if (!agreement) return res.status(404).json({ message: "Agreement not found" });

        // only tenant can sign tenant
        if (String(req.user._id) !== String(agreement.tenant)) {
            return res.status(403).json({ message: "Only tenant can sign here" });
        }

        if (!req.file) return res.status(400).json({ message: "Signature file required" });

        const useSupabase = isSupabaseEnabled();
        if (agreement.tenantSignatureUrl && !agreement.tenantSignatureUrl.startsWith("http")) {
            const oldPath = path.join(process.cwd(), agreement.tenantSignatureUrl.replace(/^\/+/, ""));
            if (fs.existsSync(oldPath)) fs.unlinkSync(oldPath);
        }

        if (useSupabase && req.file.buffer) {
            agreement.tenantSignatureUrl = await uploadSignatureImage({
                buffer: req.file.buffer,
                contentType: req.file.mimetype,
                agreementId: agreement._id,
                role: "tenant",
                originalName: req.file.originalname,
            });
        } else {
            agreement.tenantSignatureUrl = `uploads/signatures/${req.file.filename}`;
        }
        await agreement.save();

        const url = agreement.tenantSignatureUrl.startsWith("http")
            ? agreement.tenantSignatureUrl
            : `/${agreement.tenantSignatureUrl}`;
        res.json({ message: "Tenant signature saved", tenantSignatureUrl: url });
    } catch (err) {
        console.log("Tenant sign error:", err.message);
        res.status(500).json({ message: "Server error" });
    }
};

const signOwner = async (req, res) => {
    try {
        const { id } = req.params;

        const agreement = await Agreement.findById(id);
        if (!agreement) return res.status(404).json({ message: "Agreement not found" });

        // only owner can sign owner
        if (String(req.user._id) !== String(agreement.owner)) {
            return res.status(403).json({ message: "Only owner can sign here" });
        }

        if (!req.file) return res.status(400).json({ message: "Signature file required" });

        const useSupabase = isSupabaseEnabled();
        if (agreement.ownerSignatureUrl && !agreement.ownerSignatureUrl.startsWith("http")) {
            const oldPath = path.join(process.cwd(), agreement.ownerSignatureUrl.replace(/^\/+/, ""));
            if (fs.existsSync(oldPath)) fs.unlinkSync(oldPath);
        }

        if (useSupabase && req.file.buffer) {
            agreement.ownerSignatureUrl = await uploadSignatureImage({
                buffer: req.file.buffer,
                contentType: req.file.mimetype,
                agreementId: agreement._id,
                role: "owner",
                originalName: req.file.originalname,
            });
        } else {
            agreement.ownerSignatureUrl = `uploads/signatures/${req.file.filename}`;
        }
        await agreement.save();

        const url = agreement.ownerSignatureUrl.startsWith("http")
            ? agreement.ownerSignatureUrl
            : `/${agreement.ownerSignatureUrl}`;
        res.json({ message: "Owner signature saved", ownerSignatureUrl: url });
    } catch (err) {
        console.log("Owner sign error:", err.message);
        res.status(500).json({ message: "Server error" });
    }
};

export { createFromRequest, myAgreements, myTenantAgreements, updateReminderDay, downloadAgreementPdf, signTenant, signOwner };
