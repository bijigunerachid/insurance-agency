import { z } from 'zod';
import { PASSWORD_MAX } from './passwords.js';

// Upper bounds stop oversized input before it reaches Argon2.
const password = z.string().min(1).max(PASSWORD_MAX);
const code = z.string().regex(/^\d{6}$/);

export const loginSchema = z.strictObject({
  username: z.string().trim().min(1).max(64),
  password,
});

export const codeSchema = z.strictObject({ code });

export const changePasswordSchema = z.strictObject({
  currentPassword: password,
  newPassword: password,
});

export const reauthSchema = z.strictObject({
  password,
  code: code.optional(),
});
