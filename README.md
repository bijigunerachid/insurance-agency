# Insurance agency management system

Offline-first management application for one insurance agency in Morocco working with
**RMA Assurance** and **CAT Assurance & Réassurance**. It runs on a single server on the office LAN;
employees use it from a browser. Daily work does not need the Internet.

**Status:** Phase 9 started — a simpler app for daily work (owner, 24/10/2026: "easy to read and work, not like old
Excel"): the "Aujourd'hui" home page (scan button, one search box for name, CIN, plate, policy or attestation number,
and a to-do list), a short menu (5 daily pages, the rest under "Plus"), contract pages that open on a summary
(who, until when, what is left to pay) with details and history folded, plain words; avenants on a running contract
(vehicle change, registration change), typed on the contract page or read from the RMA platform's "AVENANT DE
CHANGEMENT DE VEHICULE" PDF: the new attestation replaces the old one (its paper followed until it is back at the
agency), the replaced car is archived with its history, an old plate still finds its car, and the avenant's own
amount is added to what is left to pay; the insurer's own usages (the 42 of the RMA GAMA « Type d'usage » list,
each under the legal usage of its attestation) chosen on a vehicle or read from the platform PDF, and shown on the
vehicle, the contract, the catalogue and the report of contracts ending. Phase 8 — a scanned renewal filed as the next year of its contract (found by its vehicle: a
renewal always has a new policy number, never last year's nor another contract's); the PDF made by the RMA platform (to print on the pre-printed sheet) read
exactly from its text: attestation, policy, quittance, period, holder, vehicle and premiums; scanning an attestation:
the server reads it offline (tesseract.js, French
data bundled), the employee checks each value beside the scan, and one click records the customer, vehicle and
contract (or uses the existing ones), issues the contract, records the attestation and attaches the scan, so the
insurance is followed (renewal, payments); the reports of the agency (contracts expiring, payments per day and per
insurer, amounts owed to each insurer, customer balances to chase, the agency's cash roundings, attestation stock,
activity per employee) with CSV and Excel exports for
management after re-authentication; what a document prints typed beside its scan, compared with the customer, vehicle,
contract and attestation (identical, different, missing in the app, not on this contract), and the issued contract's
policy number, dates and premium corrected from it in one click (audited); scans of the documents printed by the RMA and CAT platforms (attestation, conditions
particulières, quittance, note de couverture) attached to contracts, opened from the contract page, replaced by a
clearer scan or removed by management with a reason; Phase 7 — remittances to RMA and CAT (what is owed per month of collection with the legal due
date, 15 days after the month, rule L5; late months on the home page; printable bordereau `VER-YYYY-NNNNN`;
cancellation by management with a reason); payments received at the agency (cash, cheque, transfer, card, other) with printable
receipts `REC-YYYY-NNNNN`, reversals by management with a reason, the balance of each contract and the daily list
per method; a home dashboard and renewals (issued contracts listed 30 days before their end,
followed by an employee, prepared as a new draft contract or closed as not renewed), contracts (draft → sent to the insurer → issued, suspension and termination by a
manager, status history, covered vehicles, attestations recorded with their series and number) and the blank
attestation stock (batches received per series, one record per form, assignment to employees, damaged / lost /
returned forms with a reason, append-only movement history; a paper attestation uses its form) on top of customers,
vehicles and fleets, the catalogue (insurers, shared attestation models, vehicle usages, per-insurer attestation series,
products, rules register), sign-in, two-step verification, user administration, audit log and system status. See
[docs/roadmap.md](docs/roadmap.md).

Contract and attestation numbers come from the insurer and are entered as printed, never generated (rules L15, L27).
A contract uses only a confirmed product; a definitive attestation must match the model of the vehicle's usage (L16);
a provisional one lasts one month at most (L23); a duplicate repeats the original's number (L26).

Nothing in the catalogue is invented: every entry carries its source, and products, attestation models, usages and series stay
"à confirmer" until a manager records the agency or insurer document that confirms them. The reference rows (RMA and
CAT; the national attestation models A–G and P from the agency's answers; four usages and the 42 RMA GAMA usages under them; sixteen series, RMA 14 and CAT 91
for each model (agency rule, 23/10/2026; six of them seen on the blank forms), each series linked to a model chosen in the catalogue; the 18 products the agency sells, for RMA and for CAT (Auto-écoles added by the owner on 29/10/2026; passenger transport with CAT only: owner, 28/10/2026; taxis and three-wheelers too: owner, 29/10/2026)
(owner, 23/10/2026); and the 57 rules of
[docs/insurer-rules.md](docs/insurer-rules.md)) are seeded by the database migration.

**A contract is known by the insurer's policy number** (owner, 05/11/2026): it is typed (or read from the platform sheet)
when the contract is recorded, shown first in every list, page, receipt, bordereau and report, and searched; the app's
own `CTR-…` reference stays internal (audit log, folded details). The platform gives a new policy number at every
renewal (owner, 05/11/2026): « Préparer le nouveau contrat » asks for it, and last year's is refused. The contracts
list filters by what the customer paid: « Rien payé », « Payé en partie » or « Payé ». The **état de production** lists
the contracts issued in a period (by date of issue or of effect, per insurer, employee and payment) with their totals,
printed A4 landscape or exported to Excel by management; an agent sees only the contracts they recorded. A **bell**
at the top of every page counts what is new and pops up what arrives while working: what a colleague recorded
(contract, payment, renewal step), renewals at 30, 15 and 7 days with who follows them and the last step, balances
owed more than 15 days, and for management late remittances and low stock; « Notifications » keeps the history.

The application is a helper: the agency works on the RMA and CAT official platforms, and this application keeps the
agency's own records and follow-up. It does not issue official insurer documents, calculate official
premiums, or connect to RMA, CAT or ACAPS systems.

## Stack

| Part | Technology |
|---|---|
| Frontend | React 19, Vite 8, JavaScript, Tailwind CSS 4, Heroicons, React Router 8 |
| Backend | Node.js 24 LTS, Express 5, Zod, pino, helmet, Argon2id (`argon2`) |
| Database | PostgreSQL 18 via Prisma 7 (driver adapter `pg`) |
| Tests | Vitest, Testing Library, Supertest, Playwright |

All versions are pinned exactly in the `package.json` files; the database image is pinned by digest.

## Development setup (Windows, PowerShell)

Prerequisites: Node.js 24, Docker Desktop, Git.

```powershell
npm install
npx playwright install chromium            # browser for end-to-end tests (first time only)

# 1. Environment files (never committed)
Copy-Item .env.example .env                # database container: choose a strong POSTGRES_PASSWORD
Copy-Item backend/.env.example backend/.env
Copy-Item backend/.env.example backend/.env.test
#   In both backend files set:
#   - DATABASE_URL: user app_runtime with its own strong password (16+ characters)
#   - MIGRATION_DATABASE_URL: the POSTGRES_USER / POSTGRES_PASSWORD from .env
#   - TOTP_ENCRYPTION_KEY: node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
#   In backend/.env.test also set: NODE_ENV=test, PORT=3100, database agency_test (both URLs),
#                                  APP_ORIGIN=http://127.0.0.1:4173
#   Optional, the agency using this installation (backend/.env; see "A new agency" below):
#   AGENCY_NAME, AGENCY_TAGLINE, AGENCY_ADDRESS, AGENCY_PHONE, AGENCY_FAX, AGENCY_EMAIL, AGENCY_ICE,
#   AGENCY_ACAPS_NUMBER, AGENCY_LEGAL_FORM, AGENCY_PATENTE, AGENCY_IF, AGENCY_RC, AGENCY_CNSS,
#   AGENCY_LOGO_FILE, AGENCY_ICON_FILE. Until they are set, receipts show a warning on screen.
#   INSURER_BRANDING_FILE: the insurers' cards after sign-in (see "A new agency", step 4).
#   DOCUMENTS_DIR: folder of the attached scans (default backend/storage/documents, git-ignored; an
#   absolute path in production, included in the backups). The API refuses to start if it cannot write there.

# 2. Database (listens on 127.0.0.1:55433 only)
npm run db:up
npm run db:roles -w backend                # creates the limited runtime role app_runtime
npm run db:migrate -w backend              # creates the tables (runs as the owner)

# 3. First administrator (interactive; the password is typed hidden)
npm run create-admin -w backend

# 3b. Confirm the reference catalogue (8 national models, 3 vehicle usages, RMA 14 / CAT 91 series, 29 products: the 5 RMA passenger-transport products stay inactive), once, in the name of
#     an administrator or manager. Already confirmed entries are left as they are.
npm run catalogue:confirm-reference -w backend

# 4. Run
npm run dev:backend                        # API on http://127.0.0.1:3000
npm run dev:frontend                       # open http://127.0.0.1:5173
```

At the first sign-in the administrator scans a QR code with an authenticator app (Google Authenticator,
Microsoft Authenticator, FreeOTP…); managers do the same. Agents can enable it from "Mon compte".
Stop the database with `npm run db:stop`. Do **not** use `docker compose down -v`: it deletes the database volume.

## Production

The agency's server (mini-PC, Ubuntu, Docker, offline): step-by-step guide in French in
[docs/deployment.md](docs/deployment.md): network, Ubuntu and Docker, clock, firewall, first installation,
first administrator, the HTTPS root certificate on each PC, updates from a USB key, what to do if one fails.
Files in `deployment/production/`; a release is built with `deployment/production/release.ps1`.
Backups (encrypted, every 5 minutes, two rotated disks) and restore: [docs/backup-restore.md](docs/backup-restore.md).

## A new agency

One installation per agency: its own computer or server, database, settings and logo. Nothing about
an agency is in the code, so giving the application to another agency is a new installation:

1. Follow the development or production setup above (new database, new secrets, first administrator).
2. In `backend/.env`, fill the `AGENCY_*` lines from the agency's letterhead: name, tagline, address,
   phones, e-mail, ICE (15 digits), agrément, legal form and capital, Patente, I.F, R.C, CNSS.
3. Put its logo (wide) and tab icon (square) outside the code, as PNG or JPEG of 1 MB at most, and give
   their full paths in `AGENCY_LOGO_FILE` and `AGENCY_ICON_FILE`. Never an insurer's logo (rules L2, L3).
4. The workspace cards after sign-in (one per active insurer of the catalogue, plus « both »): put a
   folder outside the code with `insurers.json` and its images, and give the file's full path in
   `INSURER_BRANDING_FILE`. Per insurer code (as in the catalogue): `title`, `tagline`, `colour`
   (`#272F65`), `logo` and `photo` (file names in the same folder, PNG or JPEG of 1 MB at most) and
   `photoCredit` (author and licence, shown on the card). Example:
   ```json
   {
     "RMA": { "title": "RMA Assurance", "tagline": "Royale Marocaine d'Assurance", "colour": "#272F65",
              "logo": "rma-logo.png", "photo": "rma-photo.jpg", "photoCredit": "Auteur, licence" },
     "CAT": { "title": "CAT Assurance & Réassurance", "tagline": "Transport de voyageurs",
              "colour": "#00877F", "logo": "cat-logo.png", "photo": "cat-photo.jpg",
              "photoCredit": "Auteur, licence" }
   }
   ```
   An insurer's logo only with **its written permission** and the files it supplies (never copied
   from its website); a photo only under a licence that allows it (bought, or Creative Commons /
   Unsplash), its author and licence in `photoCredit`. Without the file, each card shows the insurer's
   name in a neutral colour. A logo without a photo makes a card where the logo itself is the
   picture (white top, the insurer's colour below): photos are optional. Insurer logos appear on these screen cards only, never on a printed
   document (rules L2, L3).
5. Restart the API: it refuses to start, naming the setting, if the ICE, the e-mail, an image or the
   insurers' file is wrong.
6. Check the sign-in page (logo, tab title and icon), the workspace cards, and print a test receipt:
   one A4 sheet, two copies.

## Checks

```powershell
npm run check     # lint, format check, build, unit + integration tests, end-to-end tests, dependency audit
```

Details in [docs/testing.md](docs/testing.md).

## Documentation

| Document | Content |
|---|---|
| [docs/roadmap.md](docs/roadmap.md) | Phases, decisions, verification log |
| [docs/requirements.md](docs/requirements.md) | Requirements, questions for the agency, legal questions |
| [docs/insurer-rules.md](docs/insurer-rules.md) | Register of insurer and regulatory rules with sources and status |
| [docs/architecture.md](docs/architecture.md) | Components, code structure, key flows, hardware |
| [docs/security.md](docs/security.md) | Threat model, authentication, permissions, security checklist |
| [docs/network.md](docs/network.md) | LAN addresses, ports, firewall, HTTPS |
| [docs/data-model.md](docs/data-model.md) | Entities, database constraints, status machines |
| [docs/testing.md](docs/testing.md) | Test levels, how to run them, proof that they catch problems |
| [docs/design-system.md](docs/design-system.md) | The application's look: tokens (colours, type, radii), components, contrast, redesign stages |

Deployment, backup and operations instructions will be added in Phases 11 and 12.
