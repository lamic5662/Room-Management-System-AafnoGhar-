import dotenv from "dotenv";
import http from "http";
import app from "./app.js";
import { connectDB } from "./config/db.js";
import { initSocket } from "./socket.js";
import { startVisitReminderScheduler } from "./services/visitReminder.service.js";

dotenv.config();

const PORT = process.env.PORT || 5001;

const start = async () => {
    await connectDB();
    const server = http.createServer(app);
    initSocket(server);
    startVisitReminderScheduler();
    server.listen(PORT, () => console.log(`Server running on port ${PORT}`));
};

start();
