import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { me, mockApi } from './mockApi.js';
import { renderApp } from './renderApp.jsx';

const RENEWAL_ID = '00000000-0000-4000-8000-0000000000b1';
const NEW_CONTRACT_ID = '00000000-0000-4000-8000-0000000000f2';
const agent = () => [
  200,
  me({ role: 'AGENT', permissions: ['renewals.read', 'renewals.write', 'contracts.read'] }),
];

const renewal = (overrides = {}) => ({
  id: RENEWAL_ID,
  status: 'TO_PREPARE',
  open: true,
  dueDate: '2026-11-15',
  daysLeft: 24,
  noticeDeadline: '2026-10-16',
  assignedUser: { id: 'u1', displayName: 'Karim Test' },
  outcomeReason: null,
  renewedContract: null,
  contract: {
    id: 'c1',
    ref: 'CTR-2026-00001',
    status: 'ISSUED',
    policyNumber: 'POL-1',
    startDate: '2025-11-20',
    endDate: '2026-11-15',
    tacitRenewal: true,
    customer: { id: 'cu1', ref: 'CLI-000001', displayName: 'Sara Test' },
    insurer: { id: 'i1', code: 'RMA' },
    product: { id: 'p1', name: 'Produit RMA' },
    vehicles: [{ id: 'v1', registration: '12345-B-6' }],
  },
  events: [
    {
      id: '1',
      from: null,
      to: 'TO_PREPARE',
      fromAssignee: null,
      toAssignee: { id: 'u1', displayName: 'Karim Test' },
      note: null,
      by: null,
      at: '2026-10-22T09:00:00.000Z',
    },
  ],
  version: 1,
  ...overrides,
});

describe('home page (Aujourd’hui)', () => {
  it('lists what is waiting, each line opening its page, and the next renewals', async () => {
    mockApi({
      'GET /api/auth/me': agent,
      'GET /api/today': () => [
        200,
        {
          today: '2026-10-24',
          items: [
            { kind: 'RENEWALS_LATE', count: 1, to: '/renouvellements' },
            { kind: 'RENEWALS', count: 2, soon: 1, to: '/renouvellements' },
            {
              kind: 'UNPAID',
              count: 1,
              amount: '734.50',
              old: 1,
              days: 15,
              to: '/contrats?unpaid=1',
            },
          ],
        },
      ],
      'GET /api/renewals/summary': () => [
        200,
        {
          windowDays: 30,
          mine: 3,
          mineOverdue: 1,
          allOpen: 5,
          next: [
            renewal({
              daysLeft: -2,
              contract: {
                ...renewal().contract,
                customer: { ...renewal().contract.customer, phone: '+212612345678' },
              },
            }),
          ],
        },
      ],
    });
    renderApp('/');

    expect(await screen.findByRole('heading', { name: 'Bonjour Karim Test' })).toBeInTheDocument();
    const todo = (await screen.findByRole('heading', { name: 'À faire' })).closest('section');
    // The list loads after the heading: wait for it.
    expect(
      await within(todo).findByRole('link', { name: '1 renouvellement en retard' }),
    ).toHaveAttribute('href', '/renouvellements');
    expect(
      within(todo).getByRole('link', { name: '2 assurances à renouveler (dont 1 cette semaine)' }),
    ).toBeInTheDocument();
    expect(
      within(todo).getByRole('link', {
        name: /^1 client doit encore 734,50\sMAD \(dont 1 depuis plus de 15 jours\)$/,
      }),
    ).toHaveAttribute('href', '/contrats?unpaid=1');
    expect(await screen.findByRole('link', { name: 'Sara Test' })).toHaveAttribute(
      'href',
      `/renouvellements/${RENEWAL_ID}`,
    );
    expect(screen.getByText('En retard de 2 jours')).toBeInTheDocument();
    // The client to call is one tap away.
    expect(screen.getByRole('link', { name: '06 12 34 56 78' })).toHaveAttribute(
      'href',
      'tel:+212612345678',
    );
    expect(screen.getByText(/Préavis de résiliation avant le 16\/10\/2026/)).toBeInTheDocument();
  });

  it('says when nothing is waiting', async () => {
    mockApi({
      'GET /api/auth/me': agent,
      'GET /api/today': () => [200, { today: '2026-10-24', items: [] }],
      'GET /api/renewals/summary': () => [
        200,
        { windowDays: 30, mine: 0, mineOverdue: 0, allOpen: 0, next: [] },
      ],
    });
    renderApp('/');
    expect(await screen.findByText('Rien en attente. Tout est à jour.')).toBeInTheDocument();
  });
});

describe('renewal follow-up', () => {
  it('asks for a reason before closing a renewal as not renewed; no reassigning for an agent', async () => {
    const fetchMock = mockApi({
      'GET /api/auth/me': agent,
      [`GET /api/renewals/${RENEWAL_ID}`]: () => [200, renewal()],
      [`PATCH /api/renewals/${RENEWAL_ID}`]: () => [
        200,
        renewal({ status: 'NOT_RENEWED', open: false, outcomeReason: 'Véhicule vendu' }),
      ],
    });
    renderApp(`/renouvellements/${RENEWAL_ID}`);
    const user = userEvent.setup();

    await screen.findByRole('heading', { name: 'Sara Test' });
    expect(screen.queryByLabelText('Confier à')).not.toBeInTheDocument();
    await user.selectOptions(screen.getByLabelText('Nouvelle étape'), 'Non renouvelé');
    const submit = screen.getByRole('button', { name: 'Enregistrer le suivi' });
    expect(submit).toBeDisabled();
    await user.type(screen.getByLabelText('Motif *'), 'Véhicule vendu');
    await user.click(submit);

    const call = fetchMock.mock.calls.find(([, init]) => init?.method === 'PATCH');
    expect(JSON.parse(call[1].body)).toEqual({
      version: 1,
      status: 'NOT_RENEWED',
      outcomeReason: 'Véhicule vendu',
    });
  });

  it('prepares the new contract and opens it', async () => {
    const fetchMock = mockApi({
      'GET /api/auth/me': agent,
      [`GET /api/renewals/${RENEWAL_ID}`]: () => [200, renewal()],
      [`POST /api/renewals/${RENEWAL_ID}/renew`]: () => [
        201,
        { renewal: renewal({ status: 'RENEWED', open: false }), contractId: NEW_CONTRACT_ID },
      ],
      [`GET /api/contracts/${NEW_CONTRACT_ID}`]: () => [404, { error: { code: 'NOT_FOUND' } }],
    });
    renderApp(`/renouvellements/${RENEWAL_ID}`);
    const user = userEvent.setup();

    await user.click(await screen.findByRole('button', { name: 'Préparer le nouveau contrat' }));
    const dialog = screen.getByRole('dialog', { name: 'Préparer le nouveau contrat' });
    await user.click(within(dialog).getByRole('button', { name: 'Préparer le nouveau contrat' }));

    // The new contract's page is requested.
    await screen.findByRole('link', { name: 'Tous les contrats' });
    expect(fetchMock.mock.calls.some(([url]) => url === `/api/contracts/${NEW_CONTRACT_ID}`)).toBe(
      true,
    );
    const call = fetchMock.mock.calls.find(([url]) => url.endsWith('/renew'));
    expect(JSON.parse(call[1].body)).toEqual({ version: 1 });
  });
});

describe('the renewals list on the new design', () => {
  const page = (items) => [
    200,
    { items, total: items.length, page: 1, pageSize: 25, pageCount: 1 },
  ];

  it('chooses the status from the choices side by side, and says why nothing is open', async () => {
    const fetchMock = mockApi({
      'GET /api/auth/me': agent,
      'GET /api/renewals?status=open&page=1': () => page([]),
      'GET /api/renewals?status=RENEWED&page=1': () =>
        page([renewal({ status: 'RENEWED', open: false })]),
    });
    renderApp('/renouvellements');
    const user = userEvent.setup();

    const choices = await screen.findByRole('group', { name: 'Statut' });
    expect(within(choices).getByRole('radio', { name: 'À suivre' })).toBeChecked();
    expect(await screen.findByText('Aucun renouvellement.')).toBeInTheDocument();
    expect(
      screen.getByText('Aucun contrat émis ne se termine dans les 30 prochains jours.'),
    ).toBeInTheDocument();

    await user.click(within(choices).getByRole('radio', { name: 'Renouvelés' }));
    expect(within(choices).getByRole('radio', { name: 'Renouvelés' })).toBeChecked();
    expect(await screen.findByRole('link', { name: 'Sara Test' })).toBeInTheDocument();
    expect(fetchMock.mock.calls.map(([url]) => url)).toContain(
      '/api/renewals?status=RENEWED&page=1',
    );
  });
});

describe('the steps of a renewal', () => {
  it('shows the steps done, the one in progress and those to come', async () => {
    mockApi({
      'GET /api/auth/me': agent,
      [`GET /api/renewals/${RENEWAL_ID}`]: () => [200, renewal({ status: 'CUSTOMER_CONTACTED' })],
    });
    renderApp(`/renouvellements/${RENEWAL_ID}`);
    const steps = await screen.findByRole('list', { name: 'Étapes du renouvellement' });
    const items = within(steps).getAllByRole('listitem');
    expect(items).toHaveLength(4);
    [
      'À préparer (faite)',
      'Client contacté (en cours)',
      'Dossier complet (à venir)',
      'Renouvelé (à venir)',
    ].forEach((text, index) => expect(items[index]).toHaveTextContent(text));
    expect(items[1]).toHaveAttribute('aria-current', 'step');
  });

  it('ends on « Non renouvelé » when the client does not renew', async () => {
    mockApi({
      'GET /api/auth/me': agent,
      [`GET /api/renewals/${RENEWAL_ID}`]: () => [
        200,
        renewal({ status: 'NOT_RENEWED', open: false, outcomeReason: 'Vend la voiture' }),
      ],
    });
    renderApp(`/renouvellements/${RENEWAL_ID}`);
    const steps = await screen.findByRole('list', { name: 'Étapes du renouvellement' });
    const items = within(steps).getAllByRole('listitem');
    expect(items[3]).toHaveTextContent('Non renouvelé (le client ne renouvelle pas)');
    expect(items[3]).toHaveAttribute('aria-current', 'step');
    expect(items[2]).toHaveTextContent('Dossier complet (faite)');
    // A closed follow-up: no form to change it.
    expect(screen.queryByLabelText('Nouvelle étape')).toBeNull();
  });
});
