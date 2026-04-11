import SavedSearch from "../models/SavedSearch.js";

const MAX_SAVED = 20;

const normalizeBool = (v) => v === true || v === "true";

const createSavedSearch = async (req, res) => {
  try {
    if (req.user.role !== "tenant") {
      return res.status(403).json({ message: "Tenant access only" });
    }

    const count = await SavedSearch.countDocuments({ user: req.user._id });
    if (count >= MAX_SAVED) {
      return res.status(400).json({ message: "Saved search limit reached" });
    }

    const {
      name,
      search,
      minRent,
      maxRent,
      roomType,
      sort,
      facilities,
    } = req.body || {};

    const safeName = String(name || "").trim() || `Search ${new Date().toISOString().slice(0, 10)}`;
    if (safeName.length > 60) {
      return res.status(400).json({ message: "name too long" });
    }

    const safeSearch = String(search || "").trim();
    if (safeSearch.length > 80) {
      return res.status(400).json({ message: "search too long" });
    }

    const min = minRent === "" || minRent === null || minRent === undefined ? null : Number(minRent);
    const max = maxRent === "" || maxRent === null || maxRent === undefined ? null : Number(maxRent);
    if (min !== null && (!Number.isFinite(min) || min < 0)) {
      return res.status(400).json({ message: "minRent must be a valid number" });
    }
    if (max !== null && (!Number.isFinite(max) || max < 0)) {
      return res.status(400).json({ message: "maxRent must be a valid number" });
    }

    const entry = await SavedSearch.create({
      user: req.user._id,
      name: safeName,
      search: safeSearch,
      minRent: min,
      maxRent: max,
      roomType: String(roomType || "").trim(),
      sort: String(sort || "").trim(),
      facilities: {
        wifi: normalizeBool(facilities?.wifi),
        parking: normalizeBool(facilities?.parking),
        waterSupply: normalizeBool(facilities?.waterSupply),
        electricityBackup: normalizeBool(facilities?.electricityBackup),
        kitchen: normalizeBool(facilities?.kitchen),
        furnished: normalizeBool(facilities?.furnished),
      },
    });

    res.status(201).json({ message: "Saved search created", search: entry });
  } catch (err) {
    console.log("Create saved search error:", err.message);
    res.status(500).json({ message: "Server error" });
  }
};

const listSavedSearches = async (req, res) => {
  try {
    if (req.user.role !== "tenant") {
      return res.status(403).json({ message: "Tenant access only" });
    }
    const searches = await SavedSearch.find({ user: req.user._id }).sort({ createdAt: -1 });
    res.json({ count: searches.length, searches });
  } catch (err) {
    console.log("List saved searches error:", err.message);
    res.status(500).json({ message: "Server error" });
  }
};

const deleteSavedSearch = async (req, res) => {
  try {
    if (req.user.role !== "tenant") {
      return res.status(403).json({ message: "Tenant access only" });
    }
    const removed = await SavedSearch.findOneAndDelete({
      _id: req.params.id,
      user: req.user._id,
    });
    if (!removed) return res.status(404).json({ message: "Saved search not found" });
    res.json({ message: "Saved search deleted" });
  } catch (err) {
    console.log("Delete saved search error:", err.message);
    res.status(500).json({ message: "Server error" });
  }
};

const updateSavedSearch = async (req, res) => {
  try {
    if (req.user.role !== "tenant") {
      return res.status(403).json({ message: "Tenant access only" });
    }
    const nameRaw = req.body?.name;
    const name = typeof nameRaw === "string" ? nameRaw.trim() : "";
    if (name && name.length > 60) {
      return res.status(400).json({ message: "name too long" });
    }

    const safeSearch = String(req.body?.search || "").trim();
    if (safeSearch.length > 80) {
      return res.status(400).json({ message: "search too long" });
    }

    const minRent = req.body?.minRent;
    const maxRent = req.body?.maxRent;
    const min = minRent === "" || minRent === null || minRent === undefined ? null : Number(minRent);
    const max = maxRent === "" || maxRent === null || maxRent === undefined ? null : Number(maxRent);
    if (min !== null && (!Number.isFinite(min) || min < 0)) {
      return res.status(400).json({ message: "minRent must be a valid number" });
    }
    if (max !== null && (!Number.isFinite(max) || max < 0)) {
      return res.status(400).json({ message: "maxRent must be a valid number" });
    }

    const facilities = req.body?.facilities || {};
    const updateDoc = {
      search: safeSearch,
      minRent: min,
      maxRent: max,
      roomType: String(req.body?.roomType || "").trim(),
      sort: String(req.body?.sort || "").trim(),
      facilities: {
        wifi: normalizeBool(facilities?.wifi),
        parking: normalizeBool(facilities?.parking),
        waterSupply: normalizeBool(facilities?.waterSupply),
        electricityBackup: normalizeBool(facilities?.electricityBackup),
        kitchen: normalizeBool(facilities?.kitchen),
        furnished: normalizeBool(facilities?.furnished),
      },
    };
    if (name) updateDoc.name = name;

    const updated = await SavedSearch.findOneAndUpdate(
      { _id: req.params.id, user: req.user._id },
      {
        $set: updateDoc,
      },
      { new: true }
    );
    if (!updated) return res.status(404).json({ message: "Saved search not found" });
    res.json({ message: "Saved search updated", search: updated });
  } catch (err) {
    console.log("Update saved search error:", err.message);
    res.status(500).json({ message: "Server error" });
  }
};

export { createSavedSearch, listSavedSearches, deleteSavedSearch, updateSavedSearch };
