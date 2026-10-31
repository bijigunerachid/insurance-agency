-- CreateEnum
CREATE TYPE "VerificationStatus" AS ENUM ('TO_CONFIRM', 'CONFIRMED');

-- CreateEnum
CREATE TYPE "RuleStatus" AS ENUM ('LAW', 'PUBLIC', 'PRESS', 'DOCUMENT', 'UNKNOWN', 'CONFIRMED');

-- CreateEnum
CREATE TYPE "AttestationKind" AS ENUM ('PROVISIONAL', 'DEFINITIVE');

-- CreateEnum
CREATE TYPE "ProductLine" AS ENUM ('CAR', 'MOTORCYCLE', 'TAXI', 'PASSENGER_TRANSPORT', 'COMMERCIAL', 'TRIPORTEUR', 'FLEET', 'BORDER');

-- AlterTable
ALTER TABLE "vehicle" ADD COLUMN     "usageId" UUID;

-- CreateTable
CREATE TABLE "insurer" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "code" VARCHAR(16) NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "insurer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vehicle_usage" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "label" VARCHAR(80) NOT NULL,
    "source" VARCHAR(300) NOT NULL,
    "status" "VerificationStatus" NOT NULL DEFAULT 'TO_CONFIRM',
    "confirmedAt" TIMESTAMPTZ(3),
    "confirmedById" UUID,
    "confirmationRef" VARCHAR(200),
    "active" BOOLEAN NOT NULL DEFAULT true,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "vehicle_usage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "attestation_series" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "insurerId" UUID NOT NULL,
    "code" VARCHAR(8) NOT NULL,
    "kind" "AttestationKind" NOT NULL,
    "usageId" UUID,
    "source" VARCHAR(300) NOT NULL,
    "status" "VerificationStatus" NOT NULL DEFAULT 'TO_CONFIRM',
    "confirmedAt" TIMESTAMPTZ(3),
    "confirmedById" UUID,
    "confirmationRef" VARCHAR(200),
    "active" BOOLEAN NOT NULL DEFAULT true,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "attestation_series_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "product" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "insurerId" UUID NOT NULL,
    "line" "ProductLine" NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "insurerCode" VARCHAR(40),
    "description" VARCHAR(2000),
    "source" VARCHAR(300) NOT NULL,
    "status" "VerificationStatus" NOT NULL DEFAULT 'TO_CONFIRM',
    "confirmedAt" TIMESTAMPTZ(3),
    "confirmedById" UUID,
    "confirmationRef" VARCHAR(200),
    "active" BOOLEAN NOT NULL DEFAULT true,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "product_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "insurer_rule" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "code" VARCHAR(8) NOT NULL,
    "insurerId" UUID,
    "statement" VARCHAR(1000) NOT NULL,
    "effect" VARCHAR(1000) NOT NULL,
    "source" VARCHAR(400) NOT NULL,
    "status" "RuleStatus" NOT NULL,
    "reviewedAt" TIMESTAMPTZ(3),
    "reviewedById" UUID,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "insurer_rule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rule_review" (
    "id" BIGSERIAL NOT NULL,
    "ruleId" UUID NOT NULL,
    "fromStatus" "RuleStatus" NOT NULL,
    "toStatus" "RuleStatus" NOT NULL,
    "note" VARCHAR(500) NOT NULL,
    "reference" VARCHAR(200),
    "reviewerId" UUID NOT NULL,
    "at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "rule_review_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "insurer_code_key" ON "insurer"("code");

-- CreateIndex
CREATE UNIQUE INDEX "insurer_name_key" ON "insurer"("name");

-- CreateIndex
CREATE UNIQUE INDEX "vehicle_usage_label_key" ON "vehicle_usage"("label");

-- CreateIndex
CREATE UNIQUE INDEX "attestation_series_insurerId_code_key" ON "attestation_series"("insurerId", "code");

-- CreateIndex
CREATE INDEX "product_line_idx" ON "product"("line");

-- CreateIndex
CREATE UNIQUE INDEX "product_insurerId_name_key" ON "product"("insurerId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "insurer_rule_code_key" ON "insurer_rule"("code");

-- CreateIndex
CREATE INDEX "insurer_rule_insurerId_idx" ON "insurer_rule"("insurerId");

-- CreateIndex
CREATE INDEX "rule_review_ruleId_at_idx" ON "rule_review"("ruleId", "at");

-- CreateIndex
CREATE INDEX "vehicle_usageId_idx" ON "vehicle"("usageId");

-- AddForeignKey
ALTER TABLE "vehicle" ADD CONSTRAINT "vehicle_usageId_fkey" FOREIGN KEY ("usageId") REFERENCES "vehicle_usage"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vehicle_usage" ADD CONSTRAINT "vehicle_usage_confirmedById_fkey" FOREIGN KEY ("confirmedById") REFERENCES "app_user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attestation_series" ADD CONSTRAINT "attestation_series_insurerId_fkey" FOREIGN KEY ("insurerId") REFERENCES "insurer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attestation_series" ADD CONSTRAINT "attestation_series_usageId_fkey" FOREIGN KEY ("usageId") REFERENCES "vehicle_usage"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attestation_series" ADD CONSTRAINT "attestation_series_confirmedById_fkey" FOREIGN KEY ("confirmedById") REFERENCES "app_user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product" ADD CONSTRAINT "product_insurerId_fkey" FOREIGN KEY ("insurerId") REFERENCES "insurer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product" ADD CONSTRAINT "product_confirmedById_fkey" FOREIGN KEY ("confirmedById") REFERENCES "app_user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "insurer_rule" ADD CONSTRAINT "insurer_rule_insurerId_fkey" FOREIGN KEY ("insurerId") REFERENCES "insurer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "insurer_rule" ADD CONSTRAINT "insurer_rule_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "app_user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rule_review" ADD CONSTRAINT "rule_review_ruleId_fkey" FOREIGN KEY ("ruleId") REFERENCES "insurer_rule"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rule_review" ADD CONSTRAINT "rule_review_reviewerId_fkey" FOREIGN KEY ("reviewerId") REFERENCES "app_user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------
-- Hand-written additions. See docs/data-model.md and docs/insurer-rules.md.
-- ---------------------------------------------------------------------------

ALTER TABLE "insurer"
  ADD CONSTRAINT "insurer_code_format" CHECK ("code" ~ '^[A-Z0-9]{2,16}$'),
  ADD CONSTRAINT "insurer_name_not_blank" CHECK (length(btrim("name")) > 0),
  ADD CONSTRAINT "insurer_version_positive" CHECK ("version" >= 1);

-- A confirmed entry always says who confirmed it, when, and from which document.
ALTER TABLE "vehicle_usage"
  ADD CONSTRAINT "vehicle_usage_label_not_blank" CHECK (length(btrim("label")) > 0),
  ADD CONSTRAINT "vehicle_usage_source_not_blank" CHECK (length(btrim("source")) > 0),
  ADD CONSTRAINT "vehicle_usage_confirmation" CHECK (
    ("status" = 'CONFIRMED' AND "confirmedAt" IS NOT NULL AND "confirmedById" IS NOT NULL AND "confirmationRef" IS NOT NULL)
    OR ("status" = 'TO_CONFIRM' AND "confirmedAt" IS NULL AND "confirmedById" IS NULL AND "confirmationRef" IS NULL)
  ),
  ADD CONSTRAINT "vehicle_usage_version_positive" CHECK ("version" >= 1);

ALTER TABLE "attestation_series"
  ADD CONSTRAINT "attestation_series_code_format" CHECK ("code" ~ '^[0-9]{1,3} [A-Z]{1,2}$'),
  ADD CONSTRAINT "attestation_series_usage_required" CHECK ("kind" = 'PROVISIONAL' OR "usageId" IS NOT NULL),
  ADD CONSTRAINT "attestation_series_source_not_blank" CHECK (length(btrim("source")) > 0),
  ADD CONSTRAINT "attestation_series_confirmation" CHECK (
    ("status" = 'CONFIRMED' AND "confirmedAt" IS NOT NULL AND "confirmedById" IS NOT NULL AND "confirmationRef" IS NOT NULL)
    OR ("status" = 'TO_CONFIRM' AND "confirmedAt" IS NULL AND "confirmedById" IS NULL AND "confirmationRef" IS NULL)
  ),
  ADD CONSTRAINT "attestation_series_version_positive" CHECK ("version" >= 1);

ALTER TABLE "product"
  ADD CONSTRAINT "product_name_not_blank" CHECK (length(btrim("name")) > 0),
  ADD CONSTRAINT "product_source_not_blank" CHECK (length(btrim("source")) > 0),
  ADD CONSTRAINT "product_confirmation" CHECK (
    ("status" = 'CONFIRMED' AND "confirmedAt" IS NOT NULL AND "confirmedById" IS NOT NULL AND "confirmationRef" IS NOT NULL)
    OR ("status" = 'TO_CONFIRM' AND "confirmedAt" IS NULL AND "confirmedById" IS NULL AND "confirmationRef" IS NULL)
  ),
  ADD CONSTRAINT "product_version_positive" CHECK ("version" >= 1);

ALTER TABLE "insurer_rule"
  ADD CONSTRAINT "insurer_rule_code_format" CHECK ("code" ~ '^[A-Z]{1,3}[0-9]{1,4}$'),
  ADD CONSTRAINT "insurer_rule_text_not_blank" CHECK (
    length(btrim("statement")) > 0 AND length(btrim("effect")) > 0 AND length(btrim("source")) > 0
  ),
  ADD CONSTRAINT "insurer_rule_review_fields" CHECK (("reviewedAt" IS NULL) = ("reviewedById" IS NULL)),
  ADD CONSTRAINT "insurer_rule_version_positive" CHECK ("version" >= 1);

ALTER TABLE "rule_review"
  ADD CONSTRAINT "rule_review_note_not_blank" CHECK (length(btrim("note")) > 0),
  -- CONFIRMED means "confirmed by the agency or insurer": the document must be named.
  ADD CONSTRAINT "rule_review_confirmed_reference" CHECK (
    "toStatus" <> 'CONFIRMED' OR length(btrim(coalesce("reference", ''))) > 0
  );

-- Review history is append-only, like the audit log.
CREATE FUNCTION "rule_review_reject_change"() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'rule_review is append-only';
END;
$$;
CREATE TRIGGER "rule_review_no_update_delete"
  BEFORE UPDATE OR DELETE ON "rule_review"
  FOR EACH ROW EXECUTE FUNCTION "rule_review_reject_change"();

INSERT INTO "role_permission" ("roleId", "permission")
SELECT r."id", p.permission
FROM "role" r
JOIN (VALUES
  ('ADMIN', 'catalogue.read'), ('ADMIN', 'catalogue.manage'),
  ('MANAGER', 'catalogue.read'), ('MANAGER', 'catalogue.manage'),
  ('AGENT', 'catalogue.read'),
  ('AUDITOR', 'catalogue.read')
) AS p(role_code, permission) ON p.role_code = r."code";

-- Runtime role: no DELETE (entries are deactivated); review history is insert-only.
GRANT SELECT, INSERT, UPDATE ON "insurer", "vehicle_usage", "attestation_series", "product", "insurer_rule" TO app_runtime;
GRANT SELECT, INSERT ON "rule_review" TO app_runtime;
GRANT USAGE ON SEQUENCE "rule_review_id_seq" TO app_runtime;

-- reference-data:begin
-- Reference rows, all with their source. Usages and series come from the blank forms the agency
-- supplied on 22/10/2026 and stay TO_CONFIRM until a manager confirms them. Rules are the
-- register of docs/insurer-rules.md (research of 22/10/2026), translated for the interface.
-- Integration tests re-run this block after emptying the tables (test/integration/support.js).

INSERT INTO "insurer" ("code", "name", "updatedAt") VALUES
  ('RMA', 'RMA (Royale Marocaine d’Assurance)', CURRENT_TIMESTAMP),
  ('CAT', 'CAT Assurance & Réassurance', CURRENT_TIMESTAMP);

INSERT INTO "vehicle_usage" ("label", "source", "updatedAt") VALUES
  ('Tourisme', 'Attestation RMA série 14 A (formulaire vierge fourni par l’agence le 22/10/2026)', CURRENT_TIMESTAMP),
  ('Transport de marchandises', 'Attestation RMA série 14 C (formulaire vierge fourni par l’agence le 22/10/2026)', CURRENT_TIMESTAMP),
  ('Véhicules à deux ou trois roues', 'Attestations RMA série 14 E et CAT série 91 E (formulaires vierges fournis par l’agence le 22/10/2026)', CURRENT_TIMESTAMP);

INSERT INTO "attestation_series" ("insurerId", "code", "kind", "usageId", "source", "updatedAt")
SELECT i."id", s.code, s.kind::"AttestationKind", u."id", s.source, CURRENT_TIMESTAMP
FROM (VALUES
  ('RMA', '14 P', 'PROVISIONAL', NULL, 'Attestation provisoire RMA 14 P (formulaire fourni par l’agence le 22/10/2026)'),
  ('RMA', '14 A', 'DEFINITIVE', 'Tourisme', 'Attestation RMA 14 A, usage Tourisme (formulaire fourni par l’agence le 22/10/2026)'),
  ('RMA', '14 C', 'DEFINITIVE', 'Transport de marchandises', 'Attestation RMA 14 C, usage Transport de marchandises (formulaire fourni par l’agence le 22/10/2026)'),
  ('RMA', '14 E', 'DEFINITIVE', 'Véhicules à deux ou trois roues', 'Attestation RMA 14 E, véhicules à deux ou trois roues (formulaire fourni par l’agence le 22/10/2026)'),
  ('CAT', '91 P', 'PROVISIONAL', NULL, 'Attestation provisoire et note de couverture CAT 91 P (formulaire fourni par l’agence le 22/10/2026)'),
  ('CAT', '91 E', 'DEFINITIVE', 'Véhicules à deux ou trois roues', 'Attestation CAT 91 E, véhicules à deux ou trois roues (formulaire fourni par l’agence le 22/10/2026)')
) AS s(insurer_code, code, kind, usage_label, source)
JOIN "insurer" i ON i."code" = s.insurer_code
LEFT JOIN "vehicle_usage" u ON u."label" = s.usage_label;

INSERT INTO "insurer_rule" ("code", "insurerId", "statement", "effect", "source", "status", "updatedAt")
SELECT r.code, i."id", r.statement, r.effect, r.source, r.status::"RuleStatus", CURRENT_TIMESTAMP
FROM (VALUES
  ('L1', NULL, 'Un agent d’assurances peut représenter au plus deux entreprises d’assurances, avec l’accord de la première.', 'RMA et CAT sont le maximum. Activer un troisième assureur demande une confirmation explicite.', 'Loi 17-99, art. 292', 'LAW'),
  ('L2', NULL, 'Les notes de couverture et attestations au nom de l’intermédiaire sont interdites.', 'L’application ne produit jamais de document ressemblant à une note de couverture, une attestation ou une police.', 'Loi 17-99, art. 302-1°', 'LAW'),
  ('L3', NULL, 'Détenir des imprimés falsifiés (polices, notes de couverture, attestations) ou des appareils permettant de les confectionner est une infraction pénale.', 'Aucun modèle imitant un document d’assureur. Les documents officiels sont seulement enregistrés (numéro, copie numérisée).', 'Loi 17-99, art. 328', 'LAW'),
  ('L4', NULL, 'L’intermédiaire ne peut encaisser plus que la prime fixée par l’assureur, ni accorder de ristourne ou de réduction sur la prime.', 'Aucun champ de remise sur les paiements. Le montant dû vient uniquement de la prime confirmée par l’assureur.', 'Loi 17-99, art. 302-3°', 'LAW'),
  ('L5', NULL, 'Les primes encaissées doivent être reversées aux assureurs dans les délais fixés par circulaire de l’ACAPS.', 'Suivi « encaissé, non reversé » par assureur. Délai paramétrable, laissé vide tant qu’il n’est pas confirmé (presse : 15 jours après le mois d’encaissement).', 'Loi 17-99, art. 318 ; délai : presse (TelQuel 2016, Boursenews 2016)', 'LAW'),
  ('L6', NULL, 'L’intermédiaire ne peut pas accorder de délai de paiement de sa propre initiative.', 'Aucun crédit ni échéancier créé par l’agence ; des échéances seulement si le contrat de l’assureur les prévoit.', 'Presse (TelQuel, 14/03/2016)', 'PRESS'),
  ('L7', NULL, 'L’assuré doit déclarer un sinistre dans les 5 jours où il en a connaissance ; le contrat peut allonger ce délai, pas le réduire.', 'Les sinistres montrent les dates de déclaration à l’agence et à l’assureur, avec une alerte après 5 jours. L’application ne décide pas d’une déchéance.', 'Loi 17-99, art. 20-5°', 'LAW'),
  ('L8', NULL, 'Événements catastrophiques : délai de déclaration porté de 20 à 60 jours par la loi 43-24.', 'Délai paramétrable par type d’incident, à confirmer au Bulletin officiel.', 'Loi 17-99, art. 64-5, modifiée par la loi 43-24 (presse : Médias24, 03/09/2024)', 'PRESS'),
  ('L9', NULL, 'Prime impayée : après 10 jours, l’assureur peut suspendre la garantie 20 jours après une mise en demeure et résilier le contrat 10 jours plus tard.', 'L’application enregistre le statut notifié par l’assureur (suspendu, résilié) et sa date ; elle ne le fixe jamais d’elle-même.', 'Loi 17-99, art. 21', 'LAW'),
  ('L10', NULL, 'La tacite reconduction doit figurer au contrat ; chaque prolongation tacite dure un an au plus.', 'Indicateur « tacite reconduction » sur le contrat ; les renouvellements sont des enregistrements liés.', 'Loi 17-99, art. 7', 'LAW'),
  ('L11', NULL, 'Préavis de résiliation : minimum contractuel entre 30 et 90 jours ; droit de résiliation après un an.', 'L’écran de renouvellement montre la date limite de préavis quand le préavis du contrat est saisi.', 'Loi 17-99, art. 6', 'LAW'),
  ('L12', NULL, 'Les actions dérivant d’un contrat d’assurance se prescrivent par 2 ans (5 ans pour les assurances de personnes).', 'Élément de la politique de conservation des données (revue juridique nécessaire).', 'Loi 17-99, art. 36', 'LAW'),
  ('L13', NULL, 'L’assurance de responsabilité civile est obligatoire pour tout véhicule terrestre à moteur.', 'Chaque contrat automobile enregistre la garantie RC. Les alertes d’échéance sont une fonction centrale.', 'Loi 17-99, art. 120', 'LAW'),
  ('L14', NULL, 'RC minimale : 50 000 000 DH par véhicule et par événement (25 000 000 DH pour les deux-roues de 2 CV au plus). Transport payant de personnes : au moins 1 000 000 DH par place autorisée et 50 000 000 DH.', 'Nombre de places obligatoire pour les taxis et le transport de personnes, puissance fiscale pour les deux-roues. L’application ne vérifie pas les montants de l’assureur.', 'Loi 17-99, art. 123', 'LAW'),
  ('L15', NULL, 'Les numéros et modèles d’attestation sont fixés par l’autorité ; une attestation n’est valable que pour la période qui y figure.', 'Enregistrer le numéro d’attestation, ses dates de validité et sa copie numérisée. Ne jamais générer d’attestation.', 'Arrêté n° 213-05 du 26/01/2005', 'LAW'),
  ('L16', NULL, 'Le modèle d’attestation dépend de l’usage du véhicule. L’ACAPS (19/02/2026) a exigé le modèle blanc « Divers » pour les véhicules électriques, et non le jaune « Tourisme ».', 'L’usage du véhicule est une liste contrôlée ; ses valeurs viennent de l’arrêté, des formulaires ou des assureurs, jamais inventées.', 'Arrêté n° 213-05 ; presse (Le Matin, Hespress) sur la lettre circulaire ACAPS du 19/02/2026', 'LAW'),
  ('L17', NULL, 'Attestations électroniques à QR code : pilote depuis le 01/07/2026 ; fin du papier prévue à partir du 01/07/2027.', 'Enregistrer le fichier et la référence de l’attestation électronique. Aucune génération de QR code.', 'Presse (Boursenews, 08/10/2026)', 'PRESS'),
  ('L18', NULL, 'Un intermédiaire exerce depuis un seul local.', 'Cohérent avec un déploiement sur le réseau local d’un seul site.', 'Loi 17-99, art. 301', 'LAW'),
  ('L19', NULL, 'Les intermédiaires sont contrôlés par l’ACAPS et rendent compte de leur activité selon les formats de ses circulaires.', 'Journal d’audit fiable et exports. Formats de rapport seulement quand la circulaire sera obtenue.', 'Loi 17-99, art. 315 et 316 (formats non trouvés)', 'LAW'),
  ('L20', NULL, 'Les intermédiaires respectent la loi 9-88 relative aux obligations comptables.', 'Les données financières ne sont jamais supprimées. Durée de conservation à confirmer avec un comptable.', 'Loi 17-99, art. 319', 'LAW'),
  ('L21', NULL, 'Accident sans blessé : le constat amiable papier reste utilisé ; l’e-constat existe, sur les téléphones des agents constateurs.', 'Les sinistres enregistrent le constat (copie numérisée ou référence e-constat). Aucun formulaire de constat généré.', 'Presse et sites tiers (Atlas Mag, Démarches Maroc)', 'PRESS'),
  ('L22', NULL, 'Le traitement de données personnelles doit être déclaré à la CNDP au préalable (formulaire F211 normal, F214 simplifié) ; autorisation préalable pour les données sensibles.', 'Voir les questions juridiques de docs/requirements.md. Aucune affirmation de conformité.', 'Loi 09-08 ; site de la CNDP', 'LAW'),
  ('L23', NULL, 'La période de garantie d’une attestation provisoire est d’un mois au plus.', 'Une fois la règle confirmée, les attestations provisoires enregistrées dans les contrats ne pourront pas dépasser un mois.', 'Mention imprimée sur les attestations provisoires RMA 14 P et CAT 91 P (formulaires fournis par l’agence le 22/10/2026)', 'DOCUMENT'),
  ('R1', 'RMA', 'Produits automobiles présentés : « Basic’OTO » (RC, Évènement Catastrophique, Assistance Optimale), « Offre expérimentés », « Offre WW » (véhicule neuf), « Auto IKTISSADIA », « TOUS RISQUES HANI ».', 'À confirmer : produits vendus par l’agence, codes internes, pièces demandées. Les prix affichés sur le site ne sont pas des tarifs.', 'rmaassurance.com/fr/automobile', 'PUBLIC'),
  ('R2', 'RMA', 'Assistance Optimale : véhicule de remplacement 3 jours deux fois par an, remorquage illimité.', 'Description seulement.', 'rmaassurance.com/fr/automobile', 'PUBLIC'),
  ('R3', 'RMA', 'Options de règlement des sinistres : RMA Services, garages agréés, « Hifad Express », expertise à distance, procédure normale.', 'Le sinistre peut noter la procédure choisie en texte libre tant qu’aucune liste n’est confirmée.', 'rmaassurance.com/fr/automobile', 'PUBLIC'),
  ('R4', 'RMA', 'Moto : RC obligatoire, « tous risques » en option, assistance « RMASSIST’Moto Zen ».', 'À confirmer : l’agence vend-elle des produits moto ? Les facteurs de prime sont ceux de RMA.', 'rmaassurance.com/fr/moto', 'PUBLIC'),
  ('R5', 'RMA', 'En cas de sinistre : appeler le 2526, constat amiable, police ou gendarmerie s’il y a des blessés, déclaration par téléphone, espace en ligne ou intermédiaire ; ne pas réparer avant l’examen de l’expert.', 'Point de la liste de contrôle sinistre : « ne pas réparer avant l’expertise ».', 'rmaassurance.com/fr/declarer-votre-sinistre-automobile', 'PUBLIC'),
  ('R6', 'RMA', 'Pièces à fournir et délais en cas de sinistre.', 'Non publiés. À demander à l’agence.', 'Aucune source publique', 'UNKNOWN'),
  ('R7', 'RMA', 'Produits taxi, transport de personnes, transport de marchandises et flotte.', 'Rien sur le site public. À demander à l’agence.', 'Aucune source publique', 'UNKNOWN'),
  ('R8', 'RMA', 'Souscription et renouvellement en ligne (direct.rmaassurance.com).', 'Pas une intégration de l’agence. Aucune utilisation d’API.', 'rmaassurance.com/fr/automobile', 'PUBLIC'),
  ('R9', 'RMA', 'Séries d’attestation RMA : 14 P (provisoire), 14 A (usage Tourisme), 14 C (usage Transport de marchandises), 14 E (véhicules à deux ou trois roues) ; numéros à 9 chiffres.', 'Séries enregistrées dans le catalogue, à confirmer. Base du futur suivi du stock d’attestations.', 'Formulaires vierges RMA fournis par l’agence le 22/10/2026', 'DOCUMENT'),
  ('R10', 'RMA', 'Les conditions particulières RMA comportent : police, attestation, effet, échéance, durée, périodicité, formule, package, convention, assistance ; conducteur (date de naissance, permis) ; véhicule (date de mise en circulation, valeur à neuf, valeur vénale, puissance ou PTC, genre, C.R.M., organisme de crédit) ; tableau des garanties ; bloc PTA ou GIH (décès, invalidité, frais médicaux, indemnité journalière) ; prime nette, taxes, accessoires, taxe CNPAC, timbre, total à payer.', 'Liste des champs à prévoir pour les contrats (phase 6). Aucun montant n’est tiré de ce formulaire.', 'Formulaires vierges RMA 14 A, 14 C et 14 E fournis par l’agence le 22/10/2026', 'DOCUMENT'),
  ('C1', 'CAT', 'Packs taxi : RAHTI, RAHTI +, MIHANI, IFOULKI, TAWFIR (taxis neufs), MZIYA CHAMMEL. Tous incluent la RC obligatoire ; plafonds différents pour petit et grand taxi.', 'À confirmer : packs vendus par l’agence. Plafonds en description seulement.', 'cat.co.ma/fr/nos-packs', 'PUBLIC'),
  ('C2', 'CAT', 'Taxi : petit ou grand taxi ; carburant diesel ou essence ; date de première mise en circulation.', 'Champs du véhicule pour les taxis.', 'cat.co.ma/fr/entreprise/devis-en-ligne', 'PUBLIC'),
  ('C3', 'CAT', 'Devis transport : touristique, personnel, scolaire, autocar ; durées de 12, 6 ou 3 mois.', 'Les contrats doivent accepter des durées de 3, 6 et 12 mois.', 'cat.co.ma/fr/entreprise/devis-en-ligne', 'PUBLIC'),
  ('C4', 'CAT', 'Flotte : 5 véhicules au moins ; contrat annuel à tacite reconduction ; incorporations, retraits et transferts de véhicules ; primes trimestrielles ou semestrielles.', 'Module flotte : mouvements datés (avenants) ; échéancier fourni par l’assureur.', 'cat.co.ma (gestion flotte)', 'PUBLIC'),
  ('C5', 'CAT', 'Assurance aux frontières pour les véhicules immatriculés à l’étranger sans carte verte valable : 5 jours, 10 jours, 1, 3 ou 6 mois, renouvelable.', 'À demander : l’agence vend-elle ce produit ?', 'cat.co.ma/fr/assurance-aux-frontieres', 'PUBLIC'),
  ('C6', 'CAT', 'Assurance triporteur disponible.', 'Les conditions particulières « CAT-Assurance Triporteur » fournies par l’agence le montrent ; détails du produit à demander.', 'cat.co.ma/fr/triporteur ; formulaire CAT 91 E fourni par l’agence le 22/10/2026', 'DOCUMENT'),
  ('C7', 'CAT', 'Services : DABA CAT, CAT TAAWID EXPRESS (taxis), indemnité journalière IJI, assistance médicale et technique, DABA CASH.', 'Le sinistre peut noter le service utilisé.', 'cat.co.ma/fr/nos-packs ; cat.co.ma/fr/daba-cat', 'PUBLIC'),
  ('C8', 'CAT', 'Procédure, délais et pièces en cas de sinistre.', 'Page introuvable le 22/10/2026. À demander à l’agence.', 'Aucune source publique', 'UNKNOWN'),
  ('C9', 'CAT', 'Produits voiture particulière et moto.', 'Non trouvés sur le site public. À demander à l’agence.', 'Aucune source publique', 'UNKNOWN'),
  ('C10', 'CAT', 'Documents pratiques publiés : dépliants et affiches seulement, aucun formulaire.', 'Aucun.', 'cat.co.ma/fr/infos-pratiques', 'PUBLIC'),
  ('C11', 'CAT', 'Séries d’attestation CAT : 91 P (provisoire), 91 E (véhicules à deux ou trois roues) ; numéros à 9 chiffres. La note de couverture 91 P (impression de 07/2024) porte : « Contribution des assurés au profit du CNPAC : 15 dhs accessoires (2 dhs) = 17 dhs ».', 'Séries enregistrées dans le catalogue, à confirmer. Ce montant n’est pas un tarif de l’application tant qu’il n’est pas confirmé.', 'Formulaires vierges CAT fournis par l’agence le 22/10/2026', 'DOCUMENT'),
  ('C12', 'CAT', 'La note de couverture et les conditions particulières CAT comportent : intermédiaire, code, code MF, agrément, effet, expiration, durée en mois, réduction zones sahariennes, antécédents sinistres (corporels, matériels), coefficient de majoration ou réduction (CRM) ; garanties (RC illimitée, dommage collision, dommages au véhicule, incendie, vol, bris de glaces, défense et recours, remorque, événements catastrophiques RC et GA) ; protection du conducteur (PPC) ; prime nette, taxe, CNPAC ou NARSA, taxe parafiscale FSEC, prime TTC.', 'Liste des champs à prévoir pour les contrats (phase 6). Aucun montant n’est tiré de ce formulaire.', 'Formulaires vierges CAT 91 P et 91 E fournis par l’agence le 22/10/2026', 'DOCUMENT')
) AS r(code, insurer_code, statement, effect, source, status)
LEFT JOIN "insurer" i ON i."code" = r.insurer_code;
-- reference-data:end
