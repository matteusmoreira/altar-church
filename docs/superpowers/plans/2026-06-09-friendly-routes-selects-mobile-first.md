# Friendly Routes, Selects, and Mobile-First Implementation Plan

**Goal:** Replace English dashboard URLs with friendly PT-BR slugs, normalize
shared selects, and remove mobile interaction/overflow defects.

**Architecture:** Keep persisted permission/module IDs unchanged. Add one typed
navigation registry consumed by menu, auth proxy, redirects, and tests. Move App
Router route segments to friendly slugs. Improve shared UI primitives first, then
fix page-specific mobile exceptions found by Chrome.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript, Tailwind CSS 4,
Base UI, Playwright Chrome, Node test runner.

---

## Task 1: Lock route and mobile contracts

**Files:**
- Create: `tests/p8-friendly-routes-mobile.test.mjs`
- Modify: `tests/e2e/authenticated-smoke.spec.ts`
- Modify: `playwright.config.ts`

1. Add a node contract test for the typed route registry, redirects, physical
   friendly route folders, protected paths, select sizing, and mobile shell.
2. Run the new test and confirm it fails for missing implementation.
3. Add mobile Chrome project and representative friendly-route/select/overflow
   E2E coverage.

## Task 2: Introduce friendly route registry and compatibility redirects

**Files:**
- Create: `src/lib/navigation/routes.ts`
- Modify: `next.config.ts`
- Modify: `src/lib/supabase/proxy.ts`
- Modify: `src/components/layout/dashboard-layout.tsx`
- Create: `supabase/migrations/20260609120000_friendly_dashboard_routes.sql`

1. Define module ID to friendly route mapping and legacy redirect mapping.
2. Use registry for menu links, route activity, and protected prefixes.
3. Add permanent wildcard redirects preserving nested paths/query strings.
4. Add migration updating `system_modules.route` without changing module IDs.
5. Run route contract test.

## Task 3: Move App Router segments and update internal URLs

**Files:**
- Move: dashboard route directories listed in approved design
- Modify: affected `src/**/*.ts(x)` URL literals
- Modify: affected `tests/**/*.mjs` and `tests/e2e/**/*.ts`

1. Move each translated dashboard directory to its friendly segment.
2. Update navigation, router fallback, revalidation, tests, and documentation URL
   literals while preserving API endpoints and permission/module identifiers.
3. Verify old route names remain only in registry legacy mappings, module IDs,
   library paths, database identifiers, and historical migrations.
4. Run node tests, TypeScript, and lint.

## Task 4: Normalize selects and mobile shared primitives

**Files:**
- Modify: `src/components/ui/select.tsx`
- Modify: `src/components/ui/button.tsx`
- Modify: `src/components/ui/input.tsx`
- Modify: `src/components/ui/input-group.tsx`
- Modify: `src/components/ui/tabs.tsx`
- Modify: `src/components/ui/dialog.tsx`
- Modify: `src/components/ui/sheet.tsx`
- Modify: `src/components/layout/dashboard-layout.tsx`

1. Make selects full-width by default, start-aligned, viewport-constrained, and
   touch-friendly.
2. Set 44px mobile touch targets with compact desktop sizes.
3. Make dialogs and sheets viewport-safe and actions reachable.
4. Make bottom navigation active for nested routes and reserve safe content space.
5. Run contract test, TypeScript, and lint.

## Task 5: Fix page-specific mobile exceptions

**Files:**
- Modify: dashboard pages/components identified by Chrome audit

1. Start app and authenticate using existing E2E setup.
2. Audit every dashboard menu route at 360x800 for page-level horizontal overflow,
   clipped controls, unreachable actions, and broken selects.
3. Apply narrow fixes: stack action rows, full-width filters, scroll tabs/tables,
   constrain long text, and keep modal content reachable.
4. Re-run mobile route audit until all routes pass.

## Task 6: Full verification

1. Run `npm run typecheck`.
2. Run `npm run lint`.
3. Run `node --test tests/*.test.mjs`.
4. Run `npm run build`.
5. Run `npm run e2e:setup`.
6. Run focused desktop and mobile Chrome E2E, then full E2E when environment permits.
7. Inspect final diff, route residue, and git status.

