import Notification from "../models/Notification.js";

const listMyNotifications = async (req, res) => {
  try {
    const limit = Math.min(Number(req.query.limit || 30), 100);
    const notifications = await Notification.find({ user: req.user._id })
      .sort({ createdAt: -1 })
      .limit(limit);
    const unread = await Notification.countDocuments({ user: req.user._id, read: false });
    res.json({ notifications, unread });
  } catch (err) {
    console.log("List notifications error:", err.message);
    res.status(500).json({ message: "Server error" });
  }
};

const markRead = async (req, res) => {
  try {
    const { id } = req.params;
    const notif = await Notification.findOne({ _id: id, user: req.user._id });
    if (!notif) return res.status(404).json({ message: "Notification not found" });
    notif.read = true;
    await notif.save();
    res.json({ message: "Marked read", notification: notif });
  } catch (err) {
    console.log("Mark read error:", err.message);
    res.status(500).json({ message: "Server error" });
  }
};

const markAllRead = async (req, res) => {
  try {
    await Notification.updateMany({ user: req.user._id, read: false }, { read: true });
    res.json({ message: "All marked read" });
  } catch (err) {
    console.log("Mark all read error:", err.message);
    res.status(500).json({ message: "Server error" });
  }
};

const deleteRead = async (req, res) => {
  try {
    const { id } = req.params;
    const notif = await Notification.findOne({ _id: id, user: req.user._id });
    if (!notif) return res.status(404).json({ message: "Notification not found" });
    if (!notif.read) return res.status(400).json({ message: "Only read notifications can be deleted" });
    await notif.deleteOne();
    res.json({ message: "Notification deleted" });
  } catch (err) {
    console.log("Delete notification error:", err.message);
    res.status(500).json({ message: "Server error" });
  }
};

const deleteAllRead = async (req, res) => {
  try {
    const resDel = await Notification.deleteMany({ user: req.user._id, read: true });
    res.json({ message: "Read notifications deleted", deleted: resDel.deletedCount || 0 });
  } catch (err) {
    console.log("Delete all read error:", err.message);
    res.status(500).json({ message: "Server error" });
  }
};

export { listMyNotifications, markRead, markAllRead, deleteRead, deleteAllRead };
