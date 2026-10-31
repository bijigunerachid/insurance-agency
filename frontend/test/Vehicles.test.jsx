import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { me, mockApi } from './mockApi.js';
import { renderApp } from './renderApp.jsx';

const CUSTOMER_ID = '00000000-0000-4000-8000-0000000000c1';
const VEHICLE_ID = '00000000-0000-4000-8000-0000000000e1';
const agentMe = () =>
  me({
    role: 'AGENT',
    permissions: ['customers.read', 'customers.write', 'vehicles.read', 'vehicles.write'],
  });

const customer = {
  id: CUSTOMER_ID,
  ref: 'CLI-000001',
  type: 'BUSINESS',
  displayName: 'Transports Atlas',
  legalName: 'Transports Atlas',
  identityNumber: null,
  identityMasked: false,
  phone: null,
  assignedUser: null,
  archivedAt: null,
  createdAt: '2026-10-22T09:00:00.000Z',
  version: 1,
};
const vehicle = {
  id: VEHICLE_ID,
  registration: '12345-B-6',
  category: 'TAXI',
  make: 'Dacia',
  model: 'Logan',
  firstRegistrationDate: '2019-05-14',
  vin: null,
  fiscalPowerCv: 6,
  engineCc: null,
  seats: 6,
  fuel: 'DIESEL',
  taxiType: 'GRAND',
  passengerTransportKind: null,
  owner: { id: CUSTOMER_ID, ref: 'CLI-000001', displayName: 'Transports Atlas' },
  fleet: { id: 'f1', name: 'Taxis Casablanca' },
  usage: { id: 'u1', label: 'Tourisme' },
  archivedAt: null,
  createdAt: '2026-10-22T09:00:00.000Z',
  version: 1,
};
const usage = (id, label, status, active = true) => ({ id, label, status, active, version: 1 });
const usages = [
  200,
  {
    items: [
      usage('u1', 'Tourisme', 'CONFIRMED'),
      usage('u2', 'Transport de marchandises', 'TO_CONFIRM'),
      usage('u3', 'Ancien usage', 'CONFIRMED', false),
    ],
  },
];
const page = (items) => [200, { items, total: items.length, page: 1, pageSize: 100, pageCount: 1 }];
const fleets = [
  200,
  { items: [{ id: 'f1', name: 'Taxis Casablanca', vehicleCount: 1, version: 1 }] },
];

describe('vehicles', () => {
  it('shows a customer’s vehicles and fleets, and creates a fleet', async () => {
    const fetchMock = mockApi({
      'GET /api/auth/me': () => [200, agentMe()],
      [`GET /api/customers/${CUSTOMER_ID}`]: () => [200, customer],
      [`GET /api/vehicles?customerId=${CUSTOMER_ID}&archived=include&pageSize=100`]: () =>
        page([vehicle]),
      [`GET /api/fleets?customerId=${CUSTOMER_ID}`]: () => fleets,
      'POST /api/fleets': () => [201, { id: 'f2', name: 'Autocars', vehicleCount: 0, version: 1 }],
    });
    renderApp(`/clients/${CUSTOMER_ID}`);
    const user = userEvent.setup();

    expect(await screen.findByRole('link', { name: '12345-B-6' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Taxis Casablanca' })).toBeInTheDocument();
    expect(screen.getByText('1 véhicule')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Ajouter un véhicule' })).toHaveAttribute(
      'href',
      `/vehicules/nouveau?client=${CUSTOMER_ID}`,
    );

    // The fleet form opens on request only.
    expect(screen.queryByLabelText('Nom de la flotte')).toBeNull();
    await user.click(screen.getByRole('button', { name: 'Créer une flotte' }));
    await user.type(screen.getByLabelText('Nom de la flotte'), 'Autocars');
    await user.click(screen.getByRole('button', { name: 'Créer la flotte' }));
    const call = fetchMock.mock.calls.find(
      ([url, init]) => url === '/api/fleets' && init.method === 'POST',
    );
    expect(JSON.parse(call[1].body)).toEqual({ customerId: CUSTOMER_ID, name: 'Autocars' });
  });

  it('shows one line for a customer without a fleet, the form on request', async () => {
    mockApi({
      'GET /api/auth/me': () => [200, agentMe()],
      [`GET /api/customers/${CUSTOMER_ID}`]: () => [200, customer],
      [`GET /api/vehicles?customerId=${CUSTOMER_ID}&archived=include&pageSize=100`]: () =>
        page([vehicle]),
      [`GET /api/fleets?customerId=${CUSTOMER_ID}`]: () => [200, { items: [] }],
    });
    renderApp(`/clients/${CUSTOMER_ID}`);
    const user = userEvent.setup();

    const line = (await screen.findByRole('heading', { name: 'Flottes' })).closest('section');
    expect(line).toHaveTextContent('FlottesAucune flotte.Créer une flotte');
    expect(screen.queryByLabelText('Nom de la flotte')).toBeNull();
    await user.click(within(line).getByRole('button', { name: 'Créer une flotte' }));
    expect(screen.getByLabelText('Nom de la flotte')).toBeInTheDocument();
  });

  it('shows the fields of the chosen category and the server’s field errors', async () => {
    const fetchMock = mockApi({
      'GET /api/auth/me': () => [200, agentMe()],
      [`GET /api/customers/${CUSTOMER_ID}`]: () => [200, customer],
      [`GET /api/fleets?customerId=${CUSTOMER_ID}`]: () => fleets,
      'GET /api/vehicle-usages': () => usages,
      'POST /api/vehicles': () => [
        400,
        { error: { code: 'VALIDATION_ERROR', details: [{ path: 'seats', rule: 'REQUIRED' }] } },
      ],
    });
    renderApp(`/vehicules/nouveau?client=${CUSTOMER_ID}`);
    const user = userEvent.setup();

    expect(await screen.findByRole('heading', { name: 'Ajouter un véhicule' })).toBeInTheDocument();
    expect(screen.getByText('Transports Atlas', { selector: 'span' })).toBeInTheDocument();
    expect(screen.queryByLabelText('Type de taxi')).not.toBeInTheDocument();
    // A two-wheeler needs its fiscal power or its cylindrée: both are marked until one is typed.
    await user.selectOptions(screen.getByLabelText('Catégorie'), 'MOTORCYCLE');
    expect(screen.getByLabelText('Puissance fiscale (CV) *')).toBeRequired();
    await user.type(screen.getByLabelText('Cylindrée (cm³) *'), '49');
    expect(screen.getByLabelText('Puissance fiscale (CV)')).not.toBeRequired();
    expect(screen.getByLabelText('Cylindrée (cm³)')).not.toBeRequired();
    await user.selectOptions(screen.getByLabelText('Catégorie'), 'Taxi');
    expect(screen.getByLabelText('Type de taxi')).toBeInTheDocument();
    expect(screen.getByLabelText('Nombre de places *')).toBeRequired();

    await user.type(screen.getByLabelText('Immatriculation'), '12345-B-6');
    await user.type(screen.getByLabelText('Marque'), 'Dacia');
    await user.type(screen.getByLabelText('Modèle'), 'Logan');
    await user.selectOptions(screen.getByLabelText('Flotte'), 'Taxis Casablanca');
    // Only confirmed, active usages are offered (rule L16).
    const usageSelect = screen.getByLabelText('Usage (attestation)');
    expect(
      within(usageSelect)
        .getAllByRole('option')
        .map((o) => o.textContent),
    ).toEqual(['Non précisé', 'Tourisme']);
    await user.selectOptions(usageSelect, 'Tourisme');
    await user.click(screen.getByRole('button', { name: 'Enregistrer' }));

    expect(
      await screen.findByText('Ce champ est obligatoire pour cette catégorie.'),
    ).toBeInTheDocument();
    const body = JSON.parse(fetchMock.mock.calls.find(([url]) => url === '/api/vehicles')[1].body);
    // Correcting the field removes its error at once.
    await user.type(screen.getByLabelText('Nombre de places *'), '6');
    expect(
      screen.queryByText('Ce champ est obligatoire pour cette catégorie.'),
    ).not.toBeInTheDocument();
    expect(body).toEqual({
      ownerId: CUSTOMER_ID,
      registration: '12345-B-6',
      category: 'TAXI',
      make: 'Dacia',
      model: 'Logan',
      usageId: 'u1',
      fleetId: 'f1',
    });
  });

  it('fills the usage of the attestation from the usage chosen on the insurer’s platform', async () => {
    const legal = [
      200,
      {
        items: [
          usage('u1', 'Tourisme', 'CONFIRMED'),
          usage('u2', 'Transport de marchandises', 'CONFIRMED'),
          usage('u4', 'Divers', 'TO_CONFIRM'),
        ],
      },
    ];
    const gama = (id, group, label, usageId) => ({
      id,
      insurer: { id: 'i1', code: 'RMA' },
      group,
      label,
      usage: { id: usageId, label: '', modelCode: null },
      active: true,
      vehicleCount: 0,
    });
    const fetchMock = mockApi({
      'GET /api/auth/me': () => [200, agentMe()],
      [`GET /api/customers/${CUSTOMER_ID}`]: () => [200, customer],
      [`GET /api/fleets?customerId=${CUSTOMER_ID}`]: () => [200, { items: [] }],
      'GET /api/vehicle-usages': () => legal,
      'GET /api/insurer-usages': () => [
        200,
        {
          items: [
            gama('g1', 'LOCATION', 'LOCATION C.I.', 'u4'),
            gama('g2', 'TOURISME', 'TOURISME', 'u1'),
            gama('g3', 'C1', 'C1 (COMMERCE <= 3,5T)', 'u2'),
            gama('g4', 'C2', 'C2 (COMMERCE +3,5T)', 'u2'),
          ],
        },
      ],
      'POST /api/vehicles': () => [201, { ...vehicle, id: VEHICLE_ID }],
      [`GET /api/vehicles/${VEHICLE_ID}`]: () => [200, vehicle],
    });
    renderApp(`/vehicules/nouveau?client=${CUSTOMER_ID}`);
    const user = userEvent.setup();

    const gamaSelect = await screen.findByLabelText('Usage assureur (RMA)');
    // Offered under the platform's headings, when the usage of their attestation can be chosen.
    await waitFor(() =>
      expect([...gamaSelect.querySelectorAll('optgroup')].map((g) => g.label)).toEqual([
        'RMA · TOURISME',
        'RMA · C1',
        'RMA · C2',
      ]),
    );
    // By value: the label's "<" is escaped in the option's HTML.
    await user.selectOptions(gamaSelect, 'g3');
    expect(screen.getByLabelText('Usage (attestation)')).toHaveValue('u2');
    // Another usage of the attestation: the platform's usage no longer fits and is cleared.
    await user.selectOptions(screen.getByLabelText('Usage (attestation)'), 'Tourisme');
    expect(gamaSelect).toHaveValue('');
    await user.selectOptions(gamaSelect, 'g4');

    await user.selectOptions(screen.getByLabelText('Catégorie'), 'Véhicule utilitaire');
    await user.type(screen.getByLabelText('Immatriculation'), '99999-A-13');
    await user.type(screen.getByLabelText('Marque'), 'TATA');
    await user.type(screen.getByLabelText('Modèle'), 'Xenon');
    await user.click(screen.getByRole('button', { name: 'Enregistrer' }));
    expect(await screen.findByRole('heading', { name: /12345-B-6/ })).toBeInTheDocument();
    const body = JSON.parse(fetchMock.mock.calls.find(([url]) => url === '/api/vehicles')[1].body);
    expect(body).toMatchObject({ usageId: 'u2', insurerUsageId: 'g4', category: 'COMMERCIAL' });
  });

  it('points to the existing vehicle when the plate is already registered', async () => {
    mockApi({
      'GET /api/auth/me': () => [200, agentMe()],
      [`GET /api/customers/${CUSTOMER_ID}`]: () => [200, customer],
      [`GET /api/fleets?customerId=${CUSTOMER_ID}`]: () => [200, { items: [] }],
      'GET /api/vehicle-usages': () => usages,
      'POST /api/vehicles': () => [
        409,
        {
          error: {
            code: 'DUPLICATE_REGISTRATION',
            details: {
              candidates: [
                {
                  id: VEHICLE_ID,
                  registration: '12345-B-6',
                  owner: { id: 'x', ref: 'CLI-000042', displayName: 'Autre client' },
                  archived: false,
                },
              ],
            },
          },
        },
      ],
    });
    renderApp(`/vehicules/nouveau?client=${CUSTOMER_ID}`);
    const user = userEvent.setup();
    await user.type(await screen.findByLabelText('Immatriculation'), '12345 b 6');
    await user.type(screen.getByLabelText('Marque'), 'Dacia');
    await user.type(screen.getByLabelText('Modèle'), 'Logan');
    await user.click(screen.getByRole('button', { name: 'Enregistrer' }));

    const dialog = await screen.findByRole('dialog', { name: 'Véhicule déjà enregistré' });
    expect(within(dialog).getByRole('link', { name: '12345-B-6' })).toHaveAttribute(
      'href',
      `/vehicules/${VEHICLE_ID}`,
    );
    expect(within(dialog).getByText(/Autre client \(CLI-000042\)/)).toBeInTheDocument();
  });

  it('shows a vehicle with the fields of its category, in French', async () => {
    mockApi({
      'GET /api/auth/me': () => [200, agentMe()],
      [`GET /api/vehicles/${VEHICLE_ID}`]: () => [200, vehicle],
    });
    renderApp(`/vehicules/${VEHICLE_ID}`);
    expect(await screen.findByRole('heading', { name: '12345-B-6' })).toBeInTheDocument();
    expect(screen.getByText('Grand taxi')).toBeInTheDocument();
    expect(screen.getByText('Diesel')).toBeInTheDocument();
    expect(screen.getByText('14/05/2019')).toBeInTheDocument();
    expect(screen.getByText('Tourisme')).toBeInTheDocument();
    expect(screen.queryByText('Cylindrée (cm³)')).not.toBeInTheDocument();
    // Agents may edit but not archive.
    expect(screen.getByRole('link', { name: 'Modifier' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Archiver' })).not.toBeInTheDocument();
  });

  it('keeps the history of a vehicle replaced by an avenant and of its earlier plate', async () => {
    mockApi({
      'GET /api/auth/me': () => [200, agentMe()],
      [`GET /api/vehicles/${VEHICLE_ID}`]: () => [
        200,
        {
          ...vehicle,
          archivedAt: '2026-10-28T10:00:00.000Z',
          archiveReason: 'Remplacé par avenant n° 2600012345 sur CTR-2026-00001',
          amendments: [
            {
              id: 'm2',
              kind: 'VEHICLE_CHANGE',
              number: '2600012345',
              effectiveDate: '2027-03-01',
              contract: { id: 'k1', ref: 'CTR-2026-00001' },
              previousRegistration: null,
              registration: null,
              replaced: null,
              replacedBy: { id: 'v9', registration: '36974-A-57' },
            },
            {
              id: 'm1',
              kind: 'REGISTRATION_CHANGE',
              number: null,
              effectiveDate: '2026-12-01',
              contract: { id: 'k1', ref: 'CTR-2026-00001' },
              previousRegistration: '11111-A-6',
              registration: '12345-B-6',
              replaced: null,
              replacedBy: null,
            },
          ],
        },
      ],
    });
    renderApp(`/vehicules/${VEHICLE_ID}`);
    const history = (
      await screen.findByRole('heading', { name: 'Historique des avenants' })
    ).closest('section');
    expect(within(history).getByRole('link', { name: '36974-A-57' })).toHaveAttribute(
      'href',
      '/vehicules/v9',
    );
    expect(within(history).getByText(/Immatriculation 11111-A-6 → 12345-B-6/)).toBeInTheDocument();
    expect(within(history).getAllByRole('link', { name: 'CTR-2026-00001' })).toHaveLength(2);
    expect(
      screen.getByText(/Remplacé par avenant n° 2600012345 sur CTR-2026-00001/),
    ).toBeInTheDocument();
  });
});
