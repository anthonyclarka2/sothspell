#!/bin/sh
# Runs the Codex adapter CLI with the repository toolchain.
#
# The plugin is checked in under packages/harness-codex/plugin, so the
# repository root is four levels up. Set SOTHSPELL_REPO when the plugin lives
# elsewhere, or SOTHSPELL_TSX to a tsx-compatible launcher.
set -eu
here="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"
if [ -n "${SOTHSPELL_TSX:-}" ]; then
  exec "$SOTHSPELL_TSX" "$here/cli.ts" "$@"
fi
repo="${SOTHSPELL_REPO:-$(CDPATH= cd -- "$here/../../../.." && pwd)}"
exec pnpm --dir "$repo" exec tsx "$here/cli.ts" "$@"
