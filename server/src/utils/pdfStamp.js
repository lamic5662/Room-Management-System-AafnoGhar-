const DEFAULT_STAMP_TEXT = "AafnoGhar Official";
const DEFAULT_TAGLINE = "Verified Document";

export const drawStamp = (doc, { text = DEFAULT_STAMP_TEXT, tagline = DEFAULT_TAGLINE, x, y } = {}) => {
    if (!doc || !doc.page) return;

    const pageWidth = doc.page.width;
    const pageHeight = doc.page.height;
    const stampWidth = 150;
    const stampHeight = 70;
    const padding = 30;
    const posX = x ?? pageWidth - stampWidth - padding;
    const posY = y ?? pageHeight - stampHeight - padding;
    const centerX = posX + stampWidth / 2;
    const centerY = posY + stampHeight / 2;

    doc.save();
    doc.translate(centerX, centerY);
    doc.rotate(-6);
    doc.strokeColor("#b91c1c").lineWidth(2);
    doc.ellipse(0, 0, stampWidth / 2, stampHeight / 2).stroke();
    doc.font("Helvetica-Bold").fontSize(12).fillColor("#b91c1c");
    doc.text(text.toUpperCase(), -stampWidth / 2 + 10, -10, {
        width: stampWidth - 20,
        align: "center",
    });
    doc.font("Helvetica").fontSize(8).text(tagline, -stampWidth / 2 + 10, 8, {
        width: stampWidth - 20,
        align: "center",
    });
    doc.restore();
};
