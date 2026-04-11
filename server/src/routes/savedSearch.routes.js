import { Router } from "express";
import { protect } from "../middleware/auth.middleware.js";
import {
  createSavedSearch,
  listSavedSearches,
  deleteSavedSearch,
  updateSavedSearch,
} from "../controllers/savedSearch.controller.js";

const router = Router();

router.get("/", protect, listSavedSearches);
router.post("/", protect, createSavedSearch);
router.patch("/:id", protect, updateSavedSearch);
router.delete("/:id", protect, deleteSavedSearch);

export default router;
