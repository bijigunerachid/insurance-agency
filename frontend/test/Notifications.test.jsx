import { act, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { me, mockApi } from './mockApi.js';
import { renderApp } from './renderApp.jsx';

const agent = () => [200, me({ role: 'AGENT', permissions: ['contracts.read', 'renewals.read'] })];
const manager = () => [
  200,
  me({ role: 'ADMIN', permissions: ['contracts.read', 'remittances.manage', 'stock.manage'] }),
];
const page = (items) => [200, { items, total: items.length, page: 1, pageSize: 25, pageCount: 1 }];

const created = {
  id: '4',
  kind: 'ACTIVITY',
  action: 'contract.created',
  data: { policyNumber: 'POL-0001', customer: 'Sara Test' },
  link: '/contrats/c1',
  createdAt: '2026-11-05T09:00:00.000Z',
  actor: { displayName: 'Agent B' },
  mine: false,
  unread: true,
};
const paid = {
  ...created,
  id: '5',
  action: 'payment.recorded',
  data: { policyNumber: 'POL-0001', customer: 'Sara Test', amount: '500.00' },
  link: '/recus/p1',
};
const renewal = {
  id: '3',
  kind: 'RENEWAL_DUE',
  action: null,
  data: {
    policyNumber: 'POL-0002',
    customer: 'Nadia Test',
    dueDate: '2026-11-20',
    daysLeft: 15,
    step: 15,
    follower: 'Agent A',
    lastAction: {
      status: 'CUSTOMER_CONTACTED',
      note: 'Rappeler lundi',
      by: 'Agent A',
      at: '2026-11-04T10:00:00.000Z',
    },
  },
  link: '/renouvellements/r1',
  createdAt: '2026-11-05T08:00:00.000Z',
  actor: null,
  mine: false,
  unread: false,
};

describe('the bell', () => {
  it('counts what is new, lists it in a panel, and marks it seen once shown', async () => {
    let seen = false;
    const fetchMock = mockApi({
      'GET /api/auth/me': agent,
      'GET /api/notifications/summary': () => [
        200,
        { unread: seen ? 0 : 2, latestId: '5', recent: [paid, created] },
      ],
      'GET /api/notifications?pageSize=8': () => page([paid, created, renewal]),
      'POST /api/notifications/seen': () => {
        seen = true;
        return [200, { seenAt: '2026-11-05T10:00:00.000Z' }];
      },
      'GET /api/today': () => [200, { today: '2026-11-05', items: [] }],
    });
    renderApp('/');
    const user = userEvent.setup();
    const bell = await screen.findByRole('button', { name: 'Notifications, 2 nouvelles' });
    expect(bell).toHaveAttribute('aria-expanded', 'false');

    await user.click(bell);
    const panel = await screen.findByRole('region', { name: 'Dernières notifications' });
    expect(
      await within(panel).findByText(
        'Agent B a encaissé 500,00 MAD pour le contrat POL-0001 de Sara Test',
      ),
    ).toBeInTheDocument();
    expect(
      within(panel).getByText('Agent B a enregistré le contrat POL-0001 de Sara Test'),
    ).toBeInTheDocument();
    // A renewal says who follows it and the last step taken.
    expect(
      within(panel).getByText(
        'Renouvellement dans 15 jours : Nadia Test (POL-0002), suivi par Agent A',
      ),
    ).toBeInTheDocument();
    expect(
      within(panel).getByText(/^Dernière action : Client contacté « Rappeler lundi », Agent A,/),
    ).toBeInTheDocument();
    expect(within(panel).getAllByText('Nouveau')).toHaveLength(2);
    expect(within(panel).getByRole('link', { name: /a encaissé/ })).toHaveAttribute(
      'href',
      '/recus/p1',
    );
    await waitFor(() =>
      expect(fetchMock.mock.calls.some(([url]) => url === '/api/notifications/seen')).toBe(true),
    );
    expect(screen.getByRole('button', { name: 'Notifications' })).toBeInTheDocument();

    // Escape closes it and gives the focus back to the bell.
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('region', { name: 'Dernières notifications' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Notifications' })).toHaveFocus();
  });

  it('pops up what arrives while working, never what was already there', async () => {
    let answer = { unread: 1, latestId: '4', recent: [created] };
    mockApi({
      'GET /api/auth/me': agent,
      'GET /api/notifications/summary': () => [200, answer],
      'GET /api/today': () => [200, { today: '2026-11-05', items: [] }],
    });
    renderApp('/');
    await screen.findByRole('button', { name: 'Notifications, 1 nouvelle' });
    expect(screen.queryByText(/a enregistré le contrat/)).toBeNull();

    // The next check (the tab shown again): a payment arrived.
    answer = { unread: 2, latestId: '5', recent: [paid, created] };
    const visibility = vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible');
    await act(async () => {
      document.dispatchEvent(new Event('visibilitychange'));
    });
    // The amount is written with a non-breaking space before « MAD ».
    const popup = await screen.findByRole('link', {
      name: /^Agent B a encaissé 500,00\sMAD pour le contrat POL-0001 de Sara Test$/,
    });
    expect(popup).toHaveAttribute('href', '/recus/p1');
    expect(screen.getByRole('button', { name: 'Notifications, 2 nouvelles' })).toBeInTheDocument();
    // Only the new one pops up.
    expect(screen.queryByRole('link', { name: /a enregistré le contrat/ })).toBeNull();
    visibility.mockRestore();
  });
});

describe('the history', () => {
  it('lists who did what, filtered by kind; management’s alerts for management only', async () => {
    const unpaid = {
      ...renewal,
      id: '2',
      kind: 'UNPAID',
      data: { policyNumber: 'POL-0003', customer: 'Karim Test', balance: '734.50', days: 21 },
    };
    const fetchMock = mockApi({
      'GET /api/auth/me': agent,
      'GET /api/notifications?page=1': () => page([{ ...paid, mine: true, unread: false }, unpaid]),
      'GET /api/notifications?page=1&kind=RENEWAL_DUE': () => page([renewal]),
      'POST /api/notifications/seen': () => [200, {}],
    });
    renderApp('/notifications');
    const user = userEvent.setup();
    expect(await screen.findByRole('heading', { level: 1, name: 'Notifications' }));
    // One's own action says « Vous ».
    expect(
      await screen.findByText('Vous a encaissé 500,00 MAD pour le contrat POL-0001 de Sara Test'),
    ).toBeInTheDocument();
    expect(
      screen.getByText('Impayé depuis 21 jours : Karim Test (POL-0003) doit encore 734,50 MAD'),
    ).toBeInTheDocument();
    const filter = screen.getByRole('group', { name: 'Afficher' });
    expect(
      within(filter)
        .getAllByRole('radio')
        .map((r) => r.labels[0].textContent),
    ).toEqual(['Tout', 'Activité', 'Renouvellements', 'Impayés']);
    await user.click(within(filter).getByRole('radio', { name: 'Renouvellements' }));
    expect(await screen.findByText(/^Renouvellement dans 15 jours/)).toBeInTheDocument();
    expect(fetchMock.mock.calls.map(([url]) => url)).toContain(
      '/api/notifications?page=1&kind=RENEWAL_DUE',
    );
  });

  it('shows management the late remittances and the low stock', async () => {
    mockApi({
      'GET /api/auth/me': manager,
      'GET /api/notifications?page=1': () =>
        page([
          {
            ...renewal,
            id: '7',
            kind: 'REMITTANCE_LATE',
            data: { insurer: 'RMA', amount: '1234.50' },
            link: '/reversements',
          },
          {
            ...renewal,
            id: '6',
            kind: 'STOCK_LOW',
            data: { series: '14 A', insurer: 'RMA', available: 10, threshold: 20 },
            link: '/stock',
          },
        ]),
      'POST /api/notifications/seen': () => [200, {}],
    });
    renderApp('/notifications');
    expect(
      await screen.findByText('Reversement en retard : 1 234,50 MAD à reverser à RMA'),
    ).toBeInTheDocument();
    expect(
      screen.getByText('Stock bas : 10 attestations RMA 14 A disponibles'),
    ).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: 'Direction' })).toBeInTheDocument();
  });
});
