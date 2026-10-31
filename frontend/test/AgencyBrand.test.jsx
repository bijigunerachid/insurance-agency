import { screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { anonymous, me, mockApi } from './mockApi.js';
import { renderApp } from './renderApp.jsx';

const brand = { name: 'Agence Test', tagline: 'Agent général', logo: true, icon: true };

afterEach(() => {
  document.querySelector('link[rel="icon"]')?.remove();
  document.title = '';
});

describe('the agency of this installation', () => {
  it('shows its logo on the sign-in page, its name in the tab and its icon', async () => {
    mockApi({
      'GET /api/auth/me': () => anonymous,
      'GET /api/agency/brand': () => [200, brand],
    });
    renderApp('/');
    const logo = await screen.findByRole('img', { name: 'Agence Test' });
    expect(logo).toHaveAttribute('src', '/api/agency/logo');
    await waitFor(() => expect(document.title).toBe("Agence Test · Gestion de l'agence"));
    expect(document.querySelector('link[rel="icon"]')).toHaveAttribute('href', '/api/agency/icon');
  });

  it('heads every screen with it once signed in; without settings, the application name', async () => {
    mockApi({
      'GET /api/auth/me': () => [200, me({ role: 'AGENT', permissions: [] })],
      'GET /api/today': () => [200, { today: '2026-10-24', items: [] }],
      'GET /api/agency/brand': () => [200, { ...brand, logo: false, icon: false }],
    });
    renderApp('/accueil');
    expect(await screen.findByText('Agence Test')).toBeInTheDocument();
    expect(screen.getByText('Agent général')).toBeInTheDocument();
    expect(document.querySelector('link[rel="icon"]')).toBeNull();
  });
});
