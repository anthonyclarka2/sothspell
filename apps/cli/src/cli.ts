import { mkdir, realpath, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {
  analyzeProject,
  buildProjectBrief,
  renderProjectBriefMarkdown,
  type ProjectSnapshot,
} from '@sothspell/analyzer';
import {
  authorTour,
  buildContextPack,
  createAiSdkGuideModel,
  createFixtureGuideModel,
  saveAnalysisArtifacts,
  saveTourArtifacts,
  type GuideModel,
  type TourPlan,
} from '@sothspell/authoring';
import {
  createSettingsService,
  type AuthoringConnection,
  type SettingsService,
} from '@sothspell/settings';
import type { ReviewService } from '@sothspell/review';
import { runDoctor } from './doctor.js';
import { parseImportArgs, runImport } from './import.js';
import { parseExportArgs, runExport } from './export.js';
import { runReview } from './review.js';
import { runServe, type ServeArgs } from './serve.js';
import { runAccountCommand } from './account.js';
import { parseTranslateArgs, runTranslate } from './translate.js';

export interface CliIO {
  stdout: (line: string) => void;
  stderr: (line: string) => void;
}

export interface CliDependencies {
  /** Injected settings service; tests keep the real SOTHSPELL_HOME untouched. */
  settings?: SettingsService;
  /** Injected review service; tests keep the real database untouched. */
  review?: ReviewService;
  /** Injected translation model; tests avoid a provider call. */
  translateModel?: GuideModel;
}

const USAGE = `Usage:
  sothspell analyze <path> [--json | --brief] [--out <file>] [--save] [--no-cache]
  sothspell author <path> [--model <provider/model>] [--out <dir>]
                          [--audience new-contributor|technical-evaluator|maintainer]
                          [--max-minutes <n>] [--no-cache]
  sothspell import <url> [--ref <ref>] [--json]
  sothspell export <tour.json> --embed --out <dir> [--source-root <path>]
  sothspell translate <tour.json> --locale <code> [--out <file>] [--model <provider/model>]
  sothspell serve [--port <n>] [--host <host>] [--no-open]
  sothspell doctor
  sothspell review list|show|approve|reject [<reviewId>] [--reason <text>]

Commands:
  analyze <path>    Build a read-only project snapshot.
  author <path>     Plan and write a Sóþspell tour from the snapshot.
  import <url>      Shallow-clone a public GitHub repository into SOTHSPELL_HOME.
  export <tour>     Write a self-contained embed bundle for a docs page.
  translate <tour>  Translate one tour into another locale and write it out.
  serve             Start the local API and web player.
  doctor            Check the local runtime and optional integrations.
  review            List, show, approve, or reject a stored review session.

Options:
  --json            Print the snapshot JSON (analyze), or the import record (import).
  --brief           Print the project brief as Markdown (analyze).
  --out <file|dir>  Write the snapshot JSON, the authored tour directory, or the
                    translated tour file.
  --save            Save the snapshot under SOTHSPELL_HOME/projects/<slug>/.
  --model <id>      provider/model, or "fixture" for a deterministic offline tour.
                    Defaults to SOTHSPELL_MODEL, then the active authoring
                    profile from /settings.
  --locale <code>   Target locale for translate (for example es or ar).
  --audience <kind> new-contributor, technical-evaluator, or maintainer.
  --max-minutes <n> Target tour runtime for the curriculum planner.
  --ref <ref>       Branch or tag to import (import).
  --embed           Export the embed bundle (required for export).
  --source-root <p> Read excerpts for anchors without embedded text (export).
  --port <n>        Port for serve (default 4319).
  --host <host>     Host for serve (default 127.0.0.1).
  --no-open         Do not open the browser from serve.
  --no-cache        Ignore the analysis and authoring caches.
  --help            Show this help.
`;

interface AnalyzeArgs {
  root: string;
  json: boolean;
  brief: boolean;
  out: string | null;
  save: boolean;
  noCache: boolean;
}

interface AuthorArgs {
  root: string;
  model: string | null;
  out: string | null;
  audience: TourPlan['audience'] | null;
  maxMinutes: number | null;
  noCache: boolean;
}

function parseAnalyzeArgs(argv: string[]): AnalyzeArgs {
  const root = argv[0];
  if (!root || root.startsWith('--')) {
    throw new Error(`analyze needs a project path\n\n${USAGE}`);
  }

  let json = false;
  let brief = false;
  let out: string | null = null;
  let save = false;
  let noCache = false;

  for (let index = 1; index < argv.length; index += 1) {
    const arg = argv[index];
    switch (arg) {
      case '--json':
        json = true;
        break;
      case '--brief':
        brief = true;
        break;
      case '--save':
        save = true;
        break;
      case '--no-cache':
        noCache = true;
        break;
      case '--out': {
        const value = argv[index + 1];
        if (!value || value.startsWith('--')) {
          throw new Error(`--out needs a file path\n\n${USAGE}`);
        }
        out = value;
        index += 1;
        break;
      }
      default:
        throw new Error(`unknown option: ${arg}\n\n${USAGE}`);
    }
  }

  if (json && brief) {
    throw new Error(`--json and --brief cannot be combined\n\n${USAGE}`);
  }

  return { root, json, brief, out, save, noCache };
}

function parseAuthorArgs(argv: string[]): AuthorArgs {
  const root = argv[0];
  if (!root || root.startsWith('--')) {
    throw new Error(`author needs a project path\n\n${USAGE}`);
  }

  let model: string | null = null;
  let out: string | null = null;
  let audience: AuthorArgs['audience'] = null;
  let maxMinutes: number | null = null;
  let noCache = false;

  for (let index = 1; index < argv.length; index += 1) {
    const arg = argv[index];
    switch (arg) {
      case '--model': {
        const value = argv[index + 1];
        if (!value || value.startsWith('--')) {
          throw new Error(`--model needs a provider/model id\n\n${USAGE}`);
        }
        model = value;
        index += 1;
        break;
      }
      case '--out': {
        const value = argv[index + 1];
        if (!value || value.startsWith('--')) {
          throw new Error(`--out needs a directory or file path\n\n${USAGE}`);
        }
        out = value;
        index += 1;
        break;
      }
      case '--audience': {
        const value = argv[index + 1];
        if (
          value !== 'new-contributor' &&
          value !== 'technical-evaluator' &&
          value !== 'maintainer'
        ) {
          throw new Error(`--audience must be a known audience\n\n${USAGE}`);
        }
        audience = value;
        index += 1;
        break;
      }
      case '--max-minutes': {
        const value = Number.parseInt(argv[index + 1] ?? '', 10);
        if (!Number.isFinite(value) || value < 1 || value > 60) {
          throw new Error(`--max-minutes needs a number between 1 and 60\n\n${USAGE}`);
        }
        maxMinutes = value;
        index += 1;
        break;
      }
      case '--no-cache':
        noCache = true;
        break;
      default:
        throw new Error(`unknown option: ${arg}\n\n${USAGE}`);
    }
  }

  return { root, model, out, audience, maxMinutes, noCache };
}

function sothspellHome(): string {
  return process.env.SOTHSPELL_HOME ?? path.join(os.homedir(), '.sothspell');
}

function defaultCacheDirectory(): string {
  return path.join(sothspellHome(), 'cache', 'analysis');
}

function defaultAuthoringCacheDirectory(): string {
  return path.join(sothspellHome(), 'cache', 'authoring');
}

function summary(snapshot: ProjectSnapshot): string[] {
  return [
    `Project: ${snapshot.project.name} (${snapshot.project.slug})`,
    `Revision: ${snapshot.revision.commit ?? 'not a git checkout'}${snapshot.revision.dirty ? ' (dirty)' : ''}`,
    `Files: ${snapshot.files.length}`,
    `Symbols: ${snapshot.symbols.length}`,
    `Imports: ${snapshot.graph.fileImports.length} file, ${snapshot.graph.packageImports.length} package`,
    `Cache: ${snapshot.analysis.cacheHits} hits, ${snapshot.analysis.cacheMisses} misses`,
    `Warnings: ${snapshot.warnings.length}`,
    `Duration: ${snapshot.analysis.durationMs} ms`,
  ];
}

async function ensureOutsideProject(root: string, outputPath: string): Promise<string> {
  const canonicalRoot = await realpath(root);
  const resolved = path.resolve(outputPath);
  if (resolved === canonicalRoot || resolved.startsWith(`${canonicalRoot}${path.sep}`)) {
    throw new Error(
      `refusing to write ${resolved} inside the project root; use SOTHSPELL_HOME or another directory`,
    );
  }
  return resolved;
}

async function runAuthor(
  args: AuthorArgs,
  io: CliIO,
  dependencies: CliDependencies,
): Promise<number> {
  // The settings resolver is consulted only when no explicit --model is given;
  // it applies SOTHSPELL_MODEL precedence itself and falls back to the active
  // authoring profile from /settings.
  let connection: AuthoringConnection | null = null;
  if (args.model === null) {
    const settings =
      dependencies.settings ?? createSettingsService({ homeDirectory: sothspellHome() });
    connection = await settings.resolveAuthoringConnection();
  }
  const modelId = args.model ?? connection?.modelId ?? null;
  if (!modelId) {
    io.stderr(
      `no model selected; pass --model <provider/model>, set SOTHSPELL_MODEL, or activate an authoring profile in /settings\n\n${USAGE}`,
    );
    return 2;
  }

  try {
    const analysisOptions = args.noCache
      ? {}
      : { cacheDirectory: defaultCacheDirectory() };
    const snapshot = await analyzeProject(args.root, analysisOptions);
    const brief = buildProjectBrief(snapshot);
    const context = await buildContextPack(snapshot, brief, {
      sourceRoot: args.root,
      maxCandidates: 60,
    });
    const modelOptions =
      args.model === null && connection?.source === 'profile'
        ? {
            ...(connection.apiKey === null ? {} : { apiKey: connection.apiKey }),
            ...(connection.baseUrl === null ? {} : { baseUrl: connection.baseUrl }),
          }
        : undefined;
    const model =
      modelId === 'fixture' || modelId === 'fake'
        ? createFixtureGuideModel(context)
        : createAiSdkGuideModel(modelId, modelOptions);

    const result = await authorTour(snapshot, model, {
      sourceRoot: args.root,
      contextPack: context,
      ...(args.audience === null ? {} : { audience: args.audience }),
      ...(args.maxMinutes === null ? {} : { maxMinutes: args.maxMinutes }),
      ...(args.noCache ? {} : { cacheDirectory: defaultAuthoringCacheDirectory() }),
      ...(connection?.profileName == null ? {} : { profileName: connection.profileName }),
      onProgress: (progress) => {
        const detail = progress.detail ? ` — ${progress.detail}` : '';
        const chapter =
          progress.chapterIndex === undefined ? '' : ` [${progress.chapterIndex + 1}]`;
        io.stderr(`author: ${progress.stage}${chapter}${detail}`);
      },
    });

    const requestedOut = args.out
      ? await ensureOutsideProject(args.root, args.out)
      : null;
    const canonicalRoot = await realpath(args.root);
    const saved = await saveTourArtifacts({
      home: sothspellHome(),
      document: result.document,
      quality: result.quality,
      snapshot,
      sourceRoot: canonicalRoot,
      sourceKind: 'local',
      ...(requestedOut === null ? {} : { destination: requestedOut }),
    });

    io.stdout(`Tour: ${result.document.title}`);
    io.stdout(
      `Chapters: ${result.quality.chapters}, beats: ${result.quality.beats}, anchors: ${result.quality.anchors}`,
    );
    io.stdout(
      `Model: ${result.quality.modelId}, calls: ${result.quality.modelCalls}, cache hits: ${result.quality.cacheHits}`,
    );
    if (result.quality.droppedChapters > 0) {
      io.stderr(`Dropped chapters: ${result.quality.droppedChapters}`);
    }
    for (const issue of result.quality.issues) {
      io.stderr(`Issue: ${issue}`);
    }
    io.stdout(`Wrote ${saved.tourPath}`);
    io.stdout(`Wrote ${saved.qualityPath}`);
    return 0;
  } catch (error) {
    io.stderr(`Error: ${error instanceof Error ? error.message : String(error)}`);
    return 1;
  }
}

function parseServeArgs(argv: string[]): ServeArgs {
  let port = 4319;
  let host = '127.0.0.1';
  let open = true;
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    switch (arg) {
      case '--port': {
        const value = Number.parseInt(argv[index + 1] ?? '', 10);
        if (!Number.isFinite(value) || value < 1 || value > 65535) {
          throw new Error(`--port needs a valid port\n\n${USAGE}`);
        }
        port = value;
        index += 1;
        break;
      }
      case '--host': {
        const value = argv[index + 1];
        if (!value || value.startsWith('--')) {
          throw new Error(`--host needs a host\n\n${USAGE}`);
        }
        host = value;
        index += 1;
        break;
      }
      case '--no-open':
        open = false;
        break;
      default:
        throw new Error(`unknown option: ${arg}\n\n${USAGE}`);
    }
  }
  return { port, host, open };
}

/**
 * The CLI is a thin shell over the analyzer seam. Keeping argument parsing here
 * means tests can drive the same behavior without spawning a process.
 */
export async function runCli(
  argv: string[],
  io: CliIO,
  dependencies: CliDependencies = {},
): Promise<number> {
  if (argv.length === 0 || argv[0] === '--help' || argv[0] === 'help') {
    io.stdout(USAGE.trimEnd());
    return 0;
  }

  if (argv[0] === 'doctor') {
    return runDoctor({}, io);
  }

  if (argv[0] === 'serve') {
    try {
      return await runServe(parseServeArgs(argv.slice(1)), io);
    } catch (error) {
      io.stderr(error instanceof Error ? error.message : String(error));
      return 2;
    }
  }

  if (argv[0] === 'author') {
    try {
      return await runAuthor(parseAuthorArgs(argv.slice(1)), io, dependencies);
    } catch (error) {
      io.stderr(error instanceof Error ? error.message : String(error));
      return 2;
    }
  }

  if (argv[0] === 'translate') {
    try {
      return await runTranslate(parseTranslateArgs(argv.slice(1)), io, {
        ...(dependencies.translateModel === undefined
          ? {}
          : { model: dependencies.translateModel }),
        ...(dependencies.settings === undefined
          ? {}
          : { settings: dependencies.settings }),
      });
    } catch (error) {
      io.stderr(error instanceof Error ? error.message : String(error));
      return 2;
    }
  }

  if (argv[0] === 'import') {
    try {
      return await runImport(parseImportArgs(argv.slice(1)), io);
    } catch (error) {
      io.stderr(error instanceof Error ? error.message : String(error));
      return 2;
    }
  }

  if (argv[0] === 'export') {
    try {
      return await runExport(parseExportArgs(argv.slice(1)), io);
    } catch (error) {
      io.stderr(error instanceof Error ? error.message : String(error));
      return 2;
    }
  }

  if (argv[0] === 'account' || argv[0] === 'sync') {
    return runAccountCommand(argv, io);
  }

  if (argv[0] === 'review') {
    return runReview(argv.slice(1), io, { service: dependencies.review });
  }

  if (argv[0] !== 'analyze') {
    io.stderr(`unknown command: ${argv[0]}\n\n${USAGE}`);
    return 2;
  }

  let args: AnalyzeArgs;
  try {
    args = parseAnalyzeArgs(argv.slice(1));
  } catch (error) {
    io.stderr(error instanceof Error ? error.message : String(error));
    return 2;
  }

  try {
    const options = args.noCache ? {} : { cacheDirectory: defaultCacheDirectory() };
    const snapshot = await analyzeProject(args.root, options);

    if (args.out) {
      const outputPath = await ensureOutsideProject(args.root, args.out);
      await mkdir(path.dirname(outputPath), { recursive: true });
      await writeFile(outputPath, `${JSON.stringify(snapshot, null, 2)}\n`, 'utf8');
      io.stdout(`Wrote ${outputPath}`);
    }

    if (args.save) {
      const saved = await saveAnalysisArtifacts({
        home: sothspellHome(),
        snapshot,
        sourceRoot: await realpath(args.root),
        sourceKind: 'local',
      });
      const message = `Saved ${saved.snapshotPath}`;
      if (args.json || args.brief) {
        io.stderr(message);
      } else {
        io.stdout(message);
      }
    }

    if (args.json) {
      io.stdout(JSON.stringify(snapshot, null, 2));
    } else if (args.brief) {
      io.stdout(renderProjectBriefMarkdown(buildProjectBrief(snapshot)));
    } else if (!args.out) {
      for (const line of summary(snapshot)) {
        io.stdout(line);
      }
    }

    return 0;
  } catch (error) {
    io.stderr(`Error: ${error instanceof Error ? error.message : String(error)}`);
    return 1;
  }
}
