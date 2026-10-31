import { act, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { me, mockApi } from './mockApi.js';
import { renderApp } from './renderApp.jsx';

/** A stand-in for the browser's Windows notifications: records what would be shown. */
function fakeNotifications(permission = 'granted') {
  const shown = [];
  class FakeNotification {
    static permission = permission;
    static requestPermission = vi.fn(async () => {
      FakeNotification.permission = 'granted';
      return 'granted';
    });
    constructor(title, options) {
      this.title = title;
      this.options = options;
      this.close = vi.fn();
      shown.push(this);
    }
  }
  vi.stubGlobal('Notification', FakeNotification);
  return { shown, FakeNotification };
}

const agent = () => [
  200,
  me({ role: 'AGENT', permissions: ['renewals.read', 'customers.read', 'contracts.read'] }),
];
const todayWith = (items) => () => [200, { today: '2026-10-24', items }];
const quietRoutes = {
  'GET /api/renewals/summary': () => [
    200,
    { windowDays: 30, mine: 0, mineOverdue: 0, allOpen: 0, next: [] },
  ],
  'GET /api/renewals?page=1': () => [
    200,
    { items: [], total: 0, page: 1, pageSize: 25, pageCount: 1 },
  ],
  'GET /api/renewals/assignees': () => [200, { items: [] }],
};

beforeEach(() => {
  window.localStorage.clear();
  vi.useFakeTimers({ shouldAdvanceTime: true });
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('Windows alerts for insurances ending', () => {
  it('shows one alert with counts only, not again for the same numbers, again when they change', async () => {
    const { shown } = fakeNotifications('granted');
    let items = [
      { kind: 'RENEWALS', count: 3, soon: 1, to: '/renouvellements' },
      { kind: 'RENEWALS_LATE', count: 1, to: '/renouvellements' },
    ];
    mockApi({
      'GET /api/auth/me': agent,
      'GET /api/today': () => todayWith(items)(),
      ...quietRoutes,
    });
    renderApp('/');
    await screen.findByRole('heading', { name: /^Bonjour/ });

    await act(() => vi.advanceTimersByTimeAsync(3500));
    expect(shown).toHaveLength(1);
    expect(shown[0].title).toBe('Assurances à renouveler');
    expect(shown[0].options.body).toBe(
      '1 renouvellement en retard.\n3 assurances finissent dans moins de 30 jours (dont 1 cette semaine).',
    );
    // No customer name: the alert may show on a shared or locked screen.
    expect(shown[0].options.body).not.toMatch(/Sara|Test/);

    // Five minutes later, same numbers: nothing new.
    await act(() => vi.advanceTimersByTimeAsync(5 * 60 * 1000));
    expect(shown).toHaveLength(1);

    // A new insurance comes into the 30 days: a new alert.
    items = [{ kind: 'RENEWALS', count: 4, soon: 1, to: '/renouvellements' }];
    await act(() => vi.advanceTimersByTimeAsync(5 * 60 * 1000));
    expect(shown).toHaveLength(2);

    // Clicking it opens the renewals.
    await act(async () => shown[1].onclick());
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Renouvellements' }),
    ).toBeInTheDocument();
  });

  it('asks the browser for permission only after a click, and says when it is on', async () => {
    const { FakeNotification, shown } = fakeNotifications('default');
    mockApi({ 'GET /api/auth/me': agent, 'GET /api/today': todayWith([]), ...quietRoutes });
    renderApp('/');
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });

    const button = await screen.findByRole('button', { name: 'Activer les alertes' });
    expect(FakeNotification.requestPermission).not.toHaveBeenCalled();
    await user.click(button);
    expect(FakeNotification.requestPermission).toHaveBeenCalledTimes(1);
    expect(await screen.findByText('Alertes Windows activées sur ce PC.')).toBeInTheDocument();
    // Nothing is due: no alert.
    await act(() => vi.advanceTimersByTimeAsync(3500));
    expect(shown).toHaveLength(0);
  });

  it('explains how to unblock alerts refused in the browser, and shows none', async () => {
    const { shown } = fakeNotifications('denied');
    mockApi({
      'GET /api/auth/me': agent,
      'GET /api/today': todayWith([
        { kind: 'RENEWALS', count: 2, soon: 0, to: '/renouvellements' },
      ]),
      ...quietRoutes,
    });
    renderApp('/');
    expect(
      await screen.findByText(/Les alertes sont bloquées dans ce navigateur/),
    ).toBeInTheDocument();
    await act(() => vi.advanceTimersByTimeAsync(3500));
    expect(shown).toHaveLength(0);
  });
});
