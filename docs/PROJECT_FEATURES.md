# AafnoGhar Feature Catalog

This document captures the capabilities built into the AafnoGhar Room Management System as reflected across the front-end, API, automation scripts, and supporting documentation.

---

## 1. Architecture overview

- **client/** – Vite + React UI that serves tenant, owner, and admin experiences; exposes dashboards, room discovery, payments, KYC, and notification workflows.
- **server/** – Express/Mongo API powering auth, rooms, requests, agreements, exits, payments, fraud scoring, and document generation.
- **docs/** – Operational references such as smoke-test procedures and the location-matching algorithm (HTML/Markdown versions).
- **scripts/** – Shell helpers (e.g., `smoke-test.sh`) that exercise critical flows for continuous validation.

---

## 2. Front-end feature surface (`client/`)

### Common capabilities
- Global toast notifications, localization (`client/src/i18n`), and reusable components such as modals, badge pills, and the newly added `BackButton`.
- Responsive layout/styling defined in `client/src/styles.css` to support dashboards, forms, and map cards on mobile.

### Tenant-focused flows
- Room discovery (`Rooms.jsx`), detail view with gallery, pin-able owner location, nearby place lists, and map zoom controls (client/src/pages/RoomDetails.jsx).
- Request and offer modals (send request, make offer) plus rent payment flow (`PayRent.jsx`) that handles daily rent, unpaid penalties, and proration logic.
- Exit/settlement (`TenantExits.jsx`) that surfaces unpaid rent, settlement requests, and delete/cleanup safeguards.
- KYC submission and history pages (`KycSubmit.jsx`, `KycHistory.jsx`) with admin-verified details, photo preview, delete options, and update guard (ensure fields changed before submit).

### Owner-focused flows
- Owner dashboard with room/tenant snapshots, request approvals, exit forms, and ability to add/update KYC details (`OwnerKyc.jsx`, `OwnerExits.jsx`).
- Room posting UI with auto‑verify toggle, location pinning, room status (published/unpublished), and aggregated review/rating summary submitted after exit.
- Per-card UI polish (blue accent, consistent avatar/role rendering) and mobile fixes for hover/menu/notification alignment.
- Delete logic scoped so owners can only remove owner-specific data while tenants can only delete their own data after settlements.

### Admin experience
- Admin dashboard and users list (`AdminDashboard.jsx`, `AdminUsers.jsx`) with KYC approvals, verification history, and monitoring of rooms posted by each user.
- Admin KYC area (`AdminKyc.jsx`) supports document preview with a close icon, verified/pending tabs, refresh button for cards, and a toggle to enable/disable automated fraud detection.
- Fraud monitoring includes aggregated stats, ability to inspect suspicious rooms, and the prompt to unpublish/mute a listing when flagged.

---

## 3. API & backend features (`server/`)

### Core domain controllers
- `auth.controller`, `user.controller` – JWT-based authentication, role-aware guards, admin/owner/tenant profile updates.
- `room.controller`, `request.controller`, `offer.controller`, `agreement.controller` – CRUD rooms, owner requests, tenant offers, agreement generation (including PDF stamping `agreementPdf.controller` with `pdfStamp` utilities).
- `payment.controller`, `esewa.controller`, `khalti.controller` – Multi‑gateway support (Esewa, Khalti, internal invoices) with helpers for cleanup (`cleanup:test`) and prorated first-month rent calculations.
- `exit.controller`, `electricity.controller`, `complaint.controller` – Exit workflows, utilities billing, and tenant/owner complaints tied into settlements.

### Supporting services
- `fraud.service` and `autoFraud.service` – Heuristic scoring that considers posting frequency, owner reputation, and content rules; feature-flag toggle via `featureFlag.service` controls automatic room unpublishing.
- `notify.service` – Push/notification pipeline used by payment, agreement, and request workstreams.
- `geo.controller`, `ml.controller` – Supporting location-based experiences (room-to-nearby matching, pricing suggestions, map pin generation).
- `notification.controller`, `stats.controller`, `rule.controller` – Admin auditing, dashboard KPIs, configurable business rules.
- `kyc.controller` – Multi-role KYC with document upload, verification status, and revision tracking.

### Infrastructure helpers
- `server/src/models` – Mongo schemas for rooms, users, requests, features (`FeatureFlag`), etc.
- `server/src/utils/exitPaymentGuard.js` – Ensures pending balances and paperwork are handled before exits proceed.
- `server/src/utils/pdfStamp.js` – Branded stamp rendering for agreements and payment receipts.
- `server/uploads/` – File store for avatars, KYC docs, signatures, and uploaded room media; deletion logic tied to room/user removal.
- Additional controllers (ML, price suggestion) feed into UI hints for suggested rent/nearby insights.

---

## 4. Automation & documentation

- `scripts/smoke-test.sh` – CLI script that exercises users, offers, agreements, payments, and cleanup flows; mirrored by `.github/workflows/smoke-test.yml`.
- `docs/location-*.md/html` – Detailed explanation of the location algorithm and diagram used for pin assignment.
- `.env` templates (e.g., `server/.env`) specify Mongo connection, mailer, and payment secrets that must remain in sync with local/dev environments.

---

## 5. Key notes for maintainers

- Multiple `package.json`/`package-lock.json` files exist because the repo hosts a root workspace plus independent `client/` and `server/` apps—run `npm install` at each layer.
- Deletion operations now cascade to uploaded assets (room PDFs, avatars, signatures) to keep storage clean.
- Session TTL is configurable via `JWT_TTL` in `server/.env` (default `7d`), giving you control over how long login tokens remain valid.
- Back/refresh UI components (e.g., `BackButton`, `AdminUsers` refresh) were enhanced for consistency; mobile layouts align notification indicators and menu interactions.
- Fraud detection is layered: manual review by admin plus an optional auto-unpublish feature flag for rooms flagged via heuristics.

---

Feel free to build upon this catalog to onboard new contributors, outline release notes, or update your product documentation.
