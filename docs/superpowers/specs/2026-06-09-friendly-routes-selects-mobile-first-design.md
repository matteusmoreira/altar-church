# Friendly Routes, Selects, and Mobile-First Design

## Goal

Make dashboard URLs match visible PT-BR menu labels, normalize all shared select
controls, and make dashboard workflows usable from a 360px-wide mobile viewport
without breaking existing links or module permissions.

## Route Design

Visible routes use lowercase, accent-free slugs derived from menu labels. Internal
module IDs remain unchanged because they are persisted authorization identifiers.

| Module ID | Current route | Friendly route |
| --- | --- | --- |
| `church-info` | `/church-info` | `/informacoes` |
| `ministries` | `/ministries` | `/ministerios` |
| `programming` | `/programming` | `/programacao` |
| `songs` | `/songs` | `/louvor` |
| `congregations` | `/congregations` | `/congregacoes` |
| `members` | `/members` | `/pessoas` |
| `visitors` | `/visitors` | `/visitantes` |
| `groups` | `/groups` | `/gceus` |
| `cells` | `/cells` | `/celulas` |
| `prayer` | `/prayer` | `/intercessao` |
| `reading-plans` | `/reading-plans` | `/discipulado` |
| `events` | `/events` | `/eventos` |
| `content` | `/content` | `/conteudo` |
| `notifications` | `/notifications` | `/notificacao` |
| `communication` | `/communication` | `/comunicacao` |
| `attendance` | `/attendance` | `/presenca` |
| `finance` | `/finance` | `/financeiro` |
| `donations` | `/donations` | `/doacao` |
| `reports` | `/reports` | `/relatorios` |
| `settings` | `/settings` | `/configuracoes` |

Routes already matching normalized menu labels remain unchanged:
`/dashboard`, `/crm`, `/inpeace-play`, and `/admin`.

A shared typed route registry is the source for menu links, protected route
prefixes, compatibility redirects, and tests. Existing English URLs permanently
redirect to friendly URLs, including nested member detail paths and query strings.
App Router folders move to their friendly route segments. Persisted
`system_modules.route` values receive a forward-only migration.

## Select Design

The shared select primitive becomes predictable across forms and filters:

- Full-width trigger by default, with local responsive widths still supported.
- 44px mobile touch target and compact desktop height.
- Popup aligned to trigger start, at least trigger width, constrained to viewport.
- Items use comfortable mobile height and retain keyboard navigation.
- Selection, disabled state, form names, and existing values remain unchanged.

## Mobile-First Design

Shared primitives establish mobile behavior first:

- Buttons, icon buttons, select triggers, tabs, close controls, and navigation
  targets meet a 44px mobile touch target while preserving compact desktop sizing.
- Dashboard content reserves space for fixed bottom navigation and safe-area inset.
- Bottom navigation remains usable with narrow labels and nested route active state.
- Dialogs fit the viewport, scroll internally, and expose reachable close/actions.
- Tables retain horizontal scrolling where a card representation does not exist.
- Forms and action rows stack at mobile widths; fixed-width selects become full width.
- Page content must not cause viewport-level horizontal overflow at 360px.

Targeted page fixes are allowed where shared primitives cannot solve a real mobile
overflow or interaction defect. Broad visual redesign and unrelated architecture
changes are out of scope.

## Compatibility and Security

- Module IDs and permission checks do not change.
- Old routes redirect before rendering; protected friendly routes remain guarded.
- Server actions and cache revalidation use friendly route paths.
- Public `/church/[slug]`, API endpoints, auth routes, and database identifiers do
  not change.

## Validation

1. TypeScript, ESLint, node tests, and production build pass.
2. Route tests prove every menu label points to its friendly route and old routes
   redirect.
3. Shared select tests prove mobile sizing and popup constraints.
4. Chrome E2E verifies login, friendly navigation, a representative select flow,
   old-route redirect, nested person route, and no horizontal page overflow at
   360x800.
5. Desktop Chrome smoke confirms navigation and representative forms still work.
