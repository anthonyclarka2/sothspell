# Releasing

Sóþspell ships as a GitHub source release. There is no npm package and no hosted
service: a tag is the release identity, and users clone or download that tag,
install with pnpm, and build the web player locally.

## Version rules

The root [`package.json`](../package.json) is the release version. The health
endpoint and `sothspell --version` read it at runtime; every workspace and
checked-in plugin manifest must match it.

```bash
node scripts/set-version.mjs 0.3.2   # bump every manifest
pnpm check:version                   # verify the tree before a PR
```

`pnpm check:version` runs in CI and fails on a mixed tree. Update the top
section of [`release-notes.md`](./release-notes.md) by hand; the script does not
write prose.

## Preflight

Start from a clean `main` and run the full gate:

```bash
git switch main
git pull --ff-only
pnpm install --frozen-lockfile
pnpm check:version
pnpm typecheck
pnpm lint
pnpm test
pnpm test:coverage
pnpm build
pnpm check:bundle
pnpm test:browser
pnpm test:a11y
pnpm test:canvas:perf
pnpm check:toolchain
pnpm audit --prod --audit-level high
pnpm sothspell doctor
```

Test the release as a user would, outside the checkout:

```bash
release_dir="$(mktemp -d)"
git clone --branch main --depth 1 \
  https://github.com/anthonyclarka2/sothspell.git "$release_dir/sothspell"
cd "$release_dir/sothspell"
corepack enable
pnpm install --frozen-lockfile
pnpm build
pnpm sothspell --version
SOTHSPELL_HOME="$release_dir/home" pnpm sothspell doctor
SOTHSPELL_HOME="$release_dir/home" pnpm sothspell serve --port 4321 --no-open
```

Confirm `/api/health` reports the release version and `/` returns HTML. Stop the
server and remove `release_dir` when finished.

## Release flow

1. Branch from `dev` and open a prep PR into `dev`; merge it after CI passes.
2. Open a `dev → main` PR, wait for the full gate, and merge it. Do not tag a
   commit that has not passed CI on `main`.
3. Confirm the merged `main` tree is clean and `pnpm check:version` reports the
   release version.
4. Create an annotated tag and push it:
   ```bash
   git switch main
   git pull --ff-only
   git tag -a v0.3.2 -m "Sóþspell v0.3.2"
   git push origin v0.3.2
   ```
5. Create the GitHub Release. Use the top section of `release-notes.md`, then add
   the install block from the README:
   ```bash
   gh release create v0.3.2 \
     --title "Sóþspell v0.3.2" \
     --notes-file /path/to/release-body.md
   ```
   The body must state the supported Node/pnpm versions, the source-only
   install, and any owner-gated checks or known limitations.
6. Verify the published release from a clean directory:
   ```bash
   gh release view v0.3.2
   git clone --branch v0.3.2 --depth 1 \
     https://github.com/anthonyclarka2/sothspell.git /tmp/sothspell-v0.3.2
   ```
   Repeat the install, build, `--version`, doctor, and serve checks above.

## Rollback

- **Before announcing:** delete the GitHub Release, then delete the tag locally
  and remotely (`git tag -d v0.3.2`, `git push origin :refs/tags/v0.3.2`). Fix
  the tree and re-tag.
- **After announcing:** do not move a public tag. Publish a patch release with
  the fix and mark the broken release as pre-release if necessary. Users who
  already cloned keep their checkout; the patch is the supported path.

## First public release (v0.3.1)

`v0.3.1` is the first GitHub source release and rolls up the v1, next-stage, and
canvas eras. The manual VoiceOver/NVDA pass, a real Save-as-PDF check, and
real-device touch remain owner-gated; the automated gates and the documented
keyboard/outline paths are the release evidence.
