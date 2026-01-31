import bcrypt from "bcryptjs";
import fs from "fs";
import path from "path";
import User from "../models/User.js";

const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// GET /api/users/me
const getMe = async (req, res) => {
  try {
    const user = await User.findById(req.user._id).select("-password");
    res.json({ user });
  } catch (e) {
    res.status(500).json({ message: "Server error" });
  }
};

// PATCH /api/users/me
const updateMe = async (req, res) => {
  try {
    const { fullName, email, phone } = req.body;
    const updates = {};

    if (fullName !== undefined) {
      if (!String(fullName).trim()) {
        return res.status(400).json({ message: "Full name is required" });
      }
      updates.fullName = String(fullName).trim();
    }

    if (email !== undefined) {
      const emailNorm = String(email).toLowerCase().trim();
      if (!emailRegex.test(emailNorm)) {
        return res.status(400).json({ message: "Invalid email" });
      }
      const exists = await User.findOne({ email: emailNorm, _id: { $ne: req.user._id } });
      if (exists) return res.status(409).json({ message: "Email already used" });
      updates.email = emailNorm;
    }

    if (phone !== undefined) {
      const phoneNorm = String(phone).trim();
      if (!phoneNorm) return res.status(400).json({ message: "Phone is required" });
      const exists = await User.findOne({ phone: phoneNorm, _id: { $ne: req.user._id } });
      if (exists) return res.status(409).json({ message: "Phone already used" });
      updates.phone = phoneNorm;
    }

    const user = await User.findByIdAndUpdate(req.user._id, updates, { new: true }).select("-password");
    res.json({ message: "Profile updated", user });
  } catch (e) {
    res.status(500).json({ message: "Server error" });
  }
};

// PATCH /api/users/me/password
const updatePassword = async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    if (!currentPassword || !newPassword) {
      return res.status(400).json({ message: "Current and new password are required" });
    }

    const user = await User.findById(req.user._id);
    if (!user) return res.status(404).json({ message: "User not found" });

    const ok = await bcrypt.compare(currentPassword, user.password);
    if (!ok) return res.status(400).json({ message: "Current password is incorrect" });

    const pwd = String(newPassword);
    const hasUpper = /[A-Z]/.test(pwd);
    const hasLower = /[a-z]/.test(pwd);
    const hasNum = /[0-9]/.test(pwd);
    const hasSym = /[^A-Za-z0-9]/.test(pwd);
    if (pwd.length < 8 || !hasUpper || !hasLower || !hasNum || !hasSym) {
      return res.status(400).json({
        message: "Password must be 8+ chars with upper, lower, number, symbol",
      });
    }

    const hashed = await bcrypt.hash(pwd, 10);
    user.password = hashed;
    await user.save();

    res.json({ message: "Password updated" });
  } catch (e) {
    res.status(500).json({ message: "Server error" });
  }
};

// POST /api/users/me/avatar
const updateAvatar = async (req, res) => {
  try {
    const file = req.file;
    if (!file) return res.status(400).json({ message: "Avatar file is required" });

    const user = await User.findById(req.user._id);
    if (!user) return res.status(404).json({ message: "User not found" });

    if (user.avatarUrl) {
      const idx = user.avatarUrl.indexOf("/uploads/");
      const rel = idx !== -1 ? user.avatarUrl.slice(idx + "/uploads/".length) : user.avatarUrl.replace(/^\/+/, "");
      const absPath = path.join(process.cwd(), "uploads", rel);
      fs.promises.unlink(absPath).catch(() => {});
    }

    user.avatarUrl = `/uploads/avatars/${file.filename}`;
    await user.save();

    const safeUser = await User.findById(user._id).select("-password");
    res.json({ message: "Avatar updated", user: safeUser });
  } catch (e) {
    res.status(500).json({ message: "Server error" });
  }
};

// DELETE /api/users/me/avatar
const removeAvatar = async (req, res) => {
  try {
    const user = await User.findById(req.user._id);
    if (!user) return res.status(404).json({ message: "User not found" });

    if (user.avatarUrl) {
      const idx = user.avatarUrl.indexOf("/uploads/");
      const rel = idx !== -1 ? user.avatarUrl.slice(idx + "/uploads/".length) : user.avatarUrl.replace(/^\/+/, "");
      const absPath = path.join(process.cwd(), "uploads", rel);
      fs.promises.unlink(absPath).catch(() => {});
    }

    user.avatarUrl = "";
    await user.save();

    const safeUser = await User.findById(user._id).select("-password");
    res.json({ message: "Avatar removed", user: safeUser });
  } catch (e) {
    res.status(500).json({ message: "Server error" });
  }
};

export { getMe, updateMe, updatePassword, updateAvatar, removeAvatar };
