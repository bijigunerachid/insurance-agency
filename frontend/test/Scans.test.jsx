import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { me, mockApi } from './mockApi.js';
import { renderApp } from './renderApp.jsx';

const SCAN_ID = '00000000-0000-4000-8000-0000000000a9';
const SERIES_ID = '00000000-0000-4000-8000-0000000000b1';
const USAGE_ID = '00000000-0000-4000-8000-0000000000b2';
const PRODUCT_ID = '00000000-0000-4000-8000-0000000000b3';
const INSURER_ID = '00000000-0000-4000-8000-0000000000b4';
const CONTRACT_ID = '00000000-0000-4000-8000-0000000000f1';
const SCOOTERS_ID = '00000000-0000-4000-8000-0000000000b5';
const PRODUCTS = `GET /api/scans/${SCAN_ID}/products?seriesId=${SERIES_ID}`;
const agent = () => [
  200,
  me({ role: 'AGENT', permissions: ['scans.manage', 'contracts.read', 'catalogue.read'] }),
];

const scan = (overrides = {}) => ({
  id: SCAN_ID,
  originalName: 'attestation.pdf',
  mimeType: 'application/pdf',
  size: 1000,
  uploadedAt: '2026-10-24T10:00:00.000Z',
  uploadedBy: { id: 'u1', displayName: 'Karim Test' },
  confidence: 81,
  read: true,
  proposed: {
    seriesCode: '14 A',
    seriesId: SERIES_ID,
    insurerCode: 'RMA',
    number: '990000111',
    numberCandidates: ['999000011', '990000111', '999000111'],
    numberToCheck: true,
    usage: 'TOURISME',
    holderName: 'EL AMRANI SAIDA',
    holderIdNumber: 'AB123456',
    policyNumber: '4012345678',
    registration: '12345-A-6',
    makeAndType: 'DACIA LOGAN',
    validFrom: '2026-11-01',
    validTo: '2027-10-31',
  },
  status: 'PENDING',
  progress: { customerId: null, vehicleId: null, contractId: null },
  documentId: null,
  closed: null,
  version: 1,
  ...overrides,
});
const GAMA_TOURISME = '00000000-0000-4000-8000-0000000000b6';
const catalogue = {
  // The RMA GAMA usages (owner's photos of 28/10/2026), each under its legal usage.
  'GET /api/insurer-usages': () => [
    200,
    {
      items: [
        {
          id: GAMA_TOURISME,
          insurer: { id: INSURER_ID, code: 'RMA' },
          group: 'TOURISME',
          label: 'TOURISME',
          usage: { id: USAGE_ID, label: 'Tourisme', modelCode: 'A' },
          active: true,
          vehicleCount: 0,
        },
      ],
    },
  ],
  'GET /api/attestation-series': () => [
    200,
    {
      items: [
        {
          id: SERIES_ID,
          code: '14 A',
          insurer: { id: INSURER_ID, code: 'RMA', name: 'RMA' },
          model: { code: 'A', label: 'Tourisme', provisional: false },
          status: 'CONFIRMED',
          active: true,
        },
      ],
    },
  ],
  'GET /api/vehicle-usages': () => [
    200,
    {
      items: [
        {
          id: USAGE_ID,
          label: 'Tourisme',
          model: { code: 'A', label: 'Tourisme', provisional: false },
          status: 'CONFIRMED',
          active: true,
        },
      ],
    },
  ],
  [PRODUCTS]: () => [
    200,
    {
      items: [{ id: PRODUCT_ID, name: 'Véhicules de tourisme', line: 'CAR', fits: true }],
      suggestion: null,
    },
  ],
};
const noMatch = () => [200, { customer: null, vehicle: null, contract: null, attestation: null }];

describe('scanning an attestation', () => {
  it('sends the scan to be read, then opens it to check', async () => {
    const fetchMock = mockApi({
      'GET /api/auth/me': agent,
      'GET /api/scans?status=PENDING': () => [200, { items: [] }],
      'POST /api/scans': () => [201, scan()],
      [`GET /api/scans/${SCAN_ID}`]: () => [200, scan()],
      ...catalogue,
    });
    // Any matches query of the review page answers "nothing found".
    const real = fetchMock.getMockImplementation();
    fetchMock.mockImplementation((url, init) =>
      url.includes('/matches?')
        ? Promise.resolve(new Response(JSON.stringify(noMatch()[1])))
        : real(url, init),
    );
    renderApp('/scans');
    const user = userEvent.setup();

    expect(await screen.findByText('Aucun scan en attente.')).toBeInTheDocument();
    const submit = screen.getByRole('button', { name: 'Lire l’attestation' });
    expect(submit).toBeDisabled();
    await user.upload(
      screen.getByLabelText('Scan de l’attestation'),
      new File(['%PDF-1.7'], 'attestation.pdf', { type: 'application/pdf' }),
    );
    await user.click(submit);
    expect(await screen.findByRole('heading', { name: 'Vérifier le scan' })).toBeInTheDocument();
  });

  it('proposes what was read, lets the employee pick the right number, and files new records', async () => {
    let filed = null;
    const fetchMock = mockApi({
      'GET /api/auth/me': agent,
      [`GET /api/scans/${SCAN_ID}`]: () => [200, scan()],
      [`POST /api/scans/${SCAN_ID}/file`]: (init) => {
        filed = JSON.parse(init.body);
        return [200, { scan: scan({ status: 'FILED' }), contractId: CONTRACT_ID }];
      },
      [`GET /api/contracts/${CONTRACT_ID}`]: () => [404, { error: { code: 'NOT_FOUND' } }],
      ...catalogue,
    });
    const real = fetchMock.getMockImplementation();
    fetchMock.mockImplementation((url, init) =>
      url.includes('/matches?')
        ? Promise.resolve(new Response(JSON.stringify(noMatch()[1])))
        : real(url, init),
    );
    renderApp(`/scans/${SCAN_ID}`);
    const user = userEvent.setup();

    expect(await screen.findByLabelText('N° de l’attestation')).toHaveValue('990000111');
    expect(screen.getByLabelText('Série')).toHaveValue(SERIES_ID);
    // The number was read with a digit too many: the employee picks the right reading.
    expect(screen.getByText(/Numéro mal lu/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: '999000111' }));
    expect(screen.getByLabelText('N° de l’attestation')).toHaveValue('999000111');

    const customer = screen.getByRole('region', { name: 'Client' });
    expect(within(customer).getByLabelText('Nom')).toHaveValue('EL');
    await user.clear(within(customer).getByLabelText('Nom'));
    await user.type(within(customer).getByLabelText('Nom'), 'El Amrani');
    await user.clear(within(customer).getByLabelText('Prénom'));
    await user.type(within(customer).getByLabelText('Prénom'), 'Saida');
    const vehicle = screen.getByRole('region', { name: 'Véhicule' });
    expect(within(vehicle).getByLabelText('Marque')).toHaveValue('DACIA');
    expect(within(vehicle).getByLabelText('Usage')).toHaveValue(USAGE_ID);
    await user.selectOptions(within(vehicle).getByLabelText('Catégorie'), 'CAR');
    const contract = screen.getByRole('region', { name: 'Contrat' });
    await user.selectOptions(
      await within(contract).findByLabelText('Produit'),
      'Véhicules de tourisme',
    );
    expect(within(contract).getByLabelText('Fin')).toHaveValue('2027-10-31');

    await user.click(screen.getByRole('button', { name: 'Enregistrer et suivre' }));
    await waitFor(() => expect(filed).not.toBeNull());
    expect(filed).toMatchObject({
      version: 1,
      seriesId: SERIES_ID,
      number: '999000111',
      policyNumber: '4012345678',
      customer: {
        create: {
          type: 'INDIVIDUAL',
          lastName: 'El Amrani',
          firstName: 'Saida',
          identityType: 'CIN',
          identityNumber: 'AB123456',
        },
      },
      vehicle: {
        create: {
          registration: '12345-A-6',
          category: 'CAR',
          make: 'DACIA',
          model: 'LOGAN',
          usageId: USAGE_ID,
        },
      },
      contract: {
        create: { productId: PRODUCT_ID, startDate: '2026-11-01', endDate: '2027-10-31' },
      },
      printed: { seriesCode: '14 A', number: '999000111', holderName: 'EL AMRANI SAIDA' },
    });
  });

  it('uses the customer, vehicle and contract already recorded when the scan matches them', async () => {
    let filed = null;
    mockApi({
      'GET /api/auth/me': agent,
      [`GET /api/scans/${SCAN_ID}`]: () => [
        200,
        scan({
          proposed: {
            ...scan().proposed,
            number: '999000111',
            numberToCheck: false,
            numberCandidates: undefined,
          },
        }),
      ],
      [`POST /api/scans/${SCAN_ID}/file`]: (init) => {
        filed = JSON.parse(init.body);
        return [409, { error: { code: 'SCAN_CLOSED' } }];
      },
      ...catalogue,
      [`GET /api/scans/${SCAN_ID}/matches?identityNumber=AB123456&registration=12345-A-6&policyNumber=4012345678&seriesId=${SERIES_ID}&number=999000111`]:
        () => [
          200,
          {
            customer: { id: 'cu1', ref: 'CLI-000001', displayName: 'Saida El Amrani' },
            vehicle: {
              id: 've1',
              registration: '12345-A-6',
              makeAndModel: 'Dacia Logan',
              owner: { id: 'cu1', displayName: 'Saida El Amrani' },
            },
            contract: {
              id: CONTRACT_ID,
              ref: 'CTR-2026-00001',
              startDate: '2026-11-01',
              endDate: '2027-10-31',
            },
            attestation: null,
          },
        ],
    });
    renderApp(`/scans/${SCAN_ID}`);
    const user = userEvent.setup();

    expect(await screen.findByLabelText('Existant : CLI-000001 · Saida El Amrani')).toBeChecked();
    expect(screen.getByLabelText('Existant : 12345-A-6 · Dacia Logan')).toBeChecked();
    expect(screen.queryByLabelText('Catégorie')).toBeNull();
    await user.click(screen.getByRole('button', { name: 'Enregistrer et suivre' }));
    expect(await screen.findByText('Ce scan est déjà traité.')).toBeInTheDocument();
    expect(filed).toMatchObject({
      customer: { id: 'cu1' },
      vehicle: { id: 've1' },
      contract: { id: CONTRACT_ID },
    });
  });
});

describe('a provisional attestation', () => {
  it('warns, without refusing, when the vehicle already had three provisionals in a row', async () => {
    const provisionalSeries = {
      id: SERIES_ID,
      code: '14 P',
      insurer: { id: INSURER_ID, code: 'RMA', name: 'RMA' },
      model: { code: 'P', label: 'Provisoire', provisional: true },
      status: 'CONFIRMED',
      active: true,
    };
    const vehicle = (provisionalsInARow) => ({
      id: 've1',
      registration: '12345-A-6',
      makeAndModel: 'Dacia Logan',
      provisionalsInARow,
      owner: { id: 'cu1', displayName: 'Saida El Amrani' },
    });
    let count = 3;
    const fetchMock = mockApi({
      'GET /api/auth/me': agent,
      [`GET /api/scans/${SCAN_ID}`]: () => [
        200,
        scan({
          confidence: 100,
          proposed: {
            ...scan().proposed,
            source: 'PLATFORM_PDF',
            provisional: true,
            seriesCode: '14 P',
            number: undefined,
            numberCandidates: undefined,
            numberToCheck: false,
          },
        }),
      ],
      ...catalogue,
      'GET /api/attestation-series': () => [200, { items: [provisionalSeries] }],
    });
    const real = fetchMock.getMockImplementation();
    fetchMock.mockImplementation((url, init) =>
      url.includes('/matches?')
        ? Promise.resolve(
            new Response(JSON.stringify({ ...noMatch()[1], vehicle: vehicle(count) })),
          )
        : real(url, init),
    );
    const { unmount } = renderApp(`/scans/${SCAN_ID}`);

    expect(
      await screen.findByText(/Ce véhicule a déjà 3 attestations provisoires de suite/),
    ).toBeInTheDocument();
    // Still possible to file: the agency checks, the app does not refuse.
    expect(screen.getByRole('button', { name: 'Enregistrer et suivre' })).toBeInTheDocument();
    unmount();

    count = 2;
    renderApp(`/scans/${SCAN_ID}`);
    expect(
      await screen.findByText(/le PDF n’imprime ni la série ni le numéro/),
    ).toBeInTheDocument();
    await waitFor(() =>
      expect(screen.getByLabelText('Existant : 12345-A-6 · Dacia Logan')).toBeInTheDocument(),
    );
    expect(screen.queryByText(/attestations provisoires de suite/)).toBeNull();
  });
});

describe('a new policy that replaces another', () => {
  it('proposes it as the next contract of the replaced policy, and sends the replaced policy', async () => {
    const urls = [];
    const fetchMock = mockApi({
      'GET /api/auth/me': agent,
      [`GET /api/scans/${SCAN_ID}`]: () => [
        200,
        scan({
          confidence: 100,
          proposed: {
            ...scan().proposed,
            source: 'PLATFORM_PDF',
            number: '999000111',
            numberCandidates: undefined,
            numberToCheck: false,
            policyNumber: '400000000000999',
            replacesPolicy: '400000000000998',
            // Mid-term: the new period does not start where the old contract ends.
            validFrom: '2026-09-25',
            validTo: '2027-03-25',
          },
        }),
      ],
      ...catalogue,
    });
    const real = fetchMock.getMockImplementation();
    fetchMock.mockImplementation((url, init) => {
      if (!url.includes('/matches?')) return real(url, init);
      urls.push(url);
      return Promise.resolve(
        new Response(
          JSON.stringify({
            ...noMatch()[1],
            contract: {
              id: CONTRACT_ID,
              ref: 'CTR-2025-00007',
              policyNumber: '400000000000998',
              startDate: '2026-01-01',
              endDate: '2026-12-31',
              customerId: 'cu1',
              vehicleIds: [],
              vehicles: [],
              replacedPolicy: true,
            },
          }),
        ),
      );
    });
    renderApp(`/scans/${SCAN_ID}`);

    expect(
      await screen.findByLabelText(
        'Remplacement de la police 400000000000998 : nouveau contrat avec la nouvelle police',
      ),
    ).toBeChecked();
    expect(urls.every((url) => url.includes('replacesPolicy=400000000000998'))).toBe(true);
  });
});

describe('a similar customer already exists', () => {
  it('names it, and files anyway when the employee says it is another person', async () => {
    const bodies = [];
    const fetchMock = mockApi({
      'GET /api/auth/me': agent,
      [`GET /api/scans/${SCAN_ID}`]: () => [200, scan()],
      [`POST /api/scans/${SCAN_ID}/file`]: (init) => {
        bodies.push(JSON.parse(init.body));
        return bodies.length === 1
          ? [
              409,
              {
                error: {
                  code: 'DUPLICATE_SUSPECTED',
                  details: {
                    candidates: [{ id: 'cu9', ref: 'CLI-000009', displayName: 'Saida El Amrani' }],
                  },
                },
              },
            ]
          : [200, { scan: scan({ status: 'FILED' }), contractId: CONTRACT_ID }];
      },
      [`GET /api/contracts/${CONTRACT_ID}`]: () => [404, { error: { code: 'NOT_FOUND' } }],
      ...catalogue,
    });
    const real = fetchMock.getMockImplementation();
    fetchMock.mockImplementation((url, init) =>
      url.includes('/matches?')
        ? Promise.resolve(new Response(JSON.stringify(noMatch()[1])))
        : real(url, init),
    );
    renderApp(`/scans/${SCAN_ID}`);
    const user = userEvent.setup();

    const vehicle = await screen.findByRole('region', { name: 'Véhicule' });
    await user.selectOptions(within(vehicle).getByLabelText('Catégorie'), 'CAR');
    await user.selectOptions(
      await within(screen.getByRole('region', { name: 'Contrat' })).findByLabelText('Produit'),
      'Véhicules de tourisme',
    );
    await user.click(screen.getByRole('button', { name: 'Enregistrer et suivre' }));
    expect(
      await screen.findByText('Un client semblable existe déjà. Vérifiez avant de continuer.'),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Utiliser CLI-000009 Saida El Amrani' }),
    ).toBeInTheDocument();

    await user.click(
      screen.getByRole('button', { name: 'Ce n’est pas le même client : enregistrer' }),
    );
    await waitFor(() => expect(bodies).toHaveLength(2));
    expect(bodies[0].customer.create.confirmNotDuplicate).toBeUndefined();
    expect(bodies[1].customer.create.confirmNotDuplicate).toBe(true);
  });
});

describe('a scan of the next year of a contract', () => {
  it('proposes to file it as the renewal of that contract', async () => {
    let filed = null;
    const next = scan({
      proposed: {
        ...scan().proposed,
        number: '218000777',
        numberToCheck: false,
        numberCandidates: undefined,
        validFrom: '2027-11-01',
        validTo: '2028-10-31',
      },
    });
    const fetchMock = mockApi({
      'GET /api/auth/me': agent,
      [`GET /api/scans/${SCAN_ID}`]: () => [200, next],
      [`POST /api/scans/${SCAN_ID}/file`]: (init) => {
        filed = JSON.parse(init.body);
        return [409, { error: { code: 'ALREADY_RENEWED' } }];
      },
      ...catalogue,
    });
    const real = fetchMock.getMockImplementation();
    fetchMock.mockImplementation((url, init) =>
      url.includes('/matches?')
        ? Promise.resolve(
            new Response(
              JSON.stringify({
                customer: { id: 'cu1', ref: 'CLI-000001', displayName: 'Saida El Amrani' },
                vehicle: {
                  id: 've1',
                  registration: '12345-A-6',
                  makeAndModel: 'Dacia Logan',
                  owner: { id: 'cu1', displayName: 'Saida El Amrani' },
                },
                contract: {
                  id: CONTRACT_ID,
                  ref: 'CTR-2026-00001',
                  startDate: '2026-11-01',
                  endDate: '2027-10-31',
                },
                attestation: null,
              }),
            ),
          )
        : real(url, init),
    );
    renderApp(`/scans/${SCAN_ID}`);
    const user = userEvent.setup();

    const renewal = await screen.findByLabelText(
      'Renouvellement de CTR-2026-00001 (nouvelle période)',
    );
    expect(renewal).toBeChecked();
    const contract = screen.getByRole('region', { name: 'Contrat' });
    expect(within(contract).getByLabelText('Début')).toHaveValue('2027-11-01');
    await user.click(screen.getByRole('button', { name: 'Enregistrer et suivre' }));
    expect(await screen.findByText('Ce contrat a déjà un contrat suivant.')).toBeInTheDocument();
    expect(filed.contract).toEqual({
      renew: { id: CONTRACT_ID, startDate: '2027-11-01', endDate: '2028-10-31' },
    });
  });
});

describe('a vehicle already recorded with another usage', () => {
  it('warns that the series needs another model and sends the usage chosen', async () => {
    let filed = null;
    const D_SERIES = '00000000-0000-4000-8000-0000000000c4';
    const DIVERS = '00000000-0000-4000-8000-0000000000c5';
    const E_USAGE = '00000000-0000-4000-8000-0000000000c6';
    const fetchMock = mockApi({
      'GET /api/auth/me': agent,
      [`GET /api/scans/${SCAN_ID}`]: () => [
        200,
        scan({
          proposed: {
            seriesCode: '14 D',
            seriesId: D_SERIES,
            number: '203000111',
            registration: 'VF1ABCDEF12345678',
            policyNumber: '400000000000111',
            validFrom: '2026-04-23',
            validTo: '2027-04-23',
          },
          progress: { customerId: 'cu1', vehicleId: 've1', contractId: null },
        }),
      ],
      [`POST /api/scans/${SCAN_ID}/file`]: (init) => {
        filed = JSON.parse(init.body);
        return [409, { error: { code: 'SCAN_CLOSED' } }];
      },
      'GET /api/insurer-usages': catalogue['GET /api/insurer-usages'],
      'GET /api/attestation-series': () => [
        200,
        {
          items: [
            {
              id: D_SERIES,
              code: '14 D',
              insurer: { id: INSURER_ID, code: 'RMA', name: 'RMA' },
              model: { code: 'D', label: 'Divers', provisional: false },
              status: 'CONFIRMED',
              active: true,
            },
          ],
        },
      ],
      'GET /api/vehicle-usages': () => [
        200,
        {
          items: [
            {
              id: DIVERS,
              label: 'Divers',
              model: { code: 'D' },
              status: 'CONFIRMED',
              active: true,
            },
            {
              id: E_USAGE,
              label: 'Véhicules à deux ou trois roues',
              model: { code: 'E' },
              status: 'CONFIRMED',
              active: true,
            },
          ],
        },
      ],
      [PRODUCTS]: () => [200, { items: [], suggestion: null }],
    });
    const real = fetchMock.getMockImplementation();
    fetchMock.mockImplementation((url, init) =>
      url.includes('/matches?')
        ? Promise.resolve(
            new Response(
              JSON.stringify({
                customer: null,
                contract: null,
                attestation: null,
                vehicle: {
                  id: 've1',
                  registration: 'VF1ABCDEF12345678',
                  makeAndModel: 'Volta D90',
                  usageId: E_USAGE,
                  usageModel: 'E',
                  owner: { id: 'cu1', displayName: 'Sara Test' },
                },
              }),
            ),
          )
        : real(url, init),
    );
    renderApp(`/scans/${SCAN_ID}`);
    const user = userEvent.setup();

    const vehicle = await screen.findByRole('region', { name: 'Véhicule' });
    const usage = await within(vehicle).findByLabelText('Usage du véhicule');
    expect(usage).toHaveValue(E_USAGE);
    expect(within(vehicle).getByText(/Cette série est du modèle D/)).toBeInTheDocument();
    await user.selectOptions(usage, 'Divers');
    expect(within(vehicle).queryByText(/Cette série est du modèle D/)).toBeNull();
    await user.click(screen.getByRole('button', { name: 'Enregistrer et suivre' }));
    await waitFor(() => expect(filed).not.toBeNull());
    expect(filed.vehicle).toEqual({ id: 've1', usageId: DIVERS });
  });
});

describe('a scan whose records are all known', () => {
  it('shows a short confirmation and files it in one click; the full form stays one click away', async () => {
    let filed = null;
    const fetchMock = mockApi({
      'GET /api/auth/me': agent,
      [`GET /api/scans/${SCAN_ID}`]: () => [
        200,
        scan({
          proposed: {
            ...scan().proposed,
            number: '999000111',
            numberToCheck: false,
            numberCandidates: undefined,
          },
        }),
      ],
      [`POST /api/scans/${SCAN_ID}/file`]: (init) => {
        filed = JSON.parse(init.body);
        return [409, { error: { code: 'SCAN_CLOSED' } }];
      },
      ...catalogue,
    });
    const real = fetchMock.getMockImplementation();
    fetchMock.mockImplementation((url, init) =>
      url.includes('/matches?')
        ? Promise.resolve(
            new Response(
              JSON.stringify({
                customer: { id: 'cu1', ref: 'CLI-000001', displayName: 'Saida El Amrani' },
                vehicle: {
                  id: 've1',
                  registration: '12345-A-6',
                  makeAndModel: 'Dacia Logan',
                  usageId: USAGE_ID,
                  usageModel: 'A',
                  owner: { id: 'cu1', displayName: 'Saida El Amrani' },
                },
                contract: {
                  id: CONTRACT_ID,
                  ref: 'CTR-2026-00001',
                  startDate: '2026-11-01',
                  endDate: '2027-10-31',
                },
                attestation: null,
              }),
            ),
          )
        : real(url, init),
    );
    renderApp(`/scans/${SCAN_ID}`);
    const user = userEvent.setup();

    const quick = (await screen.findByRole('heading', { name: 'Tout est reconnu' })).closest(
      'section',
    );
    expect(within(quick).getByText('Saida El Amrani')).toBeInTheDocument();
    expect(within(quick).getByText('12345-A-6 · Dacia Logan')).toBeInTheDocument();
    expect(within(quick).getByText('Attestation 14 A n° 999000111')).toBeInTheDocument();
    expect(within(quick).getByText('Ajoutée au contrat CTR-2026-00001')).toBeInTheDocument();
    // No form to fill.
    expect(screen.queryByLabelText('Catégorie')).toBeNull();

    await user.click(within(quick).getByRole('button', { name: 'Enregistrer et suivre' }));
    await waitFor(() => expect(filed).not.toBeNull());
    expect(filed).toMatchObject({
      number: '999000111',
      customer: { id: 'cu1' },
      vehicle: { id: 've1' },
      contract: { id: CONTRACT_ID },
    });

    await user.click(screen.getByRole('button', { name: 'Vérifier ou corriger en détail' }));
    expect(screen.getByLabelText('N° de l’attestation')).toHaveValue('999000111');
  });
});

describe('the product of the contract', () => {
  it('proposes the agency’s last choice for this kind of attestation, fitting products first', async () => {
    let filed = null;
    const fetchMock = mockApi({
      'GET /api/auth/me': agent,
      [`GET /api/scans/${SCAN_ID}`]: () => [
        200,
        scan({
          proposed: {
            ...scan().proposed,
            numberToCheck: false,
            numberCandidates: [],
            // A moped: the number before "2.R" is its cylindrée.
            engineCc: 49,
          },
        }),
      ],
      [`POST /api/scans/${SCAN_ID}/file`]: (init) => {
        filed = JSON.parse(init.body);
        return [200, { scan: scan({ status: 'FILED' }), contractId: CONTRACT_ID }];
      },
      [`GET /api/contracts/${CONTRACT_ID}`]: () => [404, { error: { code: 'NOT_FOUND' } }],
      ...catalogue,
      [PRODUCTS]: () => [
        200,
        {
          items: [
            { id: PRODUCT_ID, name: 'Véhicules de tourisme', line: 'CAR', fits: false },
            { id: SCOOTERS_ID, name: 'Scooters', line: 'MOTORCYCLE', fits: true },
          ],
          suggestion: { productId: SCOOTERS_ID, reason: 'LAST_CHOICE' },
        },
      ],
    });
    const real = fetchMock.getMockImplementation();
    fetchMock.mockImplementation((url, init) =>
      url.includes('/matches?')
        ? Promise.resolve(new Response(JSON.stringify(noMatch()[1])))
        : real(url, init),
    );
    renderApp(`/scans/${SCAN_ID}`);
    const user = userEvent.setup();

    const contract = await screen.findByRole('region', { name: 'Contrat' });
    const product = within(contract).getByLabelText('Produit');
    await waitFor(() => expect(product).toHaveValue(SCOOTERS_ID));
    expect(
      within(contract).getByText(
        'Proposé : le produit choisi la dernière fois pour ce type d’attestation.',
      ),
    ).toBeInTheDocument();
    // Fitting products first, under their own heading.
    const groups = within(product).getAllByRole('group');
    expect(groups.map((g) => g.getAttribute('label'))).toEqual([
      'Correspondent à l’attestation',
      'Autres produits',
    ]);
    expect(within(groups[0]).getByRole('option')).toHaveTextContent('Scooters');

    // The employee can always choose another.
    await user.selectOptions(product, 'Véhicules de tourisme');
    expect(product).toHaveValue(PRODUCT_ID);
    expect(within(contract).queryByText(/^Proposé/)).not.toBeInTheDocument();
    await user.selectOptions(product, 'Scooters');

    const customer = screen.getByRole('region', { name: 'Client' });
    await user.type(within(customer).getByLabelText('Prénom'), 'Saida');
    await user.selectOptions(
      within(screen.getByRole('region', { name: 'Véhicule' })).getByLabelText('Catégorie'),
      'MOTORCYCLE',
    );
    const vehicle = screen.getByRole('region', { name: 'Véhicule' });
    expect(within(vehicle).getByLabelText('Cylindrée (cm³)')).toHaveValue('49');
    await user.click(screen.getByRole('button', { name: 'Enregistrer et suivre' }));
    await waitFor(() => expect(filed).not.toBeNull());
    expect(filed.contract).toEqual({
      create: { productId: SCOOTERS_ID, startDate: '2026-11-01', endDate: '2027-10-31' },
    });
    expect(filed.vehicle.create).toMatchObject({ engineCc: '49' });
  });
});

describe('an avenant scanned from the platform PDF', () => {
  const OLD_CAR = '00000000-0000-4000-8000-0000000000c7';
  const avenantScan = () =>
    scan({
      confidence: 100,
      proposed: {
        ...scan().proposed,
        numberToCheck: false,
        numberCandidates: [],
        source: 'PLATFORM_PDF',
        amendmentKind: 'VEHICLE_CHANGE',
        amendmentLabel: 'Avenant de changement de vehicule',
        amendmentNumber: '2600012345',
        number: '207552775',
        policyNumber: '400070125000321',
        registration: '36974 -A- 57',
        makeAndType: 'RENAULT',
        validFrom: '2026-06-27',
        validTo: '2027-03-21',
        effectDate: '2026-06-27',
        endDate: '2027-03-21',
        premiumNet: '412.18',
        taxes: '73.46',
        cnpac: '17.00',
        premiumTotal: '512.64',
      },
    });

  it('files the attestation with the avenant on the contract: old vehicle replaced, its amount owed', async () => {
    let filed = null;
    const fetchMock = mockApi({
      'GET /api/auth/me': agent,
      [`GET /api/scans/${SCAN_ID}`]: () => [200, avenantScan()],
      [`POST /api/scans/${SCAN_ID}/file`]: (init) => {
        filed = JSON.parse(init.body);
        return [200, { scan: avenantScan(), contractId: CONTRACT_ID }];
      },
      [`GET /api/contracts/${CONTRACT_ID}`]: () => [404, { error: { code: 'NOT_FOUND' } }],
      ...catalogue,
    });
    // The customer and the contract are recorded; the new vehicle is not.
    const real = fetchMock.getMockImplementation();
    fetchMock.mockImplementation((url, init) =>
      url.includes('/matches?')
        ? Promise.resolve(
            new Response(
              JSON.stringify({
                customer: { id: 'cu1', ref: 'CLI-000001', displayName: 'Essai Test' },
                vehicle: null,
                contract: {
                  id: CONTRACT_ID,
                  ref: 'CTR-2026-00001',
                  status: 'ISSUED',
                  startDate: '2026-03-25',
                  endDate: '2027-03-21',
                  customerId: 'cu1',
                  vehicleIds: [OLD_CAR],
                  vehicles: [
                    { id: OLD_CAR, registration: '11111-A-57', make: 'Dacia', model: 'Logan' },
                  ],
                },
                attestation: null,
              }),
            ),
          )
        : real(url, init),
    );
    renderApp(`/scans/${SCAN_ID}`);
    const user = userEvent.setup();

    const avenant = await screen.findByRole('region', { name: 'Avenant' });
    expect(
      within(avenant).getByText(/changement de vehicule \(n° 2600012345\)/),
    ).toBeInTheDocument();
    expect(within(avenant).getByLabelText('Type d’avenant')).toHaveValue('VEHICLE_CHANGE');
    expect(within(avenant).getByLabelText(/Montant de l’avenant/)).toHaveValue('512.64');
    const replaced = await within(avenant).findByLabelText('Véhicule remplacé');
    expect(replaced).toHaveValue(OLD_CAR);
    // The avenant's total is not offered as a contract premium.
    expect(screen.queryByLabelText(/Prime de l’assureur/)).not.toBeInTheDocument();
    // Always checked on the full form.
    expect(screen.queryByRole('region', { name: 'Tout est reconnu' })).not.toBeInTheDocument();

    // A 14 A attestation (Tourisme) proposes a car; the platform prints "RENAULT -" and the model
    // may stay blank (owner, 29/10/2026).
    const car = screen.getByRole('region', { name: 'Véhicule' });
    expect(within(car).getByLabelText('Catégorie')).toHaveValue('CAR');
    expect(within(car).getByLabelText('Modèle')).toHaveValue('');
    await user.click(screen.getByRole('button', { name: 'Enregistrer et suivre' }));
    await waitFor(() => expect(filed).not.toBeNull());
    expect(filed.vehicle.create).not.toHaveProperty('model');
    expect(filed).toMatchObject({
      number: '207552775',
      customer: { id: 'cu1' },
      vehicle: { create: { registration: '36974 -A- 57', category: 'CAR', make: 'RENAULT' } },
      contract: { id: CONTRACT_ID },
      amendment: {
        kind: 'VEHICLE_CHANGE',
        number: '2600012345',
        effectiveDate: '2026-06-27',
        amount: '512.64',
        previousVehicleId: OLD_CAR,
      },
    });
  });
});

describe('a utility vehicle printed by the platform without its type', () => {
  const C_SERIES = '00000000-0000-4000-8000-0000000000d1';
  const C_USAGE = '00000000-0000-4000-8000-0000000000d2';
  const C_PRODUCT = '00000000-0000-4000-8000-0000000000d3';
  const GAMA_C1 = '00000000-0000-4000-8000-0000000000d4';
  const GAMA_C2 = '00000000-0000-4000-8000-0000000000d5';
  const vanScan = () =>
    scan({
      confidence: 100,
      proposed: {
        ...scan().proposed,
        source: 'PLATFORM_PDF',
        seriesCode: '14 C',
        seriesId: C_SERIES,
        number: '200000002',
        numberCandidates: [],
        numberToCheck: false,
        usage: 'C1 ( COMMERCE <= 3,5T)',
        // Named by the server from the RMA GAMA list.
        insurerUsageId: GAMA_C1,
        insurerUsageUsageId: C_USAGE,
        holderName: 'TESTI ESSAI',
        policyNumber: '400000000000222',
        registration: '99999 -A- 13',
        // "TATA -": the make only.
        makeAndType: 'TATA',
        bodyType: 'CAMIONNETTE PLATEAU',
        validFrom: '2026-10-01',
        validTo: '2026-11-01',
        premiumTotal: '856.07',
      },
    });

  it('proposes the utility category, and says the missing model on its field before sending', async () => {
    let filed = null;
    const fetchMock = mockApi({
      'GET /api/auth/me': agent,
      [`GET /api/scans/${SCAN_ID}`]: () => [200, vanScan()],
      [`POST /api/scans/${SCAN_ID}/file`]: (init) => {
        filed = JSON.parse(init.body);
        return [200, { scan: vanScan(), contractId: CONTRACT_ID }];
      },
      [`GET /api/contracts/${CONTRACT_ID}`]: () => [404, { error: { code: 'NOT_FOUND' } }],
      'GET /api/insurer-usages': () => [
        200,
        {
          items: [
            [GAMA_C1, 'C1', 'C1 (COMMERCE <= 3,5T)'],
            [GAMA_C2, 'C2', 'C2 (COMMERCE +3,5T)'],
          ].map(([id, group, label]) => ({
            id,
            insurer: { id: INSURER_ID, code: 'RMA' },
            group,
            label,
            usage: { id: C_USAGE, label: 'Transport de marchandises', modelCode: 'C' },
            active: true,
            vehicleCount: 0,
          })),
        },
      ],
      'GET /api/attestation-series': () => [
        200,
        {
          items: [
            {
              id: C_SERIES,
              code: '14 C',
              insurer: { id: INSURER_ID, code: 'RMA', name: 'RMA' },
              model: { code: 'C', label: 'Transport de marchandises', provisional: false },
              status: 'CONFIRMED',
              active: true,
            },
          ],
        },
      ],
      'GET /api/vehicle-usages': () => [
        200,
        {
          items: [
            {
              id: C_USAGE,
              label: 'C1 ( COMMERCE <= 3,5T)',
              model: { code: 'C', label: 'Transport de marchandises', provisional: false },
              status: 'CONFIRMED',
              active: true,
            },
          ],
        },
      ],
      [`GET /api/scans/${SCAN_ID}/products?seriesId=${C_SERIES}`]: () => [
        200,
        {
          items: [{ id: C_PRODUCT, name: 'Véhicules utilitaires', line: 'COMMERCIAL', fits: true }],
          suggestion: { productId: C_PRODUCT, reason: 'RULE' },
        },
      ],
    });
    const real = fetchMock.getMockImplementation();
    fetchMock.mockImplementation((url, init) =>
      url.includes('/matches?')
        ? Promise.resolve(new Response(JSON.stringify(noMatch()[1])))
        : real(url, init),
    );
    renderApp(`/scans/${SCAN_ID}`);
    const user = userEvent.setup();

    const van = await screen.findByRole('region', { name: 'Véhicule' });
    expect(within(van).getByLabelText('Catégorie')).toHaveValue('COMMERCIAL');
    expect(within(van).getByLabelText('Marque')).toHaveValue('TATA');
    expect(within(van).getByLabelText('Modèle')).toHaveValue('');
    // The usage chosen on the platform, read from the sheet, with the usage of the attestation.
    expect(within(van).getByLabelText('Usage assureur (RMA)')).toHaveValue(GAMA_C1);
    expect(within(van).getByLabelText('Usage')).toHaveValue(C_USAGE);
    const contract = screen.getByRole('region', { name: 'Contrat' });
    // The products load after the page: wait for the one to choose.
    await within(contract).findByRole('option', { name: 'Véhicules utilitaires' });
    await user.selectOptions(within(contract).getByLabelText('Produit'), 'Véhicules utilitaires');

    // A missing make is named on its field, not only "check the form"; nothing is sent.
    await user.clear(within(van).getByLabelText('Marque'));
    await user.click(screen.getByRole('button', { name: 'Enregistrer et suivre' }));
    expect(
      await screen.findByText('Certaines informations sont invalides. Vérifiez le formulaire.'),
    ).toBeInTheDocument();
    expect(within(van).getByLabelText('Marque')).toHaveAccessibleDescription(
      'Ce champ est obligatoire.',
    );
    expect(within(van).getByLabelText('Modèle')).not.toHaveAccessibleDescription(
      'Ce champ est obligatoire.',
    );
    expect(filed).toBeNull();

    // The model is optional: the platform never prints it (owner, 29/10/2026).
    await user.type(within(van).getByLabelText('Marque'), 'TATA');
    await user.click(screen.getByRole('button', { name: 'Enregistrer et suivre' }));
    await waitFor(() => expect(filed).not.toBeNull());
    expect(filed.vehicle.create).not.toHaveProperty('model');
    expect(filed).toMatchObject({
      vehicle: {
        create: {
          registration: '99999 -A- 13',
          category: 'COMMERCIAL',
          make: 'TATA',
          usageId: C_USAGE,
          insurerUsageId: GAMA_C1,
        },
      },
      contract: {
        create: { productId: C_PRODUCT, startDate: '2026-10-01', endDate: '2026-11-01' },
      },
    });
  });
});

describe('an electric moped on a white D sheet, its usage cut short', () => {
  const D_SERIES = '00000000-0000-4000-8000-0000000000e1';
  const DIVERS = '00000000-0000-4000-8000-0000000000e2';
  const TWO_WHEELS = '00000000-0000-4000-8000-0000000000e3';
  const SLOW = '00000000-0000-4000-8000-0000000000e4';
  const FAST = '00000000-0000-4000-8000-0000000000e5';
  const MIDDLE = '00000000-0000-4000-8000-0000000000e6';
  const RENTAL = '00000000-0000-4000-8000-0000000000e7';
  // An electric moped on a white 14 D sheet (synthetic values).
  const mopedScan = () =>
    scan({
      confidence: 100,
      proposed: {
        ...scan().proposed,
        source: 'PLATFORM_PDF',
        seriesCode: '14 D',
        seriesId: D_SERIES,
        number: '200000003',
        numberCandidates: [],
        numberToCheck: false,
        usage: 'CYLINDRÉE < 50 CM3 VITESSE',
        // Named by the server: the label cut short may be either.
        insurerUsageChoices: [SLOW, FAST],
        holderName: 'TESTI ESSAI',
        policyNumber: '400000000000333',
        registration: '88888 -A- 13',
        makeAndType: 'VOLTA',
        bodyType: '2.R',
        fuel: 'ELECTRIC',
        engineCc: 3,
        validFrom: '2026-10-01',
        validTo: '2027-09-30',
      },
    });
  const gama = (id, group, label, usage) => ({
    id,
    insurer: { id: INSURER_ID, code: 'RMA' },
    group,
    label,
    usage,
    active: true,
    vehicleCount: 0,
  });
  const twoWheels = { id: TWO_WHEELS, label: 'Deux ou trois roues', modelCode: 'E' };
  const divers = { id: DIVERS, label: 'Divers', modelCode: 'D' };

  it('offers only the usages the label may be, keeps Divers, and shows them all on request', async () => {
    let filed = null;
    const fetchMock = mockApi({
      'GET /api/auth/me': agent,
      [`GET /api/scans/${SCAN_ID}`]: () => [200, mopedScan()],
      [`POST /api/scans/${SCAN_ID}/file`]: (init) => {
        filed = JSON.parse(init.body);
        return [200, { scan: mopedScan(), contractId: CONTRACT_ID }];
      },
      [`GET /api/contracts/${CONTRACT_ID}`]: () => [404, { error: { code: 'NOT_FOUND' } }],
      'GET /api/insurer-usages': () => [
        200,
        {
          items: [
            gama(RENTAL, 'LOCATION', 'LOCATION C.I.', divers),
            gama(SLOW, 'CYCLOMOTER', 'CYLINDRÉE < 50 CM3 VITESSE < 60 KM/H', twoWheels),
            gama(FAST, 'CYCLOMOTER', 'CYLINDRÉE < 50 CM3 VITESSE > 60 KM/H', twoWheels),
            gama(MIDDLE, 'CYCLOMOTER', 'CYLINDRÉE ENTRE 50 CM3 ET 125 CM3', twoWheels),
          ],
        },
      ],
      'GET /api/attestation-series': () => [
        200,
        {
          items: [
            {
              id: D_SERIES,
              code: '14 D',
              insurer: { id: INSURER_ID, code: 'RMA', name: 'RMA' },
              model: { code: 'D', label: 'Divers', provisional: false },
              status: 'CONFIRMED',
              active: true,
            },
          ],
        },
      ],
      'GET /api/vehicle-usages': () => [
        200,
        {
          items: [
            [DIVERS, 'Divers', 'D'],
            [TWO_WHEELS, 'Deux ou trois roues', 'E'],
          ].map(([id, label, code]) => ({
            id,
            label,
            model: { code, label, provisional: false },
            status: 'CONFIRMED',
            active: true,
          })),
        },
      ],
      [`GET /api/scans/${SCAN_ID}/products?seriesId=${D_SERIES}`]: () => [
        200,
        {
          items: [{ id: SCOOTERS_ID, name: 'Scooters', line: 'MOTORCYCLE', fits: null }],
          suggestion: { productId: SCOOTERS_ID, reason: 'RULE' },
        },
      ],
    });
    const real = fetchMock.getMockImplementation();
    fetchMock.mockImplementation((url, init) =>
      url.includes('/matches?')
        ? Promise.resolve(new Response(JSON.stringify(noMatch()[1])))
        : real(url, init),
    );
    renderApp(`/scans/${SCAN_ID}`);
    const user = userEvent.setup();

    const moped = await screen.findByRole('region', { name: 'Véhicule' });
    const rmaUsage = within(moped).getByLabelText('Usage assureur (RMA)');
    const offered = () =>
      within(rmaUsage)
        .getAllByRole('option')
        .map((o) => o.textContent)
        .slice(1);
    // Only the two the cut label may be, nothing chosen yet; the attestation stays Divers.
    expect(offered()).toEqual([
      'CYLINDRÉE < 50 CM3 VITESSE < 60 KM/H',
      'CYLINDRÉE < 50 CM3 VITESSE > 60 KM/H',
    ]);
    expect(rmaUsage).toHaveValue('');
    expect(rmaUsage).toHaveAccessibleDescription(
      'L’attestation coupe l’usage (« CYLINDRÉE < 50 CM3 VITESSE ») : seuls les 2 usages qui commencent ainsi sont proposés.',
    );
    expect(within(moped).getByLabelText('Usage')).toHaveValue(DIVERS);

    // Chosen: an electric moped keeps the usage Divers of its white D sheet.
    await user.selectOptions(rmaUsage, FAST);
    expect(within(moped).getByLabelText('Usage')).toHaveValue(DIVERS);

    // Every usage on request, and back.
    await user.click(
      within(moped).getByRole('button', { name: 'Afficher tous les usages de l’assureur' }),
    );
    expect(offered()).toHaveLength(4);
    await user.click(
      within(moped).getByRole('button', { name: 'Afficher seulement les usages proposés' }),
    );
    expect(offered()).toHaveLength(2);

    const contract = screen.getByRole('region', { name: 'Contrat' });
    await waitFor(() =>
      expect(within(contract).getByLabelText('Produit')).toHaveValue(SCOOTERS_ID),
    );
    await user.click(screen.getByRole('button', { name: 'Enregistrer et suivre' }));
    await waitFor(() => expect(filed).not.toBeNull());
    expect(filed.vehicle.create).toMatchObject({
      category: 'MOTORCYCLE',
      usageId: DIVERS,
      insurerUsageId: FAST,
      fuel: 'ELECTRIC',
      engineCc: '3',
    });
  });
});

describe('a CAT platform sheet of a coach', () => {
  const CAT_ID = '00000000-0000-4000-8000-0000000000f4';
  const B_SERIES = '00000000-0000-4000-8000-0000000000f5';
  const TRANSPORT = '00000000-0000-4000-8000-0000000000f6';
  const CAT_PRODUCT = '00000000-0000-4000-8000-0000000000f7';
  // Laid out like the owner's CAT sample of 29/10/2026 (synthetic values).
  const coachScan = () =>
    scan({
      confidence: 100,
      proposed: {
        source: 'PLATFORM_PDF',
        insurerCode: 'CAT',
        seriesCode: '91 B',
        seriesId: B_SERIES,
        number: '165000111',
        policyNumber: 'C2026/000111',
        holderName: 'TRANSPORTS ESSAI SARL',
        holderIdNumber: 'ZZ999111',
        holderAddress: '1 RUE DE L ESSAI KENITRA',
        usage: 'CAR DE LIGNE',
        bodyType: 'C.I',
        registration: '99999-B-6',
        makeAndType: 'MERCEDES CAR',
        seats: 50,
        fuel: 'DIESEL',
        validFrom: '2026-11-01',
        validTo: '2027-10-31',
        premiumNet: '11201.00',
        fsec: '112.01',
        taxes: '1680.15',
        cnpac: '17.00',
        premiumTotal: '13010.16',
      },
    });

  it('proposes a company, a passenger transport, and no RMA usage list', async () => {
    let filed = null;
    const fetchMock = mockApi({
      'GET /api/auth/me': agent,
      [`GET /api/scans/${SCAN_ID}`]: () => [200, coachScan()],
      [`POST /api/scans/${SCAN_ID}/file`]: (init) => {
        filed = JSON.parse(init.body);
        return [200, { scan: coachScan(), contractId: CONTRACT_ID }];
      },
      [`GET /api/contracts/${CONTRACT_ID}`]: () => [404, { error: { code: 'NOT_FOUND' } }],
      // RMA's list only: nothing for CAT.
      'GET /api/insurer-usages': catalogue['GET /api/insurer-usages'],
      'GET /api/attestation-series': () => [
        200,
        {
          items: [
            {
              id: B_SERIES,
              code: '91 B',
              insurer: { id: CAT_ID, code: 'CAT', name: 'CAT' },
              model: { code: 'B', label: 'Transport public de voyageurs', provisional: false },
              status: 'CONFIRMED',
              active: true,
            },
          ],
        },
      ],
      'GET /api/vehicle-usages': () => [
        200,
        {
          items: [
            {
              id: TRANSPORT,
              label: 'Transport public de voyageurs',
              model: { code: 'B', label: 'Transport public de voyageurs', provisional: false },
              status: 'CONFIRMED',
              active: true,
            },
          ],
        },
      ],
      [`GET /api/scans/${SCAN_ID}/products?seriesId=${B_SERIES}`]: () => [
        200,
        {
          items: [
            {
              id: CAT_PRODUCT,
              name: 'Transport de voyageurs',
              line: 'PASSENGER_TRANSPORT',
              fits: true,
            },
          ],
          suggestion: { productId: CAT_PRODUCT, reason: 'RULE' },
        },
      ],
    });
    const real = fetchMock.getMockImplementation();
    fetchMock.mockImplementation((url, init) =>
      url.includes('/matches?')
        ? Promise.resolve(new Response(JSON.stringify(noMatch()[1])))
        : real(url, init),
    );
    renderApp(`/scans/${SCAN_ID}`);
    const user = userEvent.setup();

    const customer = await screen.findByRole('region', { name: 'Client' });
    expect(within(customer).getByLabelText('Type')).toHaveValue('BUSINESS');
    expect(within(customer).getByLabelText('Raison sociale')).toHaveValue('TRANSPORTS ESSAI SARL');
    const coach = screen.getByRole('region', { name: 'Véhicule' });
    expect(within(coach).getByLabelText('Catégorie')).toHaveValue('PASSENGER_TRANSPORT');
    expect(within(coach).getByLabelText('Usage')).toHaveValue(TRANSPORT);
    expect(within(coach).queryByLabelText('Usage assureur (RMA)')).toBeNull();
    // Read exactly on the PDF: marked until changed, so the eye goes to the rest.
    const make = within(coach).getByLabelText('Marque');
    expect(make.closest('div.relative')).toHaveTextContent('Lu sur le PDF');
    await user.clear(make);
    await user.type(make, 'MERCEDES-BENZ');
    expect(make.closest('div.relative')).not.toHaveTextContent('Lu sur le PDF');
    await user.clear(make);
    await user.type(make, 'MERCEDES');
    // A value the sheet did not give is never marked.
    expect(
      within(coach).getByLabelText('Numéro de châssis (VIN)').closest('div.relative'),
    ).not.toHaveTextContent('Lu sur le PDF');
    expect(
      screen.getByText(
        'Prime nette 11 201,00 MAD · Taxe parafiscale FSEC 112,01 MAD · Taxes 1 680,15 MAD · CNPAC 17,00 MAD · Total à payer 13 010,16 MAD',
      ),
    ).toBeInTheDocument();

    const contract = screen.getByRole('region', { name: 'Contrat' });
    await waitFor(() =>
      expect(within(contract).getByLabelText('Produit')).toHaveValue(CAT_PRODUCT),
    );
    await user.click(screen.getByRole('button', { name: 'Enregistrer et suivre' }));
    await waitFor(() => expect(filed).not.toBeNull());
    expect(filed).toMatchObject({
      seriesId: B_SERIES,
      number: '165000111',
      policyNumber: 'C2026/000111',
      customer: {
        create: {
          type: 'BUSINESS',
          legalName: 'TRANSPORTS ESSAI SARL',
          identityNumber: 'ZZ999111',
        },
      },
      vehicle: {
        create: {
          category: 'PASSENGER_TRANSPORT',
          make: 'MERCEDES',
          model: 'CAR',
          usageId: TRANSPORT,
          seats: '50',
        },
      },
      contract: { create: { productId: CAT_PRODUCT, premiumTotal: '13010.16' } },
    });
    expect(filed.vehicle.create).not.toHaveProperty('insurerUsageId');
  });
});

describe('the scans list on the new design', () => {
  it('shows the shape of the list while loading, then each list with its own empty line', async () => {
    let answer;
    const first = new Promise((resolve) => {
      answer = resolve;
    });
    const fetchMock = mockApi({
      'GET /api/auth/me': agent,
      'GET /api/scans?status=PENDING': () => first,
      'GET /api/scans?status=FILED': () => [200, { items: [scan({ status: 'FILED' })] }],
      'GET /api/scans?status=DISCARDED': () => [200, { items: [] }],
    });
    renderApp('/scans');
    const user = userEvent.setup();
    const list = await screen.findByRole('region', { name: 'Scans à traiter' });
    expect(within(list).getByRole('status')).toHaveTextContent('Chargement…');

    answer([200, { items: [] }]);
    expect(await within(list).findByText('Aucun scan en attente.')).toBeInTheDocument();

    await user.click(screen.getByRole('radio', { name: 'Enregistrés' }));
    const filed = await screen.findByRole('region', { name: 'Scans enregistrés' });
    expect(await within(filed).findByRole('link', { name: '14 A n° 990000111' })).toHaveAttribute(
      'href',
      `/scans/${SCAN_ID}`,
    );
    expect(within(filed).getByText('Enregistré')).toBeInTheDocument();

    // The discarded scans could not be found again before: they have their own list now.
    await user.click(screen.getByRole('radio', { name: 'Écartés' }));
    const discarded = await screen.findByRole('region', { name: 'Scans écartés' });
    expect(await within(discarded).findByText('Aucun scan écarté.')).toBeInTheDocument();
    expect(fetchMock.mock.calls.map(([url]) => url)).toContain('/api/scans?status=DISCARDED');
  });
});
