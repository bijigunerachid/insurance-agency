import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { me, mockApi } from './mockApi.js';
import { phoneScreen } from './phoneScreen.js';
import { renderApp } from './renderApp.jsx';

const RMA = '00000000-0000-4000-8000-0000000000a1';
const CAT = '00000000-0000-4000-8000-0000000000a2';
const REMITTANCE_ID = '00000000-0000-4000-8000-0000000000e1';
const as = (role, permissions) => () => [200, me({ role, permissions })];
const manager = as('ADMIN', ['remittances.read', 'remittances.manage', 'renewals.read']);
const auditor = as('AGENT', ['remittances.read']);

const summary = {
  today: '2026-11-20',
  insurers: [
    {
      id: CAT,
      code: 'CAT',
      name: 'CAT Assurance & Réassurance',
      total: '0.00',
      overdueAmount: '0.00',
      months: [],
    },
    {
      id: RMA,
      code: 'RMA',
      name: 'RMA (Royale Marocaine d’Assurance)',
      total: '1500.00',
      overdueAmount: '1000.00',
      months: [
        {
          month: '2026-10',
          amount: '1000.00',
          count: 2,
          dueOn: '2026-11-15',
          daysLeft: -5,
          overdue: true,
        },
        {
          month: '2026-11',
          amount: '500.00',
          count: 1,
          dueOn: '2026-12-15',
          daysLeft: 25,
          overdue: false,
        },
      ],
    },
  ],
};
const item = {
  paymentId: 'p1',
  receiptNumber: 'REC-2026-00001',
  kind: 'PAYMENT',
  amount: '1000.00',
  receivedAt: '2026-10-22T10:00:00.000Z',
  contract: { id: 'c1', ref: 'CTR-2026-00001' },
  customer: 'Sara Test',
};
const remittance = (overrides = {}) => ({
  id: REMITTANCE_ID,
  number: 'VER-2026-00001',
  insurer: { id: RMA, code: 'RMA', name: 'RMA (Royale Marocaine d’Assurance)' },
  collectedUntil: '2026-10-31',
  amount: '1000.00',
  method: 'TRANSFER',
  reference: 'VIR-77',
  remittedOn: '2026-11-20',
  note: null,
  recordedAt: '2026-11-20T10:00:00.000Z',
  recordedBy: { id: 'u1', displayName: 'Karim Test' },
  itemCount: 1,
  status: 'ACTIVE',
  cancellation: null,
  items: [item],
  agency: { name: null, address: null, phone: null, ice: null, acapsNumber: null },
  ...overrides,
});
const routes = (meRoute, extra = {}) => ({
  'GET /api/auth/me': meRoute,
  'GET /api/remittances/summary': () => [200, summary],
  'GET /api/remittances?page=1': () => [
    200,
    { items: [], total: 0, page: 1, pageSize: 25, pageCount: 1 },
  ],
  ...extra,
});

describe('remittances to the insurers', () => {
  it('shows late months and records a remittance of the previous month with its reference', async () => {
    const fetchMock = mockApi(
      routes(manager, {
        [`GET /api/remittances/outstanding?insurerId=${RMA}&collectedUntil=2026-10-31`]: () => [
          200,
          {
            amount: '1000.00',
            collectedUntil: '2026-10-31',
            items: [item, { ...item, paymentId: 'p2' }],
          },
        ],
        'POST /api/remittances': () => [201, remittance()],
        [`GET /api/remittances/${REMITTANCE_ID}`]: () => [200, remittance()],
      }),
    );
    renderApp('/reversements');
    const user = userEvent.setup();

    const rma = await screen.findByRole('region', { name: 'RMA (Royale Marocaine d’Assurance)' });
    expect(within(rma).getByText('1 500,00 MAD')).toBeInTheDocument();
    expect(within(rma).getByText('En retard de 5 jours')).toBeInTheDocument();
    expect(within(rma).getByText('À reverser au plus tard le 15/11/2026')).toBeInTheDocument();
    const cat = screen.getByRole('region', { name: 'CAT Assurance & Réassurance' });
    expect(within(cat).getByText('Rien à reverser.')).toBeInTheDocument();
    expect(within(cat).queryByRole('button', { name: 'Enregistrer un reversement' })).toBeNull();

    await user.click(within(rma).getByRole('button', { name: 'Enregistrer un reversement' }));
    const dialog = screen.getByRole('dialog', { name: /^Reversement à RMA/ });
    // October is owed: the remittance proposes the payments up to its last day.
    expect(within(dialog).getByLabelText('Paiements encaissés jusqu’au')).toHaveValue('2026-10-31');
    expect(
      await within(dialog).findByText('Montant à reverser : 1 000,00 MAD (2 paiements).'),
    ).toBeInTheDocument();
    const submit = within(dialog).getByRole('button', { name: 'Enregistrer un reversement' });
    expect(submit).toBeDisabled();
    await user.type(within(dialog).getByLabelText('Référence du virement'), 'VIR-77');
    await user.click(submit);

    expect(
      await screen.findByRole('heading', { name: 'Bordereau de reversement' }),
    ).toBeInTheDocument();
    expect(screen.getByText('REC-2026-00001')).toBeInTheDocument();
    const call = fetchMock.mock.calls.find(([, init]) => init?.method === 'POST');
    expect(JSON.parse(call[1].body)).toMatchObject({
      insurerId: RMA,
      collectedUntil: '2026-10-31',
      expectedAmount: '1000.00',
      method: 'TRANSFER',
      reference: 'VIR-77',
      remittedOn: '2026-11-20',
    });
  });

  it('lets management cancel a remittance with a reason, and only management', async () => {
    let current = remittance();
    const fetchMock = mockApi(
      routes(manager, {
        [`GET /api/remittances/${REMITTANCE_ID}`]: () => [200, current],
        [`POST /api/remittances/${REMITTANCE_ID}/cancel`]: () => {
          current = remittance({
            status: 'CANCELLED',
            cancellation: {
              at: '2026-11-21T09:00:00.000Z',
              by: { id: 'u1', displayName: 'Karim Test' },
              reason: 'Virement refusé',
            },
          });
          return [200, current];
        },
      }),
    );
    renderApp(`/reversements/${REMITTANCE_ID}`);
    const user = userEvent.setup();

    await user.click(await screen.findByRole('button', { name: 'Annuler le reversement' }));
    const dialog = screen.getByRole('dialog', { name: /Annuler le reversement VER-2026-00001/ });
    await user.type(within(dialog).getByRole('textbox'), 'Virement refusé');
    await user.click(within(dialog).getByRole('button', { name: 'Annuler le reversement' }));

    expect(
      await screen.findByText(
        /Reversement annulé le 21\/11\/2026 par Karim Test : Virement refusé/,
      ),
    ).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Annuler le reversement' })).toBeNull();
    const call = fetchMock.mock.calls.find(([, init]) => init?.method === 'POST');
    expect(JSON.parse(call[1].body)).toEqual({ reason: 'Virement refusé' });
  });

  it('shows the bordereau without any action to someone who may only read', async () => {
    mockApi(
      routes(auditor, {
        [`GET /api/remittances/${REMITTANCE_ID}`]: () => [200, remittance()],
      }),
    );
    renderApp(`/reversements/${REMITTANCE_ID}`);
    expect(
      await screen.findByRole('heading', { name: 'Bordereau de reversement' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Imprimer' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Annuler le reversement' })).toBeNull();
  });

  it('shows management the late remittance in the to-do list of the home page', async () => {
    mockApi(
      routes(manager, {
        'GET /api/today': () => [
          200,
          {
            today: '2026-11-20',
            items: [
              { kind: 'REMITTANCE_LATE', insurer: 'RMA', amount: '1000.00', to: '/reversements' },
            ],
          },
        ],
        'GET /api/renewals/summary': () => [
          200,
          { windowDays: 30, mine: 0, mineOverdue: 0, allOpen: 0, next: [] },
        ],
      }),
    );
    renderApp('/accueil');
    expect(
      await screen.findByRole('link', { name: /^Reversement RMA en retard : 1\s000,00\sMAD$/ }),
    ).toHaveAttribute('href', '/reversements');
  });
});

describe('remittances on the new design', () => {
  const page = (items) => [
    200,
    { items, total: items.length, page: 1, pageSize: 25, pageCount: 1 },
  ];
  const done = remittance();
  const undone = remittance({
    id: '00000000-0000-4000-8000-0000000000e2',
    number: 'VER-2026-00002',
    status: 'CANCELLED',
  });

  it('shows the shape of the cards while loading, then the history as a table', async () => {
    let answer;
    const first = new Promise((resolve) => {
      answer = resolve;
    });
    const fetchMock = mockApi(
      routes(manager, {
        'GET /api/remittances/summary': () => first,
        'GET /api/remittances?page=1': () => page([done, undone]),
        'GET /api/remittances?page=1&status=CANCELLED': () => page([undone]),
      }),
    );
    renderApp('/reversements');
    const user = userEvent.setup();
    expect((await screen.findAllByRole('status'))[0]).toHaveTextContent('Chargement…');

    answer([200, summary]);
    await screen.findByRole('region', { name: 'RMA (Royale Marocaine d’Assurance)' });
    const table = await screen.findByRole('table', { name: 'Reversements enregistrés' });
    const [, active, cancelled] = within(table).getAllByRole('row');
    expect(within(active).getByRole('link', { name: 'VER-2026-00001' })).toHaveAttribute(
      'href',
      `/reversements/${REMITTANCE_ID}`,
    );
    expect(active).toHaveTextContent('VIR-77');
    expect(within(cancelled).getByText('Annulé')).toBeInTheDocument();
    // Nothing was handed over: its amount is struck through.
    expect(within(cancelled).getByText('1 000,00 MAD')).toHaveClass('line-through');
    expect(within(active).getByText('1 000,00 MAD')).not.toHaveClass('line-through');

    await user.click(screen.getByRole('radio', { name: 'Annulé' }));
    expect(fetchMock.mock.calls.map(([url]) => url)).toContain(
      '/api/remittances?page=1&status=CANCELLED',
    );
  });

  it('shows one card per remittance on a phone', async () => {
    phoneScreen();
    mockApi(routes(manager, { 'GET /api/remittances?page=1': () => page([done]) }));
    renderApp('/reversements');
    const list = await screen.findByRole('list', { name: 'Reversements enregistrés' });
    const [card] = within(list).getAllByRole('listitem');
    expect(within(card).getByRole('link', { name: 'VER-2026-00001' })).toBeInTheDocument();
    expect(card).toHaveTextContent('1 000,00 MAD');
  });

  it('records the way the remittance was made with one click among the choices', async () => {
    mockApi(
      routes(manager, {
        [`GET /api/remittances/outstanding?insurerId=${RMA}&collectedUntil=2026-10-31`]: () => [
          200,
          { amount: '1000.00', collectedUntil: '2026-10-31', items: [item] },
        ],
      }),
    );
    renderApp('/reversements');
    const user = userEvent.setup();
    const rma = await screen.findByRole('region', { name: 'RMA (Royale Marocaine d’Assurance)' });
    await user.click(within(rma).getByRole('button', { name: 'Enregistrer un reversement' }));
    const dialog = screen.getByRole('dialog', { name: /^Reversement à RMA/ });
    expect(within(dialog).getByRole('radio', { name: 'Virement' })).toBeChecked();
    await user.click(within(dialog).getByRole('radio', { name: 'Chèque' }));
    expect(within(dialog).getByRole('radio', { name: 'Chèque' })).toBeChecked();
    expect(within(dialog).getByLabelText('N° du chèque et banque')).toBeInTheDocument();
  });
});
