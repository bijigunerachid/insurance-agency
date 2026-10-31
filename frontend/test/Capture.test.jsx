import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { me, mockApi } from './mockApi.js';
import { renderApp } from './renderApp.jsx';

const DOCUMENT_ID = '00000000-0000-4000-8000-0000000000c1';
const CONTRACT_ID = '00000000-0000-4000-8000-0000000000f1';
const as = (role, permissions) => () => [200, me({ role, permissions })];
const agent = as('AGENT', [
  'contracts.read',
  'contracts.write',
  'documents.read',
  'documents.download',
  'documents.capture',
]);

const data = ({ capture = null, checks = [], status = 'ISSUED', version = 4 } = {}) => ({
  document: {
    id: DOCUMENT_ID,
    type: 'CONDITIONS_PARTICULIERES',
    originalName: 'CP RMA.pdf',
    mimeType: 'application/pdf',
  },
  contract: {
    id: CONTRACT_ID,
    ref: 'CTR-2026-00001',
    status,
    version,
    correctable: status === 'ISSUED',
  },
  capture,
  checks,
});
const savedCapture = {
  fields: { policyNumber: 'POL-1', premiumTotal: '1300.00' },
  capturedAt: '2026-10-24T10:00:00.000Z',
  capturedBy: { id: 'u1', displayName: 'Karim Test' },
  version: 1,
};
const premiumCheck = {
  field: 'premiumTotal',
  status: 'DIFFERENT',
  captured: '1300.00',
  recorded: '1234.50',
  apply: 'premiumTotal',
};
const customerCheck = {
  field: 'holderName',
  status: 'DIFFERENT',
  captured: 'EL AMRANI Saida',
  recorded: 'Sara Test',
  link: { kind: 'customer', id: 'cu1' },
};

describe('typing a document beside its scan', () => {
  it('saves the printed values, shows the differences and corrects the contract in one click', async () => {
    let current = data();
    const fetchMock = mockApi({
      'GET /api/auth/me': agent,
      [`GET /api/documents/${DOCUMENT_ID}/capture`]: () => [200, current],
      [`PUT /api/documents/${DOCUMENT_ID}/capture`]: () => {
        current = data({ capture: savedCapture, checks: [premiumCheck, customerCheck] });
        return [200, current];
      },
      [`POST /api/documents/${DOCUMENT_ID}/capture/apply`]: () => {
        current = data({
          capture: savedCapture,
          checks: [{ ...premiumCheck, status: 'MATCH', recorded: '1300.00' }, customerCheck],
          version: 5,
        });
        return [200, current];
      },
    });
    renderApp(`/documents/${DOCUMENT_ID}/saisie`);
    const user = userEvent.setup();

    expect(
      await screen.findByRole('heading', { name: 'Saisie : Conditions particulières' }),
    ).toBeInTheDocument();
    expect(screen.getByTitle('CP RMA.pdf')).toHaveAttribute(
      'src',
      `/api/documents/${DOCUMENT_ID}/file`,
    );
    expect(
      screen.getByText('Enregistrez la saisie pour la comparer avec l’application.'),
    ).toBeInTheDocument();
    await user.type(screen.getByLabelText('N° de police'), 'POL-1');
    await user.type(screen.getByLabelText('Prime TTC (MAD)'), '1 300,00');
    await user.click(screen.getByRole('button', { name: 'Enregistrer la saisie' }));

    expect(await screen.findByText('Saisie enregistrée.')).toBeInTheDocument();
    const checks = screen.getByRole('region', { name: 'Comparaison avec l’application' });
    const premium = within(checks).getByText('Prime TTC (MAD)').closest('li');
    expect(within(premium).getByText('Différent')).toBeInTheDocument();
    expect(within(premium).getByText('1 300,00 MAD')).toBeInTheDocument();
    expect(within(premium).getByText('1 234,50 MAD')).toBeInTheDocument();
    // A difference on the customer is corrected on the customer's own page.
    const holder = within(checks).getByText('Nom du propriétaire / souscripteur').closest('li');
    expect(within(holder).getByRole('link', { name: 'Ouvrir la fiche du client' })).toHaveAttribute(
      'href',
      '/clients/cu1',
    );
    expect(within(holder).queryByRole('button')).toBeNull();

    await user.click(within(premium).getByRole('button', { name: 'Corriger le contrat' }));
    // The page reloads from the server: wait for the corrected values.
    await waitFor(() =>
      expect(screen.getByText('Contrat corrigé avec la valeur du document.')).toBeInTheDocument(),
    );
    const puts = fetchMock.mock.calls.filter(([, init]) => init?.method === 'PUT');
    expect(JSON.parse(puts[0][1].body)).toEqual({
      fields: { policyNumber: 'POL-1', premiumTotal: '1 300,00' },
    });
    const apply = fetchMock.mock.calls.find(([, init]) => init?.method === 'POST');
    expect(JSON.parse(apply[1].body)).toEqual({ field: 'premiumTotal', version: 4 });
    expect(screen.getByLabelText('Prime TTC (MAD)')).toHaveValue('1300.00');
  });

  it('shows the field the server refused, and no correction on a contract not yet issued', async () => {
    mockApi({
      'GET /api/auth/me': agent,
      [`GET /api/documents/${DOCUMENT_ID}/capture`]: () => [
        200,
        data({ capture: savedCapture, checks: [premiumCheck], status: 'DRAFT', version: 1 }),
      ],
      [`PUT /api/documents/${DOCUMENT_ID}/capture`]: () => [
        400,
        {
          error: {
            code: 'VALIDATION_ERROR',
            details: [{ path: 'premiumTotal', rule: 'INVALID_AMOUNT' }],
          },
        },
      ],
    });
    renderApp(`/documents/${DOCUMENT_ID}/saisie`);
    const user = userEvent.setup();

    const checks = await screen.findByRole('region', { name: 'Comparaison avec l’application' });
    expect(
      within(checks).getByText('Le contrat n’est pas émis : modifiez-le depuis sa fiche.'),
    ).toBeInTheDocument();
    expect(within(checks).queryByRole('button', { name: 'Corriger le contrat' })).toBeNull();

    const premium = screen.getByLabelText('Prime TTC (MAD)');
    await user.clear(premium);
    await user.type(premium, '12,345');
    await user.click(screen.getByRole('button', { name: 'Enregistrer la saisie' }));
    expect(await screen.findByText('Montant invalide (par exemple 1234,50).')).toBeInTheDocument();
    expect(premium).toHaveAttribute('aria-invalid', 'true');
  });
});
