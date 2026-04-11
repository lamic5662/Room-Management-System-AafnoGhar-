import Payment from "../models/payment.js";
import ElectricityBill from "../models/ElectricityBill.js";
import LateCharge from "../models/LateCharge.js";

export const isValidPeriod = (p) => /^\d{4}-(0[1-9]|1[0-2])$/.test(p);

const daysInMonth = (d) => new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();

const toDate = (v) => {
    if (!v) return null;
    const d = new Date(v);
    return Number.isNaN(d.getTime()) ? null : d;
};

const addDays = (d, n) => {
    const next = new Date(d);
    next.setDate(next.getDate() + n);
    return next;
};

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

    const rentPerDayRaw = daysInMonth ? rentAmount / daysInMonth : 0;
    const rentPerDay = Number(rentPerDayRaw.toFixed(2));
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
            proratedRent = Number((rentPerDayRaw * daysRemaining).toFixed(2));
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
        rentPerDay,
        daysInMonth,
        daysCharged: isProratedFirstMonth ? Math.max(0, daysInMonth - (startDate?.getDate() - 1 || 0)) : daysInMonth,
        startDate,
        period,
    };
}

export async function getExitUnpaid({ agreement, moveOutDate, tenantId }) {
    const start = toDate(agreement?.startDate || agreement?.createdAt);
    const end = toDate(moveOutDate);
    const rentAmount = Number(agreement?.monthlyRent || 0);
    const securityDeposit = Number(agreement?.securityDeposit || 0);
    if (!start || !end || !Number.isFinite(rentAmount) || rentAmount <= 0) {
        return {
            expectedRent: 0,
            paidRent: 0,
            unpaidRent: 0,
            depositPaid: 0,
            electricityAmount: 0,
            electricityBill: null,
            totalDue: 0,
            totalDays: 0,
            avgRentPerDay: 0,
            startDate: start,
            moveOutDate: end,
        };
    }

    let total = 0;
    let days = 0;
    for (let d = new Date(start); d <= end; d = addDays(d, 1)) {
        const perDay = rentAmount / daysInMonth(d);
        total += perDay;
        days += 1;
    }
    total = Number(total.toFixed(2));

    const exitPeriod = `${end.getFullYear()}-${String(end.getMonth() + 1).padStart(2, "0")}`;
    const paid = await Payment.aggregate([
        {
            $match: {
                agreement: agreement._id,
                tenant: tenantId,
                status: "confirmed",
                rentAmount: { $gt: 0 },
                period: { $lte: exitPeriod },
            },
        },
        { $group: { _id: null, total: { $sum: "$rentAmount" } } },
    ]);
    const paidRent = Number((paid?.[0]?.total || 0).toFixed(2));
    const unpaidRent = Number(Math.max(0, total - paidRent).toFixed(2));
    const avgRentPerDay = days > 0 ? Number((total / days).toFixed(2)) : 0;
    const depositPaid = Number(Math.max(0, Math.min(securityDeposit, paidRent)).toFixed(2));

    const period = `${end.getFullYear()}-${String(end.getMonth() + 1).padStart(2, "0")}`;
    const bill = await ElectricityBill.findOne({
        agreement: agreement._id,
        period,
        status: "pending",
    });
    const electricityAmount = Number(bill?.amount || 0);
    const totalDue = Number((unpaidRent + electricityAmount).toFixed(2));

    return {
        expectedRent: total,
        paidRent,
        unpaidRent,
        depositPaid,
        electricityAmount,
        electricityBill: bill || null,
        totalDue,
        totalDays: days,
        avgRentPerDay,
        startDate: start,
        moveOutDate: end,
    };
}
