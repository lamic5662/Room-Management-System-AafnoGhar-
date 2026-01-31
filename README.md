# AafnoGhar MERN Room Management System

This repository hosts the full AafnoGhar platform: a React/Vite frontend, an Express/Mongo backend, automation scripts, and supporting documentation (smoke test, fraud heuristics, PDF utilities, etc.).

## Key components

- `client/` – Vite + React UI with tenant/owner/admin dashboards, notification hooks, agreement and payment flows.
- `server/` – Express API with authentication, room/offer/payment controllers, fraud/notification services, PDF generation, and Mongo models.
- `docs/` – Smoke test instructions and architecture notes.
- `scripts/` – CI-friendly shell helpers such as `smoke-test.sh`.

## Local development

1. Install dependencies:
   - `npm install` at repo root (if needed, mostly for shared tools).
   - `npm install` inside `client/` and `server/`.
2. Provide a MongoDB connection string (e.g., via `.env` files used by `server`).
3. Start the server: `npm run dev` inside `server/`.
4. Start the frontend: `npm run dev` inside `client/`.
5. Visit `http://localhost:5173` (default Vite port) to interact with the UI once the API is running.

## Testing & utilities

- `scripts/smoke-test.sh` exercises the full workflow (users, offers, agreements, payments). Run it from the repo root after the server is up.
- The GitHub Actions workflow `.github/workflows/smoke-test.yml` mirrors the smoke script for automated validation.

## Notable features

- Fraud scoring integrates owner reputation, title validation, and posting frequency to flag suspicious listings.
- Agreement/payment flows now handle prorated first-month rent plus carry-over credit automatically.
- PDF exports include branded stamps for agreements and bills.

## Contribution tips

- Keep the timeline consistent with `server/.env` secrets (Mongo URI, mailer).
- When adding features, update the smoke script and documentation so the CI workflow remains reliable.

