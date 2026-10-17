# `@sothspell/harness`

The shared harness runtime and the adapter contract every Sóþspell host
consumes. One runtime owns analysis, authoring, storage, player reads, browser
launch, and ask; adapters translate their host's APIs into a small port.

## The contract

`HarnessAdapter` is the port. It describes what the runtime needs from a host:

| Member            | Purpose                                                          |
| ----------------- | ---------------------------------------------------------------- |
| `id`              | Stable adapter id, used for default model ids and error messages |
| `capabilities`    | What the host can do; see the matrix below                       |
| `projectRoot()`   | Absolute project root the host session works in                  |
| `createModel()`   | Builds the `GuideModel` the authoring pipeline calls             |
| `launch(url)`     | Optional; opens the player, never fatal                          |
| `notify(message)` | Optional; shows a message to the user                            |
| `emit(event)`     | Optional; mirrors runtime events into the host                   |

`createHarnessRuntime(adapter, options)` returns a `HarnessRuntime` with the
behavior surface the phase plan calls the contract: `status`, `generate`,
`open`, `progress`, `ask`, `cancel`, `capabilities`, `events`, and `dispose`.
Adapters are translation only; they never reimplement authoring, storage, or
player access.

Capability matrix (`defineCapabilities` fills conservative defaults):

| Capability             | Meaning                                                                             |
| ---------------------- | ----------------------------------------------------------------------------------- |
| `structuredOutput`     | Host returns schema-validated JSON, not only text                                   |
| `textGeneration`       | Host has a model connection; `false` fails `generate` with `unsupported_capability` |
| `notify`               | Host can show free-form messages                                                    |
| `browserLaunch`        | The runtime may open the player URL                                                 |
| `cancel`               | Host can cancel in-flight generation                                                |
| `backgroundGeneration` | Host can run generation without blocking its own turn                               |

## What the runtime owns

- **Storage.** Tours and quality reports live at
  `<SOTHSPELL_HOME>/projects/<slug>/tours/<tourId>/`; caches live under
  `<SOTHSPELL_HOME>/cache/`. The project tree is never written.
- **Read-only analysis.** `analyzeProject` reads the working tree; snapshots and
  tours stay under `SOTHSPELL_HOME`.
- **Player access.** `status`, `progress`, and `ask` read the local API at
  `playerUrl` (default `http://127.0.0.1:4319`, overridable with
  `SOTHSPELL_PLAYER_URL`). `open` deep-links to `<playerUrl>/t/<tourId>`.
- **Client identity.** `SOTHSPELL_CLIENT_ID` wins; otherwise a stable
  per-install id is derived from the data directory, so the browser and
  harnesses can share one run.
- **Error mapping.** Failures surface as `SothspellError` with one of
  `generation_running`, `generation_failed`, `no_tour`, `ask_failed`, or
  `unsupported_capability`.

`launchPlayer`, `formatStatus`, `formatAnswer`, `sessionStartHookOutput`,
`createTextGuideModel`, and `runHarnessCommand` are shared so adapters do not
drift.

## Conformance suite

Every adapter runs the suite against a fake host:

```ts
import { createHarnessRuntime } from '@sothspell/harness';
import {
  createFakeHarnessBackend,
  createFakePlayerFetch,
  harnessConformanceCases,
} from '@sothspell/harness/conformance';

describe('my harness conformance', () => {
  for (const testCase of harnessConformanceCases(async () => buildEnvironment())) {
    it(testCase.name, testCase.run);
  }
});
```

`buildEnvironment()` returns the adapter, the runtime built with
`createFakeHarnessBackend().dependencies` and a fake player fetch, recorded
launches/notifications/events, the player URL, and a `cleanup`. The suite
covers the capability matrix, the generation lifecycle, cancellation, progress
merge, error mapping, and cleanup.

## Authoring a new adapter

1. Create `packages/harness-<host>` with a process seam for the host
   (spawn or API client) so tests inject a fake.
2. Build a `GuideModel` with `createTextGuideModel`; add a `generateObject`
   host function when the host validates schemas itself.
3. Implement `HarnessAdapter` with `id`, `capabilities`, `projectRoot`,
   `createModel`, and the optional `launch`, `notify`, and `emit`.
4. Return `createHarnessRuntime(adapter, options)` from a
   `create<Host>Runtime()` helper, defaulting `playerUrl` to
   `DEFAULT_SERVE_URL` and `startHint` to the exact `sothspell serve` command.
5. Run the conformance suite with a fake host, then verify with the real CLI
   (owner-gated).

The next adapters (Gemini CLI, Aider, …) enter through the same suite.
