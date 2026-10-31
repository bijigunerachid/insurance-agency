import '@testing-library/jest-dom/vitest';
import { cleanup, configure } from '@testing-library/react';
import { afterEach, vi } from 'vitest';

// The default 1 s wait for findBy… is too short when all test files run in parallel on a cold
// cache (first renders took ~1.2 s): wait up to 5 s, which only slows down failing tests.
configure({ asyncUtilTimeout: 5000 });

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
