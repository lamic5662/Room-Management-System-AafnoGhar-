import { Router } from "express";
import { protect } from "../middleware/auth.middleware.js";
import {
    createComplaint,
    myComplaints,
    incomingComplaints,
    ownerUpdateComplaint,
} from "../controllers/complaint.controller.js";

const router = Router();

router.post("/", protect, createComplaint);          // tenant create
router.get("/my", protect, myComplaints);            // tenant list
router.get("/incoming", protect, incomingComplaints); // owner list
router.patch("/:id", protect, ownerUpdateComplaint); // owner update

export default router;
