// Creates an administrator account. Run on the server:
//   npm run create-admin -w backend               first administrator
//   npm run create-admin -w backend -- --recovery  extra administrator when access is lost
// The password is typed interactively and never shown, logged or stored in shell history.
import { createInterface } from 'node:readline/promises';
import { SetupError, createAdministrator } from '../src/modules/auth/setup.js';
import { createAuditService } from '../src/services/audit.js';
import { createPrisma } from '../src/services/prisma.js';

const MESSAGES = {
  INVALID_USERNAME:
    'Identifiant invalide : 3 à 64 caractères parmi a-z, 0-9, point, tiret, souligné.',
  INVALID_DISPLAY_NAME: 'Nom affiché invalide (1 à 120 caractères).',
  WEAK_PASSWORD: 'Mot de passe refusé',
  ADMIN_EXISTS:
    'Un administrateur actif existe déjà. Utilisez --recovery seulement si plus personne ne peut se connecter.',
  USERNAME_TAKEN: 'Cet identifiant est déjà utilisé.',
};

function askHidden(question) {
  return new Promise((resolve) => {
    const { stdin, stdout } = process;
    stdout.write(question);
    stdin.setRawMode(true);
    stdin.resume();
    stdin.setEncoding('utf8');
    let value = '';
    // A paste arrives as one chunk of several characters: handle them one by one.
    const onData = (chunk) => {
      for (const char of chunk) {
        if (char === '\r' || char === '\n') {
          stdin.setRawMode(false);
          stdin.pause();
          stdin.off('data', onData);
          stdout.write('\n');
          resolve(value);
          return;
        }
        if (char === '\u0003') {
          stdout.write('\n');
          process.exit(130);
        }
        if (char === '\u007f' || char === '\b') value = value.slice(0, -1);
        else value += char;
      }
    };
    stdin.on('data', onData);
  });
}

const recovery = process.argv.includes('--recovery');
if (!process.stdin.isTTY) {
  console.error(
    'Lancez cette commande dans un terminal interactif (le mot de passe est saisi masqué).',
  );
  process.exit(1);
}
if (!process.env.DATABASE_URL) {
  console.error('DATABASE_URL must be set (backend/.env).');
  process.exit(1);
}

const prisma = createPrisma(process.env.DATABASE_URL);
try {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const username = await rl.question('Identifiant : ');
  const displayName = await rl.question('Nom affiché : ');
  rl.close();
  const password = await askHidden('Mot de passe (12 caractères minimum) : ');
  const confirmation = await askHidden('Confirmer le mot de passe : ');
  if (password !== confirmation) {
    console.error('Les mots de passe ne correspondent pas.');
    process.exitCode = 1;
  } else {
    const user = await createAdministrator(
      { prisma, audit: createAuditService(prisma) },
      { username, displayName, password },
      { recovery },
    );
    console.log(
      `Administrateur « ${user.username} » créé. À la première connexion, la double authentification sera configurée.`,
    );
  }
} catch (err) {
  if (err instanceof SetupError) {
    const extra = err.details ? ` : ${err.details.join(', ')}` : '';
    console.error(`${MESSAGES[err.code] ?? err.code}${extra}`);
  } else {
    console.error(`Échec : ${err.message}`);
  }
  process.exitCode = 1;
} finally {
  await prisma.$disconnect();
}
