// A synthetic agent for the drills (agent.essai, password from SEED_PASSWORD): never on the
// agency's server. Run through the tools service, which has the owner's database address.
import argon2 from 'argon2';
import pg from 'pg';
const client = new pg.Client({ connectionString: process.env.MIGRATION_DATABASE_URL });
await client.connect();
const hash = await argon2.hash(process.env.SEED_PASSWORD, { type: argon2.argon2id });
await client.query(
  `INSERT INTO app_user (id, username, "displayName", "passwordHash", "roleId", "mustChangePassword", "updatedAt")
   SELECT gen_random_uuid(), 'agent.essai', 'Agent Essai', $1, id, false, now() FROM role WHERE code = 'AGENT'
   ON CONFLICT (username) DO NOTHING`,
  [hash],
);
await client.end();
console.log('seeded');
