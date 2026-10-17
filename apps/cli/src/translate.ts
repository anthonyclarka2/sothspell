import { mkdir, readFile, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {
  LocaleSchema,
  parseSothspell,
  sourceLocaleOf,
  withTranslation,
} from '@sothspell/core';
import {
  TranslationError,
  createAiSdkGuideModel,
  createFixtureTranslationModel,
  translateTour,
  type GuideModel,
} from '@sothspell/authoring';
import {
  createSettingsService,
  type AuthoringConnection,
  type SettingsService,
} from '@sothspell/settings';
import type { CliIO } from './cli.js';

/**
 * `sothspell translate` turns one tour into one locale and writes a complete
 * tour document with the translation embedded, so the result is a single
 * portable artifact that the player and the API can read directly.
 */

export interface TranslateArgs {
  tourPath: string;
  locale: string;
  out: string | null;
  model: string | null;
}

export interface TranslateDependencies {
  /** Injected model; tests use the fixture translation model. */
  model?: GuideModel;
  /** Injected settings service; tests keep the real SOTHSPELL_HOME untouched. */
  settings?: SettingsService;
  cacheDirectory?: string;
}

function sothspellHome(): string {
  return process.env.SOTHSPELL_HOME ?? path.join(os.homedir(), '.sothspell');
}

function defaultTranslationCacheDirectory(): string {
  return path.join(sothspellHome(), 'cache', 'authoring');
}

export function parseTranslateArgs(argv: string[]): TranslateArgs {
  const tourPath = argv[0];
  if (!tourPath || tourPath.startsWith('--')) {
    throw new Error('translate needs a tour JSON path');
  }

  let locale: string | null = null;
  let out: string | null = null;
  let model: string | null = null;

  for (let index = 1; index < argv.length; index += 1) {
    const arg = argv[index];
    switch (arg) {
      case '--locale': {
        const value = argv[index + 1];
        if (!value || value.startsWith('--')) {
          throw new Error('--locale needs a locale code such as es or ar');
        }
        locale = value;
        index += 1;
        break;
      }
      case '--out': {
        const value = argv[index + 1];
        if (!value || value.startsWith('--')) {
          throw new Error('--out needs a file path');
        }
        out = value;
        index += 1;
        break;
      }
      case '--model': {
        const value = argv[index + 1];
        if (!value || value.startsWith('--')) {
          throw new Error('--model needs a provider/model id');
        }
        model = value;
        index += 1;
        break;
      }
      default:
        throw new Error(`unknown option: ${arg}`);
    }
  }

  if (locale === null) {
    throw new Error('translate needs --locale <code>');
  }
  if (!LocaleSchema.safeParse(locale).success) {
    throw new Error(`--locale must be a locale code such as es or ar, not ${locale}`);
  }

  return { tourPath, locale, out, model };
}

function outputPathFor(args: TranslateArgs): string {
  const parsed = path.parse(args.tourPath);
  const defaultName = `${parsed.name}.${args.locale}.json`;
  if (args.out === null) {
    return path.join(parsed.dir, defaultName);
  }
  return args.out.endsWith('.json') ? args.out : path.join(args.out, defaultName);
}

/**
 * Resolves the translation model the same way authoring resolves its own: an
 * explicit --model wins, then SOTHSPELL_MODEL and the active authoring profile.
 */
async function resolveModel(
  args: TranslateArgs,
  dependencies: TranslateDependencies,
): Promise<GuideModel | { error: string }> {
  if (dependencies.model) {
    return dependencies.model;
  }

  let connection: AuthoringConnection | null = null;
  if (args.model === null) {
    const settings =
      dependencies.settings ?? createSettingsService({ homeDirectory: sothspellHome() });
    connection = await settings.resolveAuthoringConnection();
  }
  const modelId = args.model ?? connection?.modelId ?? null;
  if (!modelId) {
    return {
      error:
        'no model selected; pass --model <provider/model>, set SOTHSPELL_MODEL, or activate an authoring profile in /settings',
    };
  }
  if (modelId === 'fixture' || modelId === 'fake') {
    return createFixtureTranslationModel(args.locale);
  }

  const modelOptions =
    args.model === null && connection?.source === 'profile'
      ? {
          ...(connection.apiKey === null ? {} : { apiKey: connection.apiKey }),
          ...(connection.baseUrl === null ? {} : { baseUrl: connection.baseUrl }),
        }
      : undefined;
  return createAiSdkGuideModel(modelId, modelOptions);
}

export async function runTranslate(
  args: TranslateArgs,
  io: CliIO,
  dependencies: TranslateDependencies = {},
): Promise<number> {
  let document;
  try {
    document = parseSothspell(
      JSON.parse(await readFile(args.tourPath, 'utf8')) as unknown,
    );
  } catch (error) {
    io.stderr(`Error: ${error instanceof Error ? error.message : String(error)}`);
    return 1;
  }

  if (args.locale === sourceLocaleOf(document)) {
    io.stderr(`Error: the tour is already in ${args.locale}`);
    return 1;
  }

  const model = await resolveModel(args, dependencies);
  if ('error' in model) {
    io.stderr(model.error);
    return 2;
  }

  try {
    const { translation, quality } = await translateTour({
      tour: document,
      targetLocale: args.locale,
      model,
      cacheDirectory: dependencies.cacheDirectory ?? defaultTranslationCacheDirectory(),
      onProgress: (progress) => {
        const detail = progress.detail ? ` — ${progress.detail}` : '';
        io.stderr(`translate: ${progress.stage}${detail}`);
      },
    });

    const translatedDocument = withTranslation(document, translation);
    const outPath = outputPathFor(args);
    await mkdir(path.dirname(outPath), { recursive: true });
    await writeFile(outPath, `${JSON.stringify(translatedDocument, null, 2)}\n`, 'utf8');

    io.stdout(`Locale: ${translation.locale} (from ${translation.sourceLocale})`);
    io.stdout(
      `Units: ${quality.units}, model calls: ${quality.modelCalls}, cache hits: ${quality.cacheHits}`,
    );
    io.stdout(`Wrote ${outPath}`);
    return 0;
  } catch (error) {
    if (error instanceof TranslationError) {
      io.stderr(`Error: ${error.message}`);
      for (const issue of error.issues) {
        io.stderr(`Issue: ${issue}`);
      }
      return 1;
    }
    io.stderr(`Error: ${error instanceof Error ? error.message : String(error)}`);
    return 1;
  }
}
