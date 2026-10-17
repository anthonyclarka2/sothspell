# Development

## Workspace layout

```
apps/api                  @sothspell/api — Hono API and static web host
apps/cli                  @sothspell/cli — analyze CLI
apps/web                  @sothspell/web — React 19 + Vite 8 player
packages/core             @sothspell/core — schema, source access, compiler
packages/analyzer         @sothspell/analyzer — snapshots, symbols, graph, brief
packages/diagram          @sothspell/diagram — diagram IR, validation, ELK layout
packages/player           @sothspell/player — framework-free playback engine
packages/authoring        @sothspell/authoring — GuideModel, context, authoring pipeline
packages/narration        Phase 5 placeholder
packages/harness          Phase 7 placeholder
examples/bunbun-tour      checked-in golden tour (Bunbun 9fef24d)
scripts/                  golden-tour build and toolchain guard
plans/                    roadmap and phase plans
```

Package names use the ASCII `sothspell` slug; the product name is **Sóþspell**.

## Prerequisites

- Node.js 26 or newer.
- pnpm 12.14.0 (`packageManager` in the root `package.json`).
- Google Chrome for the Playwright browser tier (`channel: 'chrome'`).
- The Bunbun checkout at `/Users/ajc/Projects/codegens/bunbun` for the golden
  tour build and the read-only regression test.

## Commands

```bash
pnpm install
pnpm dev              # API on 127.0.0.1:4319, web on 127.0.0.1:5173
pnpm typecheck        # tsc -p tsconfig.json --noEmit (TypeScript 7)
pnpm lint             # oxlint
pnpm test             # Vitest unit and integration tests
pnpm test:browser     # Playwright journey tests
pnpm test:a11y        # axe-core accessibility tests
pnpm build            # production web build
pnpm check:toolchain  # TypeScript 7 and no classic compiler API packages
pnpm schema:json      # regenerate packages/core/schema/sothspell.schema.json
pnpm tour:build       # regenerate examples/bunbun-tour/tour.json
pnpm sothspell analyze /Users/ajc/Projects/codegens/bunbun --brief
pnpm sothspell analyze /Users/ajc/Projects/codegens/bunbun --save
pnpm sothspell author /Users/ajc/Projects/codegens/bunbun --model fixture --out /tmp/bunbun-tour
```

The analyzer guide is [analysis.md](./analysis.md) and the authoring guide is
[authoring.md](./authoring.md). The CLI cache, saved snapshots, and authored
tours live under `SOTHSPELL_HOME` (default `~/.sothspell`), never in the analyzed
project.

The dev server ports are `127.0.0.1:4319` (API) and `127.0.0.1:5173` (web). The
web dev server proxies `/api` to the API.

## Golden tour workflow

`examples/bunbun-tour/tour.source.json` is the editable source: chapters, beats,
narration, diagram instructions, and anchors with line ranges. The anchors carry
a `contains` guard for the expected text.

```bash
pnpm tour:build
```

The build script:

1. verifies the Bunbun checkout is at the pinned commit `9fef24d`;
2. reads the anchor ranges from Bunbun read-only;
3. hashes each excerpt;
4. writes `examples/bunbun-tour/tour.json`.

The Bunbun tree is never written to. `pnpm tour:build` refuses to run against a
different commit until the pin is updated deliberately.

After a source change, `pnpm test` compiles the golden tour and checks every
anchor and diagram.

## TypeScript 7 constraints

TypeScript 7.0 ships without the classic compiler API. Do not add a package that
imports `typescript` for AST work (`ts-morph`, `typescript-estree`,
`vite-tsconfig-paths`, and similar). `pnpm check:toolchain` fails when one
appears.

TypeScript configuration defaults to explicit values: `strict`,
`module: ESNext`, `moduleResolution: Bundler`, `rootDir`, and `types: ['node']`.
`baseUrl` and `moduleResolution: node` are not available.

## Bunbun read-only rule

No command in this repository writes inside
`/Users/ajc/Projects/codegens/bunbun`. All snapshots, tours, audio, runs, and
logs live under `SOTHSPELL_HOME` (default `~/.sothspell`). The golden tour test
runs `git -C /Users/ajc/Projects/codegens/bunbun status --porcelain` and expects
an empty result.

## Working agreements

- pnpm only; never npm or yarn.
- Test at public seams; see `plans/ROADMAP.md` §18.
- Update the relevant phase plan when a decision changes.
- Commit each completed wave with a descriptive message.
