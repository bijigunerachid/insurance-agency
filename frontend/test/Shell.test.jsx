import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';
import { me, mockApi } from './mockApi.js';
import { phoneScreen } from './phoneScreen.js';
import { renderApp } from './renderApp.jsx';

const agent = () => [
  200,
  me({
    role: 'AGENT',
    permissions: [
      'customers.read',
      'contracts.read',
      'renewals.read',
      'vehicles.read',
      'stock.read',
    ],
  }),
];
const home = {
  'GET /api/today': () => [200, { today: '2026-11-04', items: [] }],
  'GET /api/renewals/summary': () => [
    200,
    { windowDays: 30, mine: 0, mineOverdue: 0, allOpen: 0, next: [] },
  ],
};

beforeEach(() => localStorage.clear());

describe('the side menu on a computer', () => {
  it('shows the person, groups "Plus", and can be reduced to icons, remembered', async () => {
    mockApi({ 'GET /api/auth/me': agent, ...home });
    const { unmount } = renderApp('/accueil');
    const user = userEvent.setup();
    const nav = await screen.findByRole('navigation', { name: 'Navigation principale' });
    // The person, their account and « Se déconnecter »: in their menu in the header.
    const person = screen.getByRole('button', { name: 'Menu de Karim Test' });
    expect(person).toHaveTextContent('KT');
    await user.click(person);
    const menu = screen.getByRole('menu', { name: 'Menu de Karim Test' });
    expect(within(menu).getByText('Karim Test')).toBeVisible();
    expect(within(menu).getByRole('menuitem', { name: 'Mon compte' })).toHaveFocus();
    expect(within(menu).getByRole('menuitem', { name: 'Se déconnecter' })).toBeVisible();
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('menu')).toBeNull();
    expect(person).toHaveFocus();
    // Where the person is, in the header.
    expect(
      within(screen.getByRole('navigation', { name: 'Vous êtes ici' })).getByText('Aujourd’hui'),
    ).toHaveAttribute('aria-current', 'page');

    await user.click(within(nav).getByRole('button', { name: 'Plus' }));
    const more = within(nav).getByRole('list', { name: 'Autres pages' });
    expect(within(more).getByText('Suivi')).toBeVisible();
    expect(within(more).getByText('Référentiel')).toBeVisible();
    expect(within(more).getByRole('link', { name: 'Stock d’attestations' })).toBeVisible();
    // No administration page for an agent: no empty group either.
    expect(within(more).queryByText('Administration')).toBeNull();

    const reduce = screen.getByRole('button', { name: 'Réduire le menu' });
    expect(reduce).toHaveAttribute('aria-pressed', 'false');
    await user.click(reduce);
    expect(reduce).toHaveAttribute('aria-pressed', 'true');
    // Reduced: the pages keep their names (read by screen readers, shown as tooltips).
    const clients = within(nav).getByRole('link', { name: 'Clients' });
    expect(clients).toHaveAttribute('title', 'Clients');
    expect(localStorage.getItem('agency.sidebar')).toBe('collapsed');

    unmount();
    renderApp('/accueil');
    expect(await screen.findByRole('button', { name: 'Réduire le menu' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
  });
});

describe('the quick search', () => {
  it('opens with Ctrl+K from any page, finds a client and opens it', async () => {
    const fetchMock = mockApi({
      'GET /api/auth/me': agent,
      'GET /api/customers?archived=exclude&page=1': () => [
        200,
        { items: [], total: 0, page: 1, pageSize: 25, pageCount: 1 },
      ],
      'GET /api/search?q=sara': () => [
        200,
        {
          customers: [{ id: 'c1', ref: 'CLI-000001', displayName: 'Sara Test', city: null }],
          vehicles: [],
          contracts: [],
        },
      ],
      'GET /api/customers/c1': () => [200, { id: 'c1' }],
    });
    const { router } = renderApp('/clients');
    const user = userEvent.setup();
    await screen.findByRole('heading', { name: 'Clients' });
    expect(screen.getByRole('button', { name: 'Recherche rapide' })).toHaveAttribute(
      'aria-keyshortcuts',
      'Control+K',
    );

    await user.keyboard('{Control>}k{/Control}');
    const dialog = await screen.findByRole('dialog', { name: 'Recherche rapide' });
    const box = within(dialog).getByRole('searchbox', { name: 'Recherche rapide' });
    expect(box).toHaveFocus();
    await user.type(box, 'sara');
    await user.click(await within(dialog).findByRole('link', { name: /Sara Test/ }));
    expect(router.state.location.pathname).toBe('/clients/c1');
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(fetchMock.mock.calls.map(([url]) => url)).toContain('/api/search?q=sara');
  });
});

describe('the header on a phone', () => {
  it('keeps the search, the sign-out and the bottom bar within reach', async () => {
    const restore = phoneScreen();
    try {
      mockApi({ 'GET /api/auth/me': agent, ...home });
      renderApp('/accueil');
      const user = userEvent.setup();
      await screen.findByRole('navigation', { name: 'Navigation principale' });
      expect(screen.getByRole('button', { name: 'Menu de Karim Test' })).toBeVisible();
      expect(screen.queryByRole('button', { name: 'Réduire le menu' })).toBeNull();
      await user.click(screen.getByRole('button', { name: 'Recherche rapide' }));
      const dialog = await screen.findByRole('dialog', { name: 'Recherche rapide' });
      // Escape is the browser's own (native dialog, e2e); jsdom has no such key handling.
      await user.click(within(dialog).getByRole('button', { name: 'Fermer' }));
      await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    } finally {
      restore();
    }
  });
});
