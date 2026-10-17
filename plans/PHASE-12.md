# Phase 12 — Accounts and Cross-Device Sync

**Status: complete (2026-10-17).** Depends on: Phase 9 (profiles) and the v1 run store;
shipped in parallel with Phases 10 and 11.

## Goal

Let a user sign in with GitHub and see the same tours, reviews, and run
progress on every device, while the tool keeps working locally without an
account. The server owns identity; the browser and harnesses stay local-first.

## Scope

### In

- GitHub OAuth sign-in with a loopback/device-flow path for local development.
- A `packages/accounts` package: user model, session model, OAuth adapter, and
  merge rules.
- Server tables for users, sessions, and user-scoped runs; the existing local
  SQLite store gains a `user_id` scope.
- Cross-device run sync: beat, offset, completed beats, speed, mode, and
  updated-at with per-field last-write-wins and a union of completed beats.
- An `/account` page: sign in/out, device list, sync status, export, delete.
- Anonymous runs can be claimed on first sign-in (client id migration).
- CLI: `sothspell sync status`, `sothspell sync push|pull`, `sothspell account`.
- Privacy: export all account data; delete the account and its runs.
- Local fallback: no account, no network — everything from v1 still works.

### Out

- Private repository import (a follow-up once accounts exist).
- Team/org roles, sharing tours, or comments between users.
- Passwords, email sign-in, or non-GitHub identity providers.
- Hosted billing or usage limits.
- Real-time collaborative editing.

## Decisions

1. **GitHub OAuth, as chosen by the owner.** Use the authorization-code flow
   with PKCE. Local development uses a loopback redirect
   (`http://127.0.0.1:4319/api/auth/github/callback`); a device flow is the
   fallback for CLI-only environments.
2. **Sessions are server-side and httpOnly.** A signed session cookie points at
   a session row; no JWT in local storage. State-changing routes require a CSRF
   token or an origin check.
3. **The run store gains a user scope.** `user_id` is nullable for anonymous
   local runs. The server merge is explicit: newer `updatedAt` per field wins;
   `completedBeatIds` is a set union; the newest beat/offset wins as a pair.
4. **The local copy is authoritative offline.** The browser writes IndexedDB
   first and mirrors to the server when signed in. Conflicts resolve on the
   next sync with a visible "synced" state.
5. **Claiming anonymous runs is explicit.** On first sign-in, the UI offers to
   attach the local runs for the current client id to the account; nothing is
   uploaded silently.
6. **Export and delete are first-class.** Export produces a JSON bundle of
   account, runs, and reviews. Delete removes rows and revokes sessions.
7. **No account required.** Every existing flow keeps working with
   `SOTHSPELL_CLIENT_ID` or the browser's local id.

## Waves

### Wave 1 — Identity domain

- `packages/accounts`: `User`, `Session`, `OAuthIdentity`, and
  `AccountStore` ports; GitHub profile fetch (id, login, name, avatar).
- Session creation, rotation, expiry, revocation; CSRF and origin checks.
- Tests: fake OAuth provider, PKCE verifier/challenge, state parameter, session
  expiry, revoked session rejection, profile mapping.

### Wave 2 — Storage and sync

- Server tables: `users`, `sessions`, `runs` with `user_id`; migrations from the
  v1 run table.
- `SyncService`: `pull`, `push`, `merge`, `claim(clientId)`, `export`,
  `deleteAccount`.
- Merge tests: newer wins, union of completed beats, equal timestamps, deleted
  run tombstones, offline push after a remote change, idempotent push.
- Anonymous-to-account claim tests.

### Wave 3 — API and account UI

- `/api/auth/github`, `/api/auth/github/callback`, `/api/auth/session`,
  `/api/auth/signout`; `/api/account`, `/api/account/export`,
  `DELETE /api/account`.
- `/account` page: sign-in, signed-in state, device/session list, sync status,
  export download, delete confirmation.
- Sign-in nudge on the home page; run sync badge in the player.
- Playwright with a fake OAuth provider: sign in, sync a run, sign out, export,
  delete; axe on signed-out, signed-in, and error states.

### Wave 4 — CLI and docs

- `sothspell account signin|signout|status`, `sothspell sync push|pull|status`.
- `docs/accounts.md`: OAuth app setup, redirect URIs, session security, merge
  rules, export/delete, and self-hosting notes.
- Self-hosting: document the required `GITHUB_CLIENT_ID`,
  `GITHUB_CLIENT_SECRET`, and `SOTHSPELL_PUBLIC_URL`.

## Test seams

- `packages/accounts` with a fake OAuth provider and an in-memory store.
- `SyncService` merge rules as pure functions plus API integration.
- Web account page with a mocked API.
- Existing anonymous run tests remain green.

## Bunbun acceptance

1. Sign in on two browser profiles against the same local server.
2. Play the Bunbun tour in both; complete different beats.
3. Sync; both profiles show the union of completed beats and the newest
   position.
4. Sign out; the tour still plays locally.
5. Bunbun remains read-only.

## Exit criteria

- GitHub OAuth sign-in works locally with a loopback redirect.
- Sessions are server-side, httpOnly, rotated, and revocable.
- Runs sync across two profiles with the documented merge rules.
- Export and delete work and are covered by tests.
- Anonymous local use is unchanged.
- `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm build`, browser tests, and
  axe pass.
- Bunbun remains read-only.

## Risks

- **OAuth app setup.** Users must register a GitHub OAuth app. The docs and the
  doctor output must make the redirect URI exact and copyable.
- **Session security.** CSRF, fixation, and token leakage are the risks. Use
  server-side sessions, httpOnly cookies, SameSite=Lax, and origin checks.
- **Merge surprises.** Last-write-wins can lose a position if clocks differ.
  Record `updatedAt` server-side where possible and show the merge result.
- **Privacy.** Account data is sensitive. Export/delete, minimal scopes
  (`read:user`), and no email storage unless needed.
- **Self-hosted identity.** A hosted Sóþspell and a local install need different
  redirect URLs; document both.

## Working style

- Use `tdd` for merge rules and session security; those are the risky seams.
- Keep anonymous paths free of auth imports.
- Never log tokens, cookies, or full OAuth payloads.
- Update `CONTEXT.md` with account and sync terms when they land.

## Shipped (closure, 2026-10-17)

- **`packages/accounts`** — GitHub OAuth over `fetch` (no OAuth library) with
  PKCE, device flow, sanitized errors, and `read:user`; HMAC-signed session and
  state values; server-side `SessionService` with rotation, expiry, revocation,
  and last-seen; origin policy; merge rules (per-field last-write-wins, set
  union of completed beats, newest beat/offset pair, tombstones); `SyncService`
  with pull/push/merge/claim/export/delete; in-memory and SQLite stores.
- **API** — `/api/auth/github`, callback, device flow, `/api/auth/session`,
  `/api/auth/signout`, `/api/account`, `/api/account/export`,
  `DELETE /api/account`, `/api/sync/pull|push|claim`.
- **Runs** — nullable `user_id`, tombstones, and an idempotent in-place
  migration; anonymous behavior unchanged.
- **UI** — `/account` with sign-in, sessions, sync status, export, and delete;
  a home sign-in nudge and a player sync badge.
- **CLI** — `sothspell account signin|signout|status` and
  `sothspell sync status|push|pull` with 0600 credentials.
- **Docs** — `docs/accounts.md`.

### Closure verification (fresh output, 2026-10-17)

- Track: 15 files / 135 focused tests; `pnpm test` 46 files / 298 tests;
  `pnpm test:browser` 23 passed (16 browser + 7 a11y) at 0 critical/serious.
- Manual real-server check with a fake GitHub provider: loopback sign-in,
  httpOnly SameSite=Lax cookie, sync push/claim/pull union merge, export
  attachment, delete followed by 401, and an evil-origin 403.
- After merge with Phases 9 and 11: `pnpm typecheck` clean, `pnpm lint` clean,
  `pnpm test` 69 files / 540 tests, `pnpm build` clean.
- Bunbun remains read-only.

### Owner-gated / follow-ups

- A real GitHub OAuth app and device-flow round trip were not run; a fake
  provider covered the flows.
- Without `SOTHSPELL_SESSION_SECRET` sessions reset on restart; the UI reports
  the ephemeral state.
- Reviews are not part of the export bundle until Phase 15 lands.
