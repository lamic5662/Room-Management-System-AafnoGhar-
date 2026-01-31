import mongoose from "mongoose";

const roomSchema = new mongoose.Schema(
    {
        owner: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },

        title: { type: String, required: true, trim: true },
        location: { type: String, required: true, trim: true }, // e.g., "Koteshwor, Kathmandu"
        monthlyRent: { type: Number, required: true, min: 0 },

        roomType: {
            type: String,
            enum: ["Single", "Studio", "1BHK", "2BHK", "3BHK", "Other"],
            default: "1BHK",
        },

        description: { type: String, default: "", trim: true },

        rooms: { type: Number, default: 1, min: 0 },      // bedrooms/rooms count
        bathrooms: { type: Number, default: 1, min: 0 },

        facilities: {
            wifi: { type: Boolean, default: false },
            parking: { type: Boolean, default: false },
            waterSupply: { type: Boolean, default: false },
            electricityBackup: { type: Boolean, default: false },
            kitchen: { type: Boolean, default: false },
            furnished: { type: Boolean, default: false },
        },

        photos: { type: [String], default: [] },
        isPublished: { type: Boolean, default: false },

        geo: {
            lat: { type: Number },
            lng: { type: Number },
        },

        nearby: {
            hospitals: { type: [String], default: [] },
            colleges: { type: [String], default: [] },
            busStops: { type: [String], default: [] },
            markets: { type: [String], default: [] },
        },

        fraudScore: { type: Number, default: 0 },
        fraudFlags: { type: [String], default: [] },
        isFlagged: { type: Boolean, default: false },
        requiresImprovement: { type: Boolean, default: false },
        improvementNote: { type: String, default: "" },
        improvementRequestedAt: { type: Date },
    },
    { timestamps: true }
);

export default mongoose.model("Room", roomSchema);
