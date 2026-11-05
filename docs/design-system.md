# Design system

The application's look in one place (redesign, stage 1, 04/11/2026). Tokens live in
`frontend/src/styles/index.css` (Tailwind 4 `@theme`); components in `frontend/src/components/`.
A page uses the token names and the components below, never raw colours or its own button styles.
Tailwind's own palette (`slate-*`, `blue-*`) stays available only for pages not yet moved over in
their redesign stage.

## Rules

- **Calm and dense.** Grey background, white surfaces with a thin border, almost no shadow. Colour
  only where it means something: the action blue, and green / orange / red for a status.
- **The insurer's colour is an accent**, never a page background: the strip at the top, the
  workspace badge, the logo cards (`docs/architecture.md`, workspaces).
- **Contrast (WCAG 2.2 AA)**: text 4.5:1 on its background, field borders and icons 3:1. Checked
  for every token pair below.
- **Never by colour alone**: a status has an icon and a word (`StatusBadge`).
- **Motion**: 150 ms, and none when the system asks for reduced motion (a global rule in
  `index.css`).
- **Offline**: the Inter font is bundled (`@fontsource-variable/inter` 5.2.8, SIL Open Font License);
  nothing is loaded from the Internet.

## Tokens

| Token | Value | Use | Contrast |
|---|---|---|---|
| `canvas` | `#F5F7FA` | Page background | — |
| `surface` | `#FFFFFF` | Cards, fields, dialogs | — |
| `sunken` | `#EEF1F5` | Hover of quiet buttons, skeletons, disabled fields | — |
| `ink` | `#0F172A` | Main text | 16.6:1 on canvas |
| `ink-soft` | `#334155` | Labels, secondary paragraphs | 10.4:1 on white |
| `ink-muted` | `#617188` | Supporting text, metadata (the brief's `#64748B` was 4.43:1 on canvas: darkened) | 4.6:1 on canvas, 5.0:1 on white |
| `line` | `#E2E8F0` | Separators (decoration) | — |
| `line-strong` | `#8391A5` | Field borders | 3.0:1 on white |
| `primary` / `-hover` / `-soft` | `#2563EB` / `#1D4ED8` / `#EFF6FF` | Main action, links, focus | white text 5.2:1 |
| `success` / `-ink` / `-soft` | `#16A34A` / `#15803D` / `#F0FDF4` | Done, paid, valid | icon only for `success` (3.3:1); text in `-ink` 5.0:1 |
| `warning` / `-ink` / `-soft` | `#D97706` / `#B45309` / `#FFFBEB` | To check, soon late | icon only for `warning` (3.2:1); text in `-ink` 5.0:1 |
| `danger` / `-hover` / `-ink` / `-soft` | `#DC2626` / `#B91C1C` / `#B91C1C` / `#FEF2F2` | Late, refused, irreversible | white text 4.8:1 |
| `rounded-control` | 6 px | Fields, buttons, badges | — |
| `rounded-card` | 10 px | Cards, dialogs, menus, toasts | — |
| `shadow-hairline` / `shadow-raised` | — | Cards / dialogs, menus, toasts | — |
| `text-page` | 24/32, 600 | The page's h1 | — |
| `text-section` | 16/24, 600 | h2 of a card or a dialog | — |
| `text-label` | 13/20, 500 | Field labels | — |
| `focus-ring` | 2 px `primary`, offset 2 px | Every focusable element | — |
| `animate-enter` | 150 ms | Dialogs, toasts | — |

Body text is 14 px (`text-sm`); fields use 16 px on a phone, so the phone does not zoom in.
Amounts, dates and table cells use tabular figures.

## Components

| Component | What it is for |
|---|---|
| `Button` | `variant` primary / secondary / danger / ghost, `size` sm / md / lg, `loading` (turning sign, second click refused, `aria-busy`), `icon`, `iconOnly` (the label stays for screen readers). Long labels wrap on a phone. |
| `ButtonLink` | A link to another page that looks like a button. |
| `TextField`, `SelectField`, `TextAreaField` | One look (`fieldStyles.js`); `optional` adds « (facultatif) »; hint and error tied with `aria-describedby`, `aria-invalid` on error. |
| `PasswordField` | A password field like `TextField`, with « Afficher les caractères » (a toggle; its name avoids « mot de passe » so the field alone answers to its label) and a warning while Caps Lock is on. |
| `PageHeader`, `BackLink` | Every page's top: way back, h1, one line of purpose, actions. |
| `Card` | A white block; with `title` a named region (h2) with actions; `flush` for tables. |
| `DataTable` | A table on a computer, one card per record on a phone. Shows the rows it is given: sorting, filtering and pagination stay with the page and its API (the API has no sorting, so no sort headers). `renderCard(row)` draws a list's own phone card (a client's card calls them). |
| `EmptyState` | Nothing to show, and the real next step if there is one; `compact` is one quiet line for a part of a page. |
| `Disclosure` | Details folded until asked for (the browser's `<details>`): a contract's or a client's less used facts, a history. |
| `Menu` | A small menu opened by a button (space switch, profile): arrows, Home, End, Enter; Escape, Tab or a click elsewhere closes it and gives the focus back; `menuitemradio` for a choice, `menuitem` for an action. |
| `Skeleton`, `SkeletonList`, `SkeletonDetail` | The shape of a list (`flush` inside a card) or of a record's page while it loads (announced as « Chargement… »). |
| `DetailList`, `DetailItem` | A record's facts, label above value, two columns from a small tablet; an empty value shows « — » (or the page's own word), never a blank. |
| `SectionHeading` | The top of a part of a page that holds its own list (h2 and its action). |
| `PhoneLink` | A client's number that calls them, written 06 12 34 56 78. |
| `TextLink`, `textLinkClasses` | A link inside text or a table, in the action colour. |
| `ToastProvider`, `useToast` | Short messages after an action, over the page; success and information leave after 6 s, an error stays until closed; announced politely / at once. |
| `Alert` | A message inside a form or page: error, warning, info, success. |
| `StatusBadge` | A status with icon and word. |
| `Dialog`, `ConfirmDialog`, `ReasonDialog` | The browser's modal dialog (focus kept inside, Escape, focus returned). |
| `Pagination`, `ErrorState`, `Spinner`, `FormActions`, `MoreFilters` | As before, on the tokens. |

## Application layout (stage 2)

`frontend/src/layouts/AppLayout.jsx`. Routes and permissions unchanged: the menu shows a page only to
the people who may open it, and the API checks again.

- **Computer (768 px and wider):** a side menu along the full height: the agency's logo (on the
  same line and height as the header), the five daily pages, then « Plus » (owner's choice, kept)
  with its pages in groups (Suivi, Référentiel, Administration, Compte; an empty group is not
  shown), and at the bottom « Réduire le menu ». Reduced, the menu shows icons only, with each page's
  name kept for screen readers and as a tooltip; the choice is remembered in the browser
  (`localStorage`, nothing important). The current page has a blue background.
- **Header (owner, 04/11/2026):** on the left where the person is (« Clients › Sara Test »: the
  menu's section, then the record a detail page names with `usePageTitle`); in the middle
  « Recherche rapide » (Ctrl+K from any page; the home page's search in a dialog, `features/search`;
  an icon below 1280 px); on the right the space menu (« ● RMA ⌄ »: each insurer, both, « Voir les
  cartes des espaces »; changing keeps the page and reloads its lists; the code only below 1280 px)
  and the person's menu (initials: name and role, « Mon compte », « Se déconnecter »).
- **Workspace colour:** a 4 px strip along the top of the screen, in the insurer's colour.
- **Phone:** a header with the agency's icon (or a small logo), the search, the space menu (code)
  and the person's menu; the
  bottom bar of the daily pages and « Plus », which opens its grouped pages in a panel (closed by
  choosing a page, by the shade or with Escape).
- **Print:** menu, header and strip are hidden.

## Sign-in and workspace cards (stage 3)

`frontend/src/layouts/AuthLayout.jsx`, used by the four sign-in steps (sign-in, code, new password,
second factor). From 1024 px: a dark panel on the left with the agency's logo, name and tagline,
one sentence and three lines on what the application does (only what exists), and « works on the
agency's network, without Internet »; the step on the right. Below 1024 px: the step alone under
the logo (one logo in the page, chosen by the screen's width). Passwords use `PasswordField`;
buttons show their work (`loading`). The workspace cards (`WorkspacePage.jsx`) use the same top
bar, colours and radius as the application.

## Home page (stage 4)

`frontend/src/pages/HomePage.jsx` (« Aujourd'hui »): a `PageHeader` with the greeting and the
agency's day in words (the date the server gives, `formatLongDate`); the workspace banner when one
insurer is chosen; two actions, the blue « Scanner une attestation » card and the search box,
side by side from 1280 px and one under the other below; then two `Card`s. « À faire » lists what
is waiting, late lines first (a red edge and « En retard »), with « N en retard » in its header;
« Mes prochains renouvellements » shows five, with the way to all of them. Each card shows the
shape of its rows while loading (`SkeletonList flush`), a plain sentence when empty and an error
inside the card if its list cannot be read, so the rest of the page stays usable. The renewal rows
(`RenewalList`, also on the renewals pages), the notifications line (`AlertsSwitch`) and the
workspace banner (`WorkspaceNotice`, on every filtered list) moved to the tokens.

## Clients and vehicles (stage 5)

Lists (`CustomersPage`, `VehiclesPage`, `VehicleTable`): `PageHeader` with the page's action, the
search in a card (filters behind « Filtres » on a phone, now also for vehicles), `DataTable` (a
client's phone card keeps its call button), the shape of the rows while loading, and an
`EmptyState` that says to try another search when one was typed or a filter set. Record pages
(`CustomerDetailPage`, `VehicleDetailPage`): `PageHeader` with the way back, the badges (type,
archived), the number to call and the actions; facts in `Card`s with `DetailList`; the shape of
the page while loading. On a client's page, contracts and vehicles sit under a `SectionHeading`
with their « + » action; the folded details keep their three parts. Forms (`CustomerFormPage`,
`VehicleFormPage`): `PageHeader`, one `Card` per part, the client type as two choice tiles, and
« Enregistrer » showing its work.

## Contracts (stage 6)

The list (`ContractsPage`, `ContractTable` also on a client's page) uses `DataTable`: no column
heading breaks over two lines any more, what is left to pay is in red when owed with « Encaisser »
beside it; on a phone each contract keeps its own card with the amount and « Encaisser » at its
foot. The contract page opens on a section holding the `PageHeader` (the client as title, the
reference, insurer and product, the statuses and the renewal chain, the actions) and three summary
tiles (vehicles and policy, « Assuré jusqu'au » in green or amber, what is left to pay); then
attestations, avenants, guarantees and vehicles each under a `SectionHeading` with one list block
and a compact empty line; details and history in `Disclosure`s. The form has one card for the
contract and the vehicles as choice tiles. Payments and documents on the page keep their look
until their own stages (8 and 10).

## Stages

The redesign goes stage by stage, each on its own branch, merged by the owner before the next
(`docs/roadmap.md`): 1 tokens and components; 2 application layout; 3 sign-in and workspace
cards; 4 home; 5 clients and vehicles; 6 contracts; 7 renewals; 8 payments and receipt; 9 stock;
10 scanner and documents; 11 remittances; 12 reports; 13 administration and audit log. The tag
`avant-redesign` marks the application before stage 1. No stage changes the backend, the API or
a business rule.
