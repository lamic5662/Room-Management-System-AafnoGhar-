import mongoose from "mongoose";

export const connectDB = async () => {
    try {
        await mongoose.connect(process.env.MONGO_URI);
        console.log("MongoDB connected");
        // Drop legacy unique index on payments (agreement_1_period_1) to allow electricity-only payments
        try {
            const idx = await mongoose.connection.collection("payments").indexes();
            const legacy = idx.find((i) => i.name === "agreement_1_period_1");
            if (legacy) {
                await mongoose.connection.collection("payments").dropIndex("agreement_1_period_1");
                console.log("Dropped legacy payments index agreement_1_period_1");
            }
        } catch (err) {
            console.log("Index check warning:", err.message);
        }
    } catch (err) {
        console.log("MongoDB connection error:", err.message);
        process.exit(1);
    }
};
