import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useApiQuery } from '../src/hooks/useApiQuery.js';
import { apiGet } from '../src/services/api.js';
import { jsonResponse } from './mockApi.js';

afterEach(() => vi.unstubAllGlobals());

describe('loading data while the employee types', () => {
  it('keeps a request cancelled while its answer is read, never an empty answer', async () => {
    const cancelled = new Response('{}', { status: 200 });
    cancelled.json = () => Promise.reject(new DOMException('Cancelled', 'AbortError'));
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => cancelled),
    );
    await expect(apiGet('/scans/1/matches')).rejects.toMatchObject({ name: 'AbortError' });
  });

  it('drops the answer of a request replaced meanwhile, even when it arrives last', async () => {
    // A slow server: the first answer comes after the second.
    const answers = {};
    vi.stubGlobal(
      'fetch',
      vi.fn(
        (url) =>
          new Promise((resolve) => {
            answers[url] = () => resolve(jsonResponse(200, { url }));
          }),
      ),
    );
    const { result, rerender } = renderHook(({ path }) => useApiQuery(path), {
      initialProps: { path: '/scans/1/matches?registration=1' },
    });
    rerender({ path: '/scans/1/matches?registration=12' });
    await act(async () => answers['/api/scans/1/matches?registration=12']());
    await waitFor(() => expect(result.current.state.status).toBe('done'));
    await act(async () => answers['/api/scans/1/matches?registration=1']());
    expect(result.current.state.data).toEqual({ url: '/api/scans/1/matches?registration=12' });
  });
});
