import jwt from "jsonwebtoken";
import User from "../models/User.js";

const protect = async (req, res, next) => {
    try {
        const header = req.headers.authorization; // Bearer <token>
        if (!header || !header.startsWith("Bearer ")) {
            return res.status(401).json({ message: "No token provided" });
        }

        const token = header.split(" ")[1];
        const decoded = jwt.verify(token, process.env.JWT_SECRET);

        const user = await User.findById(decoded.id).select("-password");
        if (!user) return res.status(401).json({ message: "User not found" });

        req.user = user; // full user (id, role, etc.)
        next();
    } catch (err) {
        return res.status(401).json({ message: "Invalid or expired token" });
    }
};

const requireOwner = (req, res, next) => {
    if (!req.user || req.user.role !== "owner") {
        return res.status(403).json({ message: "Owner access only" });
    }
    next();
};

export { protect, requireOwner };
