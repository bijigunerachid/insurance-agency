import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { me, mockApi } from './mockApi.js';
import { renderApp } from './renderApp.jsx';

const CONTRACT_ID = '00000000-0000-4000-8000-0000000000f1';
const DOCUMENT_ID = '00000000-0000-4000-8000-0000000000c1';
const as = (role, permissions) => () => [200, me({ role, permissions })];
const agent = as('AGENT', [
  'contracts.read',
  'documents.read',
  'documents.download',
  'documents.upload',
]);
const manager = as('ADMIN', [
  'contracts.read',
  'documents.read',
  'documents.download',
  'documents.upload',
  'documents.remove',
]);
const auditor = as('AGENT', ['contracts.read', 'documents.read']);

const contract = {
  id: CONTRACT_ID,
  ref: 'CTR-2026-00001',
  status: 'ISSUED',
  period: 'ACTIVE',
  customer: { id: 'cu1', ref: 'CLI-000001', displayName: 'Sara Test' },
  product: { id: 'p1', name: 'Véhicules de tourisme', line: 'CAR', insurerCode: null },
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
const document = {
  id: DOCUMENT_ID,
  contractId: CONTRACT_ID,
  type: 'ATTESTATION',
  originalName: 'Attestation 14 P.pdf',
  mimeType: 'application/pdf',
  size: 245_760,
  uploadedAt: '2026-10-24T10:00:00.000Z',
  uploadedBy: { id: 'u1', displayName: 'Karim Test' },
  replaces: null,
  replacedBy: null,
  removal: null,
};
const routes = (meRoute, documents, extra = {}) => ({
  'GET /api/auth/me': meRoute,
  [`GET /api/contracts/${CONTRACT_ID}`]: () => [200, contract],
  [`GET /api/contracts/${CONTRACT_ID}/documents`]: () => [200, { items: documents() }],
  ...extra,
});
const pdfFile = (name = 'Quittance RMA.pdf') =>
  new File(['%PDF-1.7\n'], name, { type: 'application/pdf' });

describe('documents of the insurer on a contract', () => {
  it('attaches a scan with its type and lists it with a link to open it', async () => {
    let items = [];
    const fetchMock = mockApi(
      routes(agent, () => items, {
        [`POST /api/contracts/${CONTRACT_ID}/documents?type=QUITTANCE`]: () => {
          items = [{ ...document, type: 'QUITTANCE', originalName: 'Quittance RMA.pdf' }];
          return [201, items[0]];
        },
      }),
    );
    renderApp(`/contrats/${CONTRACT_ID}`);
    const user = userEvent.setup();

    const section = await screen.findByRole('region', { name: 'Documents de l’assureur' });
    expect(await within(section).findByText('Aucun document joint.')).toBeInTheDocument();
    await user.click(within(section).getByRole('button', { name: 'Joindre un document' }));
    const dialog = screen.getByRole('dialog', { name: 'Joindre un document de l’assureur' });
    await user.selectOptions(within(dialog).getByLabelText('Type de document'), 'Quittance');
    const submit = within(dialog).getByRole('button', { name: 'Joindre' });
    expect(submit).toBeDisabled();
    const file = pdfFile();
    await user.upload(within(dialog).getByLabelText('Fichier'), file);
    await user.click(submit);

    const link = await within(section).findByRole('link', { name: 'Quittance RMA.pdf' });
    expect(link).toHaveAttribute('href', `/api/documents/${DOCUMENT_ID}/file`);
    expect(within(section).getByRole('link', { name: 'Saisir les informations' })).toHaveAttribute(
      'href',
      `/documents/${DOCUMENT_ID}/saisie`,
    );
    expect(within(section).getByText(/240 Ko/)).toBeInTheDocument();
    expect(within(section).queryByRole('button', { name: 'Retirer' })).toBeNull();
    const [, init] = fetchMock.mock.calls.find(([, i]) => i?.method === 'POST');
    expect(init.body).toBe(file);
    expect(init.headers).toMatchObject({
      'Content-Type': 'application/pdf',
      'X-File-Name': encodeURIComponent('Quittance RMA.pdf'),
      'X-CSRF-Token': 'csrf-test-token',
    });
  });

  it('refuses a file that is not a PDF, JPEG or PNG before sending it', async () => {
    mockApi(routes(agent, () => []));
    renderApp(`/contrats/${CONTRACT_ID}`);
    const user = userEvent.setup({ applyAccept: false });

    const section = await screen.findByRole('region', { name: 'Documents de l’assureur' });
    await user.click(within(section).getByRole('button', { name: 'Joindre un document' }));
    const dialog = screen.getByRole('dialog', { name: 'Joindre un document de l’assureur' });
    await user.upload(
      within(dialog).getByLabelText('Fichier'),
      new File(['<html>'], 'page.html', { type: 'text/html' }),
    );
    expect(within(dialog).getByText('Choisissez un fichier PDF, JPEG ou PNG.')).toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: 'Joindre' })).toBeDisabled();
  });

  it('lets management remove a document with a reason', async () => {
    let items = [document];
    const fetchMock = mockApi(
      routes(manager, () => items, {
        [`POST /api/documents/${DOCUMENT_ID}/remove`]: () => {
          items = [
            {
              ...document,
              removal: {
                at: '2026-10-24T11:00:00.000Z',
                by: { id: 'u1', displayName: 'Karim Test' },
                reason: 'Mauvais contrat',
              },
            },
          ];
          return [200, items[0]];
        },
      }),
    );
    renderApp(`/contrats/${CONTRACT_ID}`);
    const user = userEvent.setup();

    const section = await screen.findByRole('region', { name: 'Documents de l’assureur' });
    await user.click(await within(section).findByRole('button', { name: 'Retirer' }));
    const dialog = screen.getByRole('dialog', { name: 'Retirer « Attestation 14 P.pdf »' });
    await user.type(within(dialog).getByRole('textbox'), 'Mauvais contrat');
    await user.click(within(dialog).getByRole('button', { name: 'Retirer' }));

    expect(await within(section).findByText('Retiré : Mauvais contrat')).toBeInTheDocument();
    // A removed document can no longer be opened.
    expect(within(section).queryByRole('link', { name: 'Attestation 14 P.pdf' })).toBeNull();
    const [, init] = fetchMock.mock.calls.find(([, i]) => i?.method === 'POST');
    expect(JSON.parse(init.body)).toEqual({ reason: 'Mauvais contrat' });
  });

  it('shows an auditor which documents exist, without opening or adding any', async () => {
    mockApi(routes(auditor, () => [document]));
    renderApp(`/contrats/${CONTRACT_ID}`);
    const section = await screen.findByRole('region', { name: 'Documents de l’assureur' });
    expect(await within(section).findByText('Attestation 14 P.pdf')).toBeInTheDocument();
    expect(within(section).queryByRole('link')).toBeNull();
    expect(within(section).queryByRole('button')).toBeNull();
  });
});

describe('documents of the insurer on the new design', () => {
  it('keeps its heading and its action while loading, then says when nothing is attached', async () => {
    let answer;
    const first = new Promise((resolve) => {
      answer = resolve;
    });
    mockApi({
      ...routes(agent, () => []),
      [`GET /api/contracts/${CONTRACT_ID}/documents`]: () => first,
    });
    renderApp(`/contrats/${CONTRACT_ID}`);
    const section = await screen.findByRole('region', { name: 'Documents de l’assureur' });
    expect(within(section).getByRole('status')).toHaveTextContent('Chargement…');
    expect(within(section).getByRole('button', { name: 'Joindre un document' })).toBeEnabled();

    answer([200, { items: [] }]);
    expect(await within(section).findByText('Aucun document joint.')).toBeInTheDocument();
  });

  it('says why the documents could not be loaded, under its heading', async () => {
    mockApi({
      ...routes(agent, () => []),
      [`GET /api/contracts/${CONTRACT_ID}/documents`]: () => [500, { error: { code: 'INTERNAL' } }],
    });
    renderApp(`/contrats/${CONTRACT_ID}`);
    const section = await screen.findByRole('region', { name: 'Documents de l’assureur' });
    expect(await within(section).findByRole('alert')).toBeInTheDocument();
  });
});
