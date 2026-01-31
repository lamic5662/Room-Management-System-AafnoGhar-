# Frontend Smoke Test Checklist

Use this quick checklist after changes to confirm UI flows.

## 1) Home
- Open `http://localhost:5173`
- Home loads with hero + featured rooms.

## 2) Register / Login
- Register as **Tenant** → redirected to `/rooms`.
- Register as **Owner** → redirected to `/owner/dashboard`.
- Logout and login works for both roles.

## 3) Owner KYC
- Go to `/owner/kyc`.
- Upload docs → status becomes **pending**.
- Admin approves → status becomes **approved**.

## 4) Owner Rooms
- Owner adds room → appears in **My Rooms**.
- Publish room → visible in Rooms list.
- Edit room → changes saved.

## 5) Tenant Requests
- Tenant opens room details and sends request.
- Owner sees incoming request and approves.

## 6) Agreements
- Owner creates agreement from request.
- Tenant sees agreement in their list.

## 7) Payments
- Tenant submits payment.
- Owner confirms payment.
- eSewa payment: choose method eSewa and ensure redirect + verify flow completes.

## 8) Complaints
- Tenant submits complaint (title + description).
- Owner resolves complaint with reply.

## 9) Exit Requests
- Tenant requests exit.
- Owner approves and settles.
- Agreement status ends.

## 10) Offers
- Tenant makes an offer on a room.
- Owner accepts/counters and creates agreement from offer.

## 11) Rules
- Owner creates a rule for a room.
- Tenant can view rules for their agreement.

## 12) Fraud Admin
- Admin can open flagged rooms and unflag/disable if needed.

## 13) Navigation
- Navbar shows correct links by role.
- Protected routes block unauthorized users.
