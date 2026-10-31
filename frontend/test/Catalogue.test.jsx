import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { me, mockApi } from './mockApi.js';
import { renderApp } from './renderApp.jsx';

const RULE_ID = '00000000-0000-4000-8000-0000000000a1';
const as = (role, permissions) => () => [200, me({ role, permissions })];
const agent = as('AGENT', ['catalogue.read']);
const manager = as('ADMIN', ['catalogue.read', 'catalogue.manage']);

const insurers = [
  200,
  {
    items: [
      { id: 'i1', code: 'CAT', name: 'CAT Assurance & Réassurance', active: true, version: 1 },
      {
        id: 'i2',
        code: 'RMA',
        name: 'RMA (Royale Marocaine d’Assurance)',
        active: true,
        version: 1,
      },
    ],
  },
];
const model = (code, label, extra = {}) => ({
  id: `m${code}`,
  code,
  label,
  provisional: false,
  status: 'TO_CONFIRM',
  source: 'Liste des modèles communiquée par l’agence',
  confirmation: null,
  active: true,
  version: 1,
  ...extra,
});
const models = [
  model('A', 'Tourisme'),
  model('C', 'Transport de marchandises'),
  model('G', 'Garagistes', { active: false }),
  model('P', 'Provisoire', { provisional: true, officialNumber: 7, colour: 'rose' }),
];
const summary = ({ code, label, provisional, status }) => ({ code, label, provisional, status });
const usage = {
  id: 'u1',
  label: 'Tourisme',
  model: summary(models[0]),
  status: 'TO_CONFIRM',
  source: 'Attestation RMA série 14 A',
  confirmation: null,
  active: true,
  vehicleCount: 0,
  version: 1,
};
const confirmedUsage = {
  ...usage,
  id: 'u2',
  label: 'Transport de marchandises',
  model: summary(models[1]),
  status: 'CONFIRMED',
  confirmation: {
    at: '2026-10-22T20:48:55.485Z',
    by: { id: 'x', displayName: 'Nadia Gérante' },
    reference: 'Attestation 14 C',
  },
};
const catalogueRoutes = (meRoute, extra = {}) => ({
  'GET /api/auth/me': meRoute,
  'GET /api/insurers': () => insurers,
  'GET /api/attestation-models': () => [200, { items: models }],
  'GET /api/vehicle-usages': () => [200, { items: [usage, confirmedUsage] }],
  'GET /api/insurer-usages': () => [
    200,
    {
      items: [
        ['g1', 'C1', 'C1 (COMMERCE <= 3,5T)', 2],
        ['g2', 'C2', 'C2 (COMMERCE +3,5T)', 0],
      ].map(([id, group, label, vehicleCount]) => ({
        id,
        insurer: { id: 'i1', code: 'RMA' },
        group,
        label,
        usage: { id: confirmedUsage.id, label: 'Transport de marchandises', modelCode: 'C' },
        active: true,
        vehicleCount,
      })),
    },
  ],
  'GET /api/attestation-series': () => [200, { items: [] }],
  'GET /api/products?active=all': () => [200, { items: [] }],
  ...extra,
});

describe('catalogue', () => {
  it('shows what is still to confirm, read-only for an agent', async () => {
    mockApi(catalogueRoutes(agent));
    renderApp('/catalogue');

    const usages = await screen.findByRole('region', { name: 'Usages des véhicules' });
    expect(await within(usages).findByText('Tourisme')).toBeInTheDocument();
    expect(within(usages).getByText('À confirmer')).toBeInTheDocument();
    expect(within(usages).getAllByText(/Attestation RMA série 14 A/)).toHaveLength(2);
    // Who confirmed it, on which day (agency time zone), from which document.
    expect(
      within(usages).getByText('Confirmé par Nadia Gérante le 22/10/2026 · Attestation 14 C'),
    ).toBeInTheDocument();
    expect(await screen.findByText(/Aucun produit/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Ajouter/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Confirmer' })).not.toBeInTheDocument();
  });

  it('shows the insurer’s own usages under their platform headings, with their attestation', async () => {
    mockApi(catalogueRoutes(agent));
    renderApp('/catalogue');

    const gama = await screen.findByRole('region', { name: 'Usages de l’assureur' });
    const c1 = await within(gama).findByText('RMA · C1 (1)');
    await userEvent.setup().click(c1);
    expect(within(gama).getByText('C1 (COMMERCE <= 3,5T)')).toBeVisible();
    expect(
      within(gama).getByText('Attestation : Transport de marchandises (modèle C) · 2 véhicules'),
    ).toBeVisible();
    expect(within(gama).getByText('RMA · C2 (1)')).toBeInTheDocument();
  });

  it('confirms a usage with the reference of the document', async () => {
    const fetchMock = mockApi(
      catalogueRoutes(manager, {
        'POST /api/vehicle-usages/u1/confirm': () => [200, { ...usage, status: 'CONFIRMED' }],
      }),
    );
    renderApp('/catalogue');
    const user = userEvent.setup();

    const usages = await screen.findByRole('region', { name: 'Usages des véhicules' });
    await user.click((await within(usages).findAllByRole('button', { name: 'Confirmer' }))[0]);
    const dialog = screen.getByRole('dialog', { name: /Confirmer cet élément : Tourisme/ });
    const submit = within(dialog).getByRole('button', { name: 'Confirmer' });
    expect(submit).toBeDisabled();
    await user.type(within(dialog).getByLabelText('Document de référence'), 'Attestation 14 A');
    await user.click(submit);

    const call = fetchMock.mock.calls.find(([url]) => url === '/api/vehicle-usages/u1/confirm');
    expect(JSON.parse(call[1].body)).toEqual({ reference: 'Attestation 14 A', version: 1 });
  });

  it('lists the shared models and lets a usage take any active, non-provisional one', async () => {
    const fetchMock = mockApi(
      catalogueRoutes(manager, {
        'PATCH /api/vehicle-usages/u1': () => [200, usage],
      }),
    );
    renderApp('/catalogue');
    const user = userEvent.setup();

    const section = await screen.findByRole('region', { name: 'Modèles d’attestation' });
    const named = (text) => (_, el) => el?.tagName === 'P' && el.textContent.startsWith(text);
    const provisional = (await within(section).findByText(named('P · Provisoire'))).closest('li');
    expect(within(provisional).getByText('Provisoire', { selector: 'span' })).toBeInTheDocument();
    // Number and colour of arrêté 213-05 (rule L24).
    expect(within(provisional).getByText('Modèle officiel n° 7 · rose')).toBeInTheDocument();
    const tourisme = within(section).getByText(named('A · Tourisme')).closest('li');
    expect(within(tourisme).queryByText('Provisoire')).not.toBeInTheDocument();
    const usages = screen.getByRole('region', { name: 'Usages des véhicules' });
    expect(await within(usages).findByText(/Modèle A · Tourisme/)).toBeInTheDocument();

    await user.click((await within(usages).findAllByRole('button', { name: 'Modifier' }))[0]);
    const form = screen.getByRole('dialog', { name: 'Modifier l’usage' });
    const select = within(form).getByLabelText('Modèle d’attestation');
    expect(
      within(select)
        .getAllByRole('option')
        .map((o) => o.textContent),
    ).toEqual(['Non indiqué', 'Modèle A · Tourisme', 'Modèle C · Transport de marchandises']);
    await user.selectOptions(select, 'Modèle C · Transport de marchandises');
    await user.click(within(form).getByRole('button', { name: 'Enregistrer' }));
    const call = fetchMock.mock.calls.find(([url]) => url === '/api/vehicle-usages/u1');
    expect(JSON.parse(call[1].body)).toEqual({ modelCode: 'C', version: 1 });
  });

  it('lets a manager choose the model of a series (configuration, not a fixed rule)', async () => {
    const series = {
      id: 's1',
      insurer: { id: 'i2', code: 'RMA', name: 'RMA' },
      code: '14 A',
      model: summary(models[0]),
      status: 'CONFIRMED',
      source: 'Attestation RMA 14 A',
      confirmation: {
        at: '2026-10-23T10:00:00.000Z',
        by: { displayName: 'Karim' },
        reference: 'Doc',
      },
      active: true,
      version: 2,
    };
    const fetchMock = mockApi(
      catalogueRoutes(manager, {
        'GET /api/attestation-series': () => [200, { items: [series] }],
        'PATCH /api/attestation-series/s1': () => [200, series],
      }),
    );
    renderApp('/catalogue');
    const user = userEvent.setup();

    const section = await screen.findByRole('region', { name: 'Séries d’attestation' });
    await user.click(await within(section).findByRole('button', { name: 'Modifier' }));
    const form = screen.getByRole('dialog', { name: 'Modifier la série' });
    const select = within(form).getByLabelText('Modèle d’attestation');
    expect(select).toHaveValue('A');
    // Active models only (G is deactivated).
    expect(
      within(select)
        .getAllByRole('option')
        .map((o) => o.textContent),
    ).toEqual([
      'Modèle A · Tourisme',
      'Modèle C · Transport de marchandises',
      'Modèle P · Provisoire',
    ]);
    // Changing the model of a confirmed series asks for a new confirmation.
    expect(within(form).getByText(/nouvelle confirmation/)).toBeInTheDocument();
    await user.selectOptions(select, 'Modèle C · Transport de marchandises');
    await user.click(within(form).getByRole('button', { name: 'Enregistrer' }));
    const call = fetchMock.mock.calls.find(([, init]) => init?.method === 'PATCH');
    expect(JSON.parse(call[1].body)).toEqual({ modelCode: 'C', version: 2 });
  });

  it('explains a series letter that matches no model', async () => {
    mockApi(
      catalogueRoutes(manager, {
        'POST /api/attestation-series': () => [
          400,
          {
            error: { code: 'VALIDATION_ERROR', details: [{ path: 'code', rule: 'UNKNOWN_MODEL' }] },
          },
        ],
      }),
    );
    renderApp('/catalogue');
    const user = userEvent.setup();

    const section = await screen.findByRole('region', { name: 'Séries d’attestation' });
    await user.click(await within(section).findByRole('button', { name: 'Ajouter une série' }));
    const form = screen.getByRole('dialog', { name: 'Ajouter une série' });
    await user.type(within(form).getByLabelText(/^Série/), '91 X');
    await user.type(within(form).getByLabelText(/^Source/), 'Formulaire CAT');
    await user.click(within(form).getByRole('button', { name: 'Enregistrer' }));
    expect(
      await within(form).findByText('Aucun modèle d’attestation ne porte cette lettre.'),
    ).toBeInTheDocument();
  });

  it('asks before activating a third insurer (rule L1)', async () => {
    let posts = 0;
    const fetchMock = mockApi(
      catalogueRoutes(manager, {
        'POST /api/insurers': () => {
          posts += 1;
          return posts === 1
            ? [409, { error: { code: 'INSURER_LIMIT', details: { activeCount: 2, max: 2 } } }]
            : [201, { id: 'i3', code: 'AXA', name: 'Assureur test', active: true, version: 1 }];
        },
      }),
    );
    renderApp('/catalogue');
    const user = userEvent.setup();

    const section = await screen.findByRole('region', { name: 'Assureurs' });
    await user.click(within(section).getByRole('button', { name: 'Ajouter un assureur' }));
    const form = screen.getByRole('dialog', { name: 'Ajouter un assureur' });
    await user.type(within(form).getByLabelText('Code'), 'AXA');
    await user.type(within(form).getByLabelText('Nom'), 'Assureur test');
    await user.click(within(form).getByRole('button', { name: 'Enregistrer' }));

    const warning = await screen.findByRole('dialog', { name: 'Troisième assureur' });
    expect(within(warning).getByText(/loi 17-99, art. 292/)).toBeInTheDocument();
    await user.click(within(warning).getByRole('button', { name: 'Continuer quand même' }));

    const bodies = fetchMock.mock.calls
      .filter(([url, init]) => url === '/api/insurers' && init.method === 'POST')
      .map(([, init]) => JSON.parse(init.body));
    expect(bodies).toEqual([
      { code: 'AXA', name: 'Assureur test' },
      { code: 'AXA', name: 'Assureur test', confirmLimit: true },
    ]);
  });
});

describe('rules register', () => {
  const rule = {
    id: RULE_ID,
    code: 'L23',
    insurer: null,
    statement: 'La période de garantie d’une attestation provisoire est d’un mois au plus.',
    effect: 'Contrôle des attestations provisoires.',
    source: 'Attestations provisoires RMA 14 P et CAT 91 P',
    status: 'DOCUMENT',
    reviewedAt: null,
    reviewedBy: null,
    version: 1,
    reviews: [],
  };

  it('lists rules with their status and source', async () => {
    mockApi({
      'GET /api/auth/me': agent,
      'GET /api/insurers': () => insurers,
      'GET /api/rules': () => [200, { items: [rule] }],
    });
    renderApp('/regles');
    expect(await screen.findByRole('link', { name: 'L23' })).toHaveAttribute(
      'href',
      `/regles/${RULE_ID}`,
    );
    const item = screen.getByRole('link', { name: 'L23' }).closest('li');
    expect(within(item).getByText('Formulaire officiel')).toBeInTheDocument();
    expect(within(item).getByText(/Attestations provisoires RMA 14 P/)).toBeInTheDocument();
    expect(screen.getByText('1 règle')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Nouvelle règle' })).not.toBeInTheDocument();
  });

  it('requires a document reference to mark a rule as confirmed', async () => {
    const fetchMock = mockApi({
      'GET /api/auth/me': manager,
      [`GET /api/rules/${RULE_ID}`]: () => [200, rule],
      [`POST /api/rules/${RULE_ID}/review`]: () => [200, { ...rule, status: 'CONFIRMED' }],
    });
    renderApp(`/regles/${RULE_ID}`);
    const user = userEvent.setup();

    await screen.findByRole('heading', { name: /L23/ });
    await user.selectOptions(screen.getByLabelText('Nouveau statut'), 'Confirmée');
    await user.type(screen.getByLabelText('Note'), 'Mention vue sur les deux modèles');
    await user.click(screen.getByRole('button', { name: 'Enregistrer une revue' }));
    expect(screen.getByText('Ce champ est obligatoire.')).toBeInTheDocument();
    const reviewCalls = () => fetchMock.mock.calls.filter(([url]) => url.endsWith('/review'));
    expect(reviewCalls()).toEqual([]);

    await user.type(screen.getByLabelText('Document de référence *'), 'Attestations 14 P et 91 P');
    await user.click(screen.getByRole('button', { name: 'Enregistrer une revue' }));
    expect(JSON.parse(reviewCalls()[0][1].body)).toEqual({
      status: 'CONFIRMED',
      note: 'Mention vue sur les deux modèles',
      reference: 'Attestations 14 P et 91 P',
      version: 1,
    });
  });
});
