import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { me, mockApi } from './mockApi.js';
import { renderApp } from './renderApp.jsx';

const CONTRACT_ID = '00000000-0000-4000-8000-0000000000f1';
const CUSTOMER_ID = '00000000-0000-4000-8000-0000000000c1';
const agentMe = () =>
  me({
    role: 'AGENT',
    permissions: ['contracts.read', 'contracts.write', 'customers.read', 'vehicles.read'],
  });

const model = (code, label, officialNumber, colour, provisional = false) => ({
  code,
  label,
  provisional,
  officialNumber,
  colour,
  status: 'CONFIRMED',
});
const vehicle = {
  id: 'v1',
  registration: '12345-B-6',
  make: 'Dacia',
  model: 'Logan',
  category: 'CAR',
  usage: { id: 'u1', label: 'Tourisme', modelCode: 'A' },
};
const contract = (overrides = {}) => ({
  id: CONTRACT_ID,
  ref: 'CTR-2026-00001',
  status: 'ISSUED',
  period: 'ACTIVE',
  customer: { id: CUSTOMER_ID, ref: 'CLI-000001', displayName: 'Sara Test' },
  product: { id: 'p1', name: 'Produit RMA', line: 'CAR', insurerCode: 'AUTO-1' },
  insurer: { id: 'i-rma', code: 'RMA', name: 'RMA (Royale Marocaine d’Assurance)' },
  policyNumber: 'POL-0001',
  insurerReference: 'Courriel de l’assureur',
  startDate: '2026-11-01',
  endDate: '2027-10-31',
  premiumTotal: '1234.50',
  tacitRenewal: true,
  noticeDays: 30,
  vehicles: [vehicle],
  attestations: [
    {
      id: 'a1',
      number: '123456789',
      series: { id: 's-14a', code: '14 A', model: model('A', 'Tourisme', 1, 'jaune') },
      vehicle: { id: 'v1', registration: '12345-B-6' },
      provisional: false,
      validFrom: '2026-11-01',
      validTo: '2027-10-31',
      medium: 'PAPER',
      coverNoteRef: null,
      duplicateOf: null,
      cancelled: null,
      version: 1,
    },
  ],
  history: [
    {
      id: '2',
      from: 'AWAITING_INSURER',
      to: 'ISSUED',
      reason: null,
      insurerReference: 'Courriel de l’assureur',
      effectiveDate: null,
      by: { id: 'u', displayName: 'Nadia Agent' },
      at: '2026-10-23T10:00:00.000Z',
    },
  ],
  createdAt: '2026-10-23T09:00:00.000Z',
  version: 3,
  ...overrides,
});
const seriesList = [
  200,
  {
    items: [
      {
        id: 's-14a',
        insurer: { id: 'i-rma', code: 'RMA' },
        code: '14 A',
        model: model('A', 'Tourisme', 1, 'jaune'),
        status: 'CONFIRMED',
        active: true,
      },
      {
        id: 's-14p',
        insurer: { id: 'i-rma', code: 'RMA' },
        code: '14 P',
        model: model('P', 'Provisoire', 7, 'rose', true),
        status: 'CONFIRMED',
        active: true,
      },
      {
        id: 's-91p',
        insurer: { id: 'i-cat', code: 'CAT' },
        code: '91 P',
        model: model('P', 'Provisoire', 7, 'rose', true),
        status: 'CONFIRMED',
        active: true,
      },
    ],
  },
];

describe('contract page', () => {
  it('shows an issued contract, its attestations and only the agent’s own actions', async () => {
    mockApi({
      'GET /api/auth/me': () => [200, agentMe()],
      [`GET /api/contracts/${CONTRACT_ID}`]: () => [200, contract()],
    });
    renderApp(`/contrats/${CONTRACT_ID}`);

    // The page opens on who is insured, with the policy number under the name: the contract's
    // number in the agency. The app's own reference stays in the folded details only.
    const title = await screen.findByRole('heading', { name: 'Sara Test' });
    const header = title.closest('header');
    expect(header).toHaveTextContent('N° de police POL-0001 · ');
    expect(header).not.toHaveTextContent('CTR-2026-00001');
    expect(screen.getByText('Référence interne de l’application').nextSibling).toHaveTextContent(
      'CTR-2026-00001',
    );
    expect(screen.getByText('Émis')).toBeInTheDocument();
    expect(screen.getByText('Actif')).toBeInTheDocument();
    expect(screen.getByText('1 234,50 MAD')).toBeInTheDocument();
    expect(screen.getByText('01/11/2026 – 31/10/2027')).toBeInTheDocument();
    const attestations = screen.getByRole('heading', { name: 'Attestations' }).closest('section');
    expect(within(attestations).getByText(/Modèle A \(n° 1, jaune\)/)).toBeInTheDocument();
    // Suspending or terminating an issued contract is a manager's action.
    expect(
      screen.queryByRole('button', { name: /suspension|résiliation/ }),
    ).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Enregistrer une attestation' })).toBeInTheDocument();
  });

  it('shows the guarantees printed on the insurer’s sheet, a premium only where printed', async () => {
    mockApi({
      'GET /api/auth/me': () => [200, agentMe()],
      [`GET /api/contracts/${CONTRACT_ID}`]: () => [
        200,
        contract({
          guarantees: [
            { label: 'Responsabilité civile', details: '50 000 000', premium: '2216.00' },
            { label: 'Vol', details: 'Valeur venale 80.000.00' },
          ],
          formula: 'DC',
        }),
      ],
    });
    renderApp(`/contrats/${CONTRACT_ID}`);

    const section = (
      await screen.findByRole('heading', { name: 'Garanties imprimées par l’assureur' })
    ).closest('section');
    const [rc, vol] = within(section).getAllByRole('listitem');
    expect(rc).toHaveTextContent('Responsabilité civile50 000 0002 216,00 MAD');
    expect(vol).toHaveTextContent('VolValeur venale 80.000.00Sans prime imprimée');
    // The formula once, with its meaning (owner, 29/10/2026).
    expect(
      within(section)
        .getByText(/^Formule :/)
        .closest('p'),
    ).toHaveTextContent('Formule : DC (dommages collision)');
  });

  it('shows no guarantees section when none was read', async () => {
    mockApi({
      'GET /api/auth/me': () => [200, agentMe()],
      [`GET /api/contracts/${CONTRACT_ID}`]: () => [200, contract({ guarantees: [] })],
    });
    renderApp(`/contrats/${CONTRACT_ID}`);
    expect(await screen.findByRole('heading', { name: 'Sara Test' })).toBeInTheDocument();
    expect(screen.queryByText('Garanties imprimées par l’assureur')).toBeNull();
  });

  it('records the issue with the insurer’s policy number and proof', async () => {
    const fetchMock = mockApi({
      'GET /api/auth/me': () => [200, agentMe()],
      [`GET /api/contracts/${CONTRACT_ID}`]: () => [
        200,
        contract({
          status: 'AWAITING_INSURER',
          period: null,
          policyNumber: 'POL-0009',
          attestations: [],
        }),
      ],
      [`POST /api/contracts/${CONTRACT_ID}/transition`]: () => [200, contract()],
    });
    renderApp(`/contrats/${CONTRACT_ID}`);
    const user = userEvent.setup();

    await user.click(await screen.findByRole('button', { name: 'Enregistrer l’émission' }));
    const dialog = screen.getByRole('dialog', { name: 'Enregistrer l’émission' });
    const submit = within(dialog).getByRole('button', { name: 'Enregistrer l’émission' });
    // The number recorded with the contract is proposed; the insurer confirmed another one.
    const policy = within(dialog).getByLabelText(/N° de police/);
    expect(policy).toHaveValue('POL-0009');
    await user.clear(policy);
    await user.type(policy, 'POL-0001');
    expect(submit).toBeDisabled();
    await user.type(
      within(dialog).getByLabelText(/Preuve de l’assureur/),
      'Courriel du 23/10/2026',
    );
    await user.click(submit);

    const call = fetchMock.mock.calls.find(([url]) => url.endsWith('/transition'));
    expect(JSON.parse(call[1].body)).toEqual({
      to: 'ISSUED',
      policyNumber: 'POL-0001',
      insurerReference: 'Courriel du 23/10/2026',
      version: 3,
    });
  });

  it('offers the insurer’s confirmed series and explains a provisional attestation that is too long', async () => {
    const fetchMock = mockApi({
      'GET /api/auth/me': () => [200, agentMe()],
      [`GET /api/contracts/${CONTRACT_ID}`]: () => [200, contract({ attestations: [] })],
      'GET /api/attestation-series': () => seriesList,
      [`POST /api/contracts/${CONTRACT_ID}/attestations`]: () => [
        400,
        {
          error: {
            code: 'VALIDATION_ERROR',
            details: [{ path: 'validTo', rule: 'PROVISIONAL_TOO_LONG' }],
          },
        },
      ],
    });
    renderApp(`/contrats/${CONTRACT_ID}`);
    const user = userEvent.setup();

    await user.click(await screen.findByRole('button', { name: 'Enregistrer une attestation' }));
    const dialog = await screen.findByRole('dialog', { name: 'Enregistrer une attestation' });
    const series = await within(dialog).findByLabelText('Série');
    // CAT's 91 P is not offered on an RMA contract.
    expect(
      within(series)
        .getAllByRole('option')
        .map((o) => o.textContent),
    ).toEqual(['—', '14 A · Tourisme', '14 P · Provisoire']);
    await user.selectOptions(series, '14 P · Provisoire');
    expect(within(dialog).getByText(/un mois au plus/)).toBeInTheDocument();
    await user.type(within(dialog).getByLabelText('Note de couverture'), 'NC-1');
    await user.type(within(dialog).getByLabelText('Numéro'), '987 654 321');
    await user.click(within(dialog).getByRole('button', { name: 'Enregistrer' }));

    expect(
      await within(dialog).findByText(
        'Une attestation provisoire vaut un mois au plus (règle L23).',
      ),
    ).toBeInTheDocument();
    const call = fetchMock.mock.calls.find(([url]) => url.endsWith('/attestations'));
    expect(JSON.parse(call[1].body)).toMatchObject({
      seriesId: 's-14p',
      number: '987 654 321',
      coverNoteRef: 'NC-1',
      medium: 'PAPER',
    });
  });
});

describe('avenants', () => {
  const newCar = {
    id: 'v2',
    registration: '36974-A-57',
    make: 'Renault',
    model: 'Clio',
    category: 'CAR',
    usage: { id: 'u1', label: 'Tourisme' },
  };
  const amended = () =>
    contract({
      vehicles: [newCar],
      amendmentsTotal: '512.64',
      amendments: [
        {
          id: 'm1',
          kind: 'VEHICLE_CHANGE',
          number: '2600012345',
          effectiveDate: '2027-03-01',
          amount: '512.64',
          insurerReference: 'Quittance n° 0026',
          previousVehicle: { id: 'v1', registration: '12345-B-6', make: 'Dacia', model: 'Logan' },
          vehicle: { id: 'v2', registration: '36974-A-57', make: 'Renault', model: 'Clio' },
          previousRegistration: null,
          registration: null,
          attestation: { id: 'a2', number: '207552775', series: '14 A' },
          createdBy: { id: 'u', displayName: 'Nadia Agent' },
          createdAt: '2026-10-28T10:00:00.000Z',
        },
      ],
      attestations: [
        {
          ...contract().attestations[0],
          replaced: {
            amendmentId: 'm1',
            number: '2600012345',
            effectiveDate: '2027-03-01',
            returned: null,
          },
        },
      ],
    });

  it('records a vehicle change with its new attestation and amount', async () => {
    const fetchMock = mockApi({
      'GET /api/auth/me': () => [200, agentMe()],
      [`GET /api/contracts/${CONTRACT_ID}`]: () => [200, contract()],
      'GET /api/attestation-series': () => seriesList,
      [`GET /api/vehicles?customerId=${CUSTOMER_ID}&archived=exclude&pageSize=100`]: () => [
        200,
        { items: [vehicle, newCar], total: 2 },
      ],
      [`POST /api/contracts/${CONTRACT_ID}/amendments`]: () => [201, amended()],
    });
    renderApp(`/contrats/${CONTRACT_ID}`);
    const user = userEvent.setup();

    await user.click(await screen.findByRole('button', { name: 'Enregistrer un avenant' }));
    const dialog = await screen.findByRole('dialog', { name: 'Enregistrer un avenant' });
    const save = within(dialog).getByRole('button', { name: 'Enregistrer' });
    // The vehicle on the contract is not offered as its own replacement; provisional series
    // are not offered either.
    const next = await within(dialog).findByLabelText(/Nouveau véhicule/);
    expect(
      within(next)
        .getAllByRole('option')
        .map((o) => o.textContent),
    ).toEqual(['—', '36974-A-57 · Renault Clio · Tourisme']);
    expect(
      within(within(dialog).getByLabelText(/Série/))
        .getAllByRole('option')
        .map((o) => o.textContent),
    ).toEqual(['—', '14 A · Tourisme']);
    await user.selectOptions(next, '36974-A-57 · Renault Clio · Tourisme');
    await user.type(within(dialog).getByLabelText(/N° de l’avenant/), '2600012345');
    await user.type(within(dialog).getByLabelText('Date d’effet'), '2027-03-01');
    await user.type(within(dialog).getByLabelText(/Montant de l’avenant/), '512,64');
    await user.selectOptions(within(dialog).getByLabelText(/Série/), '14 A · Tourisme');
    expect(save).toBeDisabled();
    await user.type(within(dialog).getByLabelText(/^Numéro/), '207552775');
    await user.click(save);

    const call = fetchMock.mock.calls.find(([url]) => url.endsWith('/amendments'));
    expect(JSON.parse(call[1].body)).toEqual({
      kind: 'VEHICLE_CHANGE',
      number: '2600012345',
      effectiveDate: '2027-03-01',
      amount: '512,64',
      insurerReference: null,
      previousVehicleId: 'v1',
      vehicleId: 'v2',
      attestation: {
        seriesId: 's-14a',
        number: '207552775',
        validFrom: '2027-03-01',
        validTo: '2027-10-31',
      },
      version: 3,
    });
  });

  it('shows the avenant, the replaced attestation to collect, and records the paper back', async () => {
    const fetchMock = mockApi({
      'GET /api/auth/me': () => [200, agentMe()],
      [`GET /api/contracts/${CONTRACT_ID}`]: () => [200, amended()],
      'POST /api/attestations/a1/returned': () => [200, amended()],
    });
    renderApp(`/contrats/${CONTRACT_ID}`);
    const user = userEvent.setup();

    const section = (await screen.findByRole('heading', { name: 'Avenants' })).closest('section');
    expect(within(section).getByText('Changement de véhicule')).toBeInTheDocument();
    expect(within(section).getByText(/12345-B-6 remplacé par 36974-A-57/)).toBeInTheDocument();
    expect(within(section).getByText(/Montant 512,64\sMAD/)).toBeInTheDocument();
    expect(
      screen.getByText('Remplacée par l’avenant n° 2600012345 du 01/03/2027'),
    ).toBeInTheDocument();
    expect(screen.getByText('Papier à récupérer auprès du client')).toBeInTheDocument();
    // A replaced attestation is not cancelled: only its paper is collected.
    expect(screen.queryByRole('button', { name: 'Annuler' })).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Papier rendu' }));
    const call = fetchMock.mock.calls.find(([url]) => url.endsWith('/returned'));
    expect(JSON.parse(call[1].body)).toEqual({ version: 1 });
  });
});

describe('contract form', () => {
  it('creates a draft with a confirmed product and the customer’s vehicles', async () => {
    const fetchMock = mockApi({
      'GET /api/auth/me': () => [200, agentMe()],
      [`GET /api/customers/${CUSTOMER_ID}`]: () => [
        200,
        { id: CUSTOMER_ID, ref: 'CLI-000001', displayName: 'Sara Test', archivedAt: null },
      ],
      'GET /api/products?status=CONFIRMED': () => [
        200,
        {
          items: [
            { id: 'p1', name: 'Produit RMA', insurer: { code: 'RMA' }, usable: true },
            { id: 'p2', name: 'Produit désactivé', insurer: { code: 'CAT' }, usable: false },
          ],
        },
      ],
      [`GET /api/vehicles?customerId=${CUSTOMER_ID}&pageSize=100`]: () => [
        200,
        { items: [vehicle] },
      ],
      'POST /api/contracts': () => [
        400,
        {
          error: {
            code: 'VALIDATION_ERROR',
            details: [{ path: 'endDate', rule: 'END_BEFORE_START' }],
          },
        },
      ],
    });
    renderApp(`/contrats/nouveau?client=${CUSTOMER_ID}`);
    const user = userEvent.setup();

    const product = await screen.findByLabelText('Produit');
    expect(
      within(product)
        .getAllByRole('option')
        .map((o) => o.textContent),
    ).toEqual(['—', 'RMA · Produit RMA']);
    await user.selectOptions(product, 'RMA · Produit RMA');
    await user.type(screen.getByLabelText('Début'), '2026-11-01');
    await user.type(screen.getByLabelText('Fin'), '2026-10-01');
    await user.type(screen.getByLabelText(/Prime confirmée/), '1 234,50');
    const save = screen.getByRole('button', { name: 'Enregistrer' });
    expect(save).toBeDisabled();
    await user.click(await screen.findByRole('checkbox', { name: /12345-B-6/ }));
    // The contract's number is the insurer's: nothing is saved without it.
    expect(save).toBeDisabled();
    await user.type(screen.getByLabelText('N° de police'), '663070526001509');
    await user.click(save);

    expect(await screen.findByText('La fin doit être après le début.')).toBeInTheDocument();
    const call = fetchMock.mock.calls.find(([url]) => url === '/api/contracts');
    expect(JSON.parse(call[1].body)).toEqual({
      customerId: CUSTOMER_ID,
      policyNumber: '663070526001509',
      productId: 'p1',
      startDate: '2026-11-01',
      endDate: '2026-10-01',
      premiumTotal: '1 234,50',
      tacitRenewal: false,
      vehicleIds: ['v1'],
    });
  });
  it('says under the field when the insurer already has a contract with this policy number', async () => {
    mockApi({
      'GET /api/auth/me': () => [200, agentMe()],
      [`GET /api/customers/${CUSTOMER_ID}`]: () => [
        200,
        { id: CUSTOMER_ID, ref: 'CLI-000001', displayName: 'Sara Test', archivedAt: null },
      ],
      'GET /api/products?status=CONFIRMED': () => [
        200,
        { items: [{ id: 'p1', name: 'Produit RMA', insurer: { code: 'RMA' }, usable: true }] },
      ],
      [`GET /api/vehicles?customerId=${CUSTOMER_ID}&pageSize=100`]: () => [
        200,
        { items: [vehicle] },
      ],
      'POST /api/contracts': () => [409, { error: { code: 'DUPLICATE_POLICY' } }],
    });
    renderApp(`/contrats/nouveau?client=${CUSTOMER_ID}`);
    const user = userEvent.setup();
    await user.type(await screen.findByLabelText('N° de police'), '663070526001509');
    await user.selectOptions(await screen.findByLabelText('Produit'), 'RMA · Produit RMA');
    await user.click(await screen.findByRole('checkbox', { name: /12345-B-6/ }));
    await user.click(screen.getByRole('button', { name: 'Enregistrer' }));
    const field = screen.getByLabelText('N° de police');
    expect(field).toHaveAttribute('aria-invalid', 'true');
    expect(field).toHaveAccessibleDescription(
      expect.stringContaining('Cet assureur a déjà un contrat avec ce numéro de police.'),
    );
  });

  it('fills the end of border insurance from its five durations, without tacit renewal (rule C5)', async () => {
    const fetchMock = mockApi({
      'GET /api/auth/me': () => [200, agentMe()],
      [`GET /api/customers/${CUSTOMER_ID}`]: () => [
        200,
        { id: CUSTOMER_ID, ref: 'CLI-000001', displayName: 'Lena Essai', archivedAt: null },
      ],
      'GET /api/products?status=CONFIRMED': () => [
        200,
        {
          items: [
            { id: 'p1', line: 'CAR', name: 'Produit RMA', insurer: { code: 'RMA' }, usable: true },
            {
              id: 'pb',
              line: 'BORDER',
              name: 'Assurance aux frontières',
              insurer: { code: 'CAT' },
              usable: true,
            },
          ],
        },
      ],
      [`GET /api/vehicles?customerId=${CUSTOMER_ID}&pageSize=100`]: () => [
        200,
        { items: [vehicle] },
      ],
      // The new contract's page is not the subject here: the request stays pending.
      'POST /api/contracts': () => new Promise(() => {}),
    });
    renderApp(`/contrats/nouveau?client=${CUSTOMER_ID}`);
    const user = userEvent.setup();

    // An ordinary product keeps tacit renewal and offers no durations.
    const product = await screen.findByLabelText('Produit');
    await user.selectOptions(product, 'RMA · Produit RMA');
    await user.click(screen.getByRole('checkbox', { name: /tacite reconduction/ }));
    expect(screen.queryByRole('group', { name: /Durée/ })).not.toBeInTheDocument();

    await user.selectOptions(product, 'CAT · Assurance aux frontières');
    const durations = screen.getByRole('group', { name: 'Durée de l’assurance aux frontières' });
    expect(
      within(durations)
        .getAllByRole('button')
        .map((b) => b.textContent),
    ).toEqual(['5 jours', '10 jours', '1 mois', '3 mois', '6 mois']);
    expect(within(durations).getByRole('button', { name: '10 jours' })).toBeDisabled();
    expect(screen.getByText('Indiquez d’abord le début.')).toBeInTheDocument();
    expect(screen.queryByRole('checkbox', { name: /tacite reconduction/ })).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/Délai pour résilier/)).not.toBeInTheDocument();
    expect(screen.getByText(/pas de tacite reconduction ni de suivi/)).toBeInTheDocument();

    await user.type(screen.getByLabelText('Début'), '2026-08-31');
    await user.click(within(durations).getByRole('button', { name: '10 jours' }));
    expect(screen.getByLabelText('Fin')).toHaveValue('2026-09-10');
    expect(within(durations).getByRole('button', { name: '10 jours' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    // A shorter month ends on its last day, like the server.
    await user.click(within(durations).getByRole('button', { name: '6 mois' }));
    expect(screen.getByLabelText('Fin')).toHaveValue('2027-02-28');
    await user.click(await screen.findByRole('checkbox', { name: /12345-B-6/ }));
    await user.type(screen.getByLabelText('N° de police'), 'C2026/000111');
    await user.click(screen.getByRole('button', { name: 'Enregistrer' }));

    await waitFor(() =>
      expect(fetchMock.mock.calls.some(([url]) => url === '/api/contracts')).toBe(true),
    );
    const call = fetchMock.mock.calls.find(([url]) => url === '/api/contracts');
    expect(JSON.parse(call[1].body)).toEqual({
      customerId: CUSTOMER_ID,
      policyNumber: 'C2026/000111',
      productId: 'pb',
      startDate: '2026-08-31',
      endDate: '2027-02-28',
      tacitRenewal: false,
      vehicleIds: ['v1'],
    });
  });
});

describe('the contract page on the new design', () => {
  it('shows the shape of what is left to pay while it loads, then the amount', async () => {
    let answer;
    const payments = new Promise((resolve) => {
      answer = resolve;
    });
    mockApi({
      'GET /api/auth/me': () => [200, agentMe()],
      [`GET /api/contracts/${CONTRACT_ID}`]: () => [200, contract({ attestations: [] })],
      [`GET /api/contracts/${CONTRACT_ID}/payments`]: () => payments,
    });
    renderApp(`/contrats/${CONTRACT_ID}`);
    const summary = (await screen.findByRole('heading', { level: 1, name: 'Sara Test' })).closest(
      'section',
    );
    const left = within(summary).getByText('Reste à payer').nextElementSibling;
    expect(left).toHaveTextContent('Chargement…');
    // No attestation yet: one quiet line under the heading.
    const attestations = screen.getByRole('heading', { name: 'Attestations' }).closest('section');
    expect(within(attestations).getByText('Aucune attestation enregistrée.')).toBeInTheDocument();

    answer([
      200,
      {
        premiumTotal: '1234.50',
        paid: '0.00',
        balance: '1234.50',
        amountDue: '1234.50',
        items: [],
      },
    ]);
    await waitFor(() => expect(left).toHaveTextContent('1 234,50 MAD'));
    expect(left).toHaveClass('text-danger-ink');
  });

  it('says the amount is unavailable rather than waiting for ever', async () => {
    mockApi({
      'GET /api/auth/me': () => [200, agentMe()],
      [`GET /api/contracts/${CONTRACT_ID}`]: () => [200, contract()],
      [`GET /api/contracts/${CONTRACT_ID}/payments`]: () => [500, { error: { code: 'INTERNAL' } }],
    });
    renderApp(`/contrats/${CONTRACT_ID}`);
    const summary = (await screen.findByRole('heading', { level: 1, name: 'Sara Test' })).closest(
      'section',
    );
    expect(await within(summary).findByText('Montant indisponible')).toBeInTheDocument();
    expect(within(summary).queryByText('Chargement…')).toBeNull();
  });

  it('lists contracts after the shape of the list, and says why a filtered list is empty', async () => {
    let answer;
    const pending = new Promise((resolve) => {
      answer = resolve;
    });
    mockApi({
      'GET /api/auth/me': () => [200, agentMe()],
      'GET /api/contracts?page=1&unpaid=1': () => pending,
    });
    renderApp('/contrats?unpaid=1');
    expect(await screen.findByRole('status')).toHaveTextContent('Chargement…');
    answer([200, { items: [], total: 0, page: 1, pageSize: 25, pageCount: 1 }]);
    expect(await screen.findByText('Aucun résultat.')).toBeInTheDocument();
    expect(
      screen.getByText('Essayez une autre recherche ou retirez des filtres.'),
    ).toBeInTheDocument();
  });
});
