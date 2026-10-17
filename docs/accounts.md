# Accounts and Sync

Accounts are optional. The tool keeps working locally with no sign-in; signing
in with GitHub adds cross-device run sync, export, and deletion.

## OAuth setup

Register a GitHub OAuth app with the redirect URI:

```
http://127.0.0.1:4319/api/auth/github/callback
```

Environment:

```bash
GITHUB_CLIENT_ID=...
GITHUB_CLIENT_SECRET=...
SOTHSPELL_PUBLIC_URL=http://127.0.0.1:4319
SOTHSPELL_SESSION_SECRET=<long random string>
# Optional GitHub Enterprise:
# GITHUB_BASE_URL=https://github.example.com
# GITHUB_API_BASE_URL=https://github.example.com/api/v3
```

Without `SOTHSPELL_SESSION_SECRET`, the server generates an ephemeral secret and
sessions reset on restart; `/api/auth/session` reports
`sessionSecretConfigured` and the account page shows a notice.

## Sessions

- Authorization-code flow with PKCE; the scope is `read:user` only.
- Server-side session rows; the cookie is httpOnly, SameSite=Lax, and rotated on
  every sign-in. Expiry and revocation are enforced on each request.
- State-changing routes check the request origin; unknown origins are rejected.
- Tokens, cookies, and full OAuth payloads are never logged.
- A device flow is available for the CLI.

## Sync

`SyncService` pulls and pushes runs for the signed-in user:

- per-field last-write-wins by `updatedAt`;
- `completedBeatIds` is a set union;
- beat and offset resolve as the newest pair;
- deleted runs leave tombstones so a delete is not resurrected.

The local copy stays authoritative offline; the browser writes IndexedDB first
and mirrors to the server when signed in. On first sign-in the UI can claim the
local anonymous runs for the current client id; nothing is uploaded silently.

## API

| Method | Route                                                     |
| ------ | --------------------------------------------------------- |
| GET    | `/api/auth/github`                                        |
| GET    | `/api/auth/github/callback`                               |
| POST   | `/api/auth/github/device`, `/api/auth/github/device/poll` |
| GET    | `/api/auth/session`                                       |
| POST   | `/api/auth/signout`                                       |
| GET    | `/api/account`                                            |
| GET    | `/api/account/export`                                     |
| DELETE | `/api/account`                                            |
| POST   | `/api/sync/pull`, `/api/sync/push`, `/api/sync/claim`     |

## CLI

```bash
sothspell account signin|signout|status
sothspell sync status|push|pull
```

CLI credentials live under `SOTHSPELL_HOME` with 0600 permissions. The CLI
honours `SOTHSPELL_URL` and `SOTHSPELL_CLIENT_ID`.

## Privacy

- Export downloads all account data as JSON.
- Delete removes users, sessions, runs, and tombstones.
- Anonymous use requires no account and sends nothing.
