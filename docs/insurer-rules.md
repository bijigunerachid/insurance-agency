# Insurer and regulatory rules register

Phase 1 deliverable. Every business rule the application relies on must have a row here.
The app may only **enforce** a rule whose status allows it (see "Status" below).

- Research date for every row below: **2026-10-22** (public web sources only).
- Reviewer: **pending**. Agency owner or an authorised insurer representative must review each row.
- No real customer data was used or uploaded during research.
- **In the app (since Phase 5):** the catalogue migration seeds every row below, in French, into the rules register
  (menu « Règles »). From then on, reviews happen in the app: each review records the new status, a note, the
  document reference (required for `CONFIRMED`), the reviewer and the time, in an append-only history. This file stays
  the research record; when the two differ after deployment, the app's history is the reference.

## Status values

| Status | Meaning | May the app enforce it? |
|---|---|---|
| `LAW` | Read in an official legal text (link given) | Yes, once the reviewer confirms the article still applies |
| `PUBLIC` | Seen on the insurer's official public website | No. Information only, until the agency confirms it applies to this agency |
| `PRESS` | Reported by the press, no official text found | No. Must be confirmed from an official source |
| `DOCUMENT` | Seen on an official insurer form supplied by the agency (blank, no customer data) | No. Must be confirmed by the agency |
| `UNKNOWN` | Not found publicly | No. Needs an agency or insurer document |
| `CONFIRMED` | Confirmed by the agency or insurer (document reference + reviewer) | Yes |

Nothing is `CONFIRMED` yet.

## Sources

| Id | Source | Notes |
|---|---|---|
| S1 | [Loi 17-99 Code des assurances, consolidated FR (ACAPS)](https://www.acaps.ma/sites/default/files/2025-02/Loi_17-99_Code%20des%20assurances%20consolid%C3%A9_FR.pdf) | Body says "version mise à jour au 24 mai 2020"; header also lists loi 43-24 (2024). Check later amendments in the Bulletin officiel |
| S2 | [Arrêté n° 213-05 du 26 janvier 2005 relatif aux assurances obligatoires (ACAPS)](https://www.acaps.ma/sites/default/files/2025-02/ARRETE%20N%C2%B0%20213-05%20DU%2026%20JANVIER%202005%20RELATIF%20AUX%20ASSURANCES%20OBLIGATOIRES%2C%20TEL%20QU%27IL%20A%20ETE%20MODIFIE.pdf) | Attestation models and numbering |
| S3 | [RMA – Automobile](https://www.rmaassurance.com/fr/automobile) | |
| S4 | [RMA – Moto](https://www.rmaassurance.com/fr/moto) | |
| S5 | [RMA – Déclarer votre sinistre automobile](https://www.rmaassurance.com/fr/declarer-votre-sinistre-automobile) | |
| S6 | [CAT – Nos packs (taxi)](https://www.cat.co.ma/fr/nos-packs/) | |
| S7 | [CAT – Devis en ligne (transport)](https://www.cat.co.ma/fr/entreprise/devis-en-ligne) | |
| S8 | [CAT – Gestion flotte](https://www.cat.co.ma/en/node/760) | |
| S9 | [CAT – Assurance aux frontières](https://www.cat.co.ma/fr/assurance-aux-frontieres) | |
| S10 | [CAT – Triporteur](https://www.cat.co.ma/fr/triporteur) | Announcement only |
| S11 | [CAT – DABA CAT](https://www.cat.co.ma/fr/daba-cat) | |
| S12 | [CAT – Infos pratiques](https://www.cat.co.ma/fr/infos-pratiques) | Flyers only |
| S13 | [Boursenews, 08/10/2026 – fin de l'attestation papier en juillet 2027](https://boursenews.ma/article/actualite/assurance-automobile-fin-attestation-papier-juillet-2027) | Press |
| S14 | [Le Matin – attestations véhicules électriques](https://lematin.ma/economie/voitures-electriques-votre-attestation-dassurance-est-peut-etre-invalide/332603) and [Hespress](https://fr.hespress.com/464429-assurance-auto-electrique-lacaps-impose-la-mise-en-conformite-immediate-des-attestations.html) | Press, about an ACAPS lettre circulaire of 19/02/2026 |
| S15 | [TelQuel, 14/03/2016 – paiement à crédit des primes](https://telquel.ma/2016/03/14/dassurance-automobile-credit_1487243), [Boursenews 2016 – provisionnement des impayés](https://boursenews.ma/article/marches/assurances-la-circulaire-relative-au-provisionnement-des-impayes-bientot-dans-le-circuit-d-homologation) | Press, about ACAPS circulars |
| S16 | [Médias24, 03/09/2024 – loi 43-24](https://medias24.com/2024/09/03/convocations-aux-ag-de-societes-commerciales-et-code-des-assurances-les-nouvelles-dispositions-publiees-au-bo/) | Press |
| S17 | [CNDP – types de déclaration et formulaires](https://www.cndp.ma/notifier-une-declaration-type-de-declaration-formulaires/), [Loi 09-08](https://www.cndp.ma/loi-09-08/) | Official |
| S18 | [Atlas Mag – e-constat](https://atlas-mag.net/fr/articles/assurance-automobile-deploiement-du-e-constat-au-maroc), [Démarches Maroc – constat amiable](https://www.demarchesmaroc.com/?p=5422) | Press / third party |
| S19 | Blank, pre-signed forms supplied by the agency on 22/10/2026: RMA attestations 14 P (provisional), 14 A (Tourisme), 14 C (Transport de marchandises), 14 E (two/three-wheelers) with conditions particulières; CAT 91 P (provisional attestation + note de couverture) and 91 E (attestation + conditions particulières « CAT-Assurance Triporteur ») | Read on screen only. Not stored in the repository or the app (they carry real serial numbers and signatures, rule L3) |
| S20 | Agency answers to the questions of docs/requirements.md §4, 22/10/2026 | Agency statement; the national model list (A–G, P) is seeded « à confirmer » with this source |
| S21 | [Circulaire ACAPS n° 01/AS/19 du 02/01/2019, consolidated version (ACAPS, 2024-11)](https://www.acaps.ma/sites/default/files/2024-11/circulaire_de_lautorite_ndeg_01_as_19_du_02_janvier_2019_prise_pour_lapplication_de_certaines_dispositions_du_code_des_assurances_0.pdf) | Official. Articles 124–136 on intermediaries read in full on 23/10/2026 |
| S22 | [212assurances, 02/03/2026](https://www.212assurances.com/2026/03/02/lacaps-recadre-les-assureurs-gare-aux-amendes-pour-les-attestations-electriques/), [Hespress](https://fr.hespress.com/464429-assurance-auto-electrique-lacaps-impose-la-mise-en-conformite-immediate-des-attestations.html) | Press, about ACAPS lettre circulaire n° 160649 of 19/02/2026 (electric vehicles « relevant de l'usage Divers »). The letter itself is not published |
| S23 | [Décret n° 2-03-50 du 22/05/2003 (ACAPS)](https://www.acaps.ma/sites/default/files/publication_documents/decret_2_03_50_0.pdf) | Official. Read in full on 23/10/2026 |
| S24 | [ACAPS – fiche conseil « Régime EVCAT »](https://www.acaps.ma/sites/default/files/acaps_fiche_conseil_-_evcat_fr.pdf) | Official guidance (ACAPS), not the legal text itself |
| S25 | [ACAPS – « Indemnisation automobile matérielle »](https://www.acaps.ma/sites/default/files/indemnisation_automobile_materielle_fr_version_finale.pdf) | Official guidance (ACAPS) |
| S26 | [Le360](https://fr.le360.ma/economie/la-taxe-de-solidarite-contre-les-catastrophes-passe-officiellement-a-15_EUN4KYOC25CF5DPKAEFFVVEIBU/), [Maroc Diplomatique](https://maroc-diplomatique.net/catastrophes-naturelles-la-taxe-de-solidarite-sur-les-assurances-passe-a-15-au-maroc/) | Press, about décret n° 2-24-1123 (BO of 18/09/2025) |
| S27 | [DGI – Taxe sur les contrats d'assurances](https://tax.gov.ma/wps/portal/DGI/Documentation-fiscale/Taxe-sur-les-contrats-d_assurances/), [Maroc-compta, 10/2026](https://www.maroc-compta.com/2026/10/la-taxe-sur-les-contrats-dassurances.html) | The DGI page shows 13,80 %; the 2026 secondary source shows 14 % (rates rounded when the tax moved into the CGI in 2019). Current rate to confirm in the CGI |
| S28 | [Le Matin, 08/2026](https://lematin.ma/nation/immatriculation-des-voitures-et-motos-ce-qui-va-changer-des-janvier-2027/360172), [Médias24](https://medias24.com/2026/08/10/plaques-dimmatriculation-le-maroc-instaure-un-modele-unique-1738879/), [TelQuel](https://telquel.ma/instant-t/2025/07/04/voyager-a-letranger-en-voiture-comment-mettre-sa-plaque-dimmatriculation-aux-normes_1940901/) | Press, about the arrêté of the Minister of Transport published in BO n° 7531 (03/08/2026) and annex 11 of the 2010 arrêté |
| S29 | [Upsilon Consulting – loi 9-88](https://upsilon-consulting.com/loi-9-88-obligations-comptables-commercants-maroc/) | Secondary source (consultancy); text of the law not read |
| S30 | Owner's photos of the RMA GAMA subscription screen, « Type d'usage » list (28/10/2026) | Agency document, not committed. Complete per the owner (29/10/2026) |
| S32 | [Arrêté du ministre des finances (EAR), mis à jour 2009, art. 58](https://www.finances.gov.ma/Publication/daps/2009/337_arrete_ear_fr_bo_maj2009.pdf) | Pure-premium criteria of motor TPL: usages tourisme, TPV, TM, deux/trois roues, « garagistes et divers »; 9° lists the « divers » sub-usages (location avec ou sans chauffeur, auto-école, ambulances, corbillards, transport scolaire et du personnel, tracteurs, engins de chantier, véhicules à moteur électrique…). A tariff text of 2009; a later version was not found |
| S31 | RMA platform layout of a vehicle-change avenant (28/10/2026) | Synthetic sheet: `backend/test/fixtures/platform-avenant-synthetique.pdf` |

## A. Rules from law and regulation (apply to both insurers)

| Id | Rule | Source | Status | Effect on the app |
|---|---|---|---|---|
| L1 | An insurance agent may represent **at most two** insurers, with the agreement of the first one | S1 art. 292 | LAW | RMA + CAT is the maximum. The insurer table is data, but adding a third active insurer should warn the administrator |
| L2 | Notes de couverture and attestations **in the intermediary's name** are forbidden | S1 art. 302-1° | LAW | The app never produces anything that looks like a cover note, attestation or policy |
| L3 | Holding forged forms or "appareils permettant de les confectionner" (polices, notes de couverture, attestations) is a criminal offence | S1 art. 328 | LAW | No templates that imitate insurer documents. Official documents are only **stored as uploaded files** and their numbers recorded |
| L4 | An intermediary may not collect more than the premium set by the insurer, and may not give any commission rebate or discount on the premium | S1 art. 302-3° | LAW | Payments have **no discount field**. The amount due comes from the insurer-confirmed premium only. Owner, 29/10/2026: the agency sometimes rounds the cash the customer gives (752,00 for 751,55, 750,00 for 750,66); the payment stays the exact premium the insurer gets, and the gap is recorded beside it as the agency's own (`clientPaid`, « Écarts de caisse » report), never on the receipt |
| L5 | Intermediaries pay premiums collected for insurers within **15 days after the month of collection** | S1 art. 318; S21 art. 132 | LAW | Track "collected, not yet remitted" per insurer; default due date = end of the month of collection + 15 days, shorter if the traité says so |
| L6 | When an intermediary grants payment facilities **on its own initiative**, the premium is deemed fully collected and must be declared as collected | S21 art. 130 | LAW | No credit or instalment plan created by the agency; instalments only when the insurer's contract provides them. A facility granted by the agency makes the premium due to the insurer |
| L7 | The insured must declare a claim within **5 days** of becoming aware of it; contracts may extend but not shorten this | S1 art. 20-5° ; confirmed by ACAPS guidance (S25), which adds the insurers' Convention d'Indemnisation Directe, the counter-expertise and the insurance mediator for disputes above 5 000 DH | LAW | Claims show "declared to agency" and "notified to insurer" dates, and warn when 5 days pass. The app does **not** decide whether cover is lost |
| L8 | Catastrophic events: notice period raised from 20 to **60 days** by loi 43-24 | S16 (art. 64-5 of S1) | PRESS | Configurable per incident type; confirm from the Bulletin officiel |
| L9 | Unpaid premium: after 10 days the insurer may suspend cover 20 days after formal notice and terminate 10 days later | S1 art. 21 | LAW | The app records the **insurer-notified** status (suspended / terminated) and its date. It never sets these statuses on its own |
| L10 | Tacit renewal must be stated in the contract; each tacit extension is at most one year | S1 art. 7 | LAW | Contracts have a "tacit renewal" flag; renewals are linked records |
| L11 | Termination notice: contract minimum between 30 and 90 days, right to withdraw after one year | S1 art. 6 | LAW | Renewal screen shows the notice deadline when the contract's notice period is entered |
| L12 | Claims from an insurance contract are time-barred after **2 years** (5 years for personal insurance) | S1 art. 36 | LAW | Input to the retention policy (legal review needed) |
| L13 | Motor third-party liability is compulsory for every land motor vehicle | S1 art. 120 | LAW | Each motor contract must record the RC cover. Expiry alerts are a core feature |
| L14 | Minimum RC cover 50,000,000 DH per vehicle and event (25,000,000 DH for two-wheelers ≤ 2 CV). Paid passenger transport: carrier RC ≥ 1,000,000 DH × authorised seats and ≥ 50,000,000 DH | S1 art. 123 | LAW | Passenger-transport vehicles need **number of authorised seats**; two-wheelers need their **fiscal power (CV) or their cylindrée** (owner, 29/10/2026: art. 123 uses the CV only to allow 25,000,000 DH for a two-wheeler ≤ 2 CV, and the RMA platform sheet of a moped prints its cylindrée, « 49 » before « 2.R », never a CV; server and database check). The app does not check insurer amounts |
| L15 | Attestation numbers and formats are allocated by the authorities; an attestation is valid only for the period printed on it | S2 | LAW | Store attestation number, validity start and end, and a scan. Never generate attestations |
| L16 | Attestation model depends on vehicle **usage**. ACAPS lettre circulaire of 19/02/2026: electric motor vehicles **falling under « Divers »** receive the white attestation, model D, not the yellow « Tourisme » one. Not every electric vehicle is model D | S2, S14, S20 | LAW + PRESS | Vehicle usage is a controlled list. The list values must come from S2 or the insurers, not invented. The app never derives the model from the fuel: the usage chosen for the vehicle decides it (owner's clarification of 23/10/2026). The circular itself has not been read; the condition comes from the press and the owner |
| L17 | QR-code electronic attestations: pilot from 01/07/2026; paper planned to end from 01/07/2027 | S13 | PRESS | Store the electronic attestation file and its reference. No QR generation |
| L18 | An intermediary works from a single premises | S1 art. 301 | LAW | Consistent with a single-site LAN deployment |
| L19 | Intermediaries are inspected by ACAPS and report on their activity: registers per insurer (art. 135) and a yearly filing before 30 April on the ACAPS platform (art. 136: staff list, démarcheurs, balance-sheet extract, criminal-record extract) | S1 art. 315–316; S21 art. 135–136 | LAW (register layouts: UNKNOWN) | Reliable audit log and exports. Registers produced once the layouts of annexes 61–62 are obtained |
| L20 | Intermediaries must follow loi 9-88 on accounting obligations; accounting documents are kept **10 years** | S1 art. 319; S29 | LAW (10 years: secondary source) | Financial records are never deleted. The 10-year period is to confirm with an accountant |
| L21 | Accident without injuries: paper constat amiable still used; e-constat exists, only on agents constateurs' phones | S18 | PRESS | Claims store the constat (scan or e-constat reference). No constat form generated |
| L22 | Personal data processing must be declared to the CNDP beforehand (forms F211 normal, F214 simplified); prior authorisation for sensitive data | S17 | LAW | See legal questions in `docs/requirements.md`. No compliance claim |
| L23 | A provisional attestation is valid **one month at most**, issued while the contract is being established; the insurer then gives the subscriber a **note de couverture** | S2 art. 2; S19 (printed on 14 P and 91 P) | LAW | Provisional attestations recorded on contracts cannot exceed one month; the note de couverture is recorded with them. Exactly one month is allowed (since 30/10/2026): the RMA platform prints 18H to 18H the same day a month later, which does not exceed the month. Owner, 29/10/2026: a provisional « can be taken 3 times »; the arrêté has no such limit (read 29/10/2026), so it is never refused. The owner then made it precise: 3 **in a row**, the next must be definitive; the scan review warns when the vehicle's last 3 attestations (not cancelled) are provisional |
| L24 | Attestations follow **8 numbered models**, each with its colour: 1 tourisme (yellow), 2 public passenger transport (light grey), 3 goods transport (light blue), 4 two/three-wheelers (light green), 5 divers (white), 6 garagistes (light brown), 7 provisional (pink), 8 border insurance (light violet) | S2 art. 2 (amended 2019, BO 6778) | LAW | Each catalogue model shows its official number and colour; each series is linked to one of these models in the catalogue (by default the letter printed on it: 14 A → A); the link is the agency's configuration |
| L25 | The « garagistes » attestation is for garages and professionals who broker, sell, repair, tow or inspect vehicles, for the vehicles entrusted to them | S2 art. 2 | LAW | Model 6 is for these professionals, not for private vehicles |
| L26 | After loss or theft, the insurer issues a **duplicate** marked « DUPLICATA » with the original attestation's number | S2 art. 2 | LAW | Contracts can record a duplicate linked to the original; the agency does not produce it |
| L27 | Attestation serial numbers and formats are allocated to insurers by the Minister of Finance or a delegated professional body | S2 art. 2 | LAW | Numbers are entered as printed, never generated (also L15) |
| L28 | A **new attestation** is issued with every amendment that changes a detail printed on it; green or orange card on request, for the set accessory fee | S2 art. 3 | LAW | An amendment that changes attestation details asks for a new attestation record |
| L29 | At expiry (on request) or termination, the insurer gives a **relevé d'information**: subscription and cover period, usage and plate, insured's identity, each claim with date and the insured's liability | S2 art. 4 | LAW | The relevé received from the insurer can be attached to the contract; the insured gives it to a new insurer |
| L30 | An intermediary collects premiums only if the traité de nomination or convention authorises it; otherwise payment only by crossed, non-endorsable cheque to the insurer | S21 art. 125, 129 | LAW | The agency is authorised for RMA and CAT (owner, 23/10/2026; traité clause to supply): all payment methods allowed |
| L31 | The intermediary hands the payer a **receipt immediately**; for an authorised agent it counts as given by the insurer | S21 art. 128 | LAW | A receipt for every payment, at the time of payment |
| L32 | Collected premiums are **declared** to the insurer within **10 days** of collection unless agreed otherwise, possibly through the insurer's application | S21 art. 130 | LAW | Track "collected, not yet declared" per insurer, due 10 days after collection by default |
| L33 | Instalment premiums and premiums of tacitly renewed contracts unpaid 10 days after their due date are declared in writing to the insurer | S21 art. 131 | LAW | Alert on instalments unpaid for more than 10 days |
| L34 | Each insurer sends the intermediary a **half-yearly statement** of amounts due within 20 days of the half-year end; the intermediary approves it or comments within 20 days of receipt | S21 art. 134 | LAW | Half-yearly reconciliation per insurer, with the reply deadline |
| L35 | The intermediary keeps, per insurer, a **register of production acts** and a **register of claims, settlements and recourses** (annexes 61 and 62) | S21 art. 135 | LAW | Registers produced once the annex layouts are obtained |
| L36 | The insured pays the **Fonds de garantie des accidents de la circulation** a contribution of **1,5 %** of the motor third-party-liability premium, collected and paid over by the insurer | S23 art. 3 (code art. 140) | LAW | An amount the insurer computes; the agency records it as printed on the insurer's documents. Configurable, never calculated by the app |
| L37 | Catastrophic events (EVCAT) cover on motor contracts costs **3,5 %** of the RC premium (**2 %** for public passenger transport) and **1,5 %** of the optional covers' premium | S24 | PUBLIC (ACAPS guidance) | Same: recorded from the insurer, never calculated |
| L38 | The parafiscal **taxe de solidarité contre les événements catastrophiques** (FSEC) rose from 1 % to **1,5 %** of premiums (décret 2-24-1123, BO 18/09/2025) | S26 | PRESS | The « taxe parafiscale FSEC » line of the CAT form (C12); decree text to read before any use |
| L39 | The **taxe sur les contrats d'assurances** on motor risks is **14 %** of premiums (13,80 % on the older DGI page), paid by the insurer monthly | S27 | PRESS (rate to confirm in the CGI) | Recorded from the insurer's documents; never calculated |
| L40 | Plates: since BO n° 7531 (03/08/2026) the Arabic series letter is shown with its official Latin equivalent and « MA »: أ A, ب B, د D, هـ H, و E, ط T, ي Y, ك K, ل L, م M, ن N, ص C, ف F, ر R, س S. Old plates stay until the next transfer of ownership; international use from 01/01/2027; two-wheelers from 01/01/2027 | S28 | PRESS (BO text not read) | Answers question 12: the app can match a plate written with either letter through this table, keeping what was entered. To build once the BO text is read |

## B. RMA Assurance (public information)

| Id | Item | Source | Status | Notes / what must be confirmed |
|---|---|---|---|---|
| R1 | Auto products listed: "Basic'OTO" (RC, Évènement Catastrophique, Assistance Optimale), "Offre expérimentés", "Offre WW" (new vehicle), "Auto IKTISSADIA", "TOUS RISQUES HANI" | S3 | PUBLIC | Which ones this agency sells; internal product codes; required documents. Prices on the page (325 DH, 225 DH) are marketing figures and are **not** stored as tariffs |
| R2 | Assistance Optimale: 3-day replacement vehicle twice a year, unlimited towing | S3 | PUBLIC | Description only |
| R3 | Claims options: RMA Services, garages agréés, "Hifad Express", remote expertise, normal procedure | S3 | PUBLIC | Claims can record the chosen procedure as free text until a confirmed list exists |
| R4 | Motorcycle: RC compulsory; "tous risques" optional; assistance "RMASSIST'Moto Zen" (389 DH/an shown) | S4 | PUBLIC | Whether the agency sells moto products; premium factors (cylinder, age, experience, claims history) are RMA's, not ours |
| R5 | Claim steps: call 2526, constat amiable, police or gendarmerie if injuries, declare by phone, online space or intermediary; **do not repair before the expert's examination** | S5 | PUBLIC | Claims checklist entry "do not repair before expertise" |
| R6 | Claim document list and deadlines | S5 | UNKNOWN | Not published. Ask the agency |
| R7 | Taxi, passenger transport, goods transport and fleet products | — | UNKNOWN | Nothing on the public consumer site. Ask the agency |
| R8 | Subscription and renewal online (direct.rmaassurance.com) | S3 | PUBLIC | Not an agency integration. No API use |
| R9 | Attestation series: **14 P** provisional, **14 A** Tourisme, **14 C** Transport de marchandises, **14 E** two/three-wheelers; 9-digit serial numbers | S19 | DOCUMENT | Seeded in the catalogue as « à confirmer ». Basis for attestation stock tracking (contracts phase) |
| R10 | Conditions particulières fields: police, attestation, effet, échéance, durée, périodicité, formule, package, convention, assistance; driver (birth date, licence and date); vehicle (MEC date, valeur à neuf, valeur vénale, puissance/PTC, genre, C.R.M., organisme de crédit); guarantees table (mode, montant assuré, franchise, prime nette); PTA / GIH block (décès, invalidité, frais médicaux, indemnité journalière); prime nette, taxes, accessoires, taxe CNPAC, timbre, total | S19 | DOCUMENT | Field list for contracts (Phase 6). No amount is taken from the form |
| R12 | Platform PDF of an avenant (vehicle change): same layout as the attestation PDF, titled « AVENANT DE CHANGEMENT DE VEHICULE N <number> »; same policy number; a new attestation for the rest of the contract (end date unchanged, start = the change date; the sheet may be printed later); the seven totals are the avenant's own amount  while the guarantee lines show the year's premiums; a plate and no chassis line | S31 | DOCUMENT | Read by `scans/platform.js` (avenant number and kind; vehicle block without chassis). Owner, 28/10/2026: effective date = attestation start; the old paper attestation comes back to the agency; the old vehicle is archived with its history kept. Registration-change title not seen yet (matched on « IMMATRICULATION »); any other avenant is left to the employee |
| R11 | GAMA « Type d'usage » groups: LOCATION (LOCATION C.I.); CYCLOMOTER (cylindrée < 50 cm3 vitesse < 60 or > 60 km/h, entre 50 et 125 cm3, motocyclette sans side-car > 125 cm3); DIVERS (about 35 special vehicles, most split ≤ 3,5 T / + 3,5 T: garagiste, engins, tracteurs, ambulances, corbillards, dépannage, incendie, ordures, transport des écoliers or du personnel, matières inflammables, auto-écoles, véhicules à moteur électrique…); TOURISME; C1 (commerce ≤ 3,5 T); C2 (commerce + 3,5 T). No taxi or public passenger transport seen. The chosen usage is printed on the platform PDF | S30 | DOCUMENT | Product proposed on a scan (owner, 28/10/2026): TOURISME → Véhicules de tourisme, < 50 cm3 → Scooters, > 125 cm3 → Motos, C1 → Véhicules utilitaires, C2 → Camions et poids lourds, only when it fits the attestation model and the agency has no earlier choice for that kind of sheet. 50–125 cm3, LOCATION and DIVERS are left to the agency's choice. How is an RMA taxi entered? **Recorded in the app (`feature/rma-usages`, owner 29/10/2026):** the 42 usages, each under its legal usage — LOCATION C.I. and every DIVERS usage → Divers (model D, S32 9°), CYCLOMOTER → deux ou trois roues (E), TOURISME → Tourisme (A), C1 / C2 → Transport de marchandises (C); GARAGISTE left out (own model 6/G, garages handled later). Proposed from the printed usage, never invented. **Owner 29/10/2026:** a label cut short (« CYLINDRÉE < 50 CM3 VITESSE ») offers only the usages it may be; an electric moped on a white 14 D sheet keeps its moped usage on Divers and is a Scooter (agency's answer) |

## C. CAT Assurance & Réassurance (public information)

| Id | Item | Source | Status | Notes / what must be confirmed |
|---|---|---|---|---|
| C1 | Taxi packs: RAHTI, RAHTI +, MIHANI, IFOULKI, TAWFIR (new taxis), MZIYA CHAMMEL. All include compulsory RC; ceilings differ for Petit Taxi and Grand Taxi | S6 | PUBLIC | Which packs the agency sells; ceilings stored only as description text |
| C2 | Taxi type: Petit taxi / Grand taxi; fuel: diesel / essence; date of first registration | S7 | PUBLIC | Vehicle fields for taxis |
| C3 | Transport quote categories: "transport touristique", "transport personnel", "transport scolaire", "transport autocar"; periods 12, 6 or 3 months | S7 | PUBLIC | Contracts must support 3-, 6- and 12-month terms |
| C4 | Fleet: **minimum 5 vehicles**; annual contract with tacit renewal; renewal proposal; vehicle statement for new business; final certificates before effective date without provisional ones; vehicles added, removed or transferred; quarterly or half-yearly premium instalments | S8 | PUBLIC | Fleet module: movements (incorporation / retrait) as dated amendments; instalment schedule from the insurer |
| C5 | Border insurance for foreign-registered vehicles without a valid green card: 5 days, 10 days, 1, 3 or 6 months, renewable; tourism, mopeds, taxis, trucks, utility, vans, coaches | S9 | PUBLIC | Sold via agents too. Ask whether this agency sells it |
| C6 | Triporteur insurance "désormais disponible" | S10, S19 | DOCUMENT | The agency's form « CAT-Assurance Triporteur » shows it is sold; product details to ask |
| C7 | Services: DABA CAT (expert on site with constat provider, platform 7/7 7:30–22:30), CAT TAAWID EXPRESS (taxis), IJI daily allowance, assistance médicale / technique, DABA CASH | S6, S11 | PUBLIC | Claims can record which service was used |
| C8 | Claim procedure, deadlines, documents | — | UNKNOWN | `/fr/en-cas-daccident` returned 404 on 22/10/2026. Ask the agency |
| C9 | Private car and motorcycle products | — | UNKNOWN | Not found on the public site. Ask the agency |
| C10 | Practical documents | S12 | PUBLIC | Only flyers and posters; no forms |
| C11 | Attestation series: **91 P** provisional (with note de couverture), **91 E** two/three-wheelers; 9-digit serial numbers. The 91 P form (printed 07/2024) states « Contribution des assurés au profit du CNPAC : 15 dhs accessoires (2 dhs) = 17 dhs » | S19 | DOCUMENT | Series seeded « à confirmer ». The amount is **not** a tariff in the app until the agency confirms it is current |
| C12 | Note de couverture and conditions particulières fields: intermédiaire, code, code MF, agrément, effet, expiration, durée (months), réduction zones sahariennes, antécédents sinistres (corporels / matériels), coefficient majoration/réduction (CRM); guarantees (RC illimitée, dommage collision, dommages au véhicule, incendie, vol, bris de glaces, défense et recours, remorque, événements catastrophiques RC / GA) with montant, franchise, prime annuelle, prime au comptant; PPC (formule, décès, invalidité, frais médicaux, indemnité journalière); prime nette, taxe, CNPAC or NARSA, taxe parafiscale FSEC, prime TTC | S19 | DOCUMENT | Field list for contracts (Phase 6). No amount is taken from the form |

## D. Not available publicly (blocking for enforced rules)

These need documents from the agency (blank or fully anonymised):

1. Internal subscription form / proposition d'assurance for each insurer.
2. Required document checklist per product (subscription, renewal, amendment, claim).
3. Format of quote, policy number, attestation number and receipt (quittance) numbers.
4. How the agency issues policies and attestations today (insurer portal? software provided by RMA / CAT?).
5. Premium remittance procedure and deadline (bordereaux) for each insurer.
6. Claim declaration forms and the documents each insurer asks for.
7. ACAPS reporting formats that apply to agents.
