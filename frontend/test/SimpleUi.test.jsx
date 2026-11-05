import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { me, mockApi } from './mockApi.js';
import { phoneScreen } from './phoneScreen.js';
import { renderApp } from './renderApp.jsx';

const agent = () => [
  200,
  me({
    role: 'AGENT',
    permissions: [
      'customers.read',
      'vehicles.read',
      'contracts.read',
      'payments.read',
      'renewals.read',
      'scans.manage',
      'stock.read',
      'catalogue.read',
    ],
  }),
];
const emptyHome = {
  'GET /api/today': () => [200, { today: '2026-10-24', items: [] }],
  'GET /api/renewals/summary': () => [
    200,
    { windowDays: 30, mine: 0, mineOverdue: 0, allOpen: 0, next: [] },
  ],
};

describe('a short menu for daily work', () => {
  it('shows the daily pages and keeps the others under "Plus"', async () => {
    mockApi({ 'GET /api/auth/me': agent, ...emptyHome });
    renderApp('/');
    const user = userEvent.setup();

    const nav = await screen.findByRole('navigation', { name: 'Navigation principale' });
    for (const name of [
      'Aujourd’hui',
      'Scanner une attestation',
      'Clients',
      'Contrats',
      'Paiements',
    ]) {
      expect(within(nav).getByRole('link', { name })).toBeInTheDocument();
    }
    expect(within(nav).queryByRole('link', { name: 'Stock d’attestations' })).toBeNull();
    const more = within(nav).getByRole('button', { name: 'Plus' });
    expect(more).toHaveAttribute('aria-expanded', 'false');
    await user.click(more);
    expect(more).toHaveAttribute('aria-expanded', 'true');
    expect(within(nav).getByRole('link', { name: 'Stock d’attestations' })).toBeInTheDocument();
    expect(within(nav).getByRole('link', { name: 'Véhicules' })).toBeInTheDocument();
  });

  it('keeps "Plus" open on a page that lives there', async () => {
    mockApi({
      'GET /api/auth/me': agent,
      'GET /api/renewals?page=1': () => [
        200,
        { items: [], total: 0, page: 1, pageSize: 25, pageCount: 1 },
      ],
      'GET /api/renewals/assignees': () => [200, { items: [] }],
    });
    renderApp('/renouvellements');
    const nav = await screen.findByRole('navigation', { name: 'Navigation principale' });
    expect(within(nav).getByRole('button', { name: 'Plus' })).toHaveAttribute(
      'aria-expanded',
      'true',
    );
  });
});

describe('the menu on a phone', () => {
  it('opens "Plus" as a panel only when asked, and closes it on a page or with Escape', async () => {
    const restore = phoneScreen();
    try {
      mockApi({
        'GET /api/auth/me': agent,
        ...emptyHome,
        'GET /api/renewals?page=1': () => [
          200,
          { items: [], total: 0, page: 1, pageSize: 25, pageCount: 1 },
        ],
        'GET /api/renewals/assignees': () => [200, { items: [] }],
      });
      renderApp('/accueil');
      const user = userEvent.setup();
      const nav = await screen.findByRole('navigation', { name: 'Navigation principale' });
      // The daily pages keep their full name, shown short under the icon.
      expect(within(nav).getByRole('link', { name: 'Scanner une attestation' })).toHaveTextContent(
        'Scanner',
      );
      const more = within(nav).getByRole('button', { name: 'Plus' });
      await user.click(more);
      expect(more).toHaveAttribute('aria-expanded', 'true');
      await user.keyboard('{Escape}');
      expect(more).toHaveAttribute('aria-expanded', 'false');

      await user.click(more);
      await user.click(within(nav).getByRole('link', { name: 'Renouvellements' }));
      expect(
        await screen.findByRole('heading', { level: 1, name: /Renouvellements/ }),
      ).toBeVisible();
      // On a page of "Plus", the panel no longer covers it.
      expect(more).toHaveAttribute('aria-expanded', 'false');
    } finally {
      restore();
    }
  });
});

describe('the to-do list puts what is late first', () => {
  it('shows late lines first, marked, then the rest', async () => {
    mockApi({
      'GET /api/auth/me': agent,
      ...emptyHome,
      'GET /api/today': () => [
        200,
        {
          today: '2026-10-24',
          items: [
            { kind: 'SCANS', count: 2, to: '/scans' },
            { kind: 'RENEWALS', count: 1, soon: 0, to: '/renouvellements' },
            {
              kind: 'UNPAID',
              count: 3,
              amount: '900.00',
              old: 1,
              days: 15,
              to: '/contrats?unpaid=1',
            },
          ],
        },
      ],
    });
    renderApp('/accueil');
    const todo = (await screen.findByRole('heading', { name: 'À faire' })).closest('section');
    const lines = await within(todo).findAllByRole('link');
    expect(lines.map((l) => l.getAttribute('href'))).toEqual([
      '/contrats?unpaid=1',
      '/scans',
      '/renouvellements',
    ]);
    // Money owed for long is late: marked on screen, its line says why.
    expect(lines[0]).toHaveTextContent('En retard');
    expect(lines[0]).toHaveAccessibleName(/dont 1 depuis plus de 15 jours/);
    expect(lines[1]).not.toHaveTextContent('En retard');
  });
});

describe('one search box on the home page', () => {
  it('finds customers, vehicles and contracts and opens them', async () => {
    const fetchMock = mockApi({
      'GET /api/auth/me': agent,
      ...emptyHome,
      'GET /api/search?q=12345': () => [
        200,
        {
          customers: [],
          vehicles: [
            {
              id: 've1',
              registration: '12345-A-6',
              makeAndModel: 'Dacia Logan',
              owner: 'Sara Test',
            },
          ],
          contracts: [
            {
              id: 'c1',
              ref: 'CTR-2026-00001',
              policyNumber: 'POL-12345',
              status: 'ISSUED',
              insurer: 'RMA',
              customer: 'Sara Test',
              endDate: '2027-10-31',
            },
          ],
        },
      ],
      'GET /api/search?q=zz': () => [200, { customers: [], vehicles: [], contracts: [] }],
    });
    renderApp('/');
    const user = userEvent.setup();

    const box = await screen.findByRole('searchbox', { name: 'Rechercher' });
    await user.type(box, '1');
    // One letter: nothing is asked.
    expect(fetchMock.mock.calls.some(([url]) => url.startsWith('/api/search'))).toBe(false);
    await user.type(box, '2345');
    expect(await screen.findByRole('link', { name: /12345-A-6/ })).toHaveAttribute(
      'href',
      '/vehicules/ve1',
    );
    // A contract is known by its policy number (05/11/2026).
    expect(screen.getByRole('link', { name: /POL-12345/ })).toHaveAttribute('href', '/contrats/c1');
    expect(screen.getByText(/Sara Test · RMA · Émis · 31\/10\/2027/)).toBeInTheDocument();

    await user.clear(box);
    await user.type(box, 'zz');
    expect(await screen.findByText('Aucun résultat.')).toBeInTheDocument();
  });
});

describe('the contract page opens on a summary', () => {
  it('says who is insured, until when and what is left to pay', async () => {
    const CONTRACT_ID = '00000000-0000-4000-8000-0000000000f1';
    mockApi({
      'GET /api/auth/me': agent,
      [`GET /api/contracts/${CONTRACT_ID}`]: () => [
        200,
        {
          id: CONTRACT_ID,
          ref: 'CTR-2026-00001',
          status: 'ISSUED',
          period: 'ACTIVE',
          customer: { id: 'cu1', ref: 'CLI-000001', displayName: 'Sara Test' },
          product: { id: 'p1', name: 'Véhicules de tourisme', line: 'CAR', insurerCode: null },
          insurer: { id: 'i1', code: 'RMA', name: 'RMA' },
          policyNumber: 'POL-1',
          insurerReference: 'Courriel',
          startDate: '2026-01-01',
          endDate: '2099-12-31',
          premiumTotal: '1234.50',
          tacitRenewal: false,
          noticeDays: null,
          vehicles: [{ id: 've1', registration: '12345-A-6', make: 'Dacia', model: 'Logan' }],
          attestations: [],
          history: [],
          previousContract: null,
          nextContract: null,
          version: 3,
        },
      ],
      [`GET /api/contracts/${CONTRACT_ID}/payments`]: () => [
        200,
        { premiumTotal: '1234.50', paid: '500.00', balance: '734.50', items: [] },
      ],
    });
    renderApp(`/contrats/${CONTRACT_ID}`);

    expect(await screen.findByRole('heading', { level: 1, name: 'Sara Test' })).toBeInTheDocument();
    expect(screen.getByText('Assuré jusqu’au 31/12/2099')).toHaveClass('text-success-ink');
    const summary = screen.getByRole('heading', { level: 1, name: 'Sara Test' }).closest('section');
    expect(within(summary).getByText('12345-A-6')).toBeInTheDocument();
    const left = await within(summary).findByText('734,50 MAD');
    expect(left).toHaveClass('text-danger-ink');
    // The details are folded until asked for.
    expect(screen.getByText('Détails du contrat').closest('details')).not.toHaveAttribute('open');
  });
});

describe('the client page opens on what matters', () => {
  it('shows the phone to call, then the contracts with what is left to pay; details folded', async () => {
    const CUSTOMER_ID = '00000000-0000-4000-8000-0000000000c9';
    mockApi({
      'GET /api/auth/me': agent,
      [`GET /api/customers/${CUSTOMER_ID}`]: () => [
        200,
        {
          id: CUSTOMER_ID,
          ref: 'CLI-000001',
          type: 'INDIVIDUAL',
          displayName: 'Sara Test',
          firstName: 'Sara',
          lastName: 'Test',
          phone: '+212612345678',
          city: 'Kenitra',
          identityType: 'CIN',
          identityNumber: 'AB****56',
          identityMasked: true,
          assignedUser: null,
          archivedAt: null,
          createdAt: '2026-10-24T10:00:00.000Z',
          version: 1,
        },
      ],
      [`GET /api/contracts?customerId=${CUSTOMER_ID}&pageSize=100`]: () => [
        200,
        {
          items: [
            {
              id: 'c1',
              ref: 'CTR-2026-00001',
              status: 'ISSUED',
              period: 'ACTIVE',
              customer: { id: CUSTOMER_ID, ref: 'CLI-000001', displayName: 'Sara Test' },
              product: { id: 'p1', name: 'Véhicules de tourisme' },
              insurer: { id: 'i1', code: 'RMA', name: 'RMA' },
              policyNumber: 'POL-1',
              startDate: '2026-11-01',
              endDate: '2027-10-31',
              vehicles: [{ id: 've1', registration: '12345-A-6' }],
              premiumTotal: '1234.50',
              balance: '234.50',
            },
          ],
          total: 1,
          page: 1,
          pageSize: 100,
          pageCount: 1,
        },
      ],
      [`GET /api/vehicles?customerId=${CUSTOMER_ID}&archived=include&pageSize=100`]: () => [
        200,
        { items: [], total: 0, page: 1, pageSize: 100, pageCount: 1 },
      ],
      [`GET /api/fleets?customerId=${CUSTOMER_ID}`]: () => [200, { items: [] }],
    });
    renderApp(`/clients/${CUSTOMER_ID}`);

    expect(await screen.findByRole('heading', { level: 1, name: 'Sara Test' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: '06 12 34 56 78' })).toHaveAttribute(
      'href',
      'tel:+212612345678',
    );
    const owed = await screen.findByText('234,50 MAD');
    expect(owed).toHaveClass('text-danger-ink');
    expect(screen.getByText('Coordonnées et suivi').closest('details')).not.toHaveAttribute('open');
  });
});

const owedRow = {
  id: 'c1',
  ref: 'CTR-2026-00001',
  status: 'ISSUED',
  period: 'ACTIVE',
  customer: { id: 'cu1', ref: 'CLI-000001', displayName: 'Sara Test' },
  product: { id: 'p1', name: 'Véhicules de tourisme' },
  insurer: { id: 'i1', code: 'RMA', name: 'RMA' },
  policyNumber: 'POL-1',
  startDate: '2026-11-01',
  endDate: '2027-10-31',
  vehicles: [{ id: 'v1', registration: '12345-A-6' }],
  premiumTotal: '1234.50',
  balance: '234.50',
};

describe('the contracts on a phone', () => {
  it('shows one card per contract, paid from the card, the filters behind one button', async () => {
    const restore = phoneScreen();
    try {
      mockApi({
        'GET /api/auth/me': () => [
          200,
          me({
            role: 'AGENT',
            permissions: ['contracts.read', 'payments.read', 'payments.record'],
          }),
        ],
        'GET /api/contracts?page=1': () => [
          200,
          { items: [owedRow], total: 1, page: 1, pageSize: 25, pageCount: 1 },
        ],
        'GET /api/contracts?page=1&status=ISSUED': () => [
          200,
          { items: [], total: 0, page: 1, pageSize: 25, pageCount: 1 },
        ],
      });
      renderApp('/contrats');
      const user = userEvent.setup();
      const card = (await screen.findByRole('link', { name: 'POL-1' })).closest('li');
      expect(screen.queryByRole('table')).toBeNull();
      expect(card).toHaveTextContent('Sara Test');
      expect(card).toHaveTextContent('12345-A-6 · 01/11/2026 – 31/10/2027');
      expect(within(card).getByText('234,50 MAD')).toHaveClass('text-danger-ink');
      await user.click(
        within(card).getByRole('button', { name: 'Encaisser un paiement pour POL-1' }),
      );
      const dialog = screen.getByRole('dialog', { name: 'Encaisser un paiement' });
      await user.click(within(dialog).getByRole('button', { name: 'Annuler' }));

      // The search box stays in reach; the status waits behind « Filtres ».
      expect(screen.getByLabelText('Rechercher (n° de police, client)')).toBeVisible();
      const filters = screen.getByRole('button', { name: 'Filtres' });
      expect(filters).toHaveAttribute('aria-expanded', 'false');
      expect(screen.getByLabelText('Statut')).not.toBeVisible();
      await user.click(filters);
      await user.selectOptions(screen.getByLabelText('Statut'), 'ISSUED');
      expect(await screen.findByText('Aucun résultat.')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Filtres (1)' })).toBeInTheDocument();
    } finally {
      restore();
    }
  });
});

describe('paying from the list of what is owed', () => {
  it('opens the payment form from the contract row and shows the receipt', async () => {
    const PAYMENT_ID = '00000000-0000-4000-8000-0000000000d1';
    const row = {
      id: 'c1',
      ref: 'CTR-2026-00001',
      status: 'ISSUED',
      period: 'ACTIVE',
      customer: { id: 'cu1', ref: 'CLI-000001', displayName: 'Sara Test' },
      product: { id: 'p1', name: 'Véhicules de tourisme' },
      insurer: { id: 'i1', code: 'RMA', name: 'RMA' },
      policyNumber: 'POL-1',
      startDate: '2026-11-01',
      endDate: '2027-10-31',
      vehicles: [],
      premiumTotal: '1234.50',
      balance: '234.50',
    };
    let paid = null;
    mockApi({
      'GET /api/auth/me': () => [
        200,
        me({ role: 'AGENT', permissions: ['contracts.read', 'payments.read', 'payments.record'] }),
      ],
      'GET /api/contracts?page=1&unpaid=1': () => [
        200,
        { items: [row], total: 1, page: 1, pageSize: 25, pageCount: 1 },
      ],
      'POST /api/contracts/c1/payments': (init) => {
        paid = JSON.parse(init.body);
        return [201, { id: PAYMENT_ID }];
      },
      [`GET /api/payments/${PAYMENT_ID}`]: () => [404, { error: { code: 'NOT_FOUND' } }],
    });
    renderApp('/contrats?unpaid=1');
    const user = userEvent.setup();

    await user.click(
      await screen.findByRole('button', { name: 'Encaisser un paiement pour POL-1' }),
    );
    const dialog = screen.getByRole('dialog', { name: 'Encaisser un paiement' });
    expect(within(dialog).getByText(/Reste à payer : 234,50/)).toBeInTheDocument();
    // The balance is proposed; the employee may change it.
    const amount = within(dialog).getByLabelText('Montant (MAD)');
    expect(amount).toHaveValue('234,50');
    await user.clear(amount);
    await user.type(amount, '234,50');
    await user.click(within(dialog).getByRole('button', { name: 'Encaisser' }));
    await waitFor(() => expect(paid).not.toBeNull());
    expect(paid).toMatchObject({ amount: '234,50', method: 'CASH' });
  });
});

describe('the home page says where it stands', () => {
  it('shows the shape of the lists while they load, then the day and how many lines are late', async () => {
    let answer;
    const today = new Promise((resolve) => {
      answer = resolve;
    });
    mockApi({
      'GET /api/auth/me': agent,
      ...emptyHome,
      'GET /api/today': () => today,
    });
    renderApp('/accueil');
    const todo = await screen.findByRole('region', { name: 'À faire' });
    expect(within(todo).getByRole('status')).toHaveTextContent('Chargement…');

    answer([
      200,
      {
        today: '2026-11-04',
        items: [
          { kind: 'RENEWALS_LATE', count: 2, to: '/renouvellements?overdue=1' },
          { kind: 'SCANS', count: 1, to: '/scans' },
        ],
      },
    ]);
    expect(await within(todo).findByText('1 en retard')).toBeInTheDocument();
    expect(within(todo).queryByRole('status')).toBeNull();
    // The agency's day, as the server gives it.
    expect(screen.getByText('Mercredi 4 novembre 2026')).toBeInTheDocument();
  });

  it('says plainly when nothing is waiting and when no renewal is due', async () => {
    mockApi({ 'GET /api/auth/me': agent, ...emptyHome });
    renderApp('/accueil');
    const todo = await screen.findByRole('region', { name: 'À faire' });
    expect(await within(todo).findByText('Rien en attente. Tout est à jour.')).toBeInTheDocument();
    expect(within(todo).queryByText(/en retard/)).toBeNull();
    const next = screen.getByRole('region', { name: 'Mes prochains renouvellements' });
    expect(
      await within(next).findByText('Aucun renouvellement à suivre pour vous.'),
    ).toBeInTheDocument();
    expect(
      within(next).getByRole('link', { name: 'Voir tous les renouvellements' }),
    ).toHaveAttribute('href', '/renouvellements');
  });

  it('keeps the page usable when the renewals cannot be read', async () => {
    mockApi({
      'GET /api/auth/me': agent,
      ...emptyHome,
      'GET /api/renewals/summary': () => [500, { error: { code: 'INTERNAL' } }],
    });
    renderApp('/accueil');
    const next = await screen.findByRole('region', { name: 'Mes prochains renouvellements' });
    expect(await within(next).findByRole('alert')).toBeInTheDocument();
    expect(screen.getByRole('searchbox', { name: 'Rechercher' })).toBeEnabled();
  });
});
