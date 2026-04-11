const DEFAULT_STAMP_TEXT = "AafnoGhar Official";
const DEFAULT_TAGLINE = "Verified Document";

export const drawStamp = (doc, { text = DEFAULT_STAMP_TEXT, tagline = DEFAULT_TAGLINE, x, y } = {}) => {
    if (!doc || !doc.page) return;

    const pageWidth = doc.page.width;
    const pageHeight = doc.page.height;
    const stampWidth = 160;
    const stampHeight = 74;
    const padding = 30;
    const posX = x ?? pageWidth - stampWidth - padding;
    const posY = y ?? pageHeight - stampHeight - padding;
    const centerX = posX + stampWidth / 2;
    const centerY = posY + stampHeight / 2;

    doc.save();
    doc.translate(centerX, centerY);
    doc.rotate(-3);
    doc.fillColor("#ffffff").opacity(1).rect(-stampWidth / 2 - 5, -stampHeight / 2 - 5, stampWidth + 10, stampHeight + 10).fill();
    doc.fillColor("#b91c1c").opacity(1);
    doc.strokeColor("#b91c1c").lineWidth(2);
    doc.ellipse(0, 0, stampWidth / 2, stampHeight / 2).stroke();
    doc.font("Helvetica-Bold").fontSize(13).fillColor("#b91c1c");
    doc.text(text.toUpperCase(), -stampWidth / 2 + 10, -14, {
        width: stampWidth - 20,
        align: "center",
    });
    doc.font("Helvetica-Bold").fontSize(9.5).text(String(tagline || "").toUpperCase(), -stampWidth / 2 + 10, 10, {
        width: stampWidth - 20,
        align: "center",
    });
    doc.restore();
};
