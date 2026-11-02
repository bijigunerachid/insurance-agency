-- CAT border insurance (« assurance aux frontières », attestation model F): the agency sells it,
-- rarely, on the CAT platform, for 5 days, 10 days, 1, 3 or 6 months (owner, 02/11/2026; CAT's
-- blank « Assurance automobile aux frontières » form and its 91 F attestation). The usage of model F
-- is needed to record its attestation (rule L16). « À confirmer » until a manager confirms them,
-- like every reference usage and product.
INSERT INTO "vehicle_usage" ("label", "modelCode", "source", "updatedAt") VALUES
  ('Assurance aux frontières', 'F', 'Attestation CAT série 91 F, « ASSURANCE AUX FRONTIÈRES » (formulaire vierge fourni par l’agence le 02/11/2026)', CURRENT_TIMESTAMP)
ON CONFLICT ("label") DO NOTHING;

-- Border insurance, sold with CAT only (owner, 02/11/2026: rarely, on the CAT platform, for the
-- five durations of rule C5).
INSERT INTO "product" ("insurerId", "line", "name", "description", "source", "active", "updatedAt")
SELECT i."id", 'BORDER', 'Assurance aux frontières',
  'Véhicules immatriculés à l’étranger sans carte verte valable : 5 jours, 10 jours, 1, 3 ou 6 mois (règle C5)',
  'Vendue par l’agence, rarement, sur la plateforme CAT (gérant, 02/11/2026)', true, CURRENT_TIMESTAMP
FROM "insurer" i
WHERE i."code" = 'CAT'
ON CONFLICT ("insurerId", "name") DO NOTHING;

-- The register follows the agency's answers and the blank forms of 02/11/2026.
UPDATE "insurer_rule" SET "statement" = 'Assurance aux frontières pour les véhicules immatriculés à l’étranger sans carte verte valable : 5 jours, 10 jours, 1, 3 ou 6 mois. L’agence la vend, rarement, sur la plateforme CAT, pour ces cinq durées ; attestation 91 F (modèle F).',
  "effect" = 'Produit « Assurance aux frontières » chez CAT seulement ; contrat de 6 mois au plus, sans tacite reconduction ni suivi de renouvellement (une nouvelle assurance à chaque entrée) ; une attestation 91 F ne propose que ce produit.',
  "source" = 'cat.co.ma/fr/assurance-aux-frontieres ; formulaire CAT « Assurance automobile aux frontières » et attestation 91 F fournis par l’agence le 02/11/2026 ; gérant, 02/11/2026',
  -- A rule a manager already confirmed stays confirmed.
  "status" = CASE WHEN "status" = 'CONFIRMED' THEN "status" ELSE 'DOCUMENT' END,
  "version" = "version" + 1, "updatedAt" = CURRENT_TIMESTAMP
WHERE "code" = 'C5';
UPDATE "insurer_rule" SET "statement" = 'Séries d’attestation CAT : 91 P (provisoire), 91 E (véhicules à deux ou trois roues), 91 B (transport public de voyageurs), 91 F (assurance aux frontières) ; numéros à 9 chiffres. La note de couverture 91 P (impression de 07/2024) porte : « Contribution des assurés au profit du CNPAC : 15 dhs accessoires (2 dhs) = 17 dhs ».',
  "source" = 'Formulaires vierges CAT fournis par l’agence le 22/10/2026 ; formulaires vierges 91 B, 91 E, 91 F et 91 P fournis par l’agence le 02/11/2026',
  "version" = "version" + 1, "updatedAt" = CURRENT_TIMESTAMP
WHERE "code" = 'C11';

-- reference-data:begin
-- The complete reference rows as of this migration; integration and e2e tests replay the block
-- of the latest migration that has one (test/referenceData.js). Every insert skips rows that
-- exist, so on a database migrated from the previous step only the insurer usages are new.
-- Models, usages and series stay TO_CONFIRM until a manager confirms them in the app.

INSERT INTO "insurer" ("code", "name", "updatedAt") VALUES
  ('RMA', 'RMA (Royale Marocaine d’Assurance)', CURRENT_TIMESTAMP),
  ('CAT', 'CAT Assurance & Réassurance', CURRENT_TIMESTAMP)
ON CONFLICT ("code") DO NOTHING;

INSERT INTO "attestation_model" ("code", "label", "provisional", "officialNumber", "colour", "source", "updatedAt") VALUES
  ('A', 'Tourisme', false, 1, 'jaune', 'Arrêté n° 213-05 du 26/01/2005 (modifié en 2019), art. 2 (modèle 1, jaune); lettre A : attestation RMA 14 A ; lettres : liste de l’agence du 22/10/2026', CURRENT_TIMESTAMP),
  ('B', 'Transport public de voyageurs', false, 2, 'gris clair', 'Arrêté n° 213-05 du 26/01/2005 (modifié en 2019), art. 2 (modèle 2, gris clair) ; lettres : liste de l’agence du 22/10/2026', CURRENT_TIMESTAMP),
  ('C', 'Transport de marchandises', false, 3, 'bleu clair', 'Arrêté n° 213-05 du 26/01/2005 (modifié en 2019), art. 2 (modèle 3, bleu clair); lettre C : attestation RMA 14 C ; lettres : liste de l’agence du 22/10/2026', CURRENT_TIMESTAMP),
  ('D', 'Divers', false, 5, 'blanc', 'Arrêté n° 213-05 du 26/01/2005 (modifié en 2019), art. 2 (modèle 5, blanc) ; lettres : liste de l’agence du 22/10/2026', CURRENT_TIMESTAMP),
  ('E', 'Véhicules à deux ou trois roues', false, 4, 'vert clair', 'Arrêté n° 213-05 du 26/01/2005 (modifié en 2019), art. 2 (modèle 4, vert clair); lettre E : attestations RMA 14 E et CAT 91 E ; lettres : liste de l’agence du 22/10/2026', CURRENT_TIMESTAMP),
  ('F', 'Assurance aux frontières', false, 8, 'violet clair', 'Arrêté n° 213-05 du 26/01/2005 (modifié en 2019), art. 2 (modèle 8, violet clair) ; lettres : liste de l’agence du 22/10/2026', CURRENT_TIMESTAMP),
  ('G', 'Garagistes', false, 6, 'marron clair', 'Arrêté n° 213-05 du 26/01/2005 (modifié en 2019), art. 2 (modèle 6, marron clair) ; lettres : liste de l’agence du 22/10/2026', CURRENT_TIMESTAMP),
  ('P', 'Provisoire', true, 7, 'rose', 'Arrêté n° 213-05 du 26/01/2005 (modifié en 2019), art. 2 (modèle 7, rose); lettre P : attestations provisoires RMA 14 P et CAT 91 P ; lettres : liste de l’agence du 22/10/2026', CURRENT_TIMESTAMP)
ON CONFLICT ("code") DO NOTHING;

INSERT INTO "vehicle_usage" ("label", "modelCode", "source", "updatedAt") VALUES
  ('Tourisme', 'A', 'Attestation RMA série 14 A (formulaire vierge fourni par l’agence le 22/10/2026)', CURRENT_TIMESTAMP),
  ('Transport de marchandises', 'C', 'Attestation RMA série 14 C (formulaire vierge fourni par l’agence le 22/10/2026)', CURRENT_TIMESTAMP),
  ('Véhicules à deux ou trois roues', 'E', 'Attestations RMA série 14 E et CAT série 91 E (formulaires vierges fournis par l’agence le 22/10/2026)', CURRENT_TIMESTAMP),
  ('Divers', 'D', 'Arrêté n° 213-05, art. 2 : modèle D « Divers » ; attestation RMA 14 D du PDF de la plateforme fourni par l’agence le 24/10/2026', CURRENT_TIMESTAMP),
  ('Transport public de voyageurs', 'B', 'Attestation CAT série 91 B, « USAGE : TRANSPORT PUBLIC DE VOYAGEURS » (formulaire vierge fourni par l’agence le 29/10/2026)', CURRENT_TIMESTAMP),
  ('Assurance aux frontières', 'F', 'Attestation CAT série 91 F, « ASSURANCE AUX FRONTIÈRES » (formulaire vierge fourni par l’agence le 02/11/2026)', CURRENT_TIMESTAMP)
ON CONFLICT ("label") DO NOTHING;

INSERT INTO "attestation_series" ("insurerId", "code", "modelCode", "source", "updatedAt")
SELECT i."id", s.code, right(s.code, 1), s.source, CURRENT_TIMESTAMP
FROM (VALUES
  ('RMA', '14 P', 'Attestation provisoire RMA 14 P (formulaire fourni par l’agence le 22/10/2026)'),
  ('RMA', '14 A', 'Attestation RMA 14 A, usage Tourisme (formulaire fourni par l’agence le 22/10/2026)'),
  ('RMA', '14 C', 'Attestation RMA 14 C, usage Transport de marchandises (formulaire fourni par l’agence le 22/10/2026)'),
  ('RMA', '14 E', 'Attestation RMA 14 E, véhicules à deux ou trois roues (formulaire fourni par l’agence le 22/10/2026)'),
  ('CAT', '91 P', 'Attestation provisoire et note de couverture CAT 91 P (formulaire fourni par l’agence le 22/10/2026)'),
  ('RMA', '14 B', 'Règle de l’agence : 14 = RMA, lettre = modèle (gérant, 23/10/2026)'),
  ('RMA', '14 D', 'Règle de l’agence : 14 = RMA, lettre = modèle (gérant, 23/10/2026)'),
  ('RMA', '14 F', 'Règle de l’agence : 14 = RMA, lettre = modèle (gérant, 23/10/2026)'),
  ('RMA', '14 G', 'Règle de l’agence : 14 = RMA, lettre = modèle (gérant, 23/10/2026)'),
  ('CAT', '91 A', 'Règle de l’agence : 91 = CAT, lettre = modèle (gérant, 23/10/2026)'),
  ('CAT', '91 B', 'Règle de l’agence : 91 = CAT, lettre = modèle (gérant, 23/10/2026)'),
  ('CAT', '91 C', 'Règle de l’agence : 91 = CAT, lettre = modèle (gérant, 23/10/2026)'),
  ('CAT', '91 D', 'Règle de l’agence : 91 = CAT, lettre = modèle (gérant, 23/10/2026)'),
  ('CAT', '91 F', 'Règle de l’agence : 91 = CAT, lettre = modèle (gérant, 23/10/2026)'),
  ('CAT', '91 G', 'Règle de l’agence : 91 = CAT, lettre = modèle (gérant, 23/10/2026)'),
  ('CAT', '91 E', 'Attestation CAT 91 E, véhicules à deux ou trois roues (formulaire fourni par l’agence le 22/10/2026)')
) AS s(insurer_code, code, source)
JOIN "insurer" i ON i."code" = s.insurer_code
ON CONFLICT ("insurerId", "code") DO NOTHING;

INSERT INTO "insurer_rule" ("code", "insurerId", "statement", "effect", "source", "status", "updatedAt")
SELECT r.code, i."id", r.statement, r.effect, r.source, r.status::"RuleStatus", CURRENT_TIMESTAMP
FROM (VALUES
  ('L1', NULL, 'Un agent d’assurances peut représenter au plus deux entreprises d’assurances, avec l’accord de la première.', 'RMA et CAT sont le maximum. Activer un troisième assureur demande une confirmation explicite.', 'Loi 17-99, art. 292', 'LAW'),
  ('L2', NULL, 'Les notes de couverture et attestations au nom de l’intermédiaire sont interdites.', 'L’application ne produit jamais de document ressemblant à une note de couverture, une attestation ou une police.', 'Loi 17-99, art. 302-1°', 'LAW'),
  ('L3', NULL, 'Détenir des imprimés falsifiés (polices, notes de couverture, attestations) ou des appareils permettant de les confectionner est une infraction pénale.', 'Aucun modèle imitant un document d’assureur. Les documents officiels sont seulement enregistrés (numéro, copie numérisée).', 'Loi 17-99, art. 328', 'LAW'),
  ('L4', NULL, 'L’intermédiaire ne peut encaisser plus que la prime fixée par l’assureur, ni accorder de ristourne ou de réduction sur la prime.', 'Aucun champ de remise sur les paiements. Le montant dû vient uniquement de la prime confirmée par l’assureur.', 'Loi 17-99, art. 302-3°', 'LAW'),
  ('L5', NULL, 'Les intermédiaires versent les primes encaissées pour le compte des assureurs dans les quinze (15) jours suivant le mois de leur encaissement.', 'Suivi « encaissé, non reversé » par assureur ; échéance par défaut : fin du mois d’encaissement + 15 jours, plus courte si le traité de nomination le prévoit.', 'Loi 17-99, art. 318 ; Circulaire ACAPS n° 01/AS/19 (version consolidée), art. 132', 'LAW'),
  ('L6', NULL, 'Lorsque l’intermédiaire accorde de sa propre initiative des facilités de paiement au souscripteur, la prime est considérée comme totalement encaissée et doit être déclarée comme encaissée.', 'Aucun crédit ni échéancier créé par l’agence ; des échéances seulement si le contrat de l’assureur les prévoit. Une facilité accordée par l’agence rend la prime due à l’assureur.', 'Circulaire ACAPS n° 01/AS/19 (version consolidée), art. 130', 'LAW'),
  ('L7', NULL, 'L’assuré doit déclarer un sinistre dans les 5 jours où il en a connaissance ; le contrat peut allonger ce délai, pas le réduire.', 'Les sinistres montrent les dates de déclaration à l’agence et à l’assureur, avec une alerte après 5 jours. L’application ne décide pas d’une déchéance.', 'Loi 17-99, art. 20-5°', 'LAW'),
  ('L8', NULL, 'Événements catastrophiques : délai de déclaration porté de 20 à 60 jours par la loi 43-24.', 'Délai paramétrable par type d’incident, à confirmer au Bulletin officiel.', 'Loi 17-99, art. 64-5, modifiée par la loi 43-24 (presse : Médias24, 03/09/2024)', 'PRESS'),
  ('L9', NULL, 'Prime impayée : après 10 jours, l’assureur peut suspendre la garantie 20 jours après une mise en demeure et résilier le contrat 10 jours plus tard.', 'L’application enregistre le statut notifié par l’assureur (suspendu, résilié) et sa date ; elle ne le fixe jamais d’elle-même.', 'Loi 17-99, art. 21', 'LAW'),
  ('L10', NULL, 'La tacite reconduction doit figurer au contrat ; chaque prolongation tacite dure un an au plus.', 'Indicateur « tacite reconduction » sur le contrat ; les renouvellements sont des enregistrements liés.', 'Loi 17-99, art. 7', 'LAW'),
  ('L11', NULL, 'Préavis de résiliation : minimum contractuel entre 30 et 90 jours ; droit de résiliation après un an.', 'L’écran de renouvellement montre la date limite de préavis quand le préavis du contrat est saisi.', 'Loi 17-99, art. 6', 'LAW'),
  ('L12', NULL, 'Les actions dérivant d’un contrat d’assurance se prescrivent par 2 ans (5 ans pour les assurances de personnes).', 'Élément de la politique de conservation des données (revue juridique nécessaire).', 'Loi 17-99, art. 36', 'LAW'),
  ('L13', NULL, 'L’assurance de responsabilité civile est obligatoire pour tout véhicule terrestre à moteur.', 'Chaque contrat automobile enregistre la garantie RC. Les alertes d’échéance sont une fonction centrale.', 'Loi 17-99, art. 120', 'LAW'),
  ('L14', NULL, 'RC minimale : 50 000 000 DH par véhicule et par événement (25 000 000 DH pour les deux-roues de 2 CV au plus). Transport payant de personnes : au moins 1 000 000 DH par place autorisée et 50 000 000 DH.', 'Nombre de places obligatoire pour les taxis et le transport de personnes, puissance fiscale pour les deux-roues. L’application ne vérifie pas les montants de l’assureur.', 'Loi 17-99, art. 123', 'LAW'),
  ('L15', NULL, 'Les numéros et modèles d’attestation sont fixés par l’autorité ; une attestation n’est valable que pour la période qui y figure.', 'Enregistrer le numéro d’attestation, ses dates de validité et sa copie numérisée. Ne jamais générer d’attestation.', 'Arrêté n° 213-05 du 26/01/2005', 'LAW'),
  ('L16', NULL, 'Le modèle d’attestation dépend de l’usage du véhicule. Selon la lettre circulaire ACAPS du 19/02/2026, les véhicules électriques relevant de la catégorie « Divers » reçoivent l’attestation blanche, modèle D, et non l’attestation jaune « Tourisme ». Tous les véhicules électriques ne relèvent pas du modèle D.', 'L’usage du véhicule est une liste contrôlée ; ses valeurs viennent de l’arrêté, des formulaires ou des assureurs, jamais inventées.', 'Arrêté n° 213-05 ; presse (Le Matin, Hespress) sur la lettre circulaire ACAPS du 19/02/2026', 'LAW'),
  ('L17', NULL, 'Attestations électroniques à QR code : pilote depuis le 01/07/2026 ; fin du papier prévue à partir du 01/07/2027.', 'Enregistrer le fichier et la référence de l’attestation électronique. Aucune génération de QR code.', 'Presse (Boursenews, 08/10/2026)', 'PRESS'),
  ('L18', NULL, 'Un intermédiaire exerce depuis un seul local.', 'Cohérent avec un déploiement sur le réseau local d’un seul site.', 'Loi 17-99, art. 301', 'LAW'),
  ('L19', NULL, 'Les intermédiaires sont contrôlés par l’ACAPS et rendent compte de leur activité : registres par assureur (art. 135) et déclaration annuelle avant le 30 avril (art. 136).', 'Journal d’audit fiable et exports. Modèles des registres (annexes 61 et 62) à obtenir avant de produire les registres.', 'Loi 17-99, art. 315 et 316 ; Circulaire ACAPS n° 01/AS/19 (version consolidée), art. 135 et 136', 'LAW'),
  ('L20', NULL, 'Les intermédiaires respectent la loi 9-88 relative aux obligations comptables.', 'Les données financières ne sont jamais supprimées. Durée de conservation à confirmer avec un comptable.', 'Loi 17-99, art. 319', 'LAW'),
  ('L21', NULL, 'Accident sans blessé : le constat amiable papier reste utilisé ; l’e-constat existe, sur les téléphones des agents constateurs.', 'Les sinistres enregistrent le constat (copie numérisée ou référence e-constat). Aucun formulaire de constat généré.', 'Presse et sites tiers (Atlas Mag, Démarches Maroc)', 'PRESS'),
  ('L22', NULL, 'Le traitement de données personnelles doit être déclaré à la CNDP au préalable (formulaire F211 normal, F214 simplifié) ; autorisation préalable pour les données sensibles.', 'Voir les questions juridiques de docs/requirements.md. Aucune affirmation de conformité.', 'Loi 09-08 ; site de la CNDP', 'LAW'),
  ('L23', NULL, 'L’attestation provisoire, dont la validité ne peut excéder un mois, peut être délivrée en attendant l’établissement du contrat ; l’assureur remet alors une note de couverture au souscripteur.', 'Les attestations provisoires enregistrées dans les contrats ne pourront pas dépasser un mois ; la note de couverture est enregistrée avec elles.', 'Arrêté n° 213-05 du 26/01/2005 (modifié en 2019), art. 2 ; mention imprimée sur les attestations RMA 14 P et CAT 91 P', 'LAW'),
  ('L24', NULL, 'Les attestations suivent huit modèles numérotés, chacun d’une couleur : 1 tourisme (jaune), 2 transport public de voyageurs (gris clair), 3 transport de marchandises (bleu clair), 4 véhicules à deux ou trois roues (vert clair), 5 divers (blanc), 6 garagistes (marron clair), 7 provisoire (rose), 8 assurance aux frontières (violet clair).', 'Le catalogue indique pour chaque modèle son numéro officiel et sa couleur ; la lettre imprimée sur les séries (14 A, 91 P…) renvoie à ces modèles.', 'Arrêté n° 213-05 du 26/01/2005 (modifié en 2019), art. 2', 'LAW'),
  ('L25', NULL, 'L’attestation « garagistes » est délivrée aux garagistes et aux professionnels du courtage, de la vente, de la réparation, du dépannage ou du contrôle des véhicules, pour les véhicules qui leur sont confiés.', 'Le modèle 6 concerne ces professionnels, pas les véhicules des particuliers.', 'Arrêté n° 213-05 du 26/01/2005 (modifié en 2019), art. 2', 'LAW'),
  ('L26', NULL, 'En cas de perte ou de vol, l’assureur délivre un duplicata portant la mention « DUPLICATA » et le numéro de l’attestation originale.', 'Un contrat pourra enregistrer un duplicata relié à l’attestation d’origine ; l’agence ne le produit pas elle-même.', 'Arrêté n° 213-05 du 26/01/2005 (modifié en 2019), art. 2', 'LAW'),
  ('L27', NULL, 'Les numéros d’ordre et formats des attestations sont attribués aux assureurs par le ministre des finances ou un organisme professionnel délégué.', 'Les numéros sont saisis tels quels, jamais générés par l’application.', 'Arrêté n° 213-05 du 26/01/2005 (modifié en 2019), art. 2', 'LAW'),
  ('L28', NULL, 'Une nouvelle attestation est délivrée à chaque avenant qui modifie une caractéristique y figurant ; la carte verte ou orange est délivrée sur demande, moyennant l’accessoire fixé.', 'Un avenant qui change une donnée de l’attestation demande l’enregistrement d’une nouvelle attestation.', 'Arrêté n° 213-05 du 26/01/2005, art. 3', 'LAW'),
  ('L29', NULL, 'À l’échéance (sur demande) ou à la résiliation, l’assureur remet un relevé d’information : souscription et période de garantie, usage et immatriculation, identité de l’assuré, chaque sinistre avec sa date et la responsabilité de l’assuré.', 'Le relevé reçu de l’assureur peut être joint au contrat ; en cas de changement d’assureur, l’assuré le remet au nouvel assureur.', 'Arrêté n° 213-05 du 26/01/2005, art. 4', 'LAW'),
  ('L30', NULL, 'L’intermédiaire n’encaisse les primes que si le traité de nomination ou la convention l’y habilite ; sinon, le paiement se fait uniquement par chèque barré non endossable au nom de l’assureur.', 'L’agence est habilitée à encaisser pour RMA et CAT (déclaration du gérant du 23/10/2026, clause du traité à fournir) : tous modes de paiement admis.', 'Circulaire ACAPS n° 01/AS/19 (version consolidée), art. 125 et 129', 'LAW'),
  ('L31', NULL, 'L’intermédiaire remet immédiatement au souscripteur un justificatif de chaque paiement ; pour un agent habilité, ce document est réputé remis par l’assureur.', 'Un reçu est émis pour chaque paiement, au moment du paiement.', 'Circulaire ACAPS n° 01/AS/19 (version consolidée), art. 128', 'LAW'),
  ('L32', NULL, 'Les primes encaissées sont déclarées à l’assureur dans les dix (10) jours de l’encaissement, sauf convention contraire, éventuellement par l’application de l’assureur.', 'Suivi « encaissé, non déclaré » par assureur, avec une échéance à 10 jours par défaut.', 'Circulaire ACAPS n° 01/AS/19 (version consolidée), art. 130', 'LAW'),
  ('L33', NULL, 'Les primes fractionnées ou de contrats renouvelés par tacite reconduction non encaissées dans les dix (10) jours de leur échéance sont déclarées par écrit à l’assureur.', 'Alerte sur les échéances impayées depuis plus de 10 jours, à déclarer à l’assureur.', 'Circulaire ACAPS n° 01/AS/19 (version consolidée), art. 131', 'LAW'),
  ('L34', NULL, 'L’assureur arrête chaque semestre la situation des créances sur l’intermédiaire et la lui communique dans les 20 jours ; l’intermédiaire l’approuve ou formule ses observations dans les 20 jours de sa réception.', 'Rapprochement semestriel par assureur, avec rappel du délai de réponse.', 'Circulaire ACAPS n° 01/AS/19 (version consolidée), art. 134', 'LAW'),
  ('L35', NULL, 'L’intermédiaire tient, par assureur, le registre des actes de production et le registre des sinistres, règlements et recours, selon les modèles des annexes 61 et 62.', 'Les registres seront produits par l’application quand les modèles des annexes auront été obtenus.', 'Circulaire ACAPS n° 01/AS/19 (version consolidée), art. 135', 'LAW'),
  ('L36', NULL, 'L’assuré verse au Fonds de garantie des accidents de la circulation une contribution de 1,5 % des primes de responsabilité civile automobile, encaissée et reversée par l’assureur.', 'Montant calculé par l’assureur : l’agence le reprend tel qu’il figure sur les documents de l’assureur ; jamais calculé par l’application.', 'Décret n° 2-03-50 du 22/05/2003, art. 3 (code des assurances, art. 140)', 'LAW'),
  ('L37', NULL, 'La garantie des événements catastrophiques (EVCAT) des contrats automobiles coûte 3,5 % de la prime RC (2 % pour le transport public de voyageurs) et 1,5 % de la prime des garanties annexes.', 'Montant repris des documents de l’assureur ; jamais calculé par l’application.', 'ACAPS, fiche conseil « Régime de couverture contre les conséquences d’événements catastrophiques »', 'PUBLIC'),
  ('L38', NULL, 'La taxe parafiscale de solidarité contre les événements catastrophiques (FSEC) est passée de 1 % à 1,5 % des primes (décret n° 2-24-1123, BO du 18/09/2025).', 'Ligne « taxe parafiscale FSEC » des formulaires (règle C12) ; texte du décret à lire avant tout usage.', 'Presse (Le360, Maroc Diplomatique) sur le décret n° 2-24-1123', 'PRESS'),
  ('L39', NULL, 'La taxe sur les contrats d’assurances est de 14 % des primes pour les risques automobiles (13,80 % sur une ancienne page de la DGI), versée chaque mois par l’assureur.', 'Montant repris des documents de l’assureur ; taux à confirmer dans le CGI.', 'DGI, page « Taxe sur les contrats d’assurances » ; Maroc-compta, 10/2026', 'PRESS'),
  ('L40', NULL, 'Plaques : depuis le BO n° 7531 (03/08/2026), la lettre arabe de série est accompagnée de son équivalent latin officiel et de « MA » : أ A, ب B, د D, هـ H, و E, ط T, ي Y, ك K, ل L, م M, ن N, ص C, ف F, ر R, س S.', 'Permettra de retrouver une plaque saisie avec l’une ou l’autre lettre, une fois le texte du BO lu.', 'Presse (Le Matin, Médias24, TelQuel) sur l’arrêté publié au BO n° 7531', 'PRESS'),
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
  ('C5', 'CAT', 'Assurance aux frontières pour les véhicules immatriculés à l’étranger sans carte verte valable : 5 jours, 10 jours, 1, 3 ou 6 mois. L’agence la vend, rarement, sur la plateforme CAT, pour ces cinq durées ; attestation 91 F (modèle F).', 'Produit « Assurance aux frontières » chez CAT seulement ; contrat de 6 mois au plus, sans tacite reconduction ni suivi de renouvellement (une nouvelle assurance à chaque entrée) ; une attestation 91 F ne propose que ce produit.', 'cat.co.ma/fr/assurance-aux-frontieres ; formulaire CAT « Assurance automobile aux frontières » et attestation 91 F fournis par l’agence le 02/11/2026 ; gérant, 02/11/2026', 'DOCUMENT'),
  ('C6', 'CAT', 'Assurance triporteur disponible.', 'Les conditions particulières « CAT-Assurance Triporteur » fournies par l’agence le montrent ; détails du produit à demander.', 'cat.co.ma/fr/triporteur ; formulaire CAT 91 E fourni par l’agence le 22/10/2026', 'DOCUMENT'),
  ('C7', 'CAT', 'Services : DABA CAT, CAT TAAWID EXPRESS (taxis), indemnité journalière IJI, assistance médicale et technique, DABA CASH.', 'Le sinistre peut noter le service utilisé.', 'cat.co.ma/fr/nos-packs ; cat.co.ma/fr/daba-cat', 'PUBLIC'),
  ('C8', 'CAT', 'Procédure, délais et pièces en cas de sinistre.', 'Page introuvable le 22/10/2026. À demander à l’agence.', 'Aucune source publique', 'UNKNOWN'),
  ('C9', 'CAT', 'Produits voiture particulière et moto.', 'Non trouvés sur le site public. À demander à l’agence.', 'Aucune source publique', 'UNKNOWN'),
  ('C10', 'CAT', 'Documents pratiques publiés : dépliants et affiches seulement, aucun formulaire.', 'Aucun.', 'cat.co.ma/fr/infos-pratiques', 'PUBLIC'),
  ('C11', 'CAT', 'Séries d’attestation CAT : 91 P (provisoire), 91 E (véhicules à deux ou trois roues), 91 B (transport public de voyageurs), 91 F (assurance aux frontières) ; numéros à 9 chiffres. La note de couverture 91 P (impression de 07/2024) porte : « Contribution des assurés au profit du CNPAC : 15 dhs accessoires (2 dhs) = 17 dhs ».', 'Séries enregistrées dans le catalogue, à confirmer. Ce montant n’est pas un tarif de l’application tant qu’il n’est pas confirmé.', 'Formulaires vierges CAT fournis par l’agence le 22/10/2026 ; formulaires vierges 91 B, 91 E, 91 F et 91 P fournis par l’agence le 02/11/2026', 'DOCUMENT'),
  ('C12', 'CAT', 'La note de couverture et les conditions particulières CAT comportent : intermédiaire, code, code MF, agrément, effet, expiration, durée en mois, réduction zones sahariennes, antécédents sinistres (corporels, matériels), coefficient de majoration ou réduction (CRM) ; garanties (RC illimitée, dommage collision, dommages au véhicule, incendie, vol, bris de glaces, défense et recours, remorque, événements catastrophiques RC et GA) ; protection du conducteur (PPC) ; prime nette, taxe, CNPAC ou NARSA, taxe parafiscale FSEC, prime TTC.', 'Liste des champs à prévoir pour les contrats (phase 6). Aucun montant n’est tiré de ce formulaire.', 'Formulaires vierges CAT 91 P et 91 E fournis par l’agence le 22/10/2026', 'DOCUMENT')
) AS r(code, insurer_code, statement, effect, source, status)
LEFT JOIN "insurer" i ON i."code" = r.insurer_code
ON CONFLICT ("code") DO NOTHING;

-- The products the agency sells, as listed by the owner on 23/10/2026 (Auto-écoles added on
-- 29/10/2026), offered by both RMA and CAT.
-- The line is the app's grouping (used for filters); the agency may rename, edit or deactivate any of them.
-- Passenger transport (owner, 28/10/2026), taxis and three-wheelers (owner, 29/10/2026) are sold
-- with CAT only: those products stay at RMA, inactive.
INSERT INTO "product" ("insurerId", "line", "name", "description", "source", "active", "updatedAt")
SELECT i."id", p.line::"ProductLine", p.name, p.description,
  'Liste des produits de l’agence (gérant, 23/10/2026)',
  NOT (i."code" = 'RMA' AND p.line IN ('PASSENGER_TRANSPORT', 'TAXI', 'TRIPORTEUR')), CURRENT_TIMESTAMP
FROM (VALUES
  ('CAR', 'Véhicules de tourisme', 'Assurance automobile : véhicules particuliers (Tourisme)'),
  ('TAXI', 'Petit taxi', 'Assurance automobile : petits taxis'),
  ('TAXI', 'Grand taxi', 'Assurance automobile : grands taxis'),
  ('COMMERCIAL', 'Véhicules utilitaires', 'Assurance automobile : véhicules utilitaires'),
  ('COMMERCIAL', 'Camions et poids lourds', 'Assurance automobile : camions et poids lourds'),
  ('FLEET', 'Flottes automobiles', 'Assurance automobile : flottes de véhicules'),
  ('CAR', 'Assurance provisoire', 'Assurance automobile provisoire ou temporaire'),
  ('MOTORCYCLE', 'Motos', 'Assurance deux et trois roues : motos'),
  ('MOTORCYCLE', 'Scooters', 'Assurance deux et trois roues : scooters'),
  ('MOTORCYCLE', 'Autres deux-roues', 'Assurance deux et trois roues : autres véhicules à deux roues'),
  ('TRIPORTEUR', 'Trois-roues et triporteurs', 'Assurance deux et trois roues : véhicules à trois roues, y compris les triporteurs de marchandises'),
  ('COMMERCIAL', 'Transport de marchandises', 'Assurance des véhicules de transport : transport de marchandises'),
  ('PASSENGER_TRANSPORT', 'Transport de voyageurs', 'Assurance des véhicules de transport : transport de voyageurs'),
  ('PASSENGER_TRANSPORT', 'Transport touristique', 'Assurance des véhicules de transport : transport touristique'),
  ('PASSENGER_TRANSPORT', 'Transport du personnel', 'Assurance des véhicules de transport : transport du personnel'),
  ('PASSENGER_TRANSPORT', 'Transport scolaire', 'Assurance des véhicules de transport : transport scolaire'),
  ('PASSENGER_TRANSPORT', 'Autocars et autobus', 'Assurance des véhicules de transport : autocars et autobus'),
  ('DRIVING_SCHOOL', 'Auto-écoles', 'Assurance des véhicules d’auto-école : tourisme, deux ou trois roues (usage divers)')
) AS p(line, name, description)
CROSS JOIN "insurer" i
WHERE i."code" IN ('RMA', 'CAT')
ON CONFLICT ("insurerId", "name") DO NOTHING;
-- Border insurance, sold with CAT only (owner, 02/11/2026: rarely, on the CAT platform, for the
-- five durations of rule C5).
INSERT INTO "product" ("insurerId", "line", "name", "description", "source", "active", "updatedAt")
SELECT i."id", 'BORDER', 'Assurance aux frontières',
  'Véhicules immatriculés à l’étranger sans carte verte valable : 5 jours, 10 jours, 1, 3 ou 6 mois (règle C5)',
  'Vendue par l’agence, rarement, sur la plateforme CAT (gérant, 02/11/2026)', true, CURRENT_TIMESTAMP
FROM "insurer" i
WHERE i."code" = 'CAT'
ON CONFLICT ("insurerId", "name") DO NOTHING;
-- The RMA GAMA « Type d'usage » list (owner's photos of 28/10/2026, complete per the owner on
-- 29/10/2026), in the platform's order, each under its legal usage: LOCATION and DIVERS are
-- « usage divers » (arrêté du ministre des finances, art. 58 9° : location avec ou sans chauffeur,
-- auto-école, ambulances, transport scolaire et du personnel…), model D. GARAGISTE is left out
-- until garages are handled (own model G, owner 29/10/2026).
INSERT INTO "insurer_usage" ("insurerId", "groupLabel", "label", "usageId", "sortOrder")
SELECT i."id", r.grp, r.label, u."id", r.sort
FROM (VALUES
  ('LOCATION', 'LOCATION C.I.', 'Divers', 10),
  ('CYCLOMOTER', 'CYLINDRÉE < 50 CM3 VITESSE < 60 KM/H', 'Véhicules à deux ou trois roues', 20),
  ('CYCLOMOTER', 'CYLINDRÉE < 50 CM3 VITESSE > 60 KM/H', 'Véhicules à deux ou trois roues', 30),
  ('CYCLOMOTER', 'CYLINDRÉE ENTRE 50 CM3 ET 125 CM3', 'Véhicules à deux ou trois roues', 40),
  ('CYCLOMOTER', 'MOTOCYCLETTE SANS SIDE-CAR CYLINDRÉE > 125 CM3', 'Véhicules à deux ou trois roues', 50),
  ('DIVERS', 'MOISSONEUSE BATTEUSE', 'Divers', 60),
  ('DIVERS', 'CHASSE NEIGE <= 3,5T', 'Divers', 70),
  ('DIVERS', 'HYDROCUREUSE +3,5T', 'Divers', 80),
  ('DIVERS', 'TRANSPORT DES ECOLIERS <= 3,5T', 'Divers', 90),
  ('DIVERS', 'TRANSPORT ECOLIERS +3,5T', 'Divers', 100),
  ('DIVERS', 'ARROSEUSE <= 3,5T', 'Divers', 110),
  ('DIVERS', 'ENGIN DE CHANTIER', 'Divers', 120),
  ('DIVERS', 'TRACTEUR AGRICOLE', 'Divers', 130),
  ('DIVERS', 'ARROSEUR +3,5T', 'Divers', 140),
  ('DIVERS', 'VÉH. SCE INCENDIE +3.5T', 'Divers', 150),
  ('DIVERS', 'ENLÈVEMENT DES ORDURES +3,5T', 'Divers', 160),
  ('DIVERS', 'CORBILLARDS <= 3,5T', 'Divers', 170),
  ('DIVERS', 'TRANSPORT PERSONNEL <= 3,5T', 'Divers', 180),
  ('DIVERS', 'VOITURE VIDANGE <= 3,5T', 'Divers', 190),
  ('DIVERS', 'VÉHICULE SCE INCENDIE <= 3.5T', 'Divers', 200),
  ('DIVERS', 'VÉHICULE DÉPANNAGE <= 3,5T', 'Divers', 210),
  ('DIVERS', 'TRANS. MATIÈRE INFL. <= 3,5T', 'Divers', 220),
  ('DIVERS', 'VOITURE VIDANGE +3.5T', 'Divers', 230),
  ('DIVERS', 'TRACTEUR AGRICOLE AVEC T.M.I.', 'Divers', 240),
  ('DIVERS', 'VÉHICULES À MOTEUR ÉLECTRIQUE', 'Divers', 250),
  ('DIVERS', 'BALAYEUSE <= 3,5T', 'Divers', 260),
  ('DIVERS', 'AUTO-ECOLE UTIL./AUTOCARS', 'Divers', 270),
  ('DIVERS', 'HYDROCUREUSE <= 3,5T', 'Divers', 280),
  ('DIVERS', 'CHASSE NEIGE +3,5T', 'Divers', 290),
  ('DIVERS', 'AUTO-ECOLE 2 OU 3 ROUES', 'Divers', 300),
  ('DIVERS', 'VÉHICULE DÉPANNAGE +3,5T', 'Divers', 310),
  ('DIVERS', 'TRANSPORT PERSONNEL +3,5T', 'Divers', 320),
  ('DIVERS', 'AMBULANCES <= 3,5T', 'Divers', 330),
  ('DIVERS', 'FOURGONS FUNÉRAIRES <= 3,5T', 'Divers', 340),
  ('DIVERS', 'BALAYEUSE +3,5T', 'Divers', 350),
  ('DIVERS', 'ENLÈVEMENT DES ORDURES <= 3,5T', 'Divers', 360),
  ('DIVERS', 'TRACTEUR FORESTIER', 'Divers', 370),
  ('DIVERS', 'TRANS. MATIÈRE INFL. +3,5T', 'Divers', 380),
  ('DIVERS', 'AUTO-ECOLE TOURISME', 'Divers', 390),
  ('TOURISME', 'TOURISME', 'Tourisme', 400),
  ('C1', 'C1 (COMMERCE <= 3,5T)', 'Transport de marchandises', 410),
  ('C2', 'C2 (COMMERCE +3,5T)', 'Transport de marchandises', 420)
) AS r(grp, label, usage, sort)
JOIN "insurer" i ON i."code" = 'RMA'
JOIN "vehicle_usage" u ON u."label" = r.usage
ON CONFLICT ("insurerId", "label") DO NOTHING;

-- reference-data:end
