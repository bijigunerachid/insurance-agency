// Confirms the reference catalogue configuration (the 8 national attestation models, the 3 vehicle
// usages, the 16 RMA 14 / CAT 91 series, one per model, and the 29 RMA and CAT products the
// agency sells there) in the name of an administrator or manager. Run on the server:
//   npm run catalogue:confirm-reference -w backend
// Entries already confirmed are left as they are: the command can safely run again.
import { createInterface } from 'node:readline/promises';
import {
  REFERENCE_DOCUMENT,
  REFERENCE_PRODUCTS_DOCUMENT,
  ReferenceError,
  confirmReferenceConfiguration,
} from '../src/modules/catalogue/reference.js';
import { createAuditService } from '../src/services/audit.js';
import { systemClock } from '../src/services/clock.js';
import { createPrisma } from '../src/services/prisma.js';

const MESSAGES = {
  USER_NOT_FOUND: 'Aucun compte actif avec cet identifiant.',
  NOT_ALLOWED: 'Ce compte ne peut pas confirmer le catalogue (administrateur ou responsable).',
};

if (!process.env.DATABASE_URL) {
  console.error('DATABASE_URL must be set (backend/.env).');
  process.exit(1);
}

const prisma = createPrisma(process.env.DATABASE_URL);
try {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  console.log(`Document de référence : ${REFERENCE_DOCUMENT}`);
  console.log(`Document de référence des produits : ${REFERENCE_PRODUCTS_DOCUMENT}`);
  const username = await rl.question('Identifiant de l’administrateur ou du responsable : ');
  rl.close();
  const result = await confirmReferenceConfiguration(
    { prisma, audit: createAuditService(prisma), clock: systemClock },
    { username },
  );
  const list = (items) => (items.length ? items.join(', ') : 'aucun');
  console.log(`Modèles confirmés : ${list(result.models.confirmed)}`);
  console.log(`Modèles déjà confirmés : ${list(result.models.already)}`);
  console.log(`Usages confirmés : ${list(result.usages.confirmed)}`);
  console.log(`Usages déjà confirmés : ${list(result.usages.already)}`);
  console.log(`Séries confirmées : ${list(result.series.confirmed)}`);
  console.log(`Séries déjà confirmées : ${list(result.series.already)}`);
  console.log(`Produits confirmés : ${list(result.products.confirmed)}`);
  console.log(`Produits déjà confirmés : ${list(result.products.already)}`);
  if (result.missing.length) {
    console.log(`Non confirmés (à vérifier dans le catalogue) : ${result.missing.join(', ')}`);
  }
} catch (err) {
  console.error(err instanceof ReferenceError ? MESSAGES[err.code] : `Échec : ${err.message}`);
  process.exitCode = 1;
} finally {
  await prisma.$disconnect();
}
