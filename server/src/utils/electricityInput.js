import ElectricityBill from "../models/ElectricityBill.js";

const parseElectricityInput = ({ electricityUnits, electricityUnitRate }) => {
  const hasUnits = electricityUnits !== undefined && electricityUnits !== null && electricityUnits !== "";
  const hasRate = electricityUnitRate !== undefined && electricityUnitRate !== null && electricityUnitRate !== "";
  const hasInput = hasUnits || hasRate;

  if (!hasInput) {
    return { hasInput: false, units: 0, rate: 0 };
  }

  const units = Number(electricityUnits);
  const rate = Number(electricityUnitRate);

  if (!Number.isFinite(units) || units <= 0) {
    throw new Error("Electricity units must be a valid number");
  }
  if (!Number.isFinite(rate) || rate <= 0) {
    throw new Error("Electricity unit rate must be a valid number");
  }

  return { hasInput: true, units, rate };
};

const createElectricityBillFromUnits = async ({ agreement, period, units, rate }) => {
  const last = await ElectricityBill.findOne({ agreement: agreement._id })
    .sort({ createdAt: -1 })
    .select("currentReading");
  const prev = Number(last?.currentReading || 0);
  const curr = prev + units;
  const amount = Math.round(units * rate);

  const bill = await ElectricityBill.create({
    agreement: agreement._id,
    room: agreement.room,
    owner: agreement.owner,
    tenant: agreement.tenant,
    period,
    previousReading: prev,
    currentReading: curr,
    unitsUsed: units,
    unitRate: rate,
    amount,
    note: "Tenant reported usage",
    status: "pending",
  });

  return { bill, amount };
};

export { parseElectricityInput, createElectricityBillFromUnits };
