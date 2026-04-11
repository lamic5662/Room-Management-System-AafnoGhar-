import PDFDocument from "pdfkit";
import fs from "fs";
import path from "path";
import QRCode from "qrcode";
import Agreement from "../models/Agreement.js";
import { drawStamp } from "../utils/pdfStamp.js";

const generateAgreementPdf = async (req, res) => {
  try {
    const agreementId = req.params.id;

    const agreement = await Agreement.findById(agreementId)
      .populate("tenant", "fullName email phone kyc")
      .populate("owner", "fullName email phone kyc")
      .populate("room", "title location monthlyRent");

    if (!agreement) return res.status(404).json({ message: "Agreement not found" });

    const uid = String(req.user._id);
    const isOwner = String(agreement.owner?._id) === uid;
    const isTenant = String(agreement.tenant?._id) === uid;
    const isAdmin = ["admin", "super_admin"].includes(req.user.role);

    if (!isOwner && !isTenant && !isAdmin) {
      return res.status(403).json({ message: "Forbidden" });
    }

    const doc = new PDFDocument({ size: "A4", margin: 40 });

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="agreement-${agreementId}.pdf"`);

    doc.pipe(res);

    const resolveLogoPath = () => {
      const candidates = [];
      if (process.env.PDF_LOGO_PATH) candidates.push(process.env.PDF_LOGO_PATH);
      candidates.push(path.join(process.cwd(), "assets", "logo.png"));
      candidates.push(path.join(process.cwd(), "server", "assets", "logo.png"));
      for (const p of candidates) {
        if (p && fs.existsSync(p)) return p;
      }
      return null;
    };

    const resolveNepaliFont = () => {
      const candidates = [];
      if (process.env.PDF_NEPALI_FONT) candidates.push(process.env.PDF_NEPALI_FONT);
      candidates.push(path.join(process.cwd(), "assets", "NotoSansDevanagari-Regular.ttf"));
      candidates.push(path.join(process.cwd(), "server", "assets", "NotoSansDevanagari-Regular.ttf"));
      for (const p of candidates) {
        if (p && fs.existsSync(p)) return p;
      }
      return null;
    };

    const nepFont = resolveNepaliFont();
    if (nepFont) {
      doc.registerFont("NotoSansDevanagari", nepFont);
    }

    const drawLogo = (x, y) => {
      const logoPath = resolveLogoPath();
      if (logoPath) {
        doc.image(logoPath, x, y, { width: 48 });
        return;
      }
      doc.save();
      doc.roundedRect(x, y, 36, 36, 6).fill("#111827");
      doc.fillColor("#ffffff").fontSize(16).font("Helvetica-Bold").text("A", x, y + 8, { width: 36, align: "center" });
      doc.restore();
    };

    const sectionTitle = (label) => {
      doc.moveDown(0.35);
      doc.fontSize(11).font("Helvetica-Bold").text(label);
      doc.moveDown(0.15);
      doc.moveTo(40, doc.y).lineTo(555, doc.y).strokeColor("#111827").stroke();
      doc.moveDown(0.25);
      doc.font("Helvetica").fillColor("#111827");
    };

    const appUrl = process.env.APP_URL || "http://localhost:5173";
    const qrUrl = `${appUrl}/tenant/agreements?agreementId=${agreementId}`;
    const qrBuf = await QRCode.toBuffer(qrUrl, { type: "png", width: 72, margin: 1 });
    const headerY = doc.y;
    drawLogo(40, headerY);
    const qrX = doc.page.width - doc.page.margins.right - 58;
    doc.image(qrBuf, qrX, headerY, { width: 58 });
    doc.moveDown(2);

    doc.fontSize(16).font("Helvetica-Bold").text("RENT AGREEMENT", { align: "center" });
    doc.moveDown(0.1);
    doc.fontSize(9).font("Helvetica").fillColor("#6b7280").text("AafnoGhar • Official Agreement", { align: "center" });
    doc.moveDown(0.25);
    doc.fontSize(9).fillColor("#111827").text(`Agreement ID: ${agreementId}`, { align: "center" });
    doc.fillColor("#111827");
    doc.moveDown(0.3);

    sectionTitle("Document Information");
    doc.fontSize(9);
    doc.text(`Generated: ${new Date().toLocaleString()}`);
    doc.text(`Status: ${agreement.status || "-"}`);

    const isNepaliChar = (ch) => /[\u0900-\u097F]/.test(ch);
    const splitByScript = (text) => {
      const out = [];
      let buf = "";
      let lastNep = null;
      for (const ch of String(text || "")) {
        const nep = isNepaliChar(ch);
        if (lastNep === null) {
          buf = ch;
          lastNep = nep;
          continue;
        }
        if (nep === lastNep) {
          buf += ch;
        } else {
          out.push({ text: buf, nep: lastNep });
          buf = ch;
          lastNep = nep;
        }
      }
      if (buf) out.push({ text: buf, nep: lastNep });
      return out.length ? out : [{ text: String(text || "-"), nep: false }];
    };

    const writeValue = (label, value) => {
      doc.font("Helvetica").text(`${label}:`);
      const text = String(value ?? "-");
      if (!nepFont) {
        doc.text(text, { indent: 14 });
        return;
      }
      const parts = splitByScript(text);
      parts.forEach((p, idx) => {
        doc.font(p.nep ? "NotoSansDevanagari" : "Helvetica");
        doc.text(p.text, { continued: idx !== parts.length - 1, indent: idx === 0 ? 14 : 0 });
      });
      doc.font("Helvetica");
    };
    const toNpr = (value) => {
      const num = Number(value);
      return Number.isFinite(num) ? Math.ceil(num) : "-";
    };

    sectionTitle("Property Details");
    doc.fontSize(9);
    writeValue("Title", agreement.room?.title || "-");
    writeValue("Location", agreement.room?.location || "-");
    doc.text(`Monthly Rent: NPR ${toNpr(agreement.monthlyRent ?? agreement.room?.monthlyRent)}`);
    doc.text(`Security Deposit: NPR ${toNpr(agreement.securityDeposit)}`);
    doc.moveDown(0.2);
    const start = agreement.startDate ? new Date(agreement.startDate).toDateString() : "-";
    const end = agreement.endDate ? new Date(agreement.endDate).toDateString() : "-";
    doc.text(`Start Date: ${start}`);
    doc.text(`End Date: ${end}`);

    sectionTitle("Parties");
    doc.fontSize(9);
    const ownerKycName = agreement.owner?.kyc?.fields?.fullName || "";
    const tenantKycName = agreement.tenant?.kyc?.fields?.fullName || "";

    writeValue("Owner", agreement.owner?.fullName || "-");
    if (ownerKycName && ownerKycName !== agreement.owner?.fullName) {
      writeValue("Owner (KYC)", ownerKycName);
    }
    doc.text(`Owner Email: ${agreement.owner?.email || "-"}`);
    doc.text(`Owner Phone: ${agreement.owner?.phone || "-"}`);
    doc.moveDown(0.35);
    writeValue("Tenant", agreement.tenant?.fullName || "-");
    if (tenantKycName && tenantKycName !== agreement.tenant?.fullName) {
      writeValue("Tenant (KYC)", tenantKycName);
    }
    doc.text(`Tenant Email: ${agreement.tenant?.email || "-"}`);
    doc.text(`Tenant Phone: ${agreement.tenant?.phone || "-"}`);

    sectionTitle("Terms & Conditions (Summary)");
    doc.fontSize(9);
    doc.text(
      "1. Rent must be paid on time each month.\n" +
      "2. Tenant must follow owner rules and keep the room in good condition.\n" +
      "3. Deposit is refundable after deductions, if any.\n" +
      "4. Agreement ends on end date or after exit settlement.",
      { lineGap: 2 }
    );

    sectionTitle("Signatures");
    doc.fontSize(9);

    const drawSignatureBlock = (label, sigUrl) => {
      const boxX = 160;
      const boxW = 180;
      const boxH = 52;
      const y = doc.y;
      if (y + boxH + 16 > doc.page.height - 50) {
        doc.addPage();
      }
      const drawY = doc.y;
      doc.fontSize(9).font("Helvetica").fillColor("#111827").text(label, 40, drawY + 18);
      doc.rect(boxX, drawY, boxW, boxH).strokeColor("#111827").lineWidth(0.5).stroke();

      if (sigUrl) {
        const rel = sigUrl.replace(/^\/+/, "");
        const p = path.join(process.cwd(), rel);
        if (fs.existsSync(p)) {
          try {
            doc.image(p, boxX + 6, drawY + 6, { fit: [boxW - 12, boxH - 12] });
          } catch {}
        } else {
          doc.fontSize(8).fillColor("#6b7280").text("Not provided", boxX + 10, drawY + 18);
        }
      } else {
        doc.fontSize(8).fillColor("#6b7280").text("Not provided", boxX + 10, drawY + 18);
      }
      doc.fillColor("#111827");
      doc.moveDown(2.8);
    };

    drawSignatureBlock("Owner Signature:", agreement.ownerSignatureUrl);
    drawSignatureBlock("Tenant Signature:", agreement.tenantSignatureUrl);

    doc.moveDown(1);
    doc.fontSize(8).fillColor("#6b7280").text(
      "This agreement is generated electronically and is valid without physical signature when both parties sign digitally.",
      { align: "center" }
    );

    drawStamp(doc, {
      text: "AafnoGhar Official",
      tagline: "Verified Agreement",
    });

    doc.end();
  } catch (err) {
    console.error("PDF error:", err.message);
    res.status(500).json({ message: "Server error" });
  }
};

export { generateAgreementPdf };
