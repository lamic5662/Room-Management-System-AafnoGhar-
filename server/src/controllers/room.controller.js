import jwt from "jsonwebtoken";
import fs from "fs";
import path from "path";
import axios from "axios";
import Room from "../models/Room.js";
import User from "../models/User.js";
import Request from "../models/Request.js";
import Agreement from "../models/Agreement.js";
import Payment from "../models/payment.js";
import Complaint from "../models/Complaint.js";
import ExitRequest from "../models/ExitRequest.js";
import Offer from "../models/Offer.js";
import Rule from "../models/Rule.js";
import { evaluateRoomFraud } from "../services/fraud.service.js";

const normalizePhotoPath = (p) => {
    if (!p) return p;
    if (p.startsWith("http")) return p;
    const idx = p.indexOf("/uploads/");
    if (idx >= 0) return p.slice(idx);
    const idx2 = p.indexOf("uploads/");
    if (idx2 >= 0) return `/${p.slice(idx2)}`;
    return p;
};

// Owner: create room
const createRoom = async (req, res) => {
    try {
        const {
            title,
            location,
            monthlyRent,
            rooms,
            bathrooms,
            facilities,
            photos,
            isPublished,
            description,
            roomType,
            lat,
            lng,
            latitude,
            longitude,
            geo,
            nearby,
        } = req.body || {};

        if (!title || !location || monthlyRent === undefined) {
            return res.status(400).json({ message: "title, location, monthlyRent are required" });
        }

        const rentNum = Number(monthlyRent);
        if (!Number.isFinite(rentNum) || rentNum < 0) {
            return res.status(400).json({ message: "monthlyRent must be a valid number" });
        }

        const roomsNum = rooms === undefined || rooms === null ? 1 : Number(rooms);
        const bathroomsNum = bathrooms === undefined || bathrooms === null ? 1 : Number(bathrooms);
        if (!Number.isFinite(roomsNum) || roomsNum < 0) {
            return res.status(400).json({ message: "rooms must be a valid number" });
        }
        if (!Number.isFinite(bathroomsNum) || bathroomsNum < 0) {
            return res.status(400).json({ message: "bathrooms must be a valid number" });
        }

        const canPublish = req.user?.role === "owner" && req.user?.kyc?.status === "approved";
        const publishFlag = canPublish && isPublished === true;

        const latVal = geo?.lat ?? lat ?? latitude;
        const lngVal = geo?.lng ?? lng ?? longitude;
        const geoVal =
            Number.isFinite(Number(latVal)) && Number.isFinite(Number(lngVal))
                ? { lat: Number(latVal), lng: Number(lngVal) }
                : undefined;

        const nearbyVal = nearby && typeof nearby === "object"
            ? {
                hospitals: Array.isArray(nearby.hospitals) ? nearby.hospitals.map(String).slice(0, 8) : [],
                colleges: Array.isArray(nearby.colleges) ? nearby.colleges.map(String).slice(0, 8) : [],
                busStops: Array.isArray(nearby.busStops) ? nearby.busStops.map(String).slice(0, 8) : [],
                markets: Array.isArray(nearby.markets) ? nearby.markets.map(String).slice(0, 8) : [],
            }
            : undefined;

        // Prevent accidental double-submit (same owner + same core fields within 10s)
        const tenSecondsAgo = new Date(Date.now() - 10 * 1000);
        const existing = await Room.findOne({
            owner: req.user._id,
            title,
            location,
            monthlyRent: rentNum,
            roomType: roomType || "1BHK",
            rooms: roomsNum,
            bathrooms: bathroomsNum,
            createdAt: { $gte: tenSecondsAgo },
        }).sort({ createdAt: -1 });

        if (existing) {
            return res.status(200).json({ message: "Room already created", room: existing });
        }

        const roomDoc = await Room.create({
            owner: req.user._id,
            title,
            location,
            monthlyRent: rentNum,
            roomType: roomType || "1BHK",
            rooms: roomsNum,
            bathrooms: bathroomsNum,
            description: description || "",
            facilities: facilities || {},
            photos: photos || [],
            isPublished: publishFlag,
            ...(geoVal ? { geo: geoVal } : {}),
            ...(nearbyVal ? { nearby: nearbyVal } : {}),
        });

        const { score, flags, isFlagged } = await evaluateRoomFraud(roomDoc);
        roomDoc.fraudScore = score;
        roomDoc.fraudFlags = flags;
        roomDoc.isFlagged = isFlagged;
        await roomDoc.save();

        res.status(201).json({ message: "Room created", room: roomDoc });
    } catch (err) {
        console.log("Create room error:", err.message);
        res.status(500).json({ message: "Server error" });
    }
};

// Public: list rooms with search/filter/sort
const listRooms = async (req, res) => {
    try {
        const {
            search = "",
            minRent,
            maxRent,
            wifi,
            parking,
            waterSupply,
            electricityBackup,
            kitchen,
            furnished,
            roomType,
            sort = "newest",
            page = "1",
            limit = "12",
        } = req.query;

        const q = { isPublished: true };

        const andFilters = [];

        if (search) {
            andFilters.push({
                $or: [
                    { title: { $regex: search, $options: "i" } },
                    { location: { $regex: search, $options: "i" } },
                ],
            });
        }

        if (minRent || maxRent) {
            q.monthlyRent = {};
            if (minRent !== undefined && minRent !== "") {
                const minNum = Number(minRent);
                if (!Number.isFinite(minNum)) {
                    return res.status(400).json({ message: "minRent must be a valid number" });
                }
                q.monthlyRent.$gte = minNum;
            }
            if (maxRent !== undefined && maxRent !== "") {
                const maxNum = Number(maxRent);
                if (!Number.isFinite(maxNum)) {
                    return res.status(400).json({ message: "maxRent must be a valid number" });
                }
                q.monthlyRent.$lte = maxNum;
            }
        }

        if (wifi === "true") q["facilities.wifi"] = true;
        if (parking === "true") q["facilities.parking"] = true;
        if (waterSupply === "true") q["facilities.waterSupply"] = true;
        if (electricityBackup === "true") q["facilities.electricityBackup"] = true;
        if (kitchen === "true") q["facilities.kitchen"] = true;
        if (furnished === "true") q["facilities.furnished"] = true;

        if (roomType) {
            if (roomType === "1BHK") {
                // allow legacy rooms without roomType to match default 1BHK
                andFilters.push({
                    $or: [{ roomType }, { roomType: { $exists: false } }],
                });
            } else {
                andFilters.push({ roomType });
            }
        }

        if (andFilters.length) {
            q.$and = andFilters;
        }

        let sortObj = { createdAt: -1 };
        if (sort === "price_asc") sortObj = { monthlyRent: 1 };
        if (sort === "price_desc") sortObj = { monthlyRent: -1 };

        const pageNum = Math.max(1, Number(page) || 1);
        const limitNum = Math.min(60, Math.max(1, Number(limit) || 12));
        const skip = (pageNum - 1) * limitNum;

        const total = await Room.countDocuments(q);

        const rooms = await Room.find(q)
            .sort(sortObj)
            .skip(skip)
            .limit(limitNum)
            .populate("owner", "fullName kyc");
        const result = rooms.map((r) => {
            const obj = r.toObject();
            obj.isVerifiedOwner = obj.owner?.kyc?.status === "approved";
            obj.photos = (obj.photos || []).map(normalizePhotoPath);
            return obj;
        });
        res.json({
            count: result.length,
            total,
            page: pageNum,
            limit: limitNum,
            pages: Math.ceil(total / limitNum),
            rooms: result,
        });
    } catch (err) {
        res.status(500).json({ message: "Server error" });
    }
};

const getRoomById = async (req, res) => {
    try {
        const room = await Room.findById(req.params.id).populate("owner", "fullName phone email");
        if (!room) return res.status(404).json({ message: "Room not found" });

        if (!room.isPublished) {
            let viewer = null;
            const header = req.headers.authorization;
            if (header && header.startsWith("Bearer ")) {
                try {
                    const token = header.split(" ")[1];
                    const decoded = jwt.verify(token, process.env.JWT_SECRET);
                    viewer = await User.findById(decoded.id).select("_id role");
                } catch {
                    viewer = null;
                }
            }

            const isOwner = viewer && String(room.owner?._id || room.owner) === String(viewer._id);
            const isAdmin = viewer && viewer.role === "admin";
            if (!isOwner && !isAdmin) {
                return res.status(404).json({ message: "Room not found" });
            }
        }

        const obj = room.toObject();
        obj.photos = (obj.photos || []).map(normalizePhotoPath);
        res.json({ room: obj });
    } catch (err) {
        res.status(500).json({ message: "Server error" });
    }
};

const featuredRooms = async (req, res) => {
    try {
        const rooms = await Room.find({ isPublished: true })
            .sort({ createdAt: -1 })
            .limit(6)
            .populate("owner", "fullName kyc");

        const result = rooms.map((r) => {
            const obj = r.toObject();
            obj.isVerifiedOwner = obj.owner?.kyc?.status === "approved";
            obj.photos = (obj.photos || []).map(normalizePhotoPath);
            return obj;
        });

        res.json({ count: result.length, rooms: result });
    } catch (err) {
        res.status(500).json({ message: "Server error" });
    }
};

const myRooms = async (req, res) => {
    try {
        if (req.user.role !== "owner") {
            return res.status(403).json({ message: "Owner access only" });
        }
        const rooms = await Room.find({ owner: req.user._id }).sort({ createdAt: -1 });
        const result = rooms.map((r) => {
            const obj = r.toObject();
            obj.photos = (obj.photos || []).map(normalizePhotoPath);
            return obj;
        });
        res.json({ count: result.length, rooms: result });
    } catch (err) {
        res.status(500).json({ message: "Server error" });
    }
};

const uploadPhotos = async (req, res) => {
    try {
        if (req.user.role !== "owner") {
            return res.status(403).json({ message: "Owner access only" });
        }

        const room = await Room.findById(req.params.id);
        if (!room) return res.status(404).json({ message: "Room not found" });
        if (String(room.owner) !== String(req.user._id)) {
            return res.status(403).json({ message: "Not your room" });
        }

        const files = req.files || [];
        if (!files.length) return res.status(400).json({ message: "No photos uploaded" });

        const paths = files.map((f) => `/uploads/rooms/${f.filename}`);
        room.photos = [...room.photos, ...paths].slice(0, 5);
        await room.save();

        const { score, flags, isFlagged } = await evaluateRoomFraud(room);
        room.fraudScore = score;
        room.fraudFlags = flags;
        room.isFlagged = isFlagged;
        await room.save();

        res.json({ message: "Photos uploaded", photos: room.photos, room });
    } catch (err) {
        res.status(500).json({ message: "Server error" });
    }
};

const updateRoom = async (req, res) => {
    try {
        if (req.user.role !== "owner") {
            return res.status(403).json({ message: "Owner access only" });
        }

        const room = await Room.findById(req.params.id);
        if (!room) return res.status(404).json({ message: "Room not found" });

        if (String(room.owner) !== String(req.user._id)) {
            return res.status(403).json({ message: "Not your room" });
        }

        const {
            title,
            location,
            roomType,
            monthlyRent,
            rooms,
            bathrooms,
            description,
            facilities,
            isPublished,
            lat,
            lng,
            latitude,
            longitude,
            geo,
            nearby,
        } = req.body;

        if (title !== undefined) room.title = title;
        if (location !== undefined) room.location = location;
        if (roomType !== undefined) room.roomType = roomType;
        if (monthlyRent !== undefined) {
            const rentNum = Number(monthlyRent);
            if (!Number.isFinite(rentNum) || rentNum < 0) {
                return res.status(400).json({ message: "monthlyRent must be a valid number" });
            }
            room.monthlyRent = rentNum;
        }
        if (rooms !== undefined) {
            const roomsNum = Number(rooms);
            if (!Number.isFinite(roomsNum) || roomsNum < 0) {
                return res.status(400).json({ message: "rooms must be a valid number" });
            }
            room.rooms = roomsNum;
        }
        if (bathrooms !== undefined) {
            const bathroomsNum = Number(bathrooms);
            if (!Number.isFinite(bathroomsNum) || bathroomsNum < 0) {
                return res.status(400).json({ message: "bathrooms must be a valid number" });
            }
            room.bathrooms = bathroomsNum;
        }
        if (description !== undefined) room.description = description;
        if (facilities !== undefined) room.facilities = facilities;
        if (nearby !== undefined && nearby && typeof nearby === "object") {
            room.nearby = {
                hospitals: Array.isArray(nearby.hospitals) ? nearby.hospitals.map(String).slice(0, 8) : [],
                colleges: Array.isArray(nearby.colleges) ? nearby.colleges.map(String).slice(0, 8) : [],
                busStops: Array.isArray(nearby.busStops) ? nearby.busStops.map(String).slice(0, 8) : [],
                markets: Array.isArray(nearby.markets) ? nearby.markets.map(String).slice(0, 8) : [],
            };
        }
        const latVal = geo?.lat ?? lat ?? latitude;
        const lngVal = geo?.lng ?? lng ?? longitude;
        if (latVal !== undefined && lngVal !== undefined) {
            const latNum = Number(latVal);
            const lngNum = Number(lngVal);
            if (Number.isFinite(latNum) && Number.isFinite(lngNum)) {
                room.geo = { lat: latNum, lng: lngNum };
            }
        }
        if (isPublished !== undefined) {
            const canPublish = req.user?.role === "owner" && req.user?.kyc?.status === "approved";
            if (isPublished === true && !canPublish) {
                return res.status(403).json({ message: "KYC not verified. Please complete KYC to publish rooms." });
            }
            room.isPublished = isPublished;
        }

        await room.save();

        const { score, flags, isFlagged } = await evaluateRoomFraud(room);
        room.fraudScore = score;
        room.fraudFlags = flags;
        room.isFlagged = isFlagged;
        await room.save();

        res.json({ message: "Room updated", room });
    } catch (err) {
        res.status(500).json({ message: "Server error" });
    }
};

// OWNER: publish room (requires verified KYC via middleware)
const publishRoom = async (req, res) => {
    try {
        const room = await Room.findOne({ _id: req.params.id, owner: req.user._id });
        if (!room) return res.status(404).json({ message: "Room not found" });

        if (room.requiresImprovement) {
            return res.status(400).json({ message: "Room pending admin approval" });
        }

        room.isPublished = true;
        await room.save();

        res.json({ message: "Room published", room });
    } catch (err) {
        res.status(500).json({ message: "Server error" });
    }
};

// OWNER: unpublish room
const unpublishRoom = async (req, res) => {
    try {
        const room = await Room.findOne({ _id: req.params.id, owner: req.user._id });
        if (!room) return res.status(404).json({ message: "Room not found" });

        room.isPublished = false;
        await room.save();

        res.json({ message: "Room unpublished", room });
    } catch (err) {
        res.status(500).json({ message: "Server error" });
    }
};

const deleteRoomPhoto = async (req, res) => {
    try {
        if (req.user.role !== "owner") {
            return res.status(403).json({ message: "Owner access only" });
        }

        const room = await Room.findById(req.params.id);
        if (!room) return res.status(404).json({ message: "Room not found" });
        if (String(room.owner) !== String(req.user._id)) {
            return res.status(403).json({ message: "Not your room" });
        }

        const { photoUrl } = req.body;
        if (!photoUrl) return res.status(400).json({ message: "photoUrl required" });

        room.photos = (room.photos || []).filter((p) => p !== photoUrl);
        await room.save();

        const { score, flags, isFlagged } = await evaluateRoomFraud(room);
        room.fraudScore = score;
        room.fraudFlags = flags;
        room.isFlagged = isFlagged;
        await room.save();

        res.json({ message: "Photo removed", photos: room.photos, room });
    } catch (err) {
        res.status(500).json({ message: "Server error" });
    }
};

const safeUnlink = (p) => {
    if (!p) return;
    const uploadsRoot = path.join(process.cwd(), "uploads");
    let rel = "";

    if (p.startsWith("http://") || p.startsWith("https://")) return;

    if (path.isAbsolute(p)) {
        if (p.includes(`${path.sep}uploads${path.sep}`) || p.includes("/uploads/")) {
            const idx = p.lastIndexOf(`${path.sep}uploads${path.sep}`);
            const idx2 = p.lastIndexOf("/uploads/");
            const cut = idx >= 0 ? idx + 1 : idx2 + 1;
            rel = p.slice(cut);
        } else {
            return;
        }
    } else if (p.startsWith("/uploads/")) {
        rel = p.slice(1);
    } else if (p.startsWith("uploads/")) {
        rel = p;
    } else if (p.includes("uploads/")) {
        rel = p.slice(p.indexOf("uploads/"));
    } else {
        return;
    }

    const full = path.normalize(path.join(process.cwd(), rel));
    if (!full.startsWith(uploadsRoot)) return;
    fs.unlink(full, () => {});
};

const cleanupRoomResources = async (room) => {
    const photos = room.photos || [];
    photos.forEach((p) => safeUnlink(p));

    await Promise.all([
        Request.deleteMany({ room: room._id }),
        Agreement.deleteMany({ room: room._id }),
        Payment.deleteMany({ room: room._id }),
        Complaint.deleteMany({ room: room._id }),
        ExitRequest.deleteMany({ room: room._id }),
        Offer.deleteMany({ room: room._id }),
        Rule.deleteMany({ room: room._id }),
    ]);

    await Room.deleteOne({ _id: room._id });
};

const deleteRoom = async (req, res) => {
    try {
        if (req.user.role !== "owner") {
            return res.status(403).json({ message: "Owner access only" });
        }

        const room = await Room.findById(req.params.id);
        if (!room) return res.status(404).json({ message: "Room not found" });
        if (String(room.owner) !== String(req.user._id)) {
            return res.status(403).json({ message: "Not your room" });
        }

        await cleanupRoomResources(room);

        res.json({ message: "Room deleted" });
    } catch (err) {
        res.status(500).json({ message: "Server error" });
    }
};

const haversineMeters = (lat1, lon1, lat2, lon2) => {
    const toRad = (v) => (v * Math.PI) / 180;
    const R = 6371e3;
    const dLat = toRad(lat2 - lat1);
    const dLon = toRad(lon2 - lon1);
    const a =
        Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
        Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
};

const nearbyPlaces = async (req, res) => {
    try {
        const room = await Room.findById(req.params.id).select("geo location");
        if (!room) return res.status(404).json({ message: "Room not found" });
        if (!room.geo?.lat || !room.geo?.lng) {
            return res.json({ hospitals: [], colleges: [], busStops: [], message: "No coordinates for this room" });
        }

        const radius = Number(req.query.radius || 1200);
        const lat = room.geo.lat;
        const lng = room.geo.lng;

        const query = `
[out:json];
(
  node(around:${radius},${lat},${lng})["amenity"="hospital"];
  node(around:${radius},${lat},${lng})["amenity"="college"];
  node(around:${radius},${lat},${lng})["amenity"="university"];
  node(around:${radius},${lat},${lng})["highway"="bus_stop"];
  node(around:${radius},${lat},${lng})["public_transport"="platform"];
  node(around:${radius},${lat},${lng})["amenity"="marketplace"];
  node(around:${radius},${lat},${lng})["shop"="supermarket"];
);
out tags center 60;
`;

        const resp = await axios.post("https://overpass-api.de/api/interpreter", query, {
            headers: { "Content-Type": "text/plain" },
            timeout: 15000,
        });

        const elements = resp.data?.elements || [];
        const hospitals = [];
        const colleges = [];
        const busStops = [];
        const markets = [];

        for (const el of elements) {
            const name = el.tags?.name || "Unnamed";
            const lat2 = el.lat ?? el.center?.lat;
            const lng2 = el.lon ?? el.center?.lon;
            const dist = (lat2 && lng2) ? Math.round(haversineMeters(lat, lng, lat2, lng2)) : null;

            const payload = { name, distance: dist, lat: lat2, lng: lng2 };
            if (el.tags?.amenity === "hospital") hospitals.push(payload);
            else if (el.tags?.amenity === "college" || el.tags?.amenity === "university") colleges.push(payload);
            else if (el.tags?.highway === "bus_stop" || el.tags?.public_transport === "platform") busStops.push(payload);
            else if (el.tags?.amenity === "marketplace" || el.tags?.shop === "supermarket") markets.push(payload);
        }

        res.json({
            hospitals: hospitals.slice(0, 6),
            colleges: colleges.slice(0, 6),
            busStops: busStops.slice(0, 6),
            markets: markets.slice(0, 6),
        });
    } catch (err) {
        res.status(500).json({ message: "Server error" });
    }
};

export {
    createRoom,
    listRooms,
    getRoomById,
    featuredRooms,
    myRooms,
    uploadPhotos,
    updateRoom,
    deleteRoomPhoto,
    publishRoom,
    unpublishRoom,
    deleteRoom,
    nearbyPlaces,
    cleanupRoomResources,
};
