# Testing

All tests use synthetic data. Never put real customer data in tests, fixtures or screenshots.

## Test levels

| Level | Tool | Where | What it covers |
|---|---|---|---|
| Backend unit | Vitest + Supertest | `backend/test/unit/` | Config validation, logger redaction, HTTP behaviour with a stand-in database |
| Backend integration | Vitest + Supertest + **real PostgreSQL** | `backend/test/integration/` | Code paths that talk to the database (test database `agency_test`) |
| Frontend unit | Vitest + Testing Library + jsdom | `frontend/test/` | Pages and components, loading / error / empty states |
| End-to-end | Playwright (Chromium) | `e2e/` | Real backend + built frontend, at 1366px (desktop) and 390px (phone) |
| Production smoke | Playwright (Chromium) | `e2e-production/` | An installed server (rehearsal or the agency's): HTTPS, security headers, nothing loaded from outside, an agent signs in. `npm run test:production` with `PRODUCTION_URL`, `SMOKE_USERNAME`, `SMOKE_PASSWORD` (see `playwright.production.config.js`); not part of `npm run check` |
| Disaster drill | bash in a `docker:cli` container | `deployment/rehearsal/` | On a development computer with Docker Desktop: `powershell -File deployment/rehearsal/run-drill.ps1 -Release release\insurance-agency-<version>`. Fresh install from the release, key, disk A, a backup, a client and a document entered after it, then volumes, settings and images erased and restored as on a new server; fails unless the client, the agent, the document and the same HTTPS authority are back. Erases this computer's `insurance-agency` volumes (drill data only). Run before a release that touches the database or the scripts |

## Running

Prerequisites: Node.js 24, Docker Desktop running, the env files described in the README.

```powershell
npm run db:up            # start the development PostgreSQL (loopback only)
npm test                 # unit + integration
npm run test:e2e         # end-to-end (starts the backend and the built frontend itself)
npm run check            # everything: lint, format, build, tests, e2e, audit
```

The first time, download the Playwright browser: `npx playwright install chromium`.

## Safety rules built into the tests

- Integration tests refuse to run unless `NODE_ENV=test` and the URL points at the `agency_test` database
  (`backend/test/integration/setup.js`), so they can never touch development or production data.
- End-to-end tests block and record **every request to a non-local address**: the interface must work without Internet.
  They also fail on any browser console message and on horizontal scrolling.
- E2E screenshots are saved under `test-results/e2e/` (git-ignored) for the layout review at both widths.

## Proof that important tests work

A test that never fails proves nothing. For each important safeguard, the code it protects was broken on purpose,
the test was run and failed, then the code was restored and the test passed again.

| Safeguard | Deliberate break | Failing test | Date |
|---|---|---|---|
| CIN never written to logs | Removed `cin` from the redaction list | `logger.test.js` › removes passwords, tokens, CIN… | 22/10/2026 |
| No internal details in 500 responses | Returned `err.message` to the client | `app.test.js` › hides internal error details… | 22/10/2026 |
| Interface works offline | Added a Google Fonts stylesheet to `index.html` | `system-status.spec.js` › loads offline-safe… | 22/10/2026 |
| Permission checks | `authorize()` skipped the permission test | `auth.test.js` › denies a permission the role does not have | 22/10/2026 |
| CSRF protection | CSRF token check disabled | `auth.test.js` › requires the CSRF token… | 22/10/2026 |
| Second-factor codes cannot be replayed | Replay check in `verifyTotp` disabled | `totp.test.js` › refuses a code that was already used; `auth.test.js` › …refuses wrong and replayed codes | 22/10/2026 |

| Re-authentication before user administration | Guard removed from the routes | `users.test.js` › requires a recent re-authentication; …expires after five minutes | 22/10/2026 |
| No silent overwrite | Version condition removed from the update | `users.test.js` › refuses an update based on an outdated version | 22/10/2026 |
| Always one active administrator | Last-administrator check disabled; separately, only the row lock (`FOR UPDATE`) removed | `users.test.js` › locks the administrators while checking… (deterministic: both actions start before either commits; failed 3/3 without the lock) | 22/10/2026 |
| Sign-in lands on the user's own home | Redirect to `/` removed from the login page | `users.spec.js` (new employee signs in from `/journal`) | 22/10/2026 |

| Unknown usernames throttled like real ones | Throttle check skipped for unknown usernames | `auth.test.js` › throttles unknown usernames exactly like real ones | 22/10/2026 |
| New token at re-authentication | Token not rotated | `auth.test.js` › issues a new session token on re-authentication | 22/10/2026 |
| A code is accepted once, even in a race | Conditional update ignored | `auth.test.js` › accepts a code only once… (sessions loaded before verifying, so the race is deterministic) | 22/10/2026 |

| Identity numbers masked for others | `canSeeIdentity` always true | `customers.test.js` › are shown in full to the responsible agent and managers, masked to others | 22/10/2026 |
| Hidden identity numbers cannot be overwritten | Check removed | `customers.test.js` › cannot be changed by someone who may not see it | 22/10/2026 |
| Duplicate warning | Soft duplicate check skipped | `customers.test.js` › warns about the same phone or the same name… | 22/10/2026 |

| Legal vehicle requirements (L14) | Seats rule disabled | `vehicles.test.js` › applies the legal requirements per category; keeps category rules when the category changes | 22/10/2026 |
| A vehicle only joins its owner's fleet | API check disabled | Not caught by the API tests **on purpose**: the composite foreign key refused it and the error was mapped to the same answer; `vehicles.test.js` › is enforced by the database too | 22/10/2026 |

| Vehicle usage must be confirmed (L16) | Status check removed | `catalogue.test.js` › lets a vehicle use only a confirmed, active usage… | 22/10/2026 |
| Editing a confirmed entry needs a new confirmation | Clearing disabled | `catalogue.test.js` › cannot be used until confirmed, and editing it requires a new confirmation | 22/10/2026 |
| Third active insurer refused (L1) | Limit check disabled | `catalogue.test.js` › refuses a third active insurer unless… | 22/10/2026 |
| Series confirmed only after its model (replaces the usage check) | Check disabled | `catalogue.test.js` › confirms a series, provisional ones included, only once its model is confirmed | 22/10/2026 |
| "Confirmed" rule needs a document | API check disabled | `catalogue.test.js` › records each review… (the API then no longer answers with the field error); the CHECK constraint is the second layer and is tested on its own: › refuses a confirmed entry without who, when and which document | 22/10/2026 |
| Confirmed rule text locked | Lock disabled | `catalogue.test.js` › records each review… | 22/10/2026 |
| Confirmation day in agency time | Raw timestamp shown (the bug seen in the screenshots) | `Catalogue.test.jsx` › shows what is still to confirm… | 22/10/2026 |
| Only confirmed usages on the vehicle form | Filter removed | `Vehicles.test.jsx` › shows the fields of the chosen category… | 22/10/2026 |
| Usage confirmed only after its model | Check disabled | `catalogue.test.js` › takes its attestation model… | 22/10/2026 |
| A usage never takes the provisional model | Provisional check disabled | `catalogue.test.js` › takes its attestation model… | 22/10/2026 |
| Series letter = model | *Superseded 23/10/2026: the model of a series is configuration (`feature/catalogue-config`)* | — | — |
| Another model for a confirmed series needs a new confirmation | `modelCode` removed from the confirmed fields | `catalogue.test.js` › confirms a series… only once its model is confirmed; › writes codes as on the forms… | 23/10/2026 |
| Reference command: administrator or manager only | Permission check disabled | `reference.test.js` › refuses an agent or an unknown account… | 23/10/2026 |
| Reference command leaves confirmed entries alone | "Already confirmed" check disabled (models; usages on 23/10/2026) | `reference.test.js` › confirms the 8 models, the 3 usages and the 16 RMA 14 / CAT 91 series… | 23/10/2026 |
| Reference command: no product of an inactive insurer | Inactive-insurer check disabled | `reference.test.js` › refuses an agent… or a product of an inactive insurer | 23/10/2026 |
| Reference command leaves confirmed products alone | "Already confirmed" check disabled for products | `reference.test.js` › confirms … the 34 products… | 23/10/2026 |
| All 16 series seeded by the migration | One new series row (CAT 91 G) removed from the reference block | `catalogue.test.js` › seeds the insurers, the models, usages, the RMA 14 / CAT 91 series…; both `reference.test.js` tests | 23/10/2026 |
| Model choice offered on the series form | Field removed | `Catalogue.test.jsx` › lets a manager choose the model of a series… | 23/10/2026 |

| Provisional attestation one month at most (L23) | API check disabled (the CHECK constraint is tested separately) | `contracts.test.js` › records a provisional attestation of one month at most… | 23/10/2026 |
| Attestation of the vehicle's model (L16) | Model check disabled | `contracts.test.js` › records the definitive attestation of the vehicle's model… | 23/10/2026 |
| Insurer decisions on an issued contract: managers only | Permission check disabled | `contracts.test.js` › lets only a manager suspend, reinstate or terminate… | 23/10/2026 |
| Issue needs the insurer's policy number and proof | Required fields removed | `contracts.test.js` › follows the status machine… | 23/10/2026 |
| Contract only with a confirmed product | Product check reduced to "exists" | `contracts.test.js` › creates a numbered draft… with a confirmed product only | 23/10/2026 |
| Agent not offered manager-only actions | Screen filter removed | `Contracts.test.jsx` › shows an issued contract… only the agent's own actions | 23/10/2026 |

| A tracked series's attestation must come from the stock | Check disabled | `stock.test.js` › uses the form from the stock when a paper attestation is recorded | 23/10/2026 |
| An assigned form is used by its holder only | Check disabled | `stock.test.js` › uses the form from the stock… | 23/10/2026 |
| Movement only from allowed statuses | Check disabled | `stock.test.js` › assigns forms, records exceptions…; › uses the form from the stock… | 23/10/2026 |
| A serial number is received once | Overlap check disabled | `stock.test.js` › records a batch form by form… refuses an overlap | 23/10/2026 |
| Cancelling an attestation cancels its form | Hook disabled | `stock.test.js` › uses the form from the stock… | 23/10/2026 |
| Reason required before an exception (screen) | Form check removed | `Stock.test.jsx` › asks for a reason before declaring forms damaged | 23/10/2026 |

| Renewals only within 30 days of the end | Window removed | `renewals.test.js` › lists an issued contract 30 days before its end… (and the others) | 23/10/2026 |
| A closed renewal does not change | Check disabled | `renewals.test.js` › records the follow-up; "not renewed" needs a reason… | 23/10/2026 |
| The new contract is linked to the old one | Link removed | `renewals.test.js` › prepares the next contract as a draft linked to the old one | 23/10/2026 |
| Reassigning a renewal: managers only | Route opened to `renewals.write` | `renewals.test.js` › lets only managers and the administrator give a renewal… | 23/10/2026 |
| "Not renewed" needs a reason (API) | Check disabled (the CHECK constraint is tested separately) | `renewals.test.js` › records the follow-up… | 23/10/2026 |
| "Not renewed" needs a reason (screen) | Form check removed | `Renewals.test.jsx` › asks for a reason before closing a renewal… | 23/10/2026 |

| Simultaneous payments add up (row lock) | `FOR UPDATE` removed | `payments.test.js` › adds up two payments recorded at the same moment… (failed 3/3 without the lock) | 23/10/2026 |
| Never more than the premium (L4) | Balance check disabled | `payments.test.js` › records a payment… never more than the premium; › adds up two payments… | 23/10/2026 |
| One payment per request | Idempotency check disabled | `payments.test.js` › needs the insurer premium first, and records one payment for a repeated request | 23/10/2026 |
| A payment is reversed once | Check disabled | `payments.test.js` › lets only management reverse a payment… | 23/10/2026 |
| Reversal: management only | Route opened to `payments.record` | `payments.test.js` › lets only management reverse a payment… | 23/10/2026 |
| A broken picture never stops the server | Reader error handler removed | `ocr.test.js` › is "not read", and never stops the server | 24/10/2026 |
| A policy number is reused only along a renewal chain, even at the same moment | Trigger `contract_policy_unique` disabled | `policy-renewals.test.js` › lets a renewal keep the policy number…; › a third year… two unrelated contracts at once | 24/10/2026 |
| The platform PDF is read from its text, not as a picture | Platform detection disabled | `scans.test.js` › reads the PDF of the platform exactly… | 24/10/2026 |
| A filing sent twice runs once | Version claim removed | `scans.test.js` › goes on where it stopped… | 24/10/2026 |
| A retried filing never creates twice | Saved progress ignored | `scans.test.js` › goes on where it stopped… | 24/10/2026 |
| An uncertain number is taken from the stock | Stock lookup disabled | `scans.test.js` › keeps the reading of the number… | 24/10/2026 |
| Exports need a recent re-authentication | Guard removed | `reports.test.js` › exports as CSV or Excel… after confirming their identity | 24/10/2026 |
| Exported cells never run as formulas | Prefix removed | `spreadsheet.test.js` › never lets a cell run as a formula; › is a workbook… | 24/10/2026 |
| Every export is audited | Audit call removed | `reports.test.js` › exports as CSV or Excel… audited | 24/10/2026 |
| A correction never sets the premium below what was paid (L4) | Check disabled | `captures.test.js` › keeps the rules of the contract… | 24/10/2026 |
| Only an issued contract is corrected from a document | Status check disabled | `captures.test.js` › keeps the rules of the contract… | 24/10/2026 |
| The comparison never reveals a hidden identity number | Masking removed | `captures.test.js` (unit) › never shows the full identity number… | 24/10/2026 |
| A file's content must match its announced type | Signature check disabled | `documents.test.js` › accepts only PDF, JPEG and PNG… checked by their content | 24/10/2026 |
| The same file is attached once, even sent twice at once | Contract `FOR UPDATE` removed | `documents.test.js` › attaches the same file once when it is sent twice at the same moment | 24/10/2026 |
| No file left on disk after a refused upload | Clean-up disabled | `documents.test.js` › accepts only…; › replaces a scan…; › attaches the same file once… | 24/10/2026 |
| Two remittances never take the same payment | Insurer `FOR UPDATE` removed | `remittances.test.js` › never includes a payment in two remittances recorded at the same moment | 23/10/2026 |
| A payment and its reversal both still to remit are not owed | Netting condition disabled | `remittances.test.js` › flags late months, nets reversals… | 23/10/2026 |
| The remittance total is the one the user saw | Amount check disabled | `remittances.test.js` › shows what is owed per month… records a remittance once | 23/10/2026 |
| Cheque number required (screen) | Form check removed | `Payments.test.jsx` › shows what is left to pay and asks for the cheque number… | 23/10/2026 |
| Lists readable on a phone (cards, filters behind « Filtres ») | Phone cards and the « Filtres » button turned off | `Customers.test.jsx` › on a phone, shows one card per customer…; `SimpleUi.test.jsx` › shows one card per contract… | 30/10/2026 |
| Customer phone in renewals only for who may read customers | Phone always added to the renewal view | `renewals.test.js` › gives the customer phone, to call, only to an employee allowed to read customers | 30/10/2026 |
| The payment form says what stays owed | « Reste après ce paiement » line removed | `Payments.test.jsx` › says what stays owed as the amount is typed… | 30/10/2026 |
| A form says how many changes wait to be saved | Hint removed from the save bar | `Customers.test.jsx` › keeps the save bar in reach and says how many changes… | 30/10/2026 |
| « Mois dernier » is the month before | Month offset ignored | `Reports.test.jsx` › changes the period in one tap… | 30/10/2026 |
| The agency's logo is a real PNG or JPEG | First-bytes check skipped | `agency.test.js` › checks the ICE, the e-mail and the images at startup… | 30/10/2026 |
| The receipt prints the agency's legal line | Patente left out of the legal line | `Payments.test.jsx` › prints the agency details once they are set | 30/10/2026 |
| The change is counted from what the customer pays (the rounded sum when rounding) | Change taken from the amount only | `payments.test.js` › counts the change from the rounded sum when the agency rounded | 30/10/2026 |
| The receipt prints « Somme reçue · Rendu » | Line hidden | `Payments.test.jsx` › says the change to give back from the cash handed over, and prints both | 30/10/2026 |
| Every route needs sign-in and the right permission | Guard removed from « annuler un paiement » | `access.test.js` › refuses every route… before sign-in; › lets the read-only auditor change nothing… | 30/10/2026 |
| A huge declared picture is never decoded | Size cap disabled | `ocr.test.js` › does not decode a picture that declares itself huge | 30/10/2026 |
| The proxy sends the screens' security policy | CSP removed from the Caddyfile (mounted override) | `smoke.spec.js` › the installed server answers over HTTPS, locked down… | 30/10/2026 |
| The status page flags a server clock that drifted | Tolerance set to infinity | `SystemStatus.test.jsx` › says when the server clock needs setting… | 30/10/2026 |
| A restore replays the changes made after the full copy | WAL files skipped at restore | `disaster-drill.sh` › « ÉCHEC : client perdu » (client entered after the full copy missing) | 30/10/2026 |
| The status page says when backups need a look | — (screen test of each case: no disk, stopped, no full copy) | `SystemStatus.test.jsx` › shows whether the backups are up to date… | 30/10/2026 |

## Stability

E2E runs are repeated (`npx playwright test --repeat-each=3`) when a step adds journeys. This found that every test signs
in from 127.0.0.1 and reached the production per-address limit (20 per 15 minutes); the e2e backend now starts with
`LOGIN_MAX_PER_IP=1000`, while the integration tests force the production value 20 and test it.
Intermittent 500 errors in repeated e2e runs (about 1 run in 3, several journeys at once) came from the server, not the
tests: under load Prisma could not start a transaction within its default 2 s, or finish it within 5 s (error P2028).
The limits are now 10 s and 15 s (`backend/src/services/prisma.js`), and P2028 answers 503 "server busy" instead of 500
(`app.test.js`). Found by piping the backend log during the e2e runs.
Afterwards two runs out of six still had one page wait over 15 s (no server error) while four browsers saturated the
laptop (85 % CPU): e2e now runs 2 browsers at a time (`workers: 2`), with no loss of coverage.
On 29–30/10/2026 the platform-PDF scan journey timed out in three full runs (passing alone): its trace showed a matches
request left unanswered for 60 s. Image recognition was measured not to block the server (tesseract.js runs in a worker
thread: 36 ms at most). The connection pool, though, waited for a free connection forever (pg's default): it now gives
up after 10 s and answers 503 "server busy" (`health.test.js`, `app.test.js`), so such a wait becomes a logged error
instead of a hang. The pg warning « client.query() when the client is already executing a query » comes from Prisma's
own parallel reads inside a transaction (traced with `--trace-deprecation`); pg queues them, so it is harmless.
Everyone now lands on the home dashboard (Accueil) after signing in; journeys that start from the client list click
"Clients" first.
Journeys share the test database: the stock journey uses series CAT 91 E, which no other journey records attestations
on, because receiving forms of a series makes its numbers checked against the stock.
Error answers the browser sees are asserted exactly (`errorResponses`), e.g. the `403` that asks an administrator to
confirm identity before creating an account.
The e2e `expect` timeout is 15 s and the per-test limit 60 s: Argon2 runs at full cost on every sign-in and password change, and four browsers in
parallel on one laptop can make a step take several seconds. Frontend tests allow 20 s per test (each wait for an
element may take up to 5 s): the 5 s default ran out on a busy machine before any assertion failed. A list that loads separately is shown only once
loaded (the contract form's product list once read as empty in 1 run out of 4; the form now waits for it, 6/6 after).

## What the authentication tests cover (Phase 4a)

- **Integration (real PostgreSQL, controllable clock):** hardened cookie attributes; identical answers for wrong password,
  unknown user and disabled account; no password in logs or audit; progressive delay; 15-minute lock after 10 failures;
  20 attempts per address per 15 minutes; Origin and CSRF checks; idle (30 min) and absolute (10 h) expiry; disabled
  user cut off; forged cookie ignored; permission denied and audited; administrator enrolment; code verification,
  wrong and replayed codes; token rotation; forced password change with policy and sign-out of other sessions; second
  factor before password change; re-authentication.
- **Database privileges:** the runtime role cannot update or delete audit records, delete users, change roles or create
  tables; the audit log refuses UPDATE/DELETE even for the owner; username format enforced by a CHECK constraint;
  seeded roles and permissions match the approved matrix; first-administrator command rules.
- **End-to-end (both widths):** agent sign-in, role-limited navigation, cookie unreadable by scripts, sign-out;
  generic error for a wrong password; administrator enrolment by reading the manual key; second-factor sign-in to the
  status page; forced password change. All with outside requests blocked and an empty browser console.
- E2E tests create their own uniquely named synthetic users in `agency_test`; global setup empties the user tables first.
