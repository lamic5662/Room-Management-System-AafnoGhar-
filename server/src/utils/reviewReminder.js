import { notifyUser } from "../services/notify.service.js";

const getId = (value) => (value && typeof value === "object" && value._id ? value._id : value);

export const sendExitReviewReminder = async (exitReq) => {
  if (!exitReq || exitReq.reviewReminderSent) return false;

  const tenantId = getId(exitReq.tenant);
  const roomId = getId(exitReq.room);
  const agreementId = getId(exitReq.agreement);

  if (!tenantId || !roomId) return false;

  await notifyUser({
    userId: tenantId,
    title: "Leave a review",
    message: "Your stay is complete. Please rate the room to help others.",
    type: "review",
    data: {
      roomId,
      agreementId,
      url: `/rooms/${roomId}#ratings`,
    },
  });

  exitReq.reviewReminderSent = true;
  exitReq.reviewReminderSentAt = new Date();
  await exitReq.save();

  return true;
};
