import { Router } from "express";
import { protect, requireOwner } from "../middleware/auth.middleware.js";
import { uploadRoomPhotos } from "../middlewares/uploadRooms.js";
import requireVerifiedOwner from "../middleware/requireVerifiedOwner.js";
import {
    createRoom,
    listRooms,
    featuredRooms,
    getRoomById,
    myRooms,
    uploadPhotos,
    updateRoom,
    deleteRoomPhoto,
    publishRoom,
    unpublishRoom,
    deleteRoom,
    nearbyPlaces,
} from "../controllers/room.controller.js";

const router = Router();

// Public
router.get("/", listRooms);
router.get("/featured", featuredRooms);
router.get("/:id/nearby", nearbyPlaces);

// Owner only
router.post("/", protect, requireOwner, createRoom);
router.get("/my", protect, myRooms);
router.patch("/:id/publish", protect, requireVerifiedOwner, publishRoom);
router.patch("/:id/unpublish", protect, unpublishRoom);
router.get("/:id", getRoomById);
router.post("/:id/photos", protect, (req, res) => {
    uploadRoomPhotos(req, res, async (err) => {
        if (err) return res.status(400).json({ message: err.message });
        return uploadPhotos(req, res);
    });
});
router.patch("/:id", protect, updateRoom);
router.delete("/:id/photos", protect, deleteRoomPhoto);
router.delete("/:id", protect, deleteRoom);

export default router;
