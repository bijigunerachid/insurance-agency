import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { me, mockApi } from './mockApi.js';
import { phoneScreen } from './phoneScreen.js';
import { renderApp } from './renderApp.jsx';

const CUSTOMER_ID = '00000000-0000-4000-8000-0000000000c1';
const agentMe = () =>
  me({ role: 'AGENT', permissions: ['customers.read', 'customers.reveal', 'customers.write'] });

const customer = {
  id: CUSTOMER_ID,
  ref: 'CLI-000001',
  type: 'INDIVIDUAL',
  displayName: 'Karim Alaoui',
  firstName: 'Karim',
  lastName: 'Alaoui',
  legalName: null,
  ice: null,
  identityType: 'CIN',
  identityNumber: 'AB****56',
  identityMasked: true,
  phone: '+212612345678',
  email: null,
  addressLine: null,
  city: 'Casablanca',
  assignedUser: { id: 'u2', displayName: 'Samira Agent' },
  archivedAt: null,
  archiveReason: null,
  createdAt: '2026-10-22T09:00:00.000Z',
  version: 1,
};

const listItem = {
  id: CUSTOMER_ID,
  ref: 'CLI-000001',
  type: 'INDIVIDUAL',
  displayName: 'Karim Alaoui',
  phone: '+212612345678',
  city: 'Casablanca',
  assignedUser: { id: 'u2', displayName: 'Samira Agent' },
  archivedAt: null,
};
const page = (items) => [200, { items, total: items.length, page: 1, pageSize: 25, pageCount: 1 }];

describe('customers', () => {
  it('lists customers without identity numbers and offers creation to agents', async () => {
    mockApi({
      'GET /api/auth/me': () => [200, agentMe()],
      'GET /api/customers?archived=exclude&page=1': () => page([listItem]),
    });
    renderApp('/clients');
    const row = (await screen.findByRole('link', { name: 'Karim Alaoui' })).closest('tr');
    expect(within(row).getByText('CLI-000001')).toBeInTheDocument();
    expect(within(row).getByText('Samira Agent')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Nouveau client' })).toBeInTheDocument();
  });

  it('on a phone, shows one card per customer that calls, the filters behind one button', async () => {
    const restore = phoneScreen();
    try {
      mockApi({
        'GET /api/auth/me': () => [200, agentMe()],
        'GET /api/customers?archived=exclude&page=1': () =>
          page([{ ...listItem, activeContracts: 2 }]),
        'GET /api/customers?archived=exclude&page=1&type=BUSINESS': () => page([]),
      });
      renderApp('/clients');
      const user = userEvent.setup();
      const card = (await screen.findByRole('link', { name: 'Karim Alaoui' })).closest('li');
      expect(screen.queryByRole('table')).toBeNull();
      expect(card).toHaveTextContent('CLI-000001 · Casablanca');
      expect(card).toHaveTextContent('2 contrats émis');
      expect(card).toHaveTextContent('Samira Agent');
      expect(within(card).getByRole('link', { name: '06 12 34 56 78' })).toHaveAttribute(
        'href',
        'tel:+212612345678',
      );

      const filters = screen.getByRole('button', { name: 'Filtres' });
      expect(screen.getByLabelText('Type')).not.toBeVisible();
      await user.click(filters);
      expect(filters).toHaveAttribute('aria-expanded', 'true');
      await user.selectOptions(screen.getByLabelText('Type'), 'BUSINESS');
      expect(await screen.findByText('Aucun résultat.')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Filtres (1)' })).toBeInTheDocument();
    } finally {
      restore();
    }
  });

  it('shows no creation button to an auditor', async () => {
    mockApi({
      'GET /api/auth/me': () => [200, me({ role: 'AGENT', permissions: ['customers.read'] })],
      'GET /api/customers?archived=exclude&page=1': () => page([]),
    });
    renderApp('/clients');
    expect(await screen.findByText('Aucun résultat.')).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Nouveau client' })).not.toBeInTheDocument();
  });

  it('shows field errors from the server, then handles a suspected duplicate', async () => {
    let attempt = 0;
    const fetchMock = mockApi({
      'GET /api/auth/me': () => [200, agentMe()],
      'POST /api/customers': () => {
        attempt += 1;
        if (attempt === 1) {
          return [
            400,
            {
              error: {
                code: 'VALIDATION_ERROR',
                details: [{ path: 'phone', rule: 'INVALID_PHONE' }],
              },
            },
          ];
        }
        if (attempt === 2) {
          return [
            409,
            {
              error: {
                code: 'DUPLICATE_SUSPECTED',
                details: {
                  candidates: [
                    {
                      id: 'other',
                      ref: 'CLI-000009',
                      displayName: 'Karim Alaoui',
                      matchedOn: 'name',
                    },
                  ],
                },
              },
            },
          ];
        }
        return [201, customer];
      },
      [`GET /api/customers/${CUSTOMER_ID}`]: () => [200, customer],
    });
    renderApp('/clients/nouveau');
    const user = userEvent.setup();

    await user.type(await screen.findByLabelText('Prénom'), 'Karim');
    await user.type(screen.getByLabelText('Nom'), 'Alaoui');
    await user.type(screen.getByLabelText('Téléphone'), '123');
    await user.click(screen.getByRole('button', { name: 'Enregistrer' }));
    expect(await screen.findByText('Numéro de téléphone non reconnu.')).toBeInTheDocument();
    expect(screen.getByLabelText('Téléphone')).toHaveAttribute('aria-invalid', 'true');

    await user.click(screen.getByRole('button', { name: 'Enregistrer' }));
    const dialog = await screen.findByRole('dialog', { name: 'Client semblable trouvé' });
    expect(within(dialog).getByText(/CLI-000009 · même nom/)).toBeInTheDocument();
    await user.click(
      within(dialog).getByRole('button', { name: 'Ce n’est pas le même client : enregistrer' }),
    );

    expect(await screen.findByRole('heading', { name: 'Karim Alaoui' })).toBeInTheDocument();
    const posts = fetchMock.mock.calls.filter(
      ([url, init]) => url === '/api/customers' && init.method === 'POST',
    );
    expect(JSON.parse(posts[2][1].body)).toMatchObject({
      type: 'INDIVIDUAL',
      firstName: 'Karim',
      lastName: 'Alaoui',
      confirmNotDuplicate: true,
    });
    expect(JSON.parse(posts[0][1].body)).not.toHaveProperty('legalName');
  });

  it('switches to company fields for a business', async () => {
    mockApi({ 'GET /api/auth/me': () => [200, agentMe()] });
    renderApp('/clients/nouveau');
    const user = userEvent.setup();
    await user.click(await screen.findByLabelText('Entreprise'));
    expect(screen.getByLabelText('Raison sociale')).toBeInTheDocument();
    expect(screen.getByLabelText('ICE')).toBeInTheDocument();
    expect(screen.queryByLabelText('Prénom')).not.toBeInTheDocument();
  });

  it('warns before leaving a form with unsaved changes', async () => {
    mockApi({
      'GET /api/auth/me': () => [200, agentMe()],
      'GET /api/customers?archived=exclude&page=1': () => page([]),
    });
    renderApp('/clients/nouveau');
    const user = userEvent.setup();
    await user.type(await screen.findByLabelText('Prénom'), 'Karim');

    await user.click(screen.getByRole('link', { name: 'Retour aux clients' }));
    const dialog = await screen.findByRole('dialog', { name: 'Quitter sans enregistrer ?' });
    await user.click(within(dialog).getByRole('button', { name: 'Annuler' }));
    expect(screen.getByLabelText('Prénom')).toHaveValue('Karim');

    await user.click(screen.getByRole('link', { name: 'Retour aux clients' }));
    await user.click(
      within(await screen.findByRole('dialog', { name: 'Quitter sans enregistrer ?' })).getByRole(
        'button',
        { name: 'Quitter la page' },
      ),
    );
    expect(await screen.findByRole('heading', { name: 'Clients' })).toBeInTheDocument();
  });

  it('keeps the save bar in reach and says how many changes wait to be saved', async () => {
    mockApi({
      'GET /api/auth/me': () => [200, agentMe()],
      [`GET /api/customers/${CUSTOMER_ID}`]: () => [200, customer],
    });
    renderApp(`/clients/${CUSTOMER_ID}/modifier`);
    const user = userEvent.setup();
    const city = await screen.findByLabelText('Ville');
    const save = screen.getByRole('button', { name: 'Enregistrer' });
    const bar = save.parentElement;
    expect(bar).toHaveClass('sticky');
    expect(bar).toHaveTextContent('Aucune modification');
    expect(save).toBeDisabled();
    await user.clear(city);
    await user.type(city, 'Rabat');
    expect(bar).toHaveTextContent('1 modification à enregistrer');
    expect(save).toBeEnabled();
  });

  it('reveals a masked identity number after a stated reason', async () => {
    const fetchMock = mockApi({
      'GET /api/auth/me': () => [200, agentMe()],
      [`GET /api/customers/${CUSTOMER_ID}`]: () => [200, customer],
      [`POST /api/customers/${CUSTOMER_ID}/reveal-identity`]: () => [
        200,
        { identityType: 'CIN', identityNumber: 'AB123456' },
      ],
    });
    renderApp(`/clients/${CUSTOMER_ID}`);
    const user = userEvent.setup();

    expect(await screen.findByText('AB****56')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Afficher le numéro' }));
    const dialog = screen.getByRole('dialog', { name: 'Afficher la pièce d’identité' });
    const confirm = within(dialog).getByRole('button', { name: 'Afficher le numéro' });
    expect(confirm).toBeDisabled();
    await user.type(within(dialog).getByLabelText('Motif'), 'Avenant au guichet');
    await user.click(confirm);

    expect(await screen.findByText('AB123456')).toBeInTheDocument();
    await waitFor(() =>
      expect(
        screen.queryByRole('dialog', { name: 'Afficher la pièce d’identité' }),
      ).not.toBeInTheDocument(),
    );
    const call = fetchMock.mock.calls.find(([url]) => url.endsWith('/reveal-identity'));
    expect(JSON.parse(call[1].body)).toEqual({ reason: 'Avenant au guichet' });
  });
});
