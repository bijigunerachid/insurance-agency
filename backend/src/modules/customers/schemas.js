import { z } from 'zod';
import {
  IDENTITY_PATTERNS,
  normalizeIce,
  normalizeIdentityNumber,
  normalizePhone,
} from '../../utils/identifiers.js';
import { paginationFields } from '../../utils/pagination.js';

export const customerIdParams = z.strictObject({ id: z.uuid() });

export const listCustomersQuery = z.strictObject({
  q: z.string().trim().max(80).optional(),
  type: z.enum(['INDIVIDUAL', 'BUSINESS']).optional(),
  archived: z.enum(['exclude', 'include', 'only']).default('exclude'),
  /** The workspace chosen after sign-in: clients with a contract there, or with none. */
  insurerId: z.uuid().optional(),
  ...paginationFields,
});

/** Empty strings from forms mean "no value". */
const isSet = (value) => value !== null && value !== undefined;
const blankToNull = (value) => (typeof value === 'string' && value.trim() === '' ? null : value);
const optionalText = (max) =>
  z.preprocess(blankToNull, z.string().trim().min(1).max(max).nullable().optional());

const phone = z.preprocess(
  blankToNull,
  z
    .string()
    .max(30)
    .transform((value, ctx) => {
      const normalized = normalizePhone(value);
      if (!normalized) ctx.addIssue({ code: 'custom', message: 'INVALID_PHONE' });
      return normalized;
    })
    .nullable()
    .optional(),
);

const ice = z.preprocess(
  blankToNull,
  z
    .string()
    .max(20)
    .transform(normalizeIce)
    .pipe(z.string().regex(/^\d{15}$/, 'INVALID_ICE'))
    .nullable()
    .optional(),
);

const fields = {
  firstName: optionalText(80),
  lastName: optionalText(80),
  legalName: optionalText(160),
  ice,
  identityType: z.preprocess(
    blankToNull,
    z.enum(['CIN', 'PASSPORT', 'RESIDENCE_CARD']).nullable().optional(),
  ),
  identityNumber: z.preprocess(
    blankToNull,
    z.string().max(40).transform(normalizeIdentityNumber).nullable().optional(),
  ),
  phone,
  email: z.preprocess(
    blankToNull,
    z.string().trim().toLowerCase().max(254).pipe(z.email()).nullable().optional(),
  ),
  addressLine: optionalText(200),
  city: optionalText(80),
  assignedUserId: z.preprocess(blankToNull, z.uuid().nullable().optional()),
  /** The user saw the possible duplicates and confirms this is a different customer. */
  confirmNotDuplicate: z.boolean().optional(),
};

/** Checks that need several fields: identity pair and format, fields allowed per type. */
function checkCombined(body, ctx, type) {
  const hasType = isSet(body.identityType);
  const hasNumber = isSet(body.identityNumber);
  if (hasType !== hasNumber) {
    ctx.addIssue({ code: 'custom', path: ['identityNumber'], message: 'IDENTITY_INCOMPLETE' });
  } else if (hasType && !IDENTITY_PATTERNS[body.identityType].test(body.identityNumber)) {
    ctx.addIssue({ code: 'custom', path: ['identityNumber'], message: 'INVALID_IDENTITY' });
  }
  if (type === 'INDIVIDUAL') {
    if (isSet(body.legalName))
      ctx.addIssue({ code: 'custom', path: ['legalName'], message: 'NOT_FOR_INDIVIDUAL' });
    if (isSet(body.ice))
      ctx.addIssue({ code: 'custom', path: ['ice'], message: 'NOT_FOR_INDIVIDUAL' });
  }
}

export const createCustomerBody = z
  .strictObject({ type: z.enum(['INDIVIDUAL', 'BUSINESS']), ...fields })
  .superRefine((body, ctx) => {
    checkCombined(body, ctx, body.type);
    if (body.type === 'INDIVIDUAL') {
      if (!body.firstName)
        ctx.addIssue({ code: 'custom', path: ['firstName'], message: 'REQUIRED' });
      if (!body.lastName) ctx.addIssue({ code: 'custom', path: ['lastName'], message: 'REQUIRED' });
    } else if (!body.legalName) {
      ctx.addIssue({ code: 'custom', path: ['legalName'], message: 'REQUIRED' });
    }
  });

/** Partial update; the type cannot change. Type-dependent rules are checked by the service. */
export const updateCustomerBody = z.strictObject({ ...fields, version: z.int().min(1) });

export const archiveBody = z.strictObject({
  reason: z.string().trim().min(5).max(200),
  version: z.int().min(1),
});

export const restoreBody = z.strictObject({ version: z.int().min(1) });

export const revealBody = z.strictObject({ reason: z.string().trim().min(5).max(200) });

export { checkCombined };
