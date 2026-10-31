import { fileURLToPath } from 'node:url';

/** Documents attached during end-to-end runs (git-ignored, emptied before each run). */
export const E2E_DOCUMENTS_DIR = fileURLToPath(
  new URL('../storage/e2e-documents', import.meta.url),
);
