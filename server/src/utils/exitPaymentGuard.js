import mongoose from "mongoose";
import ExitRequest from "../models/ExitRequest.js";

const ALLOWED_EXIT_STATUSES = ["approved", "settlement_pending", "settled"];

export async function ensureActiveAgreementOrApprovedExit({ agreement, tenantId, exitId }) {
  if (agreement?.status === "active") return null;
  if (!exitId || !mongoose.Types.ObjectId.isValid(exitId)) {
    throw new Error("Agreement is not active");
  }

  const exitRequest = await ExitRequest.findOne({
    _id: exitId,
    agreement: agreement._id,
    tenant: tenantId,
  });

  if (!exitRequest || !ALLOWED_EXIT_STATUSES.includes(exitRequest.status)) {
    throw new Error("Agreement is not active");
  }

  return exitRequest;
}
