import { readFileSync, statSync } from 'node:fs';
import { basename, dirname, isAbsolute, join, resolve } from 'node:path';
import { z } from 'zod';

/** Empty means not set. */
const blank = (value) => (typeof value === 'string' && value.trim() === '' ? undefined : value);
const optionalText = (max) => z.preprocess(blank, z.string().trim().max(max).optional());

/** The agency's logo and tab icon: small PNG or JPEG files, read once at startup. */
const IMAGE_MAX_BYTES = 1024 * 1024;
const IMAGE_TYPES = [
  { type: 'image/png', magic: [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a] },
  { type: 'image/jpeg', magic: [0xff, 0xd8, 0xff] },
];

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']),
  HOST: z.string().min(1).default('127.0.0.1'),
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  DATABASE_URL: z
    .string()
    .refine((value) => /^postgres(ql)?:\/\//.test(value), 'must be a postgresql:// URL'),
  APP_ORIGIN: z
    .url()
    .refine((value) => new URL(value).origin === value, 'must be an origin without path'),
  TRUST_PROXY: z.coerce.number().int().min(0).max(5).default(0),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
  APP_TIMEZONE: z.string().default('Africa/Casablanca'),
  TOTP_ENCRYPTION_KEY: z
    .string()
    .refine(
      (value) => Buffer.from(value, 'base64').length === 32,
      'must be 32 random bytes encoded in base64',
    ),
  SESSION_IDLE_MINUTES: z.coerce.number().int().min(5).max(240).default(30),
  SESSION_ABSOLUTE_HOURS: z.coerce.number().int().min(1).max(24).default(10),
  // Login attempts per client address per 15 minutes. Raised only for automated browser tests,
  // where every sign-in comes from 127.0.0.1.
  LOGIN_MAX_PER_IP: z.coerce.number().int().min(5).max(10_000).default(20),
  // The agency using this installation: shown on the screens and printed on receipts. One
  // installation per agency, so nothing about an agency is in the code. Optional: until they
  // are set, the receipt says so instead of printing anything invented.
  AGENCY_NAME: optionalText(120),
  AGENCY_TAGLINE: optionalText(80),
  AGENCY_ADDRESS: optionalText(200),
  AGENCY_PHONE: optionalText(40),
  AGENCY_FAX: optionalText(40),
  AGENCY_EMAIL: z.preprocess(blank, z.email().max(120).optional()),
  AGENCY_ICE: z.preprocess(
    blank,
    z
      .string()
      .trim()
      .regex(/^\d{15}$/, 'must be the 15 digits of the ICE')
      .optional(),
  ),
  AGENCY_ACAPS_NUMBER: optionalText(40),
  // The legal line at the foot of the receipt, as on the agency's letterhead.
  AGENCY_LEGAL_FORM: optionalText(120),
  AGENCY_PATENTE: optionalText(30),
  AGENCY_IF: optionalText(30),
  AGENCY_RC: optionalText(30),
  AGENCY_CNSS: optionalText(30),
  // PNG or JPEG files outside the code (1 MB at most): the logo, and a square tab icon.
  AGENCY_LOGO_FILE: optionalText(500),
  AGENCY_ICON_FILE: optionalText(500),
  // The insurers' cards on the workspace screen (colour, tagline, logo and photo per insurer
  // code): a JSON file outside the code, its images in the same folder. Optional.
  INSURER_BRANDING_FILE: optionalText(500),
  // Folder of the documents attached to contracts (scans of the insurers' documents). Outside
  // the web root and inside the backups. Relative paths are resolved from the backend folder.
  DOCUMENTS_DIR: z.string().trim().min(1).default('storage/documents'),
  // The backup job's status file (production: written by backup.sh), shown on the status page.
  BACKUP_STATUS_FILE: optionalText(500),
});

export class ConfigError extends Error {}

/**
 * Validates environment variables. The error lists variable names and problems only,
 * never values, because values may be secrets.
 */
export function loadConfig(env = process.env) {
  const result = schema.safeParse(env);
  if (!result.success) {
    const problems = result.error.issues.map(
      (issue) => `${issue.path.join('.')}: ${issue.message}`,
    );
    throw new ConfigError(`Invalid configuration:\n- ${problems.join('\n- ')}`);
  }

  const config = result.data;
  if (!isValidTimeZone(config.APP_TIMEZONE)) {
    throw new ConfigError('Invalid configuration:\n- APP_TIMEZONE: unknown time zone');
  }
  if (config.NODE_ENV === 'production' && !config.APP_ORIGIN.startsWith('https://')) {
    throw new ConfigError('Invalid configuration:\n- APP_ORIGIN: must use https in production');
  }
  // In production the API always sits behind the HTTPS proxy. Without trusting it, every office
  // PC would look like the proxy's address and share one login limit (20 per 15 minutes).
  if (config.NODE_ENV === 'production' && config.TRUST_PROXY < 1) {
    throw new ConfigError(
      'Invalid configuration:\n- TRUST_PROXY: must be at least 1 in production (behind the HTTPS proxy)',
    );
  }
  if (config.NODE_ENV === 'production' && !isAbsolute(config.DOCUMENTS_DIR)) {
    throw new ConfigError(
      'Invalid configuration:\n- DOCUMENTS_DIR: must be an absolute path in production',
    );
  }
  return Object.freeze({
    ...config,
    DOCUMENTS_DIR: resolve(config.DOCUMENTS_DIR),
    AGENCY_LOGO: readImage('AGENCY_LOGO_FILE', config.AGENCY_LOGO_FILE),
    AGENCY_ICON: readImage('AGENCY_ICON_FILE', config.AGENCY_ICON_FILE),
    INSURER_BRANDING: readInsurerBranding(config.INSURER_BRANDING_FILE),
  });
}

const imageName = z
  .string()
  .regex(
    /^[\w-][\w.-]{0,99}\.(png|jpe?g)$/i,
    'must be a .png or .jpg file name in the same folder',
  );
const brandingText = (max) => z.string().trim().min(1).max(max).optional();
const insurerBranding = z.strictObject({
  /** Title on the card; the catalogue's name when absent. */
  title: brandingText(80),
  tagline: brandingText(80),
  /** The insurer's colour: the card's overlay and the header mark. */
  colour: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/, 'must be a colour like #272F65')
    .optional(),
  logo: imageName.optional(),
  photo: imageName.optional(),
  /** Author and licence of the photo, shown on the card (a CC BY licence asks for it). */
  photoCredit: brandingText(160),
});
const brandingFile = z.record(z.string().regex(/^[A-Z0-9_-]{1,16}$/), insurerBranding);

/**
 * Reads the insurers' branding: per insurer code, texts and colour, and its logo and photo read
 * like the agency's images (PNG or JPEG by their first bytes, 1 MB at most). Only file names in
 * the JSON file's own folder are accepted. Null when unset.
 */
function readInsurerBranding(path) {
  if (!path) return null;
  const name = 'INSURER_BRANDING_FILE';
  const fail = (problem) =>
    new ConfigError(`Invalid configuration:
- ${name}: ${problem}`);
  let raw;
  try {
    raw = JSON.parse(readFileSync(resolve(path), 'utf8'));
  } catch (err) {
    if (err instanceof SyntaxError) throw fail('not valid JSON');
    throw fail(err.code === 'EACCES' ? 'file not readable (permissions)' : 'file not found');
  }
  const result = brandingFile.safeParse(raw);
  if (!result.success) {
    const issue = result.error.issues[0];
    throw fail(`${issue.path.join('.') || 'file'}: ${issue.message}`);
  }
  const folder = dirname(resolve(path));
  const image = (code, key, file) =>
    file ? readImage(`${name} ${code}.${key}`, join(folder, basename(file))) : null;
  return Object.freeze(
    Object.fromEntries(
      Object.entries(result.data).map(([code, entry]) => [
        code,
        Object.freeze({
          title: entry.title ?? null,
          tagline: entry.tagline ?? null,
          colour: entry.colour?.toUpperCase() ?? null,
          photoCredit: entry.photoCredit ?? null,
          logo: image(code, 'logo', entry.logo),
          photo: image(code, 'photo', entry.photo),
        }),
      ]),
    ),
  );
}

/**
 * Reads an image setting: a PNG or JPEG of 1 MB at most, recognised by its first bytes (never
 * by its name). Null when unset. The error names the setting, not the file's content.
 */
function readImage(name, path) {
  if (!path) return null;
  const fail = (problem) => new ConfigError(`Invalid configuration:\n- ${name}: ${problem}`);
  let size;
  try {
    size = statSync(resolve(path)).size;
  } catch (err) {
    // A folder or file the API's user may not open is not a missing file: say which.
    throw fail(err.code === 'EACCES' ? 'file not readable (permissions)' : 'file not found');
  }
  if (size > IMAGE_MAX_BYTES) throw fail('larger than 1 MB');
  const bytes = readFileSync(resolve(path));
  const kind = IMAGE_TYPES.find(({ magic }) => magic.every((byte, i) => bytes[i] === byte));
  if (!kind) throw fail('must be a PNG or JPEG image');
  return Object.freeze({ type: kind.type, bytes });
}

function isValidTimeZone(timeZone) {
  try {
    new Intl.DateTimeFormat('fr-MA', { timeZone });
    return true;
  } catch {
    return false;
  }
}
