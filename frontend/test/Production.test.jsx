import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { me, mockApi } from './mockApi.js';
import { renderApp } from './renderApp.jsx';

const as = (role, permissions) => () => [200, me({ role, permissions })];
const agent = as('AGENT', ['production.read', 'contracts.read']);
const manager = as('ADMIN', ['production.read', 'production.all', 'reports.export']);

const row = (overrides) => ({
  order: 1,
  id: 'c1',
  policyNumber: 'POL-0001',
  customer: 'Sara Test',
  premium: '1234.50',
  startDate: '2026-11-01',
  endDate: '2027-10-31',
  balance: '734.50',
  collectedOn: '2026-10-22',
  cancelledOn: null,
  operator: 'Agent A',
  status: 'ISSUED',
  ...overrides,
});
const sheet = (overrides = {}) => ({
  agency: { name: 'Agence Essai', acapsNumber: null },
  basis: 'ISSUE',
  from: '2026-10-01',
  to: '2026-10-31',
  insurer: null,
  operator: { id: 'u1', displayName: 'Agent A' },
  payment: null,
  columns: [],
  rows: [
    row(),
    row({
      order: 2,
      id: 'c2',
      policyNumber: 'POL-0002',
      balance: null,
      collectedOn: null,
      cancelledOn: '2026-11-15',
      status: 'CANCELLED',
    }),
  ],
  totals: { count: 2, premium: '1234.50', balance: '734.50', collected: '500.00' },
  ...overrides,
});
const OCTOBER = 'basis=ISSUE&from=2026-10-01&to=2026-10-31';

beforeEach(() => {
  // The page proposes the current month: the test runs on 24/10/2026.
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-10-24T10:00:00Z'));
});
afterEach(() => vi.useRealTimers());

describe('état de production', () => {
  it('shows an agent their production of the month with its totals, to print', async () => {
    const fetchMock = mockApi({
      'GET /api/auth/me': agent,
      [`GET /api/production?${OCTOBER}`]: () => [200, sheet()],
      'GET /api/production?basis=EFFECT&from=2026-10-01&to=2026-10-31&payment=PARTIAL': () => [
        200,
        sheet({ basis: 'EFFECT', payment: 'PARTIAL', rows: [] }),
      ],
    });
    const print = vi.spyOn(window, 'print').mockImplementation(() => {});
    renderApp('/production');
    const user = userEvent.setup();

    expect(await screen.findByRole('heading', { level: 1, name: 'État de production' }));
    const table = await screen.findByRole('table', { name: 'État de production' });
    expect(
      within(table)
        .getAllByRole('columnheader')
        .map((th) => th.textContent),
    ).toEqual([
      'Ordre',
      'N° de police',
      'Client',
      'Prime',
      'Effet',
      'Échéance',
      'Reste',
      'Date encaissée',
      'Annulé le',
      'Opérateur',
    ]);
    const cancelled = within(table).getByRole('row', { name: /POL-0002/ });
    expect(within(cancelled).getByText('15/11/2026')).toBeInTheDocument();
    const footer = within(table).getAllByRole('row').at(-1);
    expect(within(footer).getByText('Totaux')).toBeInTheDocument();
    expect(within(footer).getByText('734,50 MAD')).toBeInTheDocument();
    expect(screen.getByText(/^Encaissement/, { selector: 'p' })).toHaveTextContent(
      'Encaissement : 500,00 MAD',
    );
    expect(screen.getAllByText(/Un contrat annulé reste dans la liste/)[0]).toBeInTheDocument();
    // An agent has no choice of employee, and no Excel file.
    expect(screen.queryByLabelText('Employé')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Exporter en Excel' })).toBeNull();
    await user.click(screen.getByRole('button', { name: 'Imprimer' }));
    expect(print).toHaveBeenCalledOnce();

    // By date of effect, partly paid only.
    await user.click(screen.getByRole('radio', { name: 'Date d’effet' }));
    await user.click(screen.getByRole('radio', { name: 'Payé en partie' }));
    expect(await screen.findByText('Aucun contrat émis sur cette période.')).toBeInTheDocument();
    expect(fetchMock.mock.calls.map(([url]) => url)).toContain(
      '/api/production?basis=EFFECT&from=2026-10-01&to=2026-10-31&payment=PARTIAL',
    );
    // Nothing to print then.
    expect(screen.queryByRole('button', { name: 'Imprimer' })).toBeNull();
  });

  it('lets management choose an employee, and export to Excel', async () => {
    const fetchMock = mockApi({
      'GET /api/auth/me': manager,
      [`GET /api/production?${OCTOBER}`]: () => [200, sheet({ operator: null })],
      'GET /api/production/operators': () => [
        200,
        {
          items: [
            { id: 'u1', displayName: 'Agent A' },
            { id: 'u2', displayName: 'Agent B' },
          ],
        },
      ],
      [`GET /api/production?${OCTOBER}&operatorId=u2`]: () => [
        200,
        sheet({ operator: { id: 'u2', displayName: 'Agent B' } }),
      ],
    });
    renderApp('/production');
    const user = userEvent.setup();
    await screen.findByRole('table', { name: 'État de production' });
    const employee = screen.getByLabelText('Employé');
    await screen.findByRole('option', { name: 'Agent B' });
    expect(
      within(employee)
        .getAllByRole('option')
        .map((o) => o.textContent),
    ).toEqual(['Tous les employés', 'Agent A', 'Agent B']);
    await user.selectOptions(employee, 'Agent B');
    await vi.waitFor(() =>
      expect(fetchMock.mock.calls.map(([url]) => url)).toContain(
        `/api/production?${OCTOBER}&operatorId=u2`,
      ),
    );
    expect(screen.getByRole('button', { name: 'Exporter en Excel' })).toBeInTheDocument();
  });

  it('says when the period is wrong', async () => {
    mockApi({
      'GET /api/auth/me': agent,
      [`GET /api/production?${OCTOBER}`]: () => [200, sheet()],
      'GET /api/production?basis=ISSUE&from=2026-10-01&to=2026-09-30': () => [
        400,
        {
          error: { code: 'VALIDATION_ERROR', details: [{ path: 'to', rule: 'END_BEFORE_START' }] },
        },
      ],
    });
    renderApp('/production');
    const user = userEvent.setup();
    await screen.findByRole('table', { name: 'État de production' });
    const to = screen.getByLabelText('Au');
    await user.clear(to);
    await user.type(to, '2026-09-30');
    expect(to).toHaveAccessibleDescription('La fin de la période est avant son début.');
  });
});
