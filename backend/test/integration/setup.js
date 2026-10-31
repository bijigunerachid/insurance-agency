// Integration tests use the real test database from backend/.env.test (see .env.example).
try {
  process.loadEnvFile('.env.test');
} catch {
  // CI or a shell may provide the variables instead.
}
if (process.env.NODE_ENV !== 'test') {
  throw new Error('Integration tests require NODE_ENV=test');
}
if (!/\/agency_test(\?|$)/.test(process.env.DATABASE_URL ?? '')) {
  throw new Error('Integration tests must use the agency_test database');
}
