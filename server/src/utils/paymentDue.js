import Payment from "../models/payment.js";
import ElectricityBill from "../models/ElectricityBill.js";
import LateCharge from "../models/LateCharge.js";

export const isValidPeriod = (p) => /^\d{4}-(0[1-9]|1[0-2])$/.test(p);

export async function getPeriodDue(agreement, period) {
    const rentAmount = Number(agreement?.monthlyRent || 0);

    const bill = await ElectricityBill.findOne({
        agreement: agreement._id,
        period,
        status: "pending",
    });
    const electricityAmount = bill ? Number(bill.amount || 0) : 0;

    const rentPaid = await Payment.findOne({
        agreement: agreement._id,
        period,
        rentAmount: { $gt: 0 },
        status: "confirmed",
    }).select("_id");

    const rentPending = await Payment.findOne({
        agreement: agreement._id,
        period,
        rentAmount: { $gt: 0 },
        status: "pending",
    }).select("_id");

    const [yearStr, monthStr] = period.split("-");
    const periodYear = Number(yearStr);
    const periodMonth = Number(monthStr) - 1;
    const daysInMonth = new Date(periodYear, periodMonth + 1, 0).getDate();
    const startDate = agreement.startDate ? new Date(agreement.startDate) : null;

    let proratedRent = rentAmount;
    let generatedCarryCredit = 0;
    let generatedCarryCreditPeriod = "";
    let isProratedFirstMonth = false;

    if (
        startDate &&
        !agreement.firstMonthProrated &&
        startDate.getFullYear() === periodYear &&
        startDate.getMonth() === periodMonth &&
        startDate.getDate() > 1
    ) {
        const daysRemaining = Math.max(0, daysInMonth - (startDate.getDate() - 1));
        if (daysRemaining < daysInMonth) {
            const rentPerDay = rentAmount / daysInMonth;
            proratedRent = Number((rentPerDay * daysRemaining).toFixed(2));
            generatedCarryCredit = Number((rentAmount - proratedRent).toFixed(2));
            const nextPeriodDate = new Date(periodYear, periodMonth + 1, 1);
            generatedCarryCreditPeriod = `${nextPeriodDate.getFullYear()}-${String(
                nextPeriodDate.getMonth() + 1
            ).padStart(2, "0")}`;
            isProratedFirstMonth = true;
        }
    }

    let carryCreditApplied = 0;
    const carryAvailable = Number(agreement.carryOverCredit || 0);
    if (carryAvailable > 0 && agreement.carryOverCreditPeriod === period) {
        carryCreditApplied = Math.min(carryAvailable, proratedRent);
        proratedRent = Math.max(0, proratedRent - carryCreditApplied);
    }

    const dueRent = rentPaid ? 0 : proratedRent;
    const dueElectricity = electricityAmount;
    const charges = await LateCharge.find({ agreement: agreement._id, period });
    const lateFee = charges.reduce((sum, c) => sum + Number(c.amount || 0), 0);
    const totalAmount = dueRent + dueElectricity + lateFee;

    return {
        rentAmount,
        electricityAmount,
        bill,
        lateFee,
        rentPaid: !!rentPaid,
        rentPending: !!rentPending,
        dueRent,
        dueElectricity,
        lateCharges: charges,
        totalAmount,
        proratedFirstMonth: isProratedFirstMonth,
        generatedCarryCredit,
        generatedCarryCreditPeriod,
        carryCreditApplied,
        carryCreditRemaining: Math.max(0, carryAvailable - carryCreditApplied),
        period,
    };
}
