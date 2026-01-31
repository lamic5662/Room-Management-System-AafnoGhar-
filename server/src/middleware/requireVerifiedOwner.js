import User from "../models/User.js";

export default async function requireVerifiedOwner(req, res, next) {
  try {
    if (req.user.role !== "owner") {
      return res.status(403).json({ message: "Owner access only" });
    }

    const user = await User.findById(req.user._id).select("kyc");
    const status = user?.kyc?.status || "none";
    const isVerified = status === "approved";

    if (!isVerified) {
      return res.status(403).json({
        message: "KYC not verified. Please complete KYC to publish rooms.",
        kycStatus: status,
      });
    }

    next();
  } catch (err) {
    return res.status(500).json({ message: "Server error" });
  }
}
