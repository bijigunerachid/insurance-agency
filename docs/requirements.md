# Requirements (Phase 1)

What the application must do, derived from the brief and from `docs/insurer-rules.md` (rule ids in brackets).
This document says **what**; Phase 2 (`docs/architecture.md`) will say **how**.

## 1. Scope

- One agency, one premises, one server on the office LAN [L18]. No Internet needed for daily work.
- Two insurers: RMA Assurance and CAT Assurance & Réassurance, stored as data, never mixed [L1].
- Lines in scope (owner's request: all lines). Each needs agency confirmation before products are activated. On
  23/10/2026 the owner listed the 17 products the agency sells, for both RMA and CAT (« Auto-écoles » added on 29/10/2026,
  18 since); they are seeded and confirmed
  (the table below records what the public sources showed before that):

| Line | RMA | CAT |
|---|---|---|
| Private car | Public products seen [R1] | Unknown [C9] |
| Motorcycle | Public products seen [R4] | Unknown [C9] |
| Taxi (petit / grand) | Unknown [R7] | Public packs [C1, C2] |
| Passenger transport (touristique, personnel, scolaire, autocar) | Unknown [R7] | Public quote categories [C3] |
| Triporteur | Unknown | Announced [C6] |
| Commercial / goods vehicles | Unknown [R7] | Unknown |
| Fleets | Unknown [R7] | Public, minimum 5 vehicles [C4] |
| Border insurance (foreign vehicles) | — | **Sold, rarely**, on the CAT platform: 5 days, 10 days, 1, 3 or 6 months (owner, 02/11/2026) [C5] |

## 2. What the app must never do

These follow from the law and from the brief. They are fixed design constraints.

1. Produce documents that look like an insurer's policy, attestation or cover note [L2, L3, L15]. Official documents are uploaded scans or files with their numbers recorded.
2. Calculate an official premium. A premium is entered from the insurer's confirmation. An internal estimate exists only if the agency supplies an authorised method, and is always labelled "Estimation interne".
3. Allow a discount, rebate or amount above the insurer premium [L4].
4. Create payment delays or instalment plans that the insurer's contract does not provide [L6].
5. Mark a contract as issued, suspended or terminated without an insurer-sourced reference [L9].
6. Decide whether a claim is covered.
7. Submit anything to RMA, CAT, ACAPS or any online service. There is no official integration.

## 3. Functional requirements added by the research

On top of the modules listed in the brief (§7):

| Id | Requirement | From |
|---|---|---|
| F1 | Vehicle **usage** is a controlled list managed by the administrator, initially empty until filled from S2 or insurer documents | L16 |
| F2 | Vehicle fields depend on category: seats for passenger transport, fiscal power (CV) or cylindrée for two-wheelers, taxi type and fuel for taxis, date of first registration | L14, C2 |
| F3 | Contracts support terms of 3, 6 and 12 months, and short border terms (5 days, 10 days, 1–6 months) if that line is activated | C3, C5 |
| F4 | Contracts store the attestation number, its validity dates, and its file (paper scan or electronic QR-code attestation) | L15, L17 |
| F5 | Contracts have a tacit-renewal flag and a notice period; renewal screens show the notice deadline | L10, L11 |
| F6 | Fleet contracts support dated vehicle movements (add, remove, transfer) as amendments, keeping history | C4 |
| F7 | Payments: amount due = insurer-confirmed premium; no discount field; reversals instead of edits | L4 |
| F8 | **Remittance tracking**: premiums collected per insurer, remitted or not, with remittance batches and a configurable deadline alert | L5 |
| F9 | Claims: incident date, date the customer informed the agency, date notified to the insurer; warning when 5 days pass (configurable per incident type, e.g. 60 days for catastrophic events) | L7, L8 |
| F10 | Claims checklist includes "ne pas réparer avant l'expertise" and the constat (scan or e-constat reference) | R5, L21 |
| F11 | Claims record the insurer service used (e.g. RMA Services, Hifad Express, DABA CAT, TAAWID EXPRESS) as a configurable list | R3, C7 |
| F12 | Every insurer rule shown in the app carries its status (`LAW`, `PUBLIC`, `PRESS`, `UNKNOWN`, `CONFIRMED`), source and verification date; only `LAW`/`CONFIRMED` rules are enforced | Brief §4.3 |
| F13 | Financial and contract records are never deleted; audit log and exports support an ACAPS inspection | L19, L20 |

## 4. Agency answers (22/10/2026)

The agency answered questions 1–17 on 22/10/2026. "Open" means the answer still needs a document or a decision; the
app keeps the matching feature disabled or configurable until then, and never fills the gap with an assumption.

| # | Question | Answer | Open | What the app does |
|---|---|---|---|---|
| 1 | Products sold, per insurer | Vehicle insurance with RMA and CAT. CAT's public products (taxi packs, triporteur, fleets, border, passenger transport) are **not** proof that the agency sells them | Full product list and internal codes | Separate RMA and CAT catalogues; only confirmed products can be used |
| 2 | How policies and attestations are issued | On each insurer's platform or procedure, with the insurers' forms (provisional attestations included) | — | Records customers, contracts, policy references, attestation model, series and serial numbers. Never issues official documents |
| 3 | Numbers on documents | Quote/reference, policy number, attestation model + series + serial number, insurer quittance reference, agency receipt number. RMA 14 A/C/E/P and CAT 91 E/P seen on the forms; 14 and 91 are series, not models | Full numbering rules, who assigns each number | Keeps each number in its own field; official numbers are entered, never generated |
| 4 | Documents per product and operation | Not confirmed | Lists per insurer, product and operation | Configurable checklists (subscription, renewal, amendment, claim); mandatory only when confirmed by the insurer |
| 5 | Premium remittance to RMA / CAT | The agency collects first, then transfers to the insurer. **The agency is authorised to collect premiums** for RMA and CAT (owner, 23/10/2026; the authorisation is written in the traité de nomination, circulaire ACAPS 01/AS/19 art. 125) | The traité clause for each insurer; any deadline stricter than the legal one, frequency, bordereau, transfer, reconciliation | Remittance tracking per insurer (F8). Default deadline = the legal one: 15 days after the month of collection (art. 132), configurable per insurer if the traité is stricter. Cash, cheque and other methods allowed (the crossed-cheque-only rule of art. 129 applies only to agents without the authorisation). Twice-yearly insurer statement to reconcile (art. 134) |
| 6 | Receipt or quittance | Both may be given; several payment methods | A redacted sample of the agency receipt | A receipt is handed over at once for every payment (art. 128: it counts as given by the insurer). Layout, numbering and fields wait for the sample (Phase 7) |
| 7 | Claims forms and deadlines | The agency prepares files, submits them on the insurer's platform and follows them. **Research (23/10/2026):** the insured declares within 5 days with the constat or police report (L7, confirmed by ACAPS); non-liable victims are paid by their own insurer under the Convention d'Indemnisation Directe; counter-expertise and the mediator (disputes above 5 000 DH) before court | Forms, documents, internal deadlines per insurer | Insurer-specific checklists, submission dates, reminders, status; the 5-day legal deadline warned; no unverified internal deadline hard-coded |
| 8 | Border, triporteur, fleets | **Border: sold, rarely, on the CAT platform, for the five durations of C5** (owner, 02/11/2026). Triporteur: the agency's form (rule C6) | Number of fleet customers | Border insurance built (rule C5); fleets stay disabled until confirmed |
| 9 | Users and permissions | At most 4 users: 1 administrator and up to 3 agents with identical operational permissions (customers, contracts, payments, cancellations where permitted) | — | One account each; payments, issued documents, stock movements and cancellations audited; cancellation needs a reason; financial and issued-document records never deleted; official cancellation follows the insurer's procedure |
| 10 | Data loss and downtime | Proposed: RPO 15 minutes, RTO 4 hours | Agency approval; maximum tolerable downtime | Phase 12 designs for these targets (15 minutes needs continuous WAL archiving, not only nightly dumps); local operation without Internet, except the insurers' platforms |
| 11 | CNDP declaration | Not confirmed | Whether the formalities are done, and the receipt reference | Built with access control and audit; no assumption that the formalities are complete |
| 12 | Plate convention | Arabic (12345-ب-6) or Latin (12345-B-6). **Research (23/10/2026):** an official table maps the 15 Arabic series letters to Latin ones (BO n° 7531, 03/08/2026, rule L40), and new plates show both | The agency's choice of how to type it (both can be supported) | Built: separators ignored, original kept. Proposed: match both spellings through the official table once the BO text is read |
| 13 | Attestation models and series | The **model** is national and shared: A Tourisme, B Transport public de voyageurs, C Transport de marchandises, D Divers, E deux ou trois roues, F Assurance aux frontières, G Garagistes, P Provisoire. The **series** is per insurer: RMA 14 A, 14 C, 14 E, 14 P; CAT 91 E, 91 P. P is a provisional attestation (one month at most, L23), not a vehicle usage. Electric vehicles falling under « Divers » take model D (ACAPS lettre circulaire of 19/02/2026); not every electric car or motorcycle is model D (owner, 23/10/2026) | Whether the numbers 14 and 91 change in future (owner will check) | One shared model list with the official number and colour of arrêté 213-05 art. 2 (A = 1 yellow, B = 2, C = 3, D = 5 white, E = 4, F = 8, G = 6, P = 7 pink) and per-insurer series (built: `feature/attestation-models`); each series is linked to a model, editable in the catalogue (the code's letter by default); one RMA 14 and one CAT 91 series per model (agency rule, owner 23/10/2026); the 8 models and the 16 series are confirmed as the current configuration (owner, 23/10/2026, confirmation command); a usage determines its model; nothing is assigned from the fuel or any other field |
| 14 | Products and codes to enter | To collect: insurer, official name and code, eligible category, confirmed pricing rules, required documents | All of it | Products unusable until complete and confirmed; marketing names are not used as codes |
| 15 | CNPAC on CAT 91 P (15 DH + 2 DH = 17 DH, 07/2024) | Not confirmed current; RMA's "taxe CNPAC" may differ. **Research (23/10/2026):** no public text on this contribution was found (the CNPAC was replaced by the NARSA in 2020). Found instead: guarantee fund 1,5 % of the RC premium (L36), EVCAT 3,5 % / 2 % and 1,5 % (L37), FSEC tax 1,5 % (L38), insurance contract tax 14 % (L39) | The CNPAC / NARSA amount per insurer | Nothing charged or hard-coded; amounts are the insurer's, recorded as printed, later stored per insurer and attestation type with effective dates and audit |
| 16 | Blank attestation stock | Procedure to document | Arrival in batches, storage, key holder, assignment, returns | Stock per insurer, model and series: batch, serial ranges, receipt date, location, holder; statuses available, assigned, used, returned, damaged, lost, cancelled; who did each movement and why; discrepancies; no deletion. **Built (`feature/attestation-stock`)**; the procedure itself (keys, returns to the insurer) is still to describe |
| 17 | Printing on pre-printed conditions particulières | **No** | — | The app records data and serial numbers; it does not print on insurer forms or bypass the insurer's process |

Still to supply: the product lists and codes (1, 14), numbering rules (3), document lists (4), remittance terms beyond the legal 15 days and the traité clauses (5), a
redacted receipt (6), claim requirements (7), availability of border / triporteur / fleet (8), approval of the recovery
targets (10), the CNDP status (11), how the agency types plates (12), the missing series (13), the CNPAC / NARSA amounts (15)
and the stock procedure (16). Public sources cannot answer these: they are the agency's own practice or its agreements
with RMA and CAT. The register layouts of circulaire 01/AS/19 (annexes 61–62) are not published online either: ask
RMA, CAT or the FNACAM.

## 4b. Scope decisions and answers of 23/10/2026

**The application is a helper.** The agency works on the RMA and CAT official platforms (quotes, policies,
attestations, claims). The app keeps the agency's own follow-up and never duplicates those platforms; the full quote
workflow is dropped (owner, 23/10/2026).

| Area | Decided | Still to confirm |
|---|---|---|
| Renewals | Listed **30 days** before expiry; followed by the employee who created the contract, reassignable by the administrator (and managers); reminders on the home dashboard and a Renouvellements page; **no SMS or email** | — |
| Payments | Receipt shows agency details, unique number, date, customer, contract reference, amount, method, employee. Proposed numbering \`REC-2026-00001\`, never reused, even after a reversal. Reversal by management only, with a reason; the original payment is kept and audited | Payment methods confirmed: cash, cheque, transfer, card, other; receipt designed from these answers (owner, 23/10/2026). Built: `feature/payments`. Still open: RMA / CAT remittance method and any deadline shorter than the legal one. New requests to scope: **commissions** (expected, confirmed, paid) and **agency expenses** |
| Claims | The app never replaces the insurer's claims platform; possible documents: constat or police report, carte grise, licence, photos, insurer's requests | Agency-managed claims (assigned employee, progress) or insurer-managed (agency only records and follows up) |
| Documents | Uploads (CIN, carte grise, insurer documents, claim documents) up to 10 MB, with restricted access, audit and backups | Legal check before storing real customer documents (CNDP, CIN copies) |
| Printing | Agency receipts and renewal reminder letters | — |
| Reports | Contracts expiring by month; payments per day; payments per insurer; amounts owed to each insurer; attestation stock and movements; activity per employee. Exports **CSV and Excel**, management and administrator only | — |
| Users | One administrator, up to three agents, individual logins and audit; management-only actions go to the administrator until a manager is named | Whether one agent also gets the manager role |
| Server and backups | Proposed: mini-PC, 16 GB, SSD, external backup disk, UPS; RPO 15 min (needs WAL archiving), RTO 4 h; external disk at the office plus an encrypted copy kept elsewhere, restore tests | Purchase, approval of the targets, Windows PCs with Chrome / Edge, server on during working hours |
| Legal | — | CNDP formalities and receipt; keeping CIN copies; retention periods (10 years for accounting not yet verified) |

## 5. Legal questions (for a qualified professional)

The app does not claim legal compliance. These must be answered by a lawyer or data-protection adviser:

1. Which CNDP declaration applies to the agency's processing: normal (F211) or simplified (F214)? [L22]
2. Claim files can contain health data (injuries) and offence data (police reports). Do they require **prior authorisation**?
3. Is keeping a copy of the CIN allowed or required for each product, or is recording the number enough?
4. Retention periods: customer, contract, claim and financial records (inputs: 2-year prescription [L12], loi 9-88 accounting obligations: 10 years according to a secondary source [L20]; 5-year review periods of loi 70-24 for injury claims, press).
5. What must the agency tell customers (information notice) and how are access and correction requests handled?
6. Does the agency's mandate (traité de nomination) with RMA or CAT impose rules on local copies of their documents?
7. Is an agency-issued payment acknowledgement allowed alongside the insurer quittance, and what must it say? [L2]
