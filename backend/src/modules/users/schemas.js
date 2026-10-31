import { z } from 'zod';
import { paginationFields } from '../../utils/pagination.js';
import { USERNAME_PATTERN } from '../auth/setup.js';

export const userIdParams = z.strictObject({ id: z.uuid() });

export const listUsersQuery = z.strictObject({
  q: z.string().trim().max(64).optional(),
  status: z.enum(['active', 'disabled', 'all']).default('active'),
  ...paginationFields,
});

const roleCode = z.enum(['ADMIN', 'MANAGER', 'AGENT', 'AUDITOR']);
const displayName = z.string().trim().min(1).max(120);
const version = z.int().min(1);

// Strict objects: any other field (active, passwordHash, totpSecret…) is rejected.
export const createUserBody = z.strictObject({
  username: z.string().trim().toLowerCase().regex(USERNAME_PATTERN),
  displayName,
  roleCode,
});

export const updateUserBody = z
  .strictObject({ displayName: displayName.optional(), roleCode: roleCode.optional(), version })
  .refine((body) => body.displayName !== undefined || body.roleCode !== undefined, {
    message: 'Nothing to change',
  });

export const versionBody = z.strictObject({ version });
