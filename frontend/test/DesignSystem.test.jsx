import { act, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { PlusIcon } from '@heroicons/react/20/solid';
import { MemoryRouter } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Alert } from '../src/components/Alert.jsx';
import { Button, ButtonLink } from '../src/components/Button.jsx';
import { Card } from '../src/components/Card.jsx';
import { DataTable } from '../src/components/DataTable.jsx';
import { DetailItem, DetailList } from '../src/components/DetailList.jsx';
import { Disclosure } from '../src/components/Disclosure.jsx';
import { EmptyState } from '../src/components/EmptyState.jsx';
import { Menu } from '../src/components/Menu.jsx';
import { PageHeader } from '../src/components/PageHeader.jsx';
import { PasswordField } from '../src/components/PasswordField.jsx';
import { PhoneLink } from '../src/components/PhoneLink.jsx';
import { SelectField } from '../src/components/SelectField.jsx';
import { SkeletonDetail, SkeletonList } from '../src/components/Skeleton.jsx';
import { TextField } from '../src/components/TextField.jsx';
import { ToastProvider, useToast } from '../src/components/Toast.jsx';
import { phoneScreen } from './phoneScreen.js';

const inRouter = (ui) => render(<MemoryRouter>{ui}</MemoryRouter>);

describe('buttons', () => {
  it('refuse a second click while busy, keeping their name', async () => {
    const onClick = vi.fn();
    const { rerender } = render(<Button onClick={onClick}>Enregistrer</Button>);
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Enregistrer' }));
    expect(onClick).toHaveBeenCalledTimes(1);

    rerender(
      <Button onClick={onClick} loading>
        Enregistrer
      </Button>,
    );
    const busy = screen.getByRole('button', { name: 'Enregistrer' });
    expect(busy).toBeDisabled();
    expect(busy).toHaveAttribute('aria-busy', 'true');
    await user.click(busy);
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('name an icon-only button for screen readers, and link to a page as a button', () => {
    inRouter(
      <>
        <Button icon={PlusIcon} iconOnly variant="ghost">
          Ajouter un véhicule
        </Button>
        <ButtonLink to="/clients/nouveau" icon={PlusIcon}>
          Nouveau client
        </ButtonLink>
      </>,
    );
    const add = screen.getByRole('button', { name: 'Ajouter un véhicule' });
    expect(add.querySelector('svg')).toHaveAttribute('aria-hidden', 'true');
    expect(screen.getByRole('link', { name: 'Nouveau client' })).toHaveAttribute(
      'href',
      '/clients/nouveau',
    );
  });
});

describe('form fields', () => {
  it('say when a field is optional, and tie the hint and the error to it', () => {
    render(
      <>
        <TextField label="E-mail" optional hint="Pour les rappels." error="Adresse invalide." />
        <SelectField label="Ville" options={[{ value: '', label: '—' }]} />
      </>,
    );
    const email = screen.getByLabelText('E-mail (facultatif)');
    expect(email).toHaveAttribute('aria-invalid', 'true');
    expect(email).toHaveAccessibleDescription('Pour les rappels. Adresse invalide.');
    expect(screen.getByLabelText('Ville')).not.toHaveAttribute('aria-invalid');
  });
});

describe('password fields', () => {
  it('show the characters on request, and warn while Caps Lock is on', async () => {
    render(<PasswordField label="Mot de passe" defaultValue="Secret" />);
    const user = userEvent.setup();
    // The field alone answers to its label; the button is named otherwise.
    const field = screen.getByLabelText('Mot de passe');
    expect(field).toHaveAttribute('type', 'password');
    const show = screen.getByRole('button', { name: 'Afficher les caractères' });
    expect(show).toHaveAttribute('aria-pressed', 'false');
    await user.click(show);
    expect(field).toHaveAttribute('type', 'text');
    expect(show).toHaveAttribute('aria-pressed', 'true');
    await user.click(show);
    expect(field).toHaveAttribute('type', 'password');

    await user.click(field);
    await user.keyboard('{CapsLock}');
    expect(screen.getByRole('status')).toHaveTextContent('Majuscules verrouillées');
    expect(field).toHaveAccessibleDescription('Majuscules verrouillées (Verr. Maj).');
    // Caps Lock off: the warning goes with the next key typed.
    await user.keyboard('{CapsLock}a');
    expect(screen.queryByRole('status')).toBeNull();
  });
});

describe('page structure', () => {
  it('heads a page with its title, a way back and its actions', () => {
    inRouter(
      <PageHeader
        title="Karim Alaoui"
        titleId="customer-title"
        description="Client particulier"
        back={{ to: '/clients', label: 'Retour aux clients' }}
        actions={<Button>Modifier</Button>}
      />,
    );
    expect(screen.getByRole('heading', { level: 1, name: 'Karim Alaoui' })).toHaveAttribute(
      'id',
      'customer-title',
    );
    expect(screen.getByRole('link', { name: 'Retour aux clients' })).toHaveAttribute(
      'href',
      '/clients',
    );
    expect(screen.getByRole('button', { name: 'Modifier' })).toBeVisible();
  });

  it('names a card by its title, and says plainly when there is nothing', () => {
    render(
      <>
        <Card title="Contrats" actions={<Button size="sm">Nouveau contrat</Button>}>
          <EmptyState title="Aucun contrat" description="Ce client n’a pas encore de contrat." />
        </Card>
        <Card>Sans titre</Card>
      </>,
    );
    const region = screen.getByRole('region', { name: 'Contrats' });
    expect(within(region).getByText('Aucun contrat')).toBeVisible();
    expect(screen.getAllByRole('region')).toHaveLength(1);
  });

  it('announces a list being loaded, and a success', () => {
    render(
      <>
        <SkeletonList rows={3} />
        <Alert tone="success">Client enregistré.</Alert>
      </>,
    );
    const statuses = screen.getAllByRole('status');
    expect(statuses[0]).toHaveTextContent('Chargement…');
    expect(statuses[0]).toHaveAttribute('aria-busy', 'true');
    expect(statuses[1]).toHaveTextContent('Client enregistré.');
  });
});

describe('data tables', () => {
  const columns = [
    { key: 'ref', header: 'Référence', primary: true, cell: (row) => row.ref },
    { key: 'client', header: 'Client', cell: (row) => row.client },
    { key: 'amount', header: 'Montant', align: 'right', cell: (row) => row.amount },
    { key: 'note', header: 'Note', hideOnPhone: true, cell: (row) => row.note },
  ];
  const rows = [
    { id: 'a', ref: 'CTR-1', client: 'Sara Test', amount: '600,00 MAD', note: 'Ok' },
    { id: 'b', ref: 'CTR-2', client: 'Badr Test', amount: '400,00 MAD', note: 'Ok' },
  ];
  let restore;
  afterEach(() => restore?.());

  it('show a table with column headers on a computer', () => {
    render(<DataTable caption="Contrats" columns={columns} rows={rows} />);
    const table = screen.getByRole('table', { name: 'Contrats' });
    expect(
      within(table)
        .getAllByRole('columnheader')
        .map((th) => th.textContent),
    ).toEqual(['Référence', 'Client', 'Montant', 'Note']);
    expect(within(table).getAllByRole('row')).toHaveLength(3);
  });

  it('show one card per record on a phone, its main column first', () => {
    restore = phoneScreen();
    render(<DataTable caption="Contrats" columns={columns} rows={rows} />);
    expect(screen.queryByRole('table')).toBeNull();
    const cards = within(screen.getByRole('list', { name: 'Contrats' })).getAllByRole('listitem');
    expect(cards).toHaveLength(2);
    expect(cards[0].firstChild).toHaveTextContent('CTR-1');
    expect(within(cards[0]).getByText('Montant')).toBeVisible();
    expect(within(cards[0]).queryByText('Note')).toBeNull();
  });

  it('let a list draw its own phone card, still one list item per record', () => {
    restore = phoneScreen();
    render(
      <DataTable
        caption="Contrats"
        columns={columns}
        rows={rows}
        renderCard={(row) => <p>Carte {row.ref}</p>}
      />,
    );
    const cards = within(screen.getByRole('list', { name: 'Contrats' })).getAllByRole('listitem');
    expect(cards.map((card) => card.textContent)).toEqual(['Carte CTR-1', 'Carte CTR-2']);
  });
});

describe('record details', () => {
  it('show each fact under its label, and a dash rather than a blank', () => {
    render(
      <DetailList>
        <DetailItem label="Ville" value="Casablanca" />
        <DetailItem label="Courriel" value="" />
        <DetailItem label="Châssis" value={null} empty="Non renseigné" />
      </DetailList>,
    );
    const terms = screen.getAllByRole('term').map((dt) => dt.textContent);
    const values = screen.getAllByRole('definition').map((dd) => dd.textContent);
    expect(terms).toEqual(['Ville', 'Courriel', 'Châssis']);
    expect(values).toEqual(['Casablanca', '—', 'Non renseigné']);
  });

  it('call a client from their number, written the familiar way', () => {
    render(<PhoneLink phone="+212612345678" />);
    expect(screen.getByRole('link', { name: '06 12 34 56 78' })).toHaveAttribute(
      'href',
      'tel:+212612345678',
    );
  });

  it('announce a record being loaded', () => {
    render(<SkeletonDetail />);
    expect(screen.getByRole('status')).toHaveTextContent('Chargement…');
  });
});

describe('toast messages', () => {
  afterEach(() => vi.useRealTimers());

  /** A button that shows one message: built per test, so it needs no props. */
  const saverOf = (message, tone) =>
    function Saver() {
      const toast = useToast();
      return <Button onClick={() => toast.show(message, { tone })}>Enregistrer</Button>;
    };

  it('announce a success over the page, then go away by themselves', async () => {
    vi.useFakeTimers();
    const Saver = saverOf('Paiement enregistré.');
    render(
      <ToastProvider>
        <Saver />
      </ToastProvider>,
    );
    act(() => screen.getByRole('button', { name: 'Enregistrer' }).click());
    const message = screen.getByText('Paiement enregistré.');
    expect(message.closest('[aria-live="polite"]')).not.toBeNull();
    act(() => vi.advanceTimersByTime(6100));
    expect(screen.queryByText('Paiement enregistré.')).toBeNull();
  });

  it('keep an error until it is closed, announced at once', async () => {
    vi.useFakeTimers();
    const Saver = saverOf('Le serveur ne répond pas.', 'error');
    render(
      <ToastProvider>
        <Saver />
      </ToastProvider>,
    );
    act(() => screen.getByRole('button', { name: 'Enregistrer' }).click());
    act(() => vi.advanceTimersByTime(60_000));
    const message = screen.getByText('Le serveur ne répond pas.');
    expect(message.closest('[aria-live="assertive"]')).not.toBeNull();
    act(() => screen.getByRole('button', { name: 'Fermer le message' }).click());
    expect(screen.queryByText('Le serveur ne répond pas.')).toBeNull();
  });
});

describe('menus', () => {
  const chosen = [];
  const items = [
    { key: 'rma', label: 'RMA', checked: false, onSelect: () => chosen.push('rma') },
    { key: 'cat', label: 'CAT', checked: true, onSelect: () => chosen.push('cat') },
    { key: 'sep', separator: true },
    { key: 'cards', label: 'Voir les cartes', onSelect: () => chosen.push('cards') },
  ];
  const renderMenu = () =>
    render(
      <>
        <Menu
          label="Espaces"
          items={items}
          renderButton={(props) => (
            <button type="button" {...props}>
              Espace
            </button>
          )}
        />
        <p>Ailleurs</p>
      </>,
    );

  it('open on the checked choice, move with the arrows, and choose with Enter', async () => {
    chosen.length = 0;
    renderMenu();
    const user = userEvent.setup();
    const button = screen.getByRole('button', { name: 'Espace' });
    expect(button).toHaveAttribute('aria-haspopup', 'menu');
    await user.click(button);
    expect(button).toHaveAttribute('aria-expanded', 'true');
    const menu = screen.getByRole('menu', { name: 'Espaces' });
    expect(within(menu).getByRole('menuitemradio', { name: 'CAT' })).toHaveFocus();
    expect(within(menu).getByRole('menuitemradio', { name: 'CAT' })).toHaveAttribute(
      'aria-checked',
      'true',
    );
    // An action among the choices is a plain menu item.
    expect(within(menu).getByRole('menuitem', { name: 'Voir les cartes' })).toBeVisible();
    await user.keyboard('{ArrowDown}');
    expect(within(menu).getByRole('menuitem', { name: 'Voir les cartes' })).toHaveFocus();
    await user.keyboard('{ArrowDown}');
    expect(within(menu).getByRole('menuitemradio', { name: 'RMA' })).toHaveFocus();
    await user.keyboard('{End}');
    expect(within(menu).getByRole('menuitem', { name: 'Voir les cartes' })).toHaveFocus();
    await user.keyboard('{Home}{Enter}');
    expect(chosen).toEqual(['rma']);
    expect(screen.queryByRole('menu')).toBeNull();
    expect(button).toHaveFocus();
  });

  it('close with Escape, Tab or a click elsewhere, choosing nothing', async () => {
    chosen.length = 0;
    renderMenu();
    const user = userEvent.setup();
    const button = screen.getByRole('button', { name: 'Espace' });
    await user.click(button);
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('menu')).toBeNull();
    expect(button).toHaveFocus();
    // The down arrow on the button opens it too.
    await user.keyboard('{ArrowDown}');
    expect(screen.getByRole('menu')).toBeVisible();
    await user.tab();
    expect(screen.queryByRole('menu')).toBeNull();
    await user.click(button);
    await user.click(screen.getByText('Ailleurs'));
    expect(screen.queryByRole('menu')).toBeNull();
    expect(chosen).toEqual([]);
  });
});

describe('folded details and quiet empty lines', () => {
  it('keep details folded until asked for, then show them', async () => {
    render(
      <Disclosure title="Historique">
        <p>Émis par Nadia</p>
      </Disclosure>,
    );
    const user = userEvent.setup();
    const details = screen.getByText('Historique').closest('details');
    expect(details).not.toHaveAttribute('open');
    await user.click(screen.getByText('Historique'));
    expect(details).toHaveAttribute('open');
    expect(screen.getByText('Émis par Nadia')).toBeVisible();
  });

  it('say there is nothing in one line for a part of a page', () => {
    render(<EmptyState compact title="Aucune attestation enregistrée." />);
    const line = screen.getByText('Aucune attestation enregistrée.');
    expect(line.tagName).toBe('P');
    expect(line.querySelector('svg')).toBeNull();
  });
});
