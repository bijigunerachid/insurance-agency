import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { me, mockApi } from './mockApi.js';
import { renderApp } from './renderApp.jsx';

const CONTRACT_ID = '00000000-0000-4000-8000-0000000000f1';
const PAYMENT_ID = '00000000-0000-4000-8000-0000000000d1';
const as = (role, permissions) => () => [200, me({ role, permissions })];
const agent = as('AGENT', ['contracts.read', 'payments.read', 'payments.record']);
const manager = as('ADMIN', [
  'contracts.read',
  'payments.read',
  'payments.record',
  'payments.reverse',
]);

const contract = {
  id: CONTRACT_ID,
  ref: 'CTR-2026-00001',
  status: 'ISSUED',
  period: 'ACTIVE',
  customer: { id: 'cu1', ref: 'CLI-000001', displayName: 'Sara Test' },
  product: { id: 'p1', name: 'Produit RMA', line: 'CAR', insurerCode: null },
  insurer: { id: 'i1', code: 'RMA', name: 'RMA (Royale Marocaine d’Assurance)' },
  policyNumber: 'POL-1',
  insurerReference: 'Courriel',
  startDate: '2026-11-01',
  endDate: '2027-10-31',
  premiumTotal: '1234.50',
  tacitRenewal: false,
  noticeDays: null,
  vehicles: [],
  attestations: [],
  history: [],
  previousContract: null,
  nextContract: null,
  version: 3,
};
const payment = {
  id: PAYMENT_ID,
  receiptNumber: 'REC-2026-00001',
  kind: 'PAYMENT',
  amount: '1000.00',
  method: 'CASH',
  reference: null,
  payerName: null,
  receivedAt: '2026-10-23T10:00:00.000Z',
  receivedBy: { id: 'u1', displayName: 'Karim Test' },
  reverses: null,
  reversedBy: null,
  reason: null,
};
const receipt = (overrides = {}) => ({
  ...payment,
  contract: {
    id: CONTRACT_ID,
    ref: 'CTR-2026-00001',
    policyNumber: 'POL-1',
    insurer: { code: 'RMA', name: 'RMA (Royale Marocaine d’Assurance)' },
    product: { name: 'Produit RMA' },
    customer: { ref: 'CLI-000001', displayName: 'Sara Test' },
  },
  agency: { name: null, address: null, phone: null, ice: null, acapsNumber: null },
  ...overrides,
});
const routes = (meRoute, extra = {}) => ({
  'GET /api/auth/me': meRoute,
  [`GET /api/contracts/${CONTRACT_ID}`]: () => [200, contract],
  [`GET /api/contracts/${CONTRACT_ID}/payments`]: () => [
    200,
    { premiumTotal: '1234.50', paid: '1000.00', balance: '234.50', items: [payment] },
  ],
  ...extra,
});

describe('contract payments', () => {
  it('shows what is left to pay and asks for the cheque number before recording', async () => {
    const fetchMock = mockApi(
      routes(agent, {
        [`POST /api/contracts/${CONTRACT_ID}/payments`]: () => [201, receipt()],
        [`GET /api/payments/${PAYMENT_ID}`]: () => [200, receipt()],
      }),
    );
    renderApp(`/contrats/${CONTRACT_ID}`);
    const user = userEvent.setup();

    const section = await screen.findByRole('region', { name: 'Paiements' });
    expect(await within(section).findByText('234,50 MAD')).toBeInTheDocument();
    // Reversing is for management.
    expect(within(section).queryByRole('button', { name: 'Annuler le paiement' })).toBeNull();

    await user.click(within(section).getByRole('button', { name: 'Encaisser' }));
    const dialog = screen.getByRole('dialog', { name: 'Encaisser un paiement' });
    // The balance is proposed; the employee may change it.
    const amount = within(dialog).getByLabelText('Montant (MAD)');
    expect(amount).toHaveValue('234,50');
    await user.clear(amount);
    await user.type(amount, '234,50');
    await user.click(within(dialog).getByRole('radio', { name: 'Chèque' }));
    const submit = within(dialog).getByRole('button', { name: 'Encaisser' });
    expect(submit).toBeDisabled();
    await user.type(within(dialog).getByLabelText('N° du chèque et banque'), '123456 Banque Test');
    await user.click(submit);

    // The receipt opens, ready to print.
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Reçu de paiement' }),
    ).toBeInTheDocument();
    // Each copy has a place for the client's signature and the agency's stamp and signature.
    for (const name of ['Exemplaire agence', 'Exemplaire client']) {
      const copy = screen.getByRole('article', { name });
      expect(within(copy).getByText('Signature du client')).toBeInTheDocument();
      expect(within(copy).getByText('Cachet et signature de l’agence')).toBeInTheDocument();
    }
    const call = fetchMock.mock.calls.find(([, init]) => init?.method === 'POST');
    const body = JSON.parse(call[1].body);
    expect(body).toMatchObject({
      amount: '234,50',
      method: 'CHEQUE',
      reference: '123456 Banque Test',
    });
    expect(body.idempotencyKey).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    );
  });

  it('says what stays owed as the amount is typed, and keeps rare fields aside', async () => {
    mockApi(routes(agent));
    renderApp(`/contrats/${CONTRACT_ID}`);
    const user = userEvent.setup();

    await user.click(await screen.findByRole('button', { name: 'Encaisser' }));
    const dialog = screen.getByRole('dialog', { name: 'Encaisser un paiement' });
    // The whole balance is proposed: it settles the contract.
    expect(dialog).toHaveTextContent('Ce paiement solde le contrat.');
    expect(within(dialog).queryByRole('button', { name: 'Tout le reste' })).toBeNull();
    const amount = within(dialog).getByLabelText('Montant (MAD)');
    await user.clear(amount);
    await user.type(amount, '100');
    expect(dialog).toHaveTextContent('Reste après ce paiement : 134,50 MAD');
    await user.click(within(dialog).getByRole('button', { name: 'Tout le reste' }));
    expect(amount).toHaveValue('234,50');

    // Cash: the method is one tap; the optional fields wait under « Autres informations ».
    expect(within(dialog).getByRole('radio', { name: 'Espèces' })).toBeChecked();
    expect(within(dialog).getByLabelText('Payé par (si ce n’est pas le client)')).not.toBeVisible();
    // A cheque needs its number: the field comes out.
    expect(within(dialog).queryByLabelText('N° du chèque et banque')).toBeNull();
    await user.click(within(dialog).getByRole('radio', { name: 'Chèque' }));
    expect(within(dialog).getByLabelText('N° du chèque et banque')).toBeVisible();
  });

  it('says the change to give back from the cash handed over, and prints both', async () => {
    const withChange = receipt({ amount: '234.50', cashTendered: '300.00', change: '65.50' });
    const fetchMock = mockApi(
      routes(agent, {
        [`POST /api/contracts/${CONTRACT_ID}/payments`]: () => [201, withChange],
        [`GET /api/payments/${PAYMENT_ID}`]: () => [200, withChange],
      }),
    );
    renderApp(`/contrats/${CONTRACT_ID}`);
    const user = userEvent.setup();

    await user.click(await screen.findByRole('button', { name: 'Encaisser' }));
    const dialog = screen.getByRole('dialog', { name: 'Encaisser un paiement' });
    const tendered = within(dialog).getByLabelText('Somme reçue (facultatif, MAD)');
    const submit = within(dialog).getByRole('button', { name: 'Encaisser' });
    await user.type(tendered, '200');
    expect(dialog).toHaveTextContent('Moins que ce que le client paie.');
    expect(submit).toBeDisabled();
    await user.clear(tendered);
    await user.type(tendered, 'abc');
    expect(dialog).toHaveTextContent('Montant invalide');
    expect(submit).toBeDisabled();
    await user.clear(tendered);
    await user.type(tendered, '300');
    expect(dialog).toHaveTextContent('À rendre : 65,50 MAD');
    // Only for cash.
    await user.click(within(dialog).getByRole('radio', { name: 'Carte bancaire' }));
    expect(within(dialog).queryByLabelText('Somme reçue (facultatif, MAD)')).toBeNull();
    await user.click(within(dialog).getByRole('radio', { name: 'Espèces' }));
    await user.click(submit);

    expect(
      await screen.findByRole('heading', { level: 1, name: 'Reçu de paiement' }),
    ).toBeInTheDocument();
    const call = fetchMock.mock.calls.find(([, init]) => init?.method === 'POST');
    expect(JSON.parse(call[1].body)).toMatchObject({ amount: '234,50', cashTendered: '300' });
    for (const name of ['Exemplaire agence', 'Exemplaire client']) {
      expect(screen.getByRole('article', { name })).toHaveTextContent(
        'Somme reçue : 300,00 MAD · Rendu : 65,50 MAD',
      );
    }
  });

  it('records a cash rounding beside the exact amount, never on the receipt', async () => {
    const rounded = receipt({ amount: '234.50', clientPaid: '235.00', roundingGap: '0.50' });
    const fetchMock = mockApi(
      routes(agent, {
        [`POST /api/contracts/${CONTRACT_ID}/payments`]: () => [201, rounded],
        [`GET /api/payments/${PAYMENT_ID}`]: () => [200, rounded],
      }),
    );
    renderApp(`/contrats/${CONTRACT_ID}`);
    const user = userEvent.setup();

    await user.click(await screen.findByRole('button', { name: 'Encaisser' }));
    const dialog = screen.getByRole('dialog', { name: 'Encaisser un paiement' });
    expect(within(dialog).getByLabelText('Le client a payé un montant arrondi')).not.toBeChecked();
    // Only cash, and only for the whole balance.
    await user.click(within(dialog).getByRole('radio', { name: 'Chèque' }));
    expect(within(dialog).queryByLabelText('Le client a payé un montant arrondi')).toBeNull();
    await user.click(within(dialog).getByRole('radio', { name: 'Espèces' }));
    await user.type(within(dialog).getByLabelText('Montant (MAD)'), '0');
    expect(within(dialog).queryByLabelText('Le client a payé un montant arrondi')).toBeNull();
    await user.type(within(dialog).getByLabelText('Montant (MAD)'), '{Backspace}');

    await user.click(within(dialog).getByLabelText('Le client a payé un montant arrondi'));
    const submit = within(dialog).getByRole('button', { name: 'Encaisser' });
    expect(submit).toBeDisabled();
    await user.type(within(dialog).getByLabelText('Montant donné par le client (MAD)'), '235');
    expect(within(dialog).getByRole('status')).toHaveTextContent(
      'Écart pour l’agence : +0,50 MAD (gardé par l’agence).',
    );
    await user.click(submit);

    expect(
      await screen.findByRole('heading', { level: 1, name: 'Reçu de paiement' }),
    ).toBeInTheDocument();
    expect(screen.queryByText(/235,00|Arrondi|Écart/)).toBeNull();
    const call = fetchMock.mock.calls.find(([, init]) => init?.method === 'POST');
    expect(JSON.parse(call[1].body)).toMatchObject({
      amount: '234,50',
      method: 'CASH',
      clientPaid: '235',
    });
  });

  it('lets management reverse a payment with a reason', async () => {
    const fetchMock = mockApi(
      routes(manager, {
        [`POST /api/payments/${PAYMENT_ID}/reverse`]: () => [
          201,
          receipt({ id: 'r1', kind: 'REVERSAL', amount: '-1000.00', reason: 'Erreur de montant' }),
        ],
        'GET /api/payments/r1': () => [
          200,
          receipt({
            id: 'r1',
            receiptNumber: 'REC-2026-00002',
            kind: 'REVERSAL',
            amount: '-1000.00',
            reason: 'Erreur de montant',
            reverses: { id: PAYMENT_ID, receiptNumber: 'REC-2026-00001' },
          }),
        ],
      }),
    );
    renderApp(`/contrats/${CONTRACT_ID}`);
    const user = userEvent.setup();

    await user.click(await screen.findByRole('button', { name: 'Annuler le paiement' }));
    const dialog = screen.getByRole('dialog', { name: /Annuler le paiement REC-2026-00001/ });
    await user.type(within(dialog).getByLabelText(/Motif/), 'Erreur de montant');
    await user.click(within(dialog).getByRole('button', { name: 'Annuler le paiement' }));

    expect(
      await screen.findByRole('heading', { level: 1, name: 'Annulation de paiement' }),
    ).toBeInTheDocument();
    // Printed twice: the agency's copy and the client's.
    expect(
      screen.getAllByText(/Annulation du reçu REC-2026-00001 · Erreur de montant/),
    ).toHaveLength(2);
    const call = fetchMock.mock.calls.find(([url]) => url.endsWith('/reverse'));
    expect(JSON.parse(call[1].body)).toMatchObject({ reason: 'Erreur de montant' });
  });
});

describe('receipt', () => {
  it('says when the agency details are missing, and prints the agency’s own receipt', async () => {
    mockApi({
      'GET /api/auth/me': agent,
      [`GET /api/payments/${PAYMENT_ID}`]: () => [200, receipt()],
    });
    renderApp(`/recus/${PAYMENT_ID}`);

    expect(
      await screen.findByRole('heading', { level: 1, name: 'Reçu de paiement' }),
    ).toBeInTheDocument();
    // One sheet, two copies: the agency keeps one, the client takes the other.
    const agencyCopy = screen.getByRole('article', { name: 'Exemplaire agence' });
    const clientCopy = screen.getByRole('article', { name: 'Exemplaire client' });
    for (const copy of [agencyCopy, clientCopy]) {
      expect(within(copy).getByText('REC-2026-00001')).toBeInTheDocument();
      expect(within(copy).getByText('1 000,00 MAD')).toBeInTheDocument();
      expect(
        within(copy).getByText(/ne remplace pas la quittance de l’assureur/),
      ).toBeInTheDocument();
    }
    expect(within(clientCopy).getByText('Exemplaire client')).toBeInTheDocument();
    expect(screen.getByText(/Découper ici/)).toBeInTheDocument();
    expect(screen.getByText(/ne sont pas encore renseignées/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Imprimer' })).toBeInTheDocument();
  });

  it('prints the agency details once they are set', async () => {
    mockApi({
      'GET /api/auth/me': agent,
      [`GET /api/payments/${PAYMENT_ID}`]: () => [
        200,
        receipt({
          agency: {
            name: 'Agence Test',
            tagline: 'Agent général',
            address: 'Rue Test, Casablanca',
            phone: '05 22 00 00 00',
            fax: '05 22 00 00 01',
            email: 'agence@exemple.ma',
            ice: '001234567000089',
            acapsNumber: 'A-123',
            legalForm: 'S.A.R.L au capital de 100 000,00 DH',
            patente: '111',
            taxId: '222',
            rc: '333',
            cnss: '444',
            logo: false,
          },
        }),
      ],
    });
    renderApp(`/recus/${PAYMENT_ID}`);

    // No logo: the name heads each copy, and opens the legal line at its foot.
    expect(await screen.findAllByText('Agence Test')).toHaveLength(4);
    expect(screen.getAllByText('Agent général')).toHaveLength(2);
    for (const name of ['Exemplaire agence', 'Exemplaire client']) {
      const foot = screen.getByRole('article', { name }).querySelector('footer');
      expect(foot).toHaveTextContent(
        'Rue Test, Casablanca · Tél. 05 22 00 00 00 · Fax 05 22 00 00 01 · agence@exemple.ma',
      );
      expect(foot).toHaveTextContent(
        'Agence Test S.A.R.L au capital de 100 000,00 DH · Patente 111 · I.F 222 · ICE 001234567000089 · R.C 333 · CNSS 444 · N° d’agrément A-123',
      );
    }
    expect(screen.queryByRole('img')).toBeNull();
    expect(screen.queryByText(/ne sont pas encore renseignées/)).not.toBeInTheDocument();
  });

  it('heads each copy with the agency logo when it is set', async () => {
    mockApi({
      'GET /api/auth/me': agent,
      [`GET /api/payments/${PAYMENT_ID}`]: () => [
        200,
        receipt({ agency: { name: 'Agence Test', logo: true } }),
      ],
    });
    renderApp(`/recus/${PAYMENT_ID}`);
    const logos = await screen.findAllByRole('img', { name: 'Agence Test' });
    expect(logos).toHaveLength(2);
    expect(logos[0]).toHaveAttribute('src', '/api/agency/logo');
  });
});

describe('the payments of the day on the new design', () => {
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Casablanca' }).format(
    new Date(),
  );
  const list = (items, byMethod) => [
    200,
    {
      items,
      total: items.length,
      page: 1,
      pageSize: 25,
      pageCount: 1,
      totals: {
        amount: items.reduce((sum, i) => sum + Number(i.amount), 0).toFixed(2),
        byMethod,
        roundings: 0,
        roundingGap: '0.00',
      },
    },
  ];
  const row = {
    ...payment,
    contract: { id: CONTRACT_ID, ref: 'CTR-2026-00001', customer: 'Sara Test', insurer: 'RMA' },
  };

  it('shows the total, one tile per method, and the payments as a table', async () => {
    let answer;
    const first = new Promise((resolve) => {
      answer = resolve;
    });
    const fetchMock = mockApi({
      'GET /api/auth/me': agent,
      [`GET /api/payments?page=1&from=${today}&to=${today}`]: () => first,
      [`GET /api/payments?page=1&from=${today}&to=${today}&method=CHEQUE`]: () => list([], []),
    });
    renderApp('/paiements');
    const user = userEvent.setup();
    expect(await screen.findByRole('status')).toHaveTextContent('Chargement…');

    answer(list([row], [{ method: 'CASH', amount: '1000.00' }]));
    const table = await screen.findByRole('table', { name: 'Paiements' });
    const cells = within(table).getAllByRole('row')[1];
    expect(within(cells).getByRole('link', { name: 'REC-2026-00001' })).toHaveAttribute(
      'href',
      `/recus/${PAYMENT_ID}`,
    );
    expect(cells).toHaveTextContent('Sara Test');
    expect(cells).toHaveTextContent('Karim Test');
    expect(screen.getByText('Total · 1 paiement').nextElementSibling).toHaveTextContent(
      '1 000,00 MAD',
    );
    expect(screen.getByText('Espèces', { selector: 'dt' })).toBeInTheDocument();

    // The method is one click among the choices side by side.
    await user.click(screen.getByRole('radio', { name: 'Chèque' }));
    expect(await screen.findByText('Aucun paiement.')).toBeInTheDocument();
    expect(fetchMock.mock.calls.map(([url]) => url)).toContain(
      `/api/payments?page=1&from=${today}&to=${today}&method=CHEQUE`,
    );
  });

  it('keeps the « Paiements » heading of a contract while its payments load or fail', async () => {
    mockApi({
      'GET /api/auth/me': agent,
      [`GET /api/contracts/${CONTRACT_ID}`]: () => [200, contract],
      [`GET /api/contracts/${CONTRACT_ID}/payments`]: () => [500, { error: { code: 'INTERNAL' } }],
    });
    renderApp(`/contrats/${CONTRACT_ID}`);
    const part = await screen.findByRole('region', { name: 'Paiements' });
    expect(await within(part).findByRole('alert')).toBeInTheDocument();
  });
});
