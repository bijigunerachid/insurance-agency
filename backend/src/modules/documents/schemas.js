import { z } from 'zod';

export const DOCUMENT_KINDS = [
  'ATTESTATION',
  'CONDITIONS_PARTICULIERES',
  'QUITTANCE',
  'NOTE_DE_COUVERTURE',
];
/** 10 MB, the agency's answer on uploads. */
export const MAX_DOCUMENT_BYTES = 10 * 1024 * 1024;

export const idParams = z.strictObject({ id: z.uuid() });

export const uploadQuery = z.strictObject({
  type: z.enum(DOCUMENT_KINDS),
  replacesId: z.uuid().optional(),
});

/**
 * The file's name, sent URI-encoded in X-File-Name. Only its last part is kept, without
 * control characters; it is shown to users, never used on disk.
 */
export const fileName = z
  .string()
  .transform((value, ctx) => {
    try {
      return decodeURIComponent(value);
    } catch {
      ctx.addIssue({ code: 'custom', message: 'INVALID_FILE_NAME' });
      return z.NEVER;
    }
  })
  .transform((value) =>
    value
      .split(/[\\/]/)
      .pop()
      // eslint-disable-next-line no-control-regex
      .replace(/[\u0000-\u001f\u007f]/g, '')
      .trim(),
  )
  .pipe(z.string().min(1, 'INVALID_FILE_NAME').max(200, 'INVALID_FILE_NAME'));

export const removeDocumentBody = z.strictObject({
  reason: z.string().trim().min(5).max(300),
});
