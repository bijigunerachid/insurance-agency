import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { ConfigError, loadConfig } from '../../src/config/env.js';

const valid = {
  NODE_ENV: 'development',
  DATABASE_URL: 'postgresql://agency:s3cret-value@127.0.0.1:55433/agency_dev',
  APP_ORIGIN: 'http://127.0.0.1:5173',
  TOTP_ENCRYPTION_KEY: Buffer.alloc(32, 1).toString('base64'),
};

describe('loadConfig', () => {
  it('accepts a valid configuration and applies defaults', () => {
    const config = loadConfig(valid);
    expect(config.PORT).toBe(3000);
    expect(config.HOST).toBe('127.0.0.1');
    expect(config.APP_TIMEZONE).toBe('Africa/Casablanca');
    expect(Object.isFrozen(config)).toBe(true);
  });

  it('rejects a missing database URL', () => {
    expect(() => loadConfig({ ...valid, DATABASE_URL: undefined })).toThrow(/DATABASE_URL/);
  });

  it('never includes values in the error message', () => {
    const secret = 'mysql://root:TopSecretPassword@db/x';
    let message = '';
    try {
      loadConfig({ ...valid, DATABASE_URL: secret });
    } catch (err) {
      expect(err).toBeInstanceOf(ConfigError);
      message = err.message;
    }
    expect(message).toContain('DATABASE_URL');
    expect(message).not.toContain('TopSecretPassword');
  });

  it('rejects an origin with a path', () => {
    expect(() => loadConfig({ ...valid, APP_ORIGIN: 'http://127.0.0.1:5173/app' })).toThrow(
      /APP_ORIGIN/,
    );
  });

  it('requires https in production', () => {
    expect(() => loadConfig({ ...valid, NODE_ENV: 'production' })).toThrow(/https/);
    expect(() =>
      loadConfig({
        ...valid,
        NODE_ENV: 'production',
        APP_ORIGIN: 'https://agence.lan',
        TRUST_PROXY: '1',
        DOCUMENTS_DIR: resolve('agence-documents'),
      }),
    ).not.toThrow();
  });

  it('requires a 32-byte encryption key for two-factor secrets', () => {
    expect(() => loadConfig({ ...valid, TOTP_ENCRYPTION_KEY: undefined })).toThrow(
      /TOTP_ENCRYPTION_KEY/,
    );
    expect(() =>
      loadConfig({ ...valid, TOTP_ENCRYPTION_KEY: Buffer.alloc(16).toString('base64') }),
    ).toThrow(/TOTP_ENCRYPTION_KEY/);
  });

  it('applies session lifetime defaults and limits', () => {
    const config = loadConfig(valid);
    expect(config.SESSION_IDLE_MINUTES).toBe(30);
    expect(config.SESSION_ABSOLUTE_HOURS).toBe(10);
    expect(() => loadConfig({ ...valid, SESSION_IDLE_MINUTES: '1' })).toThrow(
      /SESSION_IDLE_MINUTES/,
    );
  });

  it('requires the proxy to be trusted in production', () => {
    expect(() =>
      loadConfig({ ...valid, NODE_ENV: 'production', APP_ORIGIN: 'https://agence.lan' }),
    ).toThrow(/TRUST_PROXY/);
  });

  it('rejects an unknown time zone', () => {
    expect(() => loadConfig({ ...valid, APP_TIMEZONE: 'Mars/Olympus' })).toThrow(/APP_TIMEZONE/);
  });
});
