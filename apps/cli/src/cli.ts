import { mkdir, realpath, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {
  analyzeProject,
  buildProjectBrief,
  renderProjectBriefMarkdown,
  saveSnapshot,
  snapshotPathFor,
  type ProjectSnapshot,
} from '@sothspell/analyzer';

export interface CliIO {
  stdout: (line: string) => void;
  stderr: (line: string) => void;
}

const USAGE = `Usage:
  sothspell analyze <path> [--json | --brief] [--out <file>] [--save] [--no-cache]

Commands:
  analyze <path>    Build a read-only project snapshot.

Options:
  --json            Print the snapshot JSON.
  --brief           Print the project brief as Markdown.
  --out <file>      Write the snapshot JSON to a file outside the project.
  --save            Save the snapshot under SOTHSPELL_HOME/projects/<slug>/.
  --no-cache        Ignore the per-file analysis cache.
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

function sothspellHome(): string {
  return process.env.SOTHSPELL_HOME ?? path.join(os.homedir(), '.sothspell');
}

function defaultCacheDirectory(): string {
  return path.join(sothspellHome(), 'cache', 'analysis');
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

/**
 * The CLI is a thin shell over the analyzer seam. Keeping argument parsing here
 * means tests can drive the same behavior without spawning a process.
 */
export async function runCli(argv: string[], io: CliIO): Promise<number> {
  if (argv.length === 0 || argv[0] === '--help' || argv[0] === 'help') {
    io.stdout(USAGE.trimEnd());
    return 0;
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
      const savedPath = await saveSnapshot(
        snapshot,
        snapshotPathFor(sothspellHome(), snapshot.project.slug),
      );
      const message = `Saved ${savedPath}`;
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
