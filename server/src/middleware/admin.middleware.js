const isAdminRole = (role) => role === "admin" || role === "super_admin";
const isStaffRole = (role) => role === "admin" || role === "super_admin" || role === "moderator";

const requireAdmin = (req, res, next) => {
    if (!req.user || !isAdminRole(req.user.role)) {
        return res.status(403).json({ message: "Admin access only" });
    }
    next();
};

const requireStaff = (req, res, next) => {
    if (!req.user || !isStaffRole(req.user.role)) {
        return res.status(403).json({ message: "Admin access only" });
    }
    next();
};

const requireSuperAdmin = (req, res, next) => {
    if (!req.user || req.user.role !== "super_admin") {
        return res.status(403).json({ message: "Super admin access only" });
    }
    next();
};

export { requireAdmin, requireSuperAdmin, requireStaff };
