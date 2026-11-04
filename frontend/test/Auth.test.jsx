import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { renderApp } from './renderApp.jsx';
import { anonymous, me, mockApi, unauthenticated } from './mockApi.js';

/** « Se déconnecter » is in the person's menu, at the top right. */
async function signOut(user) {
  await user.click(await screen.findByRole('button', { name: /^Menu de / }));
  await user.click(await screen.findByRole('menuitem', { name: 'Se déconnecter' }));
}

describe('sign-in', () => {
  it('shows the login page when nobody is signed in', async () => {
    mockApi({ 'GET /api/auth/me': () => anonymous });
    renderApp('/systeme');
    expect(await screen.findByRole('heading', { name: 'Connexion' })).toBeInTheDocument();
    expect(screen.getByLabelText('Identifiant')).toHaveAttribute('autocomplete', 'username');
    expect(screen.getByLabelText('Mot de passe')).toHaveAttribute('type', 'password');
  });

  it('shows a generic message for wrong credentials and keeps the username', async () => {
    mockApi({
      'GET /api/auth/me': () => anonymous,
      'POST /api/auth/login': () => [
        401,
        { error: { code: 'INVALID_CREDENTIALS', message: 'server text', requestId: 'r' } },
      ],
    });
    renderApp();
    const user = userEvent.setup();
    await user.type(await screen.findByLabelText('Identifiant'), 'karim');
    await user.type(screen.getByLabelText('Mot de passe'), 'mauvais');
    await user.click(screen.getByRole('button', { name: 'Se connecter' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Identifiant ou mot de passe incorrect.',
    );
    expect(screen.getByLabelText('Identifiant')).toHaveValue('karim');
    expect(screen.getByLabelText('Mot de passe')).toHaveValue('');
  });

  it('signs in, sends the credentials once, then shows the application', async () => {
    let signedIn = false;
    const fetchMock = mockApi({
      'GET /api/auth/me': () => (signedIn ? [200, me()] : anonymous),
      'POST /api/auth/login': () => {
        signedIn = true;
        return [200, { stage: 'ACTIVE', csrfToken: 'csrf-test-token' }];
      },
      'GET /api/customers?archived=exclude&page=1': () => [
        200,
        { items: [], total: 0, page: 1, pageSize: 25, pageCount: 1 },
      ],
    });
    renderApp();
    const user = userEvent.setup();
    await user.type(await screen.findByLabelText('Identifiant'), 'karim.admin');
    await user.type(screen.getByLabelText('Mot de passe'), 'Synthétique-Test-2026!');
    await user.click(screen.getByRole('button', { name: 'Se connecter' }));

    expect(await screen.findByRole('heading', { name: 'Clients' })).toBeInTheDocument();
    // The person signed in: their menu in the header (initials), named after them.
    expect(screen.getByRole('button', { name: 'Menu de Karim Test' })).toBeInTheDocument();
    const loginCall = fetchMock.mock.calls.find(([url]) => url === '/api/auth/login');
    expect(JSON.parse(loginCall[1].body)).toEqual({
      username: 'karim.admin',
      password: 'Synthétique-Test-2026!',
    });
  });

  it('asks for the code when the second factor is required', async () => {
    let stage = 'TOTP_VERIFY';
    const fetchMock = mockApi({
      'GET /api/auth/me': () => [200, me({ stage })],
      'POST /api/auth/totp/verify': () => {
        stage = 'ACTIVE';
        return [200, { stage, csrfToken: 'rotated-token' }];
      },
      'GET /api/customers?archived=exclude&page=1': () => [
        200,
        { items: [], total: 0, page: 1, pageSize: 25, pageCount: 1 },
      ],
    });
    renderApp();
    const user = userEvent.setup();
    const field = await screen.findByLabelText('Code à 6 chiffres');
    await user.type(field, '12a34-56');
    expect(field).toHaveValue('123456');
    await user.click(screen.getByRole('button', { name: 'Vérifier' }));

    expect(await screen.findByRole('heading', { name: 'Clients' })).toBeInTheDocument();
    const verify = fetchMock.mock.calls.find(([url]) => url === '/api/auth/totp/verify');
    expect(verify[1].headers['X-CSRF-Token']).toBe('csrf-test-token');
  });

  it('forces a password change and explains refused passwords', async () => {
    mockApi({
      'GET /api/auth/me': () => [200, me({ stage: 'PASSWORD_CHANGE' })],
      'POST /api/auth/password': () => [
        400,
        { error: { code: 'WEAK_PASSWORD', details: { problems: ['TOO_COMMON'] } } },
      ],
    });
    renderApp();
    const user = userEvent.setup();
    await user.type(await screen.findByLabelText('Mot de passe actuel'), 'Temporaire-2026-xyz');
    await user.type(screen.getByLabelText('Nouveau mot de passe'), 'azerty123456');
    await user.type(screen.getByLabelText('Confirmer le nouveau mot de passe'), 'azerty123457');
    await user.click(screen.getByRole('button', { name: 'Enregistrer' }));
    expect(
      await screen.findByText('Les deux mots de passe ne correspondent pas.'),
    ).toBeInTheDocument();

    await user.clear(screen.getByLabelText('Confirmer le nouveau mot de passe'));
    await user.type(screen.getByLabelText('Confirmer le nouveau mot de passe'), 'azerty123456');
    await user.click(screen.getByRole('button', { name: 'Enregistrer' }));
    expect(await screen.findByText('Ce mot de passe est trop courant.')).toBeInTheDocument();
  });

  it('returns to the login page with a notice when the session ends', async () => {
    let expired = false;
    mockApi({
      'GET /api/auth/me': () => (expired ? anonymous : [200, me()]),
      'GET /api/system/status': () => {
        expired = true;
        return unauthenticated;
      },
    });
    renderApp('/systeme');
    expect(
      await screen.findByText('Votre session a pris fin. Reconnectez-vous pour continuer.'),
    ).toBeInTheDocument();
  });

  it('signs out', async () => {
    mockApi({
      'GET /api/auth/me': () => [200, me({ role: 'AGENT' })],
      'POST /api/auth/logout': () => [204, null],
    });
    renderApp();
    const user = userEvent.setup();
    await signOut(user);
    expect(await screen.findByText('Vous êtes déconnecté.')).toBeInTheDocument();
  });

  it('says « déconnecté », not « session ended », when a page was still loading', async () => {
    // The home page asks for its to-do list; the answer comes back only after the sign-out,
    // refused (401) because the session is gone. Found by the e2e run of 04/11/2026.
    let answerLate;
    const late = new Promise((resolve) => {
      answerLate = () => resolve(unauthenticated);
    });
    mockApi({
      'GET /api/auth/me': () => [200, me({ role: 'AGENT', permissions: ['renewals.read'] })],
      'GET /api/today': () => late,
      'GET /api/renewals/summary': () => late,
      'POST /api/auth/logout': () => [204, null],
    });
    renderApp('/accueil');
    const user = userEvent.setup();
    await signOut(user);
    expect(await screen.findByText('Vous êtes déconnecté.')).toBeInTheDocument();
    answerLate();
    await waitFor(() => expect(screen.getByText('Vous êtes déconnecté.')).toBeInTheDocument());
    expect(screen.queryByText(/Votre session a pris fin/)).toBeNull();
  });
});
