import AuditLog from "../models/AuditLog.js";

const getIp = (req) => {
  if (!req) return "";
  const forwarded = req.headers?.["x-forwarded-for"];
  if (typeof forwarded === "string" && forwarded.trim()) {
    return forwarded.split(",")[0].trim();
  }
  return req.ip || "";
};

export const logAdminAction = async ({ adminId, action, entityType = "", entityId = null, meta = {}, req }) => {
  if (!adminId || !action) return null;
  try {
    const payload = {
      admin: adminId,
      action,
      entityType,
      entityId,
      meta,
      ip: getIp(req),
      userAgent: req?.headers?.["user-agent"] || "",
    };
    return await AuditLog.create(payload);
  } catch (err) {
    console.log("Audit log error:", err.message);
    return null;
  }
};
