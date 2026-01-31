import dotenv from "dotenv";
import mongoose from "mongoose";
import User from "../models/User.js";

dotenv.config();

async function run() {
    try {
        await mongoose.connect(process.env.MONGO_URI);

        const email = "admin@test.com";
        const user = await User.findOne({ email });

        if (!user) {
            console.log("User not found:", email);
            process.exit(1);
        }

        user.role = "admin";
        await user.save();

        console.log("✅ Updated to admin:", user.email, "role =", user.role);
        process.exit(0);
    } catch (err) {
        console.error("❌ Error:", err.message);
        process.exit(1);
    }
}

run();
