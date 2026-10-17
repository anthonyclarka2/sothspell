import os from 'node:os';
import path from 'node:path';
import { createImportService, type ImportService } from '@sothspell/import';
import type { CliIO } from './cli.js';

export interface ImportArgs {
  url: string;
  ref: string | null;
  json: boolean;
}

export interface RunImportOptions {
  service?: ImportService;
  home?: string;
}

export function parseImportArgs(argv: string[]): ImportArgs {
  const url = argv[0];
  if (!url || url.startsWith('--')) {
    throw new Error(
      'import needs a GitHub repository URL\n\nRun "sothspell --help" for usage.',
    );
  }

  let ref: string | null = null;
  let json = false;
  for (let index = 1; index < argv.length; index += 1) {
    const arg = argv[index];
    switch (arg) {
      case '--json':
        json = true;
        break;
      case '--ref': {
        const value = argv[index + 1];
        if (!value || value.startsWith('--')) {
          throw new Error(
            '--ref needs a branch or tag name\n\nRun "sothspell --help" for usage.',
          );
        }
        ref = value;
        index += 1;
        break;
      }
      default:
        throw new Error(`unknown option: ${arg}\n\nRun "sothspell --help" for usage.`);
    }
  }

  return { url, ref, json };
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) {
    return `${bytes} B`;
  }
  const units = ['KB', 'MB', 'GB'];
  let value = bytes / 1024;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  const rounded = value >= 10 ? value.toFixed(0) : value.toFixed(1);
  return `${rounded} ${units[unit]}`;
}

/**
 * `sothspell import` is a thin shell over the import service: parse the URL,
 * clone read-only under SOTHSPELL_HOME, and report where it landed. Tests
 * inject the service so the command stays offline.
 */
export async function runImport(
  args: ImportArgs,
  io: CliIO,
  options: RunImportOptions = {},
): Promise<number> {
  const home =
    options.home ?? process.env.SOTHSPELL_HOME ?? path.join(os.homedir(), '.sothspell');
  const service = options.service ?? createImportService({ home });

  try {
    const { record, created } = await service.import({ url: args.url, ref: args.ref });

    if (args.json) {
      io.stdout(JSON.stringify({ import: record, created }, null, 2));
      return 0;
    }

    if (!created) {
      io.stdout(`Already imported: ${record.id}`);
    }
    io.stdout(`Imported ${record.owner}/${record.repo}@${record.shortCommit}`);
    io.stdout(`Source: ${record.sourceUrl}${record.ref ? ` (ref ${record.ref})` : ''}`);
    io.stdout(`Path: ${record.directory}`);
    io.stdout(`Size: ${formatBytes(record.sizeBytes)} (${record.fileCount} files)`);
    return 0;
  } catch (error) {
    io.stderr(`Error: ${error instanceof Error ? error.message : String(error)}`);
    return 1;
  }
}
