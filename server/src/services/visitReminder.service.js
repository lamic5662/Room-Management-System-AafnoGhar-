import Visit from "../models/Visit.js";
import { notifyUser } from "./notify.service.js";

const WINDOW_HOURS = Number(process.env.VISIT_REMINDER_WINDOW_HOURS || 24);
const INTERVAL_MINUTES = Number(process.env.VISIT_REMINDER_INTERVAL_MINUTES || 30);

const shouldRun = () => process.env.VISIT_REMINDER_ENABLED !== "false";

const runVisitReminders = async () => {
  if (!shouldRun()) return;
  const now = new Date();
  const end = new Date(now.getTime() + WINDOW_HOURS * 60 * 60 * 1000);

  const visits = await Visit.find({
    status: "approved",
    scheduledAt: { $gte: now, $lte: end },
    reminderSentAt: null,
    rescheduleStatus: { $ne: "pending" },
  })
    .populate("room", "title")
    .populate("tenant", "fullName")
    .populate("owner", "fullName");

  if (!visits.length) return;

  for (const v of visits) {
    const when = new Date(v.scheduledAt).toLocaleString();
    const title = "Visit reminder";
    const msg = `${v.room?.title || "Room"} visit at ${when}`;

    await notifyUser({
      userId: v.tenant?._id || v.tenant,
      title,
      message: msg,
      type: "visit",
      data: { visitId: v._id, roomId: v.room?._id || v.room, url: "/tenant/visits" },
    });

    await notifyUser({
      userId: v.owner?._id || v.owner,
      title,
      message: msg,
      type: "visit",
      data: { visitId: v._id, roomId: v.room?._id || v.room, url: "/owner/visits" },
    });

    v.reminderSentAt = new Date();
    await v.save();
  }
};

const startVisitReminderScheduler = () => {
  if (!shouldRun()) return;
  const interval = Math.max(5, INTERVAL_MINUTES) * 60 * 1000;
  setTimeout(runVisitReminders, 5000);
  setInterval(runVisitReminders, interval);
};

export { startVisitReminderScheduler };
