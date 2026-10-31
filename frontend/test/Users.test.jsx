import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { renderApp } from './renderApp.jsx';
import { me, mockApi } from './mockApi.js';

const ROLES = [
  { code: 'ADMIN', name: 'Administrateur', requiresTwoFactor: true },
  { code: 'MANAGER', name: "Responsable d'agence", requiresTwoFactor: true },
  { code: 'AGENT', name: 'Agent', requiresTwoFactor: false },
  { code: 'AUDITOR', name: 'Auditeur', requiresTwoFactor: false },
];

const AGENT_ID = '00000000-0000-4000-8000-0000000000a1';
const agent = {
  id: AGENT_ID,
  username: 'samira.agent',
  displayName: 'Samira Test',
  active: true,
  locked: true,
  mustChangePassword: false,
  twoFactorEnabled: false,
  lastLoginAt: null,
  createdAt: '2026-10-01T09:00:00.000Z',
  version: 3,
  role: { code: 'AGENT', name: 'Agent' },
};

const page = (items) => [200, { items, total: items.length, page: 1, pageSize: 25, pageCount: 1 }];
const reauthRequired = [403, { error: { code: 'REAUTH_REQUIRED', requestId: 'r' } }];

const base = {
  'GET /api/auth/me': () => [200, me()],
  'GET /api/roles': () => [200, { items: ROLES }],
};

describe('users administration', () => {
  it('lists accounts with their state written out', async () => {
    mockApi({ ...base, 'GET /api/users?status=active&page=1': () => page([agent]) });
    renderApp('/utilisateurs');

    const row = (await screen.findByRole('link', { name: 'Samira Test' })).closest('tr');
    expect(within(row).getByText('samira.agent')).toBeInTheDocument();
    expect(within(row).getByText('Actif')).toBeInTheDocument();
    expect(within(row).getByText('Verrouillé')).toBeInTheDocument();
    expect(within(row).getByText('Jamais')).toBeInTheDocument();
  });

  it('shows an empty state', async () => {
    mockApi({ ...base, 'GET /api/users?status=active&page=1': () => page([]) });
    renderApp('/utilisateurs');
    expect(await screen.findByText('Aucun résultat.')).toBeInTheDocument();
  });

  it('asks for re-authentication, retries, then shows the temporary password once', async () => {
    let reauthenticated = false;
    const fetchMock = mockApi({
      ...base,
      'GET /api/users?status=active&page=1': () => page([agent]),
      'POST /api/users': () =>
        reauthenticated
          ? [201, { user: { ...agent, id: 'new-id' }, temporaryPassword: 'Kp7d-Qm3x-Ta9w-Hc2v' }]
          : reauthRequired,
      'POST /api/auth/reauth': () => {
        reauthenticated = true;
        return [200, { reauthValidUntil: '2026-10-22T10:05:00.000Z' }];
      },
      'GET /api/users/new-id': () => [200, { ...agent, id: 'new-id', activeSessions: 0 }],
    });
    renderApp('/utilisateurs');
    const user = userEvent.setup();

    await user.click(await screen.findByRole('button', { name: 'Nouvel utilisateur' }));
    const form = screen.getByRole('dialog', { name: 'Nouvel utilisateur' });
    await user.type(within(form).getByLabelText('Identifiant'), 'Nouvel.Agent');
    expect(within(form).getByLabelText('Identifiant')).toHaveValue('nouvel.agent');
    await user.type(within(form).getByLabelText('Nom affiché'), 'Nouvel agent');
    await user.click(within(form).getByRole('button', { name: 'Nouvel utilisateur' }));

    const reauth = await screen.findByRole('dialog', { name: 'Confirmer votre identité' });
    await user.type(within(reauth).getByLabelText('Mot de passe'), 'Synthétique-Test-2026!');
    await user.type(within(reauth).getByLabelText('Code à 6 chiffres'), '123456');
    await user.click(within(reauth).getByRole('button', { name: 'Confirmer' }));

    const temp = await screen.findByRole('dialog', { name: 'Mot de passe temporaire' });
    expect(within(temp).getByText('Kp7d-Qm3x-Ta9w-Hc2v')).toBeInTheDocument();

    const creations = fetchMock.mock.calls.filter(
      ([url, init]) => url === '/api/users' && init.method === 'POST',
    );
    expect(creations).toHaveLength(2);
    expect(JSON.parse(creations[1][1].body)).toEqual({
      username: 'nouvel.agent',
      displayName: 'Nouvel agent',
      roleCode: 'AGENT',
    });
  });

  it('validates the username before sending', async () => {
    const fetchMock = mockApi({ ...base, 'GET /api/users?status=active&page=1': () => page([]) });
    renderApp('/utilisateurs');
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: 'Nouvel utilisateur' }));
    const form = screen.getByRole('dialog', { name: 'Nouvel utilisateur' });
    await user.type(within(form).getByLabelText('Identifiant'), 'a b');
    await user.type(within(form).getByLabelText('Nom affiché'), 'X');
    await user.click(within(form).getByRole('button', { name: 'Nouvel utilisateur' }));

    expect(within(form).getByLabelText('Identifiant')).toHaveAttribute('aria-invalid', 'true');
    expect(fetchMock.mock.calls.some(([, init]) => init?.method === 'POST')).toBe(false);
  });

  it('confirms an action, sends the version and explains a conflict', async () => {
    const fetchMock = mockApi({
      ...base,
      [`GET /api/users/${AGENT_ID}`]: () => [200, { ...agent, activeSessions: 1 }],
      [`POST /api/users/${AGENT_ID}/disable`]: () => [
        409,
        { error: { code: 'VERSION_CONFLICT', requestId: 'r' } },
      ],
    });
    renderApp(`/utilisateurs/${AGENT_ID}`);
    const user = userEvent.setup();

    await user.click(await screen.findByRole('button', { name: 'Désactiver le compte' }));
    const confirm = screen.getByRole('dialog', { name: 'Désactiver le compte' });
    expect(confirm).toHaveTextContent('ne pourra plus se connecter');
    await user.click(within(confirm).getByRole('button', { name: 'Désactiver le compte' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('modifié par quelqu’un d’autre');
    const call = fetchMock.mock.calls.find(([url]) => url.endsWith('/disable'));
    expect(JSON.parse(call[1].body)).toEqual({ version: 3 });
    expect(call[1].headers['X-CSRF-Token']).toBe('csrf-test-token');
  });

  it('does not offer actions on the signed-in administrator’s own account', async () => {
    const self = { ...agent, id: me().user.id, role: { code: 'ADMIN', name: 'Administrateur' } };
    mockApi({
      ...base,
      [`GET /api/users/${self.id}`]: () => [200, { ...self, activeSessions: 1 }],
    });
    renderApp(`/utilisateurs/${self.id}`);
    await screen.findByRole('heading', { name: 'Modifier' });
    expect(screen.queryByRole('button', { name: 'Désactiver le compte' })).not.toBeInTheDocument();
    expect(screen.getByLabelText('Rôle')).toBeDisabled();
  });

  it('is not reachable for an agent', async () => {
    mockApi({ 'GET /api/auth/me': () => [200, me({ role: 'AGENT' })] });
    renderApp('/utilisateurs');
    expect(await screen.findByRole('heading', { name: 'Page introuvable' })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Utilisateurs' })).not.toBeInTheDocument();
  });
});

describe('audit log page', () => {
  it('shows events in French with their details and filters by action', async () => {
    const event = {
      id: '42',
      at: '2026-10-22T09:15:00.000Z',
      action: 'user.disabled',
      actor: { username: 'karim.admin', displayName: 'Karim Test' },
      entityType: 'user',
      entityId: AGENT_ID,
      details: { sessionsEnded: 1 },
    };
    const fetchMock = mockApi({
      'GET /api/auth/me': () => [200, me()],
      'GET /api/audit/actions': () => [200, { items: ['auth.login.succeeded', 'user.disabled'] }],
      'GET /api/audit?page=1': () => page([event]),
      'GET /api/audit?page=1&action=user.disabled&from=2026-10-01': () => page([event]),
    });
    renderApp('/journal');
    const user = userEvent.setup();

    const item = (await screen.findByText('sessionsEnded :')).closest('li');
    expect(within(item).getByText('Compte désactivé')).toBeInTheDocument();
    expect(within(item).getByText(/Karim Test \(karim\.admin\)/)).toBeInTheDocument();
    expect(within(item).getByText('sessionsEnded :')).toBeInTheDocument();
    // Agency time zone: 09:15 UTC on 22/10/2026 (Morocco on GMT since 20/09/2026).
    expect(within(item).getByText(/22\/10\/2026/)).toBeInTheDocument();

    await user.selectOptions(screen.getByLabelText('Action'), 'Compte désactivé');
    await user.type(screen.getByLabelText('Du'), '2026-10-01');
    await user.click(screen.getByRole('button', { name: 'Filtrer' }));
    await screen.findByText('sessionsEnded :');
    expect(fetchMock.mock.calls.map(([url]) => url)).toContain(
      '/api/audit?page=1&action=user.disabled&from=2026-10-01',
    );
  });
});
