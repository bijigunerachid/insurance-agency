import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { me, mockApi } from './mockApi.js';
import { renderApp } from './renderApp.jsx';

const as = (role, permissions) => () => [200, me({ role, permissions })];
const agent = as('AGENT', ['stock.read']);
const manager = as('ADMIN', ['stock.read', 'stock.manage']);

const series14A = {
  id: 's-14a',
  code: '14 A',
  insurer: { id: 'i-rma', code: 'RMA' },
  model: { code: 'A', label: 'Tourisme', officialNumber: 1, colour: 'jaune' },
};
const counts = {
  AVAILABLE: 4,
  ASSIGNED: 5,
  USED: 0,
  RETURNED: 1,
  DAMAGED: 0,
  LOST: 0,
  CANCELLED: 0,
};
const stockRoutes = (meRoute, extra = {}) => ({
  'GET /api/auth/me': meRoute,
  'GET /api/attestation-stock/summary': () => [
    200,
    {
      series: [{ series: series14A, counts, total: 10 }],
      assigned: [{ holder: { id: 'u1', displayName: 'Nadia Agent' }, series: series14A, count: 5 }],
    },
  ],
  'GET /api/attestation-batches': () => [200, { items: [] }],
  'GET /api/attestation-forms?page=1': () => [
    200,
    {
      items: [
        {
          id: 'f1',
          series: series14A,
          number: '000000101',
          status: 'ASSIGNED',
          holder: { id: 'u1', displayName: 'Nadia Agent' },
          contract: null,
          version: 2,
        },
      ],
      total: 1,
      page: 1,
      pageSize: 25,
      pageCount: 1,
    },
  ],
  ...extra,
});

describe('attestation stock', () => {
  it('shows the stock per series and per employee, read-only for an agent', async () => {
    mockApi(stockRoutes(agent));
    renderApp('/stock');

    const summary = await screen.findByRole('region', { name: 'État du stock' });
    const row = await within(summary).findByRole('row', { name: /RMA 14 A/ });
    expect(
      within(row)
        .getAllByRole('cell')
        .map((cell) => cell.textContent),
    ).toEqual(['4', '5', '0', '1', '0', '0', '0', '10']);
    expect(within(summary).getByText('Nadia Agent')).toBeInTheDocument();
    expect(await screen.findByText('RMA 14 A n° 000000101')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Réceptionner un lot' })).not.toBeInTheDocument();
  });

  it('receives a batch and explains numbers already in stock', async () => {
    const fetchMock = mockApi(
      stockRoutes(manager, {
        'GET /api/attestation-series': () => [
          200,
          { items: [{ ...series14A, status: 'CONFIRMED', active: true }] },
        ],
        'GET /api/attestation-stock/holders': () => [
          200,
          { items: [{ id: 'u2', displayName: 'Karim Gérant' }] },
        ],
        'POST /api/attestation-batches': () => [
          409,
          {
            error: {
              code: 'FORMS_ALREADY_IN_STOCK',
              details: { count: 1, numbers: [{ number: '000000110', status: 'AVAILABLE' }] },
            },
          },
        ],
      }),
    );
    renderApp('/stock');
    const user = userEvent.setup();

    await user.click(await screen.findByRole('button', { name: 'Réceptionner un lot' }));
    const dialog = await screen.findByRole('dialog', { name: 'Réceptionner un lot' });
    await user.selectOptions(await within(dialog).findByLabelText('Série'), 'RMA 14 A · Tourisme');
    await user.type(within(dialog).getByLabelText('Premier numéro'), '000000110');
    await user.type(within(dialog).getByLabelText('Dernier numéro'), '000000120');
    await user.type(within(dialog).getByLabelText('Reçu le'), '2026-10-20');
    await user.type(within(dialog).getByLabelText('Lieu de rangement'), 'Armoire fermée');
    await user.selectOptions(await within(dialog).findByLabelText('Responsable'), 'Karim Gérant');
    await user.click(within(dialog).getByRole('button', { name: 'Réceptionner un lot' }));

    expect(
      await within(dialog).findByText('Une partie de ces numéros est déjà en stock.'),
    ).toBeInTheDocument();
    expect(within(dialog).getByText('Par exemple : 000000110')).toBeInTheDocument();
    const call = fetchMock.mock.calls.find(
      ([url, init]) => url === '/api/attestation-batches' && init?.method === 'POST',
    );
    expect(JSON.parse(call[1].body)).toEqual({
      seriesId: 's-14a',
      firstNumber: '000000110',
      lastNumber: '000000120',
      receivedOn: '2026-10-20',
      insurerReference: '',
      location: 'Armoire fermée',
      holderId: 'u2',
    });
  });

  it('asks for a reason before declaring forms damaged', async () => {
    const fetchMock = mockApi(
      stockRoutes(manager, {
        'POST /api/attestation-forms/move': () => [200, { count: 1 }],
      }),
    );
    renderApp('/stock');
    const user = userEvent.setup();

    await user.click(await screen.findByRole('button', { name: 'Enregistrer un mouvement' }));
    const dialog = screen.getByRole('dialog', { name: 'Enregistrer un mouvement' });
    await user.selectOptions(within(dialog).getByLabelText('Mouvement'), 'Déclarer abîmé');
    await user.type(within(dialog).getByLabelText('Premier numéro'), '000000106');
    await user.type(within(dialog).getByLabelText('Dernier numéro'), '000000106');
    const submit = within(dialog).getByRole('button', { name: 'Déclarer abîmé' });
    expect(submit).toBeDisabled();
    expect(within(dialog).queryByLabelText('Responsable')).not.toBeInTheDocument();
    await user.type(within(dialog).getByLabelText('Motif'), 'Imprimante bloquée');
    await user.click(submit);

    expect(await screen.findByText('1 formulaire mis à jour.')).toBeInTheDocument();
    const call = fetchMock.mock.calls.find(([url]) => url === '/api/attestation-forms/move');
    expect(JSON.parse(call[1].body)).toEqual({
      seriesId: 's-14a',
      firstNumber: '000000106',
      lastNumber: '000000106',
      to: 'DAMAGED',
      reason: 'Imprimante bloquée',
    });
  });
});

describe('the stock page on the new design', () => {
  it('says when no batch was received', async () => {
    mockApi(stockRoutes(agent));
    renderApp('/stock');
    const batches = await screen.findByRole('region', { name: 'Lots reçus' });
    expect(await within(batches).findByText('Aucun lot reçu pour l’instant.')).toBeInTheDocument();
  });

  it('shows the batches error in its own part, the rest of the page still there', async () => {
    mockApi(
      stockRoutes(agent, {
        'GET /api/attestation-batches': () => [500, { error: { code: 'INTERNAL' } }],
      }),
    );
    renderApp('/stock');
    const batches = await screen.findByRole('region', { name: 'Lots reçus' });
    expect(await within(batches).findByRole('alert')).toBeInTheDocument();
    expect(
      await screen.findByRole('region', { name: 'Rechercher un formulaire' }),
    ).toBeInTheDocument();
  });

  it('puts the forms in stock first on a series card', async () => {
    mockApi(stockRoutes(agent));
    renderApp('/stock');
    const summary = await screen.findByRole('region', { name: 'État du stock' });
    await within(summary).findByRole('row', { name: /RMA 14 A/ });
    // The phone card (hidden by the page styles on a computer): « 4 En stock » at its top.
    const card = within(summary)
      .getAllByRole('listitem')
      .find((li) => li.textContent.startsWith('RMA 14 A'));
    expect(card.querySelector('.text-2xl')).toHaveTextContent('4');
    expect(card.querySelector('.text-2xl').nextElementSibling).toHaveTextContent('En stock');
  });
});
