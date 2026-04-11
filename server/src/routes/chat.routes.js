import express from "express";
import { chatReply } from "../controllers/chat.controller.js";

const router = express.Router();

router.post("/", chatReply);

export default router;
