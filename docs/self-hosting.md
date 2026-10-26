# Self-Hosting

## Requirements

- Node.js 26+
- pnpm 12.14.0
- A local checkout of the project you want to explain
- Optional: `SOTHSPELL_MODEL` provider credentials
- Optional: `ELEVENLABS_API_KEY` + `ELEVENLABS_VOICE_ID` for cloud narration

## Install

Install a tagged GitHub release (replace `v0.3.1` with the newest tag), or clone
`main` for the latest unreleased changes:

```bash
git clone --branch v0.3.1 --depth 1 https://github.com/anthonyclarka2/sothspell.git
cd sothspell
corepack enable
pnpm install --frozen-lockfile
pnpm build
pnpm sothspell --version
pnpm sothspell doctor
```

`doctor` checks Node, TypeScript 7, `SOTHSPELL_HOME`, SQLite, the configured
`SOTHSPELL_PROJECT_ROOT`, model/voice configuration, and the port.

## Run

```bash
pnpm sothspell serve
# or
pnpm sothspell serve --port 4319 --host 127.0.0.1 --no-open
```

The server binds to loopback by default. `serve` hosts the API and the built web
app when `apps/web/dist` exists.

## Environment

```bash
SOTHSPELL_HOME=~/.sothspell
SOTHSPELL_PROJECT_ROOT=/path/to/project
SOTHSPELL_MODEL=openai/gpt-5.2          # or anthropic/...
OPENAI_API_KEY=...                       # provider key, server only
ANTHROPIC_API_KEY=...
ELEVENLABS_API_KEY=...
ELEVENLABS_VOICE_ID=...
ELEVENLABS_MODEL_ID=eleven_multilingual_v2
```

Never commit provider keys.

## Storage and backup

Everything lives under `SOTHSPELL_HOME`. Snapshot the directory to preserve tours,
audio, and runs. Source snapshots can be regenerated from the repository; tours
and audio cannot be regenerated without model/TTS calls.

## Upgrade

1. Fetch tags and check out the new release (`git fetch --tags`, then
   `git switch --detach v0.3.2`).
2. `pnpm install --frozen-lockfile`.
3. `pnpm build`.
4. `pnpm sothspell --version` and `pnpm sothspell doctor`.
5. Restart `serve`.

SQLite migrations are idempotent (`CREATE TABLE IF NOT EXISTS`) for the current
schema. Back up `sothspell.db` before upgrading across a schema change.

## Docker

There is no bundled Dockerfile. The local server is a Node process with a
host-mounted `SOTHSPELL_HOME` and a read-only project mount. Containerized
deployment remains a follow-up, not part of the source release.

## Security posture

- local-first, loopback by default; binding another host prints a warning
  because the API has no authentication;
- read-only source access with containment and symlink checks;
- server-side keys in `$SOTHSPELL_HOME/config/secrets.json` (0600) or the
  environment; never returned to the browser;
- OAuth sessions are server-side with httpOnly, SameSite=Lax cookies;
- imported repositories are shallow, read-only clones that never execute;
- no remote project upload;
- no hidden telemetry;
- `pnpm check:secrets` and `pnpm audit --prod` run in CI.

See [`SECURITY.md`](../SECURITY.md) for the full policy, accepted risks, and the
operator checklist.
