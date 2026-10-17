# Phase 9 — Preferences UI

**Status: in progress (2026-10-17).** Depends on: the v1 release (archived plans). This is the
foundation phase for the next stage.

## Goal

Give the user one place to configure the authoring model and the narration voice
without editing environment files or restarting with different variables. A
connection profile is named, testable, and switchable; secrets stay server-side.

## Scope

### In

- A `ConnectionProfile` model with kinds `authoring` and `narration`.
- Local storage under `$SOTHSPELL_HOME/config/` with a separate secret store.
- A settings API: list, create, update, delete, activate, and test.
- A `/settings` route in the web app with authoring and narration sections.
- Profile-aware wiring for authoring, in-tour questions, drilldown, and
  narration synthesis.
- Environment variables remain the fallback and never get overwritten.
- Validation messages that name the field and the expected shape.

### Out

- Accounts, cloud sync, or sharing profiles between users (Phase 12).
- Provider-specific OAuth flows for model providers.
- Per-project profile overrides.
- Key rotation, audit logs, or team policies.

## Decisions

1. **New package `packages/settings`** owns the profile schema, secret store,
   and settings service. The API and CLI consume it; the web app talks to the
   API only.
2. **Profiles live in `$SOTHSPELL_HOME/config/profiles.json`.** The file is
   user-readable only (`0600` where the platform supports it). Environment
   variables override a profile at runtime and are marked read-only in the UI.
3. **Secrets live in `$SOTHSPELL_HOME/config/secrets.json`** behind a
   `SecretStore` port. A keychain-backed implementation is a future adapter; the
   file store is the v2 default. Secret values never appear in a `GET` response,
   a log line, or a tour.
4. **API keys are write-only.** `PUT /api/settings/profiles/:id` accepts a
   secret value; the response contains only `secretRef` and `hasSecret`.
5. **The active profile is per kind.** One authoring profile and one narration
   profile are active at a time. Switching is immediate for new operations; an
   in-flight run keeps the profile it started with.
6. **Test connection is a real call, but bounded.** Authoring uses a tiny
   structured generation; narration uses a short synthesis (cached by content
   hash). The test returns latency, model id, and a redacted error.
7. **No provider keys in the browser.** The settings UI never receives a key
   after the initial write.

## Waves

### Wave 1 — Profile domain and store

- `ConnectionProfileSchema` (Zod 4): `id`, `name`, `kind`, `provider`,
  `baseUrl`, `modelId`, `voiceId`, `outputFormat`, `secretRef`, `active`,
  `createdAt`, `updatedAt`.
- `SettingsService`: CRUD, activate, resolve active profile with env fallback,
  redaction, and file permissions.
- `SecretStore` file adapter with atomic writes and masked reads.
- Tests: schema validation, secret redaction, atomic writes, env precedence,
  corrupted-file recovery.

### Wave 2 — Settings API

- `GET /api/settings/profiles`, `POST /api/settings/profiles`,
  `PUT /api/settings/profiles/:id`, `DELETE /api/settings/profiles/:id`,
  `POST /api/settings/profiles/:id/activate`,
  `POST /api/settings/profiles/:id/test`.
- Zod request/response schemas; 400 for invalid, 404 for unknown, 409 for
  duplicate names, 502 for provider test failures with a redacted message.
- Tests: CRUD, activation, masking, test-connection with a fake provider,
  failure mapping.

### Wave 3 — Preferences UI

- `/settings` route with two sections (Authoring, Narration) and a provider
  form: name, provider, base URL, model id, voice id, output format, API key,
  test button, activate button.
- Keyboard-only path, visible focus, inline validation, `role="status"` for
  test results, and no color-only state.
- A first-run nudge on the home page when no authoring profile exists, with a
  link to `/settings`.
- Playwright: create, test (fake provider), activate, edit, delete; axe on the
  empty, filled, and error states.

### Wave 4 — Pipeline integration

- Authoring, ask, and drilldown resolve the active authoring profile; narration
  resolves the active narration profile; env fallback remains.
- Quality reports record the profile name and model id (never the secret).
- Tests: authoring with a profile-backed fake model, narration with a
  profile-backed fake provider, env fallback when no profile is active.

## Test seams

- `packages/settings` public API: schema, service, secret store.
- `apps/api` settings routes with an injected `SettingsService`.
- `apps/web` settings page with a mocked API.
- Pipeline resolution via the existing `GuideModel` and narration seams.

## Bunbun acceptance

1. Create an authoring profile that points at the fixture model.
2. Author a Bunbun tour through the active profile.
3. Create a narration profile that points at the browser speech fallback.
4. Play the tour in listen mode.
5. Confirm `git -C /Users/ajc/Projects/codegens/bunbun status --porcelain` is
   empty.

## Exit criteria

- Profiles can be created, tested, activated, edited, and deleted entirely in
  the UI.
- Secrets are write-only and never returned by the API.
- Authoring and narration use the active profile with env fallback.
- `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm build`, browser tests, and
  axe pass.
- The settings page has a keyboard-only path and 0 critical/serious violations.
- Bunbun remains read-only.

## Risks

- **Secret storage.** A file store is convenient but weaker than a keychain.
  Document it, restrict permissions, and keep the port ready for a keychain
  adapter.
- **Provider drift.** Base URLs and model ids change; the test button and clear
  errors are the mitigation.
- **Scope creep.** Settings can grow into an admin console. Keep it to two
  kinds and one active profile each.

## Working style

- Use `tdd` and `codebase-design`; confirm the `SettingsService` seam before the
  first test.
- Use the `design-taste-frontend` guardrails for the settings page.
- Keep secrets out of fixtures, snapshots, and logs.
- Record the profile resolution rules in `CONTEXT.md` when they land.
