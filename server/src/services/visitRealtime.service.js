import Visit from "../models/Visit.js";
import { emitToUser } from "../socket.js";

const populateVisit = async (visit) => {
  if (!visit) return null;
  if (typeof visit.populate === "function") {
    await visit.populate("room", "title location monthlyRent photos");
    await visit.populate("tenant", "fullName phone email");
    await visit.populate("owner", "fullName phone email");
    return visit;
  }
  const doc = await Visit.findById(visit?._id || visit)
    .populate("room", "title location monthlyRent photos")
    .populate("tenant", "fullName phone email")
    .populate("owner", "fullName phone email");
  return doc;
};

const emitVisitUpdate = async (visit, action = "updated") => {
  const doc = await populateVisit(visit);
  if (!doc) return;
  const payload = { action, visit: doc };
  const tenantId = doc.tenant?._id || doc.tenant;
  const ownerId = doc.owner?._id || doc.owner;
  if (tenantId) emitToUser(String(tenantId), "visit:updated", payload);
  if (ownerId) emitToUser(String(ownerId), "visit:updated", payload);
};

const emitVisitDeletesByRoom = async (roomId) => {
  const visits = await Visit.find({ room: roomId });
  for (const v of visits) {
    await emitVisitUpdate(v, "deleted");
  }
};

export { emitVisitUpdate, emitVisitDeletesByRoom };
