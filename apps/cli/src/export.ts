import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  buildEmbedExport,
  EMBED_API_VERSION,
  type EmbedAsset,
  type EmbedAssetWriter,
} from '@sothspell/embed/export';
import type { CliIO } from './cli.js';

export const EXPORT_USAGE = `Usage:
  sothspell export <tour.json> --embed --out <dir> [--source-root <path>]
`;

export interface ExportArgs {
  tour: string;
  out: string;
  sourceRoot: string | null;
  embed: boolean;
}

export interface ExportDeps {
  readTour?: (tourPath: string) => Promise<unknown>;
  readAssets?: () => Promise<EmbedAsset[]>;
  now?: () => Date;
}

export function parseExportArgs(argv: string[]): ExportArgs {
  const tour = argv[0];
  if (!tour || tour.startsWith('--')) {
    throw new Error(`export needs a tour.json path\n\n${EXPORT_USAGE}`);
  }

  let out: string | null = null;
  let sourceRoot: string | null = null;
  let embed = false;

  for (let index = 1; index < argv.length; index += 1) {
    const arg = argv[index];
    switch (arg) {
      case '--embed':
        embed = true;
        break;
      case '--out': {
        const value = argv[index + 1];
        if (!value || value.startsWith('--')) {
          throw new Error(`--out needs a directory path\n\n${EXPORT_USAGE}`);
        }
        out = value;
        index += 1;
        break;
      }
      case '--source-root': {
        const value = argv[index + 1];
        if (!value || value.startsWith('--')) {
          throw new Error(`--source-root needs a project path\n\n${EXPORT_USAGE}`);
        }
        sourceRoot = value;
        index += 1;
        break;
      }
      default:
        throw new Error(`unknown option: ${arg}\n\n${EXPORT_USAGE}`);
    }
  }

  if (!embed) {
    throw new Error(`only --embed exports are supported\n\n${EXPORT_USAGE}`);
  }
  if (!out) {
    throw new Error(`export needs --out <dir>\n\n${EXPORT_USAGE}`);
  }

  return { tour, out, sourceRoot, embed };
}

/** The built player bundle lives beside the CLI source in the workspace. */
function embedDistDirectory(): string {
  return fileURLToPath(new URL('../../../packages/embed/dist/', import.meta.url));
}

async function readBuiltAssets(): Promise<EmbedAsset[]> {
  const directory = embedDistDirectory();
  const assets: EmbedAsset[] = [];
  for (const name of ['player.js', 'player.css']) {
    const file = path.join(directory, name);
    try {
      assets.push({ path: name, contents: await readFile(file, 'utf8') });
    } catch {
      throw new Error(
        `the embed bundle is not built (${file} is missing); run "pnpm build:embed" first`,
      );
    }
  }
  return assets;
}

async function readTourFile(tourPath: string): Promise<unknown> {
  const raw = await readFile(tourPath, 'utf8');
  return JSON.parse(raw) as unknown;
}

function createFileWriter(outDir: string): EmbedAssetWriter {
  return {
    async write(relativePath: string, contents: string): Promise<void> {
      const target = path.resolve(outDir, relativePath);
      if (target !== outDir && !target.startsWith(`${outDir}${path.sep}`)) {
        throw new Error(`refusing to write outside ${outDir}: ${relativePath}`);
      }
      await mkdir(path.dirname(target), { recursive: true });
      await writeFile(target, contents, 'utf8');
    },
  };
}

/**
 * `sothspell export --embed`: compiles one tour and writes the self-contained
 * bundle. The heavy lifting lives in `@sothspell/embed/export` as a pure
 * function; this command only supplies files, a directory, and output.
 */
export async function runExport(
  args: ExportArgs,
  io: CliIO,
  deps: ExportDeps = {},
): Promise<number> {
  if (!args.embed) {
    io.stderr(`only --embed exports are supported\n\n${EXPORT_USAGE}`);
    return 2;
  }

  try {
    const outDir = path.resolve(args.out);
    if (args.sourceRoot) {
      const sourceRoot = path.resolve(args.sourceRoot);
      if (outDir === sourceRoot || outDir.startsWith(`${sourceRoot}${path.sep}`)) {
        throw new Error(
          `refusing to write ${outDir} inside the source root; choose another directory`,
        );
      }
    }

    const input = await (deps.readTour ?? readTourFile)(args.tour);
    const assets = await (deps.readAssets ?? readBuiltAssets)();
    const result = await buildEmbedExport(
      input,
      {
        embedApiVersion: EMBED_API_VERSION,
        generatedAt: (deps.now ?? (() => new Date()))().toISOString(),
        assets,
        sourceRoot: args.sourceRoot,
      },
      createFileWriter(outDir),
    );

    io.stdout(`Tour: ${result.manifest.tour.title} (${result.manifest.tour.id})`);
    io.stdout(
      `Excerpts: ${result.manifest.excerpts.count} anchors, ${result.manifest.excerpts.totalBytes} bytes`,
    );
    for (const file of result.files) {
      io.stdout(`Wrote ${path.join(outDir, file.path)} (${file.bytes} bytes)`);
    }
    io.stdout(`Wrote ${path.join(outDir, 'export-manifest.json')}`);
    return 0;
  } catch (error) {
    io.stderr(`Error: ${error instanceof Error ? error.message : String(error)}`);
    return 1;
  }
}
