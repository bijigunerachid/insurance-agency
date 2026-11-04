import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';
import { anonymous, me, mockApi } from './mockApi.js';
import { renderApp } from './renderApp.jsx';

const RMA = '00000000-0000-4000-8000-0000000000a1';
const CAT = '00000000-0000-4000-8000-0000000000c1';
const cards = [
  {
    id: CAT,
    code: 'CAT',
    name: 'CAT Assurance & Réassurance',
    title: 'CAT Assurance & Réassurance',
    tagline: 'Transport de voyageurs',
    colour: '#00A19A',
    photoCredit: 'Photographe synthétique, CC BY 4.0',
    logo: false,
    photo: true,
  },
  {
    id: RMA,
    code: 'RMA',
    name: 'RMA',
    title: 'RMA Assurance',
    tagline: 'Assurance automobile',
    colour: '#272F65',
    photoCredit: null,
    logo: true,
    photo: false,
  },
];
const agent = () => [
  200,
  me({ role: 'AGENT', permissions: ['contracts.read', 'renewals.read', 'customers.read'] }),
];
const page = { items: [], total: 0, page: 1, pageSize: 25, pageCount: 1 };
const summary = () => [200, { windowDays: 30, mine: 0, mineOverdue: 0, allOpen: 0, next: [] }];
/** The home page, with or without one insurer. */
const home = {
  'GET /api/today': () => [200, { today: '2026-11-04', items: [] }],
  [`GET /api/today?insurerId=${RMA}`]: () => [200, { today: '2026-11-04', items: [] }],
  'GET /api/renewals/summary': summary,
  [`GET /api/renewals/summary?insurerId=${RMA}`]: summary,
};
const requested = (fetchMock) => fetchMock.mock.calls.map(([url]) => url);

beforeEach(() => sessionStorage.clear());

describe('the workspace cards after sign-in', () => {
  it('welcome the user, open one insurer and filter the lists by it', async () => {
    const fetchMock = mockApi({
      'GET /api/auth/me': agent,
      'GET /api/workspaces': () => [200, { items: cards }],
      ...home,
      [`GET /api/contracts?page=1&insurerId=${RMA}`]: () => [200, page],
      'GET /api/contracts?page=1': () => [200, page],
    });
    const { router } = renderApp('/');
    const user = userEvent.setup();

    expect(await screen.findByRole('heading', { name: 'Bienvenue, Karim Test' })).toBeVisible();
    expect(screen.getByText('Choisissez votre espace de travail')).toBeVisible();
    const list = screen.getByRole('list', { name: 'Espaces de travail' });
    const rma = within(list).getByRole('button', { name: 'Accéder à l’espace RMA' });
    expect(rma).toHaveAccessibleDescription('RMA Assurance Assurance automobile');
    // The logo from the settings, the photo and its credit; the colour as a CSS variable.
    expect(rma.querySelector('img')).toHaveAttribute('src', '/api/workspaces/RMA/logo');
    expect(rma.style.getPropertyValue('--brand')).toBe('#272F65');
    const cat = within(list).getByRole('button', { name: 'Accéder à l’espace CAT' });
    expect(cat.querySelector('img')).toHaveAttribute('src', '/api/workspaces/CAT/photo');
    expect(within(cat).getByText('Photo : Photographe synthétique, CC BY 4.0')).toBeVisible();
    expect(screen.getByRole('button', { name: 'Se déconnecter' })).toBeVisible();
    // Nothing of the application is loaded before a choice.
    expect(requested(fetchMock)).not.toContain('/api/today');

    await user.click(rma);
    expect(await screen.findByText('Espace RMA : seuls les dossiers RMA sont affichés ici.'));
    await waitFor(() => expect(requested(fetchMock)).toContain(`/api/today?insurerId=${RMA}`));
    expect(requested(fetchMock)).toContain(`/api/renewals/summary?insurerId=${RMA}`);

    await router.navigate('/contrats');
    await screen.findByRole('heading', { name: 'Contrats' });
    expect(requested(fetchMock)).toContain(`/api/contracts?page=1&insurerId=${RMA}`);

    // The space menu in the header: both insurers, staying on the same page, the list reloaded.
    await user.click(screen.getByRole('button', { name: 'Espace RMA — changer d’espace' }));
    const spaces = screen.getByRole('menu', { name: 'Espaces de travail' });
    expect(within(spaces).getByRole('menuitemradio', { name: 'RMA Assurance' })).toHaveAttribute(
      'aria-checked',
      'true',
    );
    await user.click(within(spaces).getByRole('menuitemradio', { name: 'Les deux compagnies' }));
    expect(await screen.findByRole('button', { name: 'Les deux compagnies — changer d’espace' }));
    expect(router.state.location.pathname).toBe('/contrats');
    expect(screen.queryByText(/seuls les dossiers/)).toBeNull();
    await waitFor(() => expect(requested(fetchMock)).toContain('/api/contracts?page=1'));

    // Or back to the big cards, from any page.
    await user.click(
      screen.getByRole('button', { name: 'Les deux compagnies — changer d’espace' }),
    );
    await user.click(screen.getByRole('menuitem', { name: 'Voir les cartes des espaces' }));
    expect(
      await screen.findByRole('button', { name: 'Travailler sur les deux compagnies' }),
    ).toBeVisible();
  });

  it('are used with the keyboard', async () => {
    mockApi({
      'GET /api/auth/me': agent,
      'GET /api/workspaces': () => [200, { items: cards }],
      ...home,
    });
    renderApp('/');
    const user = userEvent.setup();
    await screen.findByRole('heading', { name: 'Bienvenue, Karim Test' });

    await user.tab(); // Sign out, in the header.
    await user.tab();
    expect(screen.getByRole('button', { name: 'Accéder à l’espace CAT' })).toHaveFocus();
    await user.tab();
    expect(screen.getByRole('button', { name: 'Accéder à l’espace RMA' })).toHaveFocus();
    await user.keyboard('{Enter}');
    expect(await screen.findByText(/Espace RMA : seuls les dossiers RMA/)).toBeVisible();
  });

  it('keep the choice when the page is reloaded, and show "see both" on a filtered list', async () => {
    sessionStorage.setItem(
      'agency.workspace',
      JSON.stringify({ userId: '00000000-0000-4000-8000-000000000001', insurerId: RMA }),
    );
    const fetchMock = mockApi({
      'GET /api/auth/me': agent,
      'GET /api/workspaces': () => [200, { items: cards }],
      ...home,
    });
    renderApp('/accueil');
    const user = userEvent.setup();
    expect(await screen.findByText(/Espace RMA : seuls les dossiers RMA/)).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'Voir les deux' }));
    await waitFor(() => expect(requested(fetchMock)).toContain('/api/today'));
    expect(screen.queryByText(/seuls les dossiers/)).toBeNull();
  });

  it('ask again when the saved insurer is no longer active, or belonged to someone else', async () => {
    sessionStorage.setItem(
      'agency.workspace',
      JSON.stringify({ userId: '00000000-0000-4000-8000-000000000999', insurerId: RMA }),
    );
    mockApi({
      'GET /api/auth/me': agent,
      'GET /api/workspaces': () => [200, { items: cards }],
    });
    renderApp('/');
    expect(await screen.findByRole('heading', { name: 'Bienvenue, Karim Test' })).toBeVisible();
  });

  it('are left out with a single insurer, for people without contracts, or if they fail', async () => {
    for (const workspaces of [
      () => [200, { items: [cards[1]] }],
      () => [500, { error: { code: 'INTERNAL_ERROR', requestId: 'r-1' } }],
    ]) {
      mockApi({ 'GET /api/auth/me': agent, 'GET /api/workspaces': workspaces, ...home });
      const { unmount } = renderApp('/');
      expect(await screen.findByRole('heading', { name: /Bonjour/ })).toBeVisible();
      expect(screen.queryByRole('button', { name: /changer d’espace/ })).toBeNull();
      unmount();
    }
    // An administrator who follows no contract: never asked.
    const fetchMock = mockApi({
      'GET /api/auth/me': () => [200, me({ role: 'ADMIN' })],
      'GET /api/customers?page=1': () => [200, page],
    });
    renderApp('/');
    await screen.findByRole('heading', { name: 'Clients' });
    expect(requested(fetchMock)).not.toContain('/api/workspaces');
  });

  it('make the logo the picture when an insurer has a logo and no photo', async () => {
    mockApi({
      'GET /api/auth/me': agent,
      'GET /api/workspaces': () => [200, { items: cards }],
    });
    renderApp('/');
    // RMA: a logo, no photo. One image, the logo, and the insurer's colour.
    const rma = await screen.findByRole('button', { name: 'Accéder à l’espace RMA' });
    const images = rma.querySelectorAll('img');
    expect(images).toHaveLength(1);
    expect(images[0]).toHaveAttribute('src', '/api/workspaces/RMA/logo');
    expect(rma.style.getPropertyValue('--brand')).toBe('#272F65');
    // No decorative shield behind it (that is the card without a picture): the arrow only.
    expect(rma.querySelectorAll('svg')).toHaveLength(1);
    // CAT: a photo, no logo. The photo layout, with the code instead of a logo.
    const cat = screen.getByRole('button', { name: 'Accéder à l’espace CAT' });
    expect(cat.querySelector('img')).toHaveAttribute('src', '/api/workspaces/CAT/photo');
    expect(within(cat).getByText('CAT', { selector: 'span[aria-hidden="true"]' })).toBeVisible();
  });

  it('show the colour and the code when a logo or photo cannot be loaded', async () => {
    mockApi({
      'GET /api/auth/me': agent,
      'GET /api/workspaces': () => [200, { items: cards }],
    });
    renderApp('/');
    const rma = await screen.findByRole('button', { name: 'Accéder à l’espace RMA' });
    fireEvent.error(rma.querySelector('img'));
    await waitFor(() => expect(rma.querySelector('img')).toBeNull());
    expect(within(rma).getByText('RMA', { selector: 'span[aria-hidden="true"]' })).toBeVisible();
    const cat = screen.getByRole('button', { name: 'Accéder à l’espace CAT' });
    fireEvent.error(cat.querySelector('img'));
    await waitFor(() => expect(cat.querySelector('img')).toBeNull());
    expect(within(cat).queryByText(/Photo :/)).toBeNull();
  });

  it('are offered again after signing out', async () => {
    sessionStorage.setItem(
      'agency.workspace',
      JSON.stringify({ userId: '00000000-0000-4000-8000-000000000001', insurerId: RMA }),
    );
    mockApi({ 'GET /api/auth/me': () => anonymous });
    renderApp('/');
    await screen.findByRole('button', { name: 'Se connecter' });
    expect(sessionStorage.getItem('agency.workspace')).toBeNull();
  });
});

describe('the clients of one workspace', () => {
  const rmaChoice = () =>
    sessionStorage.setItem(
      'agency.workspace',
      JSON.stringify({ userId: '00000000-0000-4000-8000-000000000001', insurerId: RMA }),
    );
  const client = (id, displayName, hasContract, activeContracts = 0) => ({
    id,
    ref: `CLI-00000${id.slice(-1)}`,
    type: 'INDIVIDUAL',
    displayName,
    phone: null,
    city: null,
    assignedUser: null,
    archivedAt: null,
    activeContracts,
    hasContract,
  });

  it('lists the clients with an RMA contract and those without any, marked « Sans contrat »', async () => {
    rmaChoice();
    mockApi({
      'GET /api/auth/me': agent,
      'GET /api/workspaces': () => [200, { items: cards }],
      [`GET /api/customers?archived=exclude&page=1&insurerId=${RMA}`]: () => [
        200,
        {
          ...page,
          items: [
            client('00000000-0000-4000-8000-0000000000e1', 'Amina Test', true, 1),
            client('00000000-0000-4000-8000-0000000000e2', 'Dahbia Test', false),
          ],
          total: 2,
        },
      ],
    });
    renderApp('/clients');
    expect(
      await screen.findByText(
        'Espace RMA : les clients qui ont un contrat RMA, et ceux qui n’ont encore aucun contrat.',
      ),
    ).toBeVisible();
    const dahbia = (await screen.findByRole('link', { name: 'Dahbia Test' })).closest('tr');
    expect(within(dahbia).getByText('Sans contrat')).toBeVisible();
    const amina = screen.getByRole('link', { name: 'Amina Test' }).closest('tr');
    expect(within(amina).getByText('1 contrat émis')).toBeVisible();
  });

  it('searches the RMA workspace from the home page', async () => {
    rmaChoice();
    const fetchMock = mockApi({
      'GET /api/auth/me': agent,
      'GET /api/workspaces': () => [200, { items: cards }],
      ...home,
      [`GET /api/search?q=amina&insurerId=${RMA}`]: () => [
        200,
        { customers: [], vehicles: [], contracts: [] },
      ],
    });
    renderApp('/accueil');
    const user = userEvent.setup();
    await user.type(await screen.findByRole('searchbox', { name: 'Rechercher' }), 'amina');
    await waitFor(() =>
      expect(requested(fetchMock)).toContain(`/api/search?q=amina&insurerId=${RMA}`),
    );
  });
});
