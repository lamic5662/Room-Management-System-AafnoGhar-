import { Router } from "express";
import { protect } from "../middleware/auth.middleware.js";
import {
    createRequest,
    myRequests,
    incomingRequests,
    updateRequestStatus,
    cancelRequest,
} from "../controllers/request.controller.js";

const router = Router();

router.post("/", protect, createRequest);            // tenant sends request
router.get("/my", protect, myRequests);              // tenant sees own requests
router.get("/incoming", protect, incomingRequests);  // owner sees requests
router.patch("/:id/status", protect, updateRequestStatus); // owner approve/reject
router.patch("/:id/cancel", protect, cancelRequest); // tenant cancel

export default router;
