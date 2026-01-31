import mongoose from "mongoose";
import dotenv from "dotenv";
import bcrypt from "bcryptjs";
import User from "../models/User.js";

dotenv.config();

const [,, email, newPassword] = process.argv;

if (!email || !newPassword) {
  console.error("Usage: node src/scripts/resetPassword.js <email> <newPassword>");
  process.exit(1);
}

const MONGO_URI = process.env.MONGO_URI;
if (!MONGO_URI) {
  console.error("MONGO_URI is missing in .env");
  process.exit(1);
}

const run = async () => {
  try {
    await mongoose.connect(MONGO_URI);

    const user = await User.findOne({ email });
    if (!user) {
      console.error(`User not found: ${email}`);
      process.exit(1);
    }

    const salt = await bcrypt.genSalt(10);
    const hash = await bcrypt.hash(newPassword, salt);

    user.password = hash;
    await user.save();

    console.log(`✅ Password reset for ${email}`);
    process.exit(0);
  } catch (err) {
    console.error("Reset error:", err.message);
    process.exit(1);
  }
};

run();
