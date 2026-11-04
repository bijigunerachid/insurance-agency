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
| `PageHeader`, `BackLink` | Every page's top: way back, h1, one line of purpose, actions. |
| `Card` | A white block; with `title` a named region (h2) with actions; `flush` for tables. |
| `DataTable` | A table on a computer, one card per record on a phone. Shows the rows it is given: sorting, filtering and pagination stay with the page and its API (the API has no sorting, so no sort headers). |
| `EmptyState` | Nothing to show, and the real next step if there is one. |
| `Skeleton`, `SkeletonList` | The shape of a list while it loads (announced as « Chargement… »). |
| `ToastProvider`, `useToast` | Short messages after an action, over the page; success and information leave after 6 s, an error stays until closed; announced politely / at once. |
| `Alert` | A message inside a form or page: error, warning, info, success. |
| `StatusBadge` | A status with icon and word. |
| `Dialog`, `ConfirmDialog`, `ReasonDialog` | The browser's modal dialog (focus kept inside, Escape, focus returned). |
| `Pagination`, `ErrorState`, `Spinner`, `FormActions`, `MoreFilters` | As before, on the tokens. |

## Application layout (stage 2)

`frontend/src/layouts/AppLayout.jsx`. Routes and permissions unchanged: the menu shows a page only to
the people who may open it, and the API checks again.

- **Computer (768 px and wider):** a side menu along the full height: the agency's logo, the
  workspace (« changer d'espace »), the five daily pages, then « Plus » with its pages in groups
  (Suivi, Référentiel, Administration, Compte; an empty group is not shown), and at the bottom the
  person, « Se déconnecter » and « Réduire le menu ». Reduced, the menu shows icons only, with each
  page's name kept for screen readers and as a tooltip; the choice is remembered in the browser
  (`localStorage`, nothing important). The current page has a blue bar on its left.
- **Header:** « Recherche rapide » (Ctrl+K from any page; the same search as the home page, in a
  dialog, `features/search`). The page's title stays in the page (its h1), not repeated in the header.
- **Workspace colour:** a 4 px strip along the top of the screen, in the insurer's colour.
- **Phone:** a header with the agency's logo, the search, the workspace and « Se déconnecter »; the
  bottom bar of the daily pages and « Plus », which opens its grouped pages in a panel (closed by
  choosing a page, by the shade or with Escape).
- **Print:** menu, header and strip are hidden.

## Stages

The redesign goes stage by stage, each on its own branch, merged by the owner before the next
(`docs/roadmap.md`): 1 tokens and components; 2 application layout; 3 sign-in and workspace
cards; 4 home; 5 clients and vehicles; 6 contracts; 7 renewals; 8 payments and receipt; 9 stock;
10 scanner and documents; 11 remittances; 12 reports; 13 administration and audit log. The tag
`avant-redesign` marks the application before stage 1. No stage changes the backend, the API or
a business rule.
