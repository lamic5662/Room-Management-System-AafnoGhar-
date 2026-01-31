import bcrypt from "bcryptjs";
import crypto from "crypto";
import jwt from "jsonwebtoken";
import User from "../models/User.js";
import { sendResetEmail } from "../utils/mailer.js";

// helper to make token
const makeToken = (userId) => {
    return jwt.sign({ id: userId }, process.env.JWT_SECRET, { expiresIn: "7d" });
};

// POST /api/auth/register
const register = async (req, res) => {
    try {
        const { fullName, email, phone, role, password } = req.body;

        if (!fullName || !email || !phone || !role || !password) {
            return res.status(400).json({ message: "All fields are required" });
        }

        if (!["owner", "tenant"].includes(role)) {
            return res.status(400).json({ message: "Role must be owner or tenant" });
        }

        const emailNorm = String(email).toLowerCase().trim();
        const phoneNorm = String(phone).trim();

        const existingEmail = await User.findOne({ email: emailNorm });
        if (existingEmail) return res.status(409).json({ message: "Email already used" });

        const existingPhone = await User.findOne({ phone: phoneNorm });
        if (existingPhone) return res.status(409).json({ message: "Phone already used" });

        const hashed = await bcrypt.hash(password, 10);

        const user = await User.create({
            fullName,
            email: emailNorm,
            phone: phoneNorm,
            role,
            password: hashed,
        });

        const token = makeToken(user._id);

        return res.status(201).json({
            message: "Registered successfully",
            token,
            user: {
                id: user._id,
                fullName: user.fullName,
                email: user.email,
                phone: user.phone,
                role: user.role,
                avatarUrl: user.avatarUrl || "",
            },
        });
    } catch (err) {
        console.log("Register error:", err.message);
        return res.status(500).json({ message: "Server error" });
    }
};

// POST /api/auth/login
const login = async (req, res) => {
    try {
        const { emailOrPhone, password } = req.body;

        if (!emailOrPhone || !password) {
            return res.status(400).json({ message: "Email/Phone and password are required" });
        }

        const identifier = String(emailOrPhone).trim();
        const emailNorm = identifier.toLowerCase();

        const user = await User.findOne({
            $or: [{ email: emailNorm }, { phone: identifier }],
        });

        if (!user) return res.status(401).json({ message: "Invalid credentials" });

        const ok = await bcrypt.compare(password, user.password);
        if (!ok) return res.status(401).json({ message: "Invalid credentials" });

        const token = makeToken(user._id);

        return res.json({
            message: "Login successful",
            token,
            user: {
                id: user._id,
                fullName: user.fullName,
                email: user.email,
                phone: user.phone,
                role: user.role,
                avatarUrl: user.avatarUrl || "",
            },
        });
    } catch (err) {
        console.log("Login error:", err.message);
        return res.status(500).json({ message: "Server error" });
    }
};

// POST /api/auth/forgot-password
const forgotPassword = async (req, res) => {
    try {
        const { email } = req.body;
        if (!email) return res.status(400).json({ message: "Email is required" });

        const emailNorm = String(email).toLowerCase().trim();
        const user = await User.findOne({ email: emailNorm });

        // Always respond success to avoid account enumeration
        if (!user) {
            return res.json({ message: "If that email exists, a reset link was sent." });
        }

        const token = crypto.randomBytes(32).toString("hex");
        const tokenHash = crypto.createHash("sha256").update(token).digest("hex");

        user.resetPasswordToken = tokenHash;
        user.resetPasswordExpires = new Date(Date.now() + 1000 * 60 * 30); // 30 minutes
        await user.save();

        const resetLink = `${process.env.APP_URL}/reset-password?token=${token}`;
        await sendResetEmail({ to: user.email, name: user.fullName, resetLink });

        return res.json({ message: "If that email exists, a reset link was sent." });
    } catch (err) {
        console.log("Forgot password error:", err.message);
        return res.status(500).json({ message: "Server error" });
    }
};

// POST /api/auth/reset-password
const resetPassword = async (req, res) => {
    try {
        const { token, password, confirmPassword } = req.body;
        if (!token || !password) {
            return res.status(400).json({ message: "Token and password are required" });
        }
        if (confirmPassword !== undefined && password !== confirmPassword) {
            return res.status(400).json({ message: "Passwords do not match" });
        }
        if (!isStrongPassword(password)) {
            return res.status(400).json({ message: "Password is not strong enough" });
        }

        const tokenHash = crypto.createHash("sha256").update(token).digest("hex");
        const user = await User.findOne({
            resetPasswordToken: tokenHash,
            resetPasswordExpires: { $gt: new Date() },
        });

        if (!user) {
            return res.status(400).json({ message: "Reset token is invalid or expired" });
        }

        user.password = await bcrypt.hash(password, 10);
        user.resetPasswordToken = "";
        user.resetPasswordExpires = undefined;
        await user.save();

        return res.json({ message: "Password reset successful" });
    } catch (err) {
        console.log("Reset password error:", err.message);
        return res.status(500).json({ message: "Server error" });
    }
};

const isStrongPassword = (pwd = "") => {
    if (pwd.length < 8) return false;
    const hasUpper = /[A-Z]/.test(pwd);
    const hasLower = /[a-z]/.test(pwd);
    const hasNumber = /\d/.test(pwd);
    const hasSymbol = /[^A-Za-z0-9]/.test(pwd);
    return hasUpper && hasLower && hasNumber && hasSymbol;
};

export { register, login, forgotPassword, resetPassword };
