import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { me, mockApi } from './mockApi.js';
import { renderApp } from './renderApp.jsx';

const as = (role, permissions) => () => [200, me({ role, permissions })];
const manager = as('ADMIN', ['reports.read', 'reports.export']);
const auditor = as('AGENT', ['reports.read']);
const list = {
  items: [
    { name: 'contrats-echeances', title: 'Contrats arrivant à échéance' },
    { name: 'paiements-jour', title: 'Paiements par jour' },
    { name: 'soldes-clients', title: 'Soldes clients à recouvrer' },
  ],
};
const owed = {
  name: 'soldes-clients',
  title: 'Soldes clients à recouvrer',
  columns: [
    { key: 'customer', label: 'Client', type: 'text' },
    { key: 'phone', label: 'Téléphone', type: 'text' },
    { key: 'balance', label: 'Reste à payer (MAD)', type: 'money' },
    { key: 'days', label: 'Jours depuis le début', type: 'int' },
    { key: 'late', label: 'Relance', type: 'text' },
  ],
  rows: [
    {
      customer: 'Sara Test',
      phone: '0600000000',
      balance: '2.64',
      days: 20,
      late: 'Plus de 15 jours',
    },
  ],
  totals: { balance: '2.64' },
};
const expiring = {
  name: 'contrats-echeances',
  title: 'Contrats arrivant à échéance',
  columns: [
    { key: 'endDate', label: 'Échéance', type: 'date' },
    { key: 'ref', label: 'Contrat', type: 'text' },
    { key: 'customer', label: 'Client', type: 'text' },
  ],
  rows: [{ endDate: '2026-10-31', ref: 'CTR-2026-00001', customer: 'Sara Test' }],
  totals: { count: 1 },
};
const perDay = {
  name: 'paiements-jour',
  title: 'Paiements par jour',
  columns: [
    { key: 'day', label: 'Jour', type: 'date' },
    { key: 'count', label: 'Reçus', type: 'int' },
    { key: 'total', label: 'Total (MAD)', type: 'money' },
  ],
  rows: [
    { day: '2026-10-22', count: 3, total: '234.50' },
    { day: '2026-10-23', count: 1, total: '1000.00' },
  ],
  totals: { total: '1234.50' },
};
const PERIOD = 'from=2026-10-01&to=2026-10-31';

beforeEach(() => {
  // The page proposes the current month: the test runs on 24/10/2026.
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-10-24T10:00:00Z'));
  vi.stubGlobal(
    'URL',
    Object.assign(URL, { createObjectURL: () => 'blob:x', revokeObjectURL() {} }),
  );
});
afterEach(() => vi.useRealTimers());

describe('reports', () => {
  it('shows a report of the current month and the totals of another', async () => {
    mockApi({
      'GET /api/auth/me': auditor,
      'GET /api/reports': () => [200, list],
      [`GET /api/reports/contrats-echeances?${PERIOD}`]: () => [200, expiring],
      [`GET /api/reports/paiements-jour?${PERIOD}`]: () => [200, perDay],
    });
    renderApp('/rapports');
    const user = userEvent.setup();

    expect(await screen.findByRole('cell', { name: 'CTR-2026-00001' })).toBeInTheDocument();
    expect(screen.getByRole('cell', { name: '31/10/2026' })).toBeInTheDocument();
    // Exports are for management only.
    expect(screen.queryByRole('button', { name: 'Exporter en CSV' })).toBeNull();

    await user.selectOptions(screen.getByLabelText('Rapport'), 'Paiements par jour');
    const table = await screen.findByRole('table');
    const footer = within(table).getAllByRole('row').at(-1);
    expect(within(footer).getByText('Total')).toBeInTheDocument();
    expect(within(footer).getByText('1 234,50 MAD')).toBeInTheDocument();
    expect(screen.getByText('· 2 lignes')).toBeInTheDocument();
  });

  it('changes the period in one tap: last month, this year', async () => {
    mockApi({
      'GET /api/auth/me': () => auditor(),
      'GET /api/reports': () => [200, list],
      [`GET /api/reports/contrats-echeances?${PERIOD}`]: () => [200, expiring],
      'GET /api/reports/contrats-echeances?from=2026-09-01&to=2026-09-30': () => [
        200,
        { ...expiring, rows: [] },
      ],
      'GET /api/reports/contrats-echeances?from=2026-01-01&to=2026-12-31': () => [200, expiring],
    });
    renderApp('/rapports');
    const user = userEvent.setup();
    await screen.findByRole('cell', { name: 'CTR-2026-00001' });
    const periods = screen.getByRole('group', { name: 'Période rapide' });
    expect(within(periods).getByRole('button', { name: 'Ce mois-ci' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );

    await user.click(within(periods).getByRole('button', { name: 'Mois dernier' }));
    expect(screen.getByLabelText('Du')).toHaveValue('2026-09-01');
    expect(screen.getByLabelText('Au')).toHaveValue('2026-09-30');
    expect(await screen.findByText('Aucune donnée sur cette période.')).toBeInTheDocument();
    expect(within(periods).getByRole('button', { name: 'Mois dernier' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );

    await user.click(within(periods).getByRole('button', { name: 'Cette année' }));
    expect(screen.getByLabelText('Au')).toHaveValue('2026-12-31');
    expect(await screen.findByRole('cell', { name: 'CTR-2026-00001' })).toBeInTheDocument();
  });

  it('shows the balances customers still owe today, with a note that the period is not used', async () => {
    mockApi({
      'GET /api/auth/me': auditor,
      'GET /api/reports': () => [200, list],
      [`GET /api/reports/contrats-echeances?${PERIOD}`]: () => [200, expiring],
      [`GET /api/reports/soldes-clients?${PERIOD}`]: () => [200, owed],
    });
    renderApp('/rapports');
    const user = userEvent.setup();

    await screen.findByRole('cell', { name: 'CTR-2026-00001' });
    await user.selectOptions(screen.getByLabelText('Rapport'), 'Soldes clients à recouvrer');
    expect(await screen.findByRole('cell', { name: 'Plus de 15 jours' })).toBeInTheDocument();
    expect(screen.getByRole('cell', { name: '0600000000' })).toBeInTheDocument();
    expect(
      screen.getByText(/ce que les clients doivent encore aujourd’hui, les plus anciens d’abord/),
    ).toBeInTheDocument();
  });

  it('asks management to confirm their identity before an export, then downloads it', async () => {
    let confirmed = false;
    const fetchMock = mockApi({
      'GET /api/auth/me': manager,
      'GET /api/reports': () => [200, list],
      [`GET /api/reports/contrats-echeances?${PERIOD}`]: () => [200, expiring],
      [`GET /api/reports/contrats-echeances/export?${PERIOD}&format=xlsx`]: () =>
        confirmed
          ? [200, {}]
          : [403, { error: { code: 'REAUTH_REQUIRED', message: 'Confirmez votre identité.' } }],
      'POST /api/auth/reauth': () => {
        confirmed = true;
        return [200, { csrfToken: 'csrf-2' }];
      },
    });
    renderApp('/rapports');
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });

    await user.click(await screen.findByRole('button', { name: 'Exporter en Excel' }));
    const dialog = await screen.findByRole('dialog', { name: 'Confirmer votre identité' });
    await user.type(within(dialog).getByLabelText('Mot de passe'), 'Mot-de-passe-1');
    await user.type(within(dialog).getByLabelText('Code à 6 chiffres'), '123456');
    await user.click(within(dialog).getByRole('button', { name: 'Confirmer' }));

    expect(await screen.findByText('Fichier téléchargé : export')).toBeInTheDocument();
    const exports = fetchMock.mock.calls.filter(([url]) => url.includes('/export?'));
    expect(exports).toHaveLength(2);
  });
});
