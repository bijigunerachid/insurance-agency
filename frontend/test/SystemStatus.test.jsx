import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { renderApp } from './renderApp.jsx';
import { me, mockApi } from './mockApi.js';

function rowFor(label) {
  return screen.getByText(label).closest('div');
}

const signedInAdmin = { 'GET /api/auth/me': () => [200, me()] };

describe('System status page', () => {
  it('shows loading, then server and database as available', async () => {
    const fetchMock = mockApi({
      ...signedInAdmin,
      'GET /api/system/status': () => [200, { status: 'ready', checks: { database: 'ok' } }],
    });
    renderApp('/systeme');

    expect(await screen.findByText('Base de données')).toBeInTheDocument();
    expect(within(rowFor("Serveur de l'application")).getByText('Disponible')).toBeInTheDocument();
    expect(within(rowFor('Base de données')).getByText('Disponible')).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/system/status',
      expect.objectContaining({ credentials: 'same-origin' }),
    );
  });

  it('says when the server clock needs setting, compared with this PC', async () => {
    const at = (offsetMs) => new Date(Date.now() + offsetMs).toISOString();
    let offset = 10_000;
    mockApi({
      ...signedInAdmin,
      'GET /api/system/status': () => [
        200,
        { status: 'ready', checks: { database: 'ok' }, serverTime: at(offset) },
      ],
    });
    renderApp('/systeme');
    const user = userEvent.setup();
    expect(await screen.findByText('Horloge du serveur')).toBeInTheDocument();
    expect(within(rowFor('Base de données').parentElement).getByText('À l’heure')).toBeVisible();

    // Seven minutes behind: two-step codes would be refused.
    offset = -7 * 60_000;
    await user.click(screen.getByRole('button', { name: 'Actualiser' }));
    expect(await screen.findByText('À régler')).toBeVisible();
    expect(screen.getByText(/écart de 7 minutes avec ce PC/)).toBeVisible();
  });

  it('shows whether the backups are up to date, and what to do when they are not', async () => {
    const minutesAgo = (n) => new Date(Date.now() - n * 60_000).toISOString();
    const folder = (iso) =>
      iso.replace(/:(\d{2}):(\d{2})\.\d{3}Z$/, '$1$2Z').replace(/T(\d{2}):/, 'T$1');
    let backup = {
      state: 'ok',
      checkedAt: minutesAgo(3),
      disk: 'A',
      lastBase: folder(minutesAgo(600)),
      diskFreeKb: String(900 * 1048576),
    };
    mockApi({
      ...signedInAdmin,
      'GET /api/system/status': () => [
        200,
        {
          status: 'ready',
          checks: { database: 'ok' },
          serverTime: new Date().toISOString(),
          backup,
        },
      ],
    });
    renderApp('/systeme');
    const user = userEvent.setup();
    const row = (await screen.findByText('Sauvegardes')).closest('div');
    expect(row).toHaveTextContent('À jour');
    expect(row).toHaveTextContent('Disque A · dernière copie complète');
    expect(row).toHaveTextContent('900 Go libres');

    backup = { ...backup, state: 'missing' };
    await user.click(screen.getByRole('button', { name: 'Actualiser' }));
    expect(await screen.findByText(/Aucun disque de sauvegarde branché/)).toBeVisible();
    expect(screen.getByText('Sauvegardes').closest('div')).toHaveTextContent('À vérifier');

    // The job stopped running: the timer or the server needs a look.
    backup = { ...backup, state: 'ok', checkedAt: minutesAgo(90) };
    await user.click(screen.getByRole('button', { name: 'Actualiser' }));
    expect(await screen.findByText(/La sauvegarde ne tourne plus depuis le/)).toBeVisible();

    backup = { ...backup, checkedAt: minutesAgo(2), lastBase: folder(minutesAgo(30 * 60)) };
    await user.click(screen.getByRole('button', { name: 'Actualiser' }));
    expect(await screen.findByText('Pas de copie complète depuis plus d’un jour.')).toBeVisible();
  });

  it('shows the database as unavailable when the server answers 503', async () => {
    mockApi({
      ...signedInAdmin,
      'GET /api/system/status': () => [
        503,
        { status: 'not_ready', checks: { database: 'unavailable' } },
      ],
    });
    renderApp('/systeme');
    expect(await screen.findByText('Base de données')).toBeInTheDocument();
    expect(within(rowFor('Base de données')).getByText('Indisponible')).toBeInTheDocument();
  });

  it('shows a generic error without server details when the network fails', async () => {
    mockApi({
      ...signedInAdmin,
      'GET /api/system/status': () => Promise.reject(new TypeError('Failed to fetch 10.0.0.5')),
    });
    renderApp('/systeme');
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Impossible de joindre le serveur');
    expect(alert).not.toHaveTextContent('10.0.0.5');
  });

  it('shows the request reference for a server error, never the server message', async () => {
    mockApi({
      ...signedInAdmin,
      'GET /api/system/status': () => [
        500,
        { error: { code: 'INTERNAL_ERROR', message: 'stack trace here', requestId: 'abc-123' } },
      ],
    });
    renderApp('/systeme');
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('abc-123');
    expect(alert).not.toHaveTextContent('stack trace here');
  });

  it('checks again when the user clicks refresh', async () => {
    const fetchMock = mockApi({
      ...signedInAdmin,
      'GET /api/system/status': () => [200, { status: 'ready', checks: { database: 'ok' } }],
    });
    renderApp('/systeme');
    await screen.findByText('Base de données');
    await userEvent.click(screen.getByRole('button', { name: 'Actualiser' }));
    await screen.findByText('Base de données');
    const statusCalls = fetchMock.mock.calls.filter(([url]) => url === '/api/system/status');
    expect(statusCalls).toHaveLength(2);
  });

  it('is not offered to a role without the permission', async () => {
    mockApi({ 'GET /api/auth/me': () => [200, me({ role: 'AGENT' })] });
    renderApp('/');
    expect(await screen.findByRole('heading', { name: 'Mon compte' })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'État du système' })).not.toBeInTheDocument();
  });

  it('shows a not-found page for unknown addresses', async () => {
    mockApi(signedInAdmin);
    renderApp('/nulle-part');
    expect(await screen.findByRole('heading', { name: 'Page introuvable' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: "Retour à l'accueil" })).toHaveAttribute('href', '/');
  });

  it('shows the signed-in person their account: identity, two-step check, password', async () => {
    mockApi(signedInAdmin);
    renderApp('/compte');
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Mon compte' }),
    ).toBeInTheDocument();
    const identity = screen.getByRole('region', { name: 'Identité' });
    expect(identity).toHaveTextContent('karim.admin');
    expect(identity).toHaveTextContent('Administrateur');
    expect(screen.getByRole('region', { name: 'Changer le mot de passe' })).toBeInTheDocument();
  });
});
