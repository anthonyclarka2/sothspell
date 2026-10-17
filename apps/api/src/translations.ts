import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { z } from 'zod';
import type { Hono } from 'hono';
import {
  LocaleSchema,
  parseSothspell,
  sourceLocaleOf,
  type TourTranslation,
} from '@sothspell/core';
import {
  TranslationError,
  translateTour,
  type GuideModel,
  type TranslationProgress,
  type TranslationQuality,
} from '@sothspell/authoring';

/**
 * Translation routes and storage. A translation lives beside its tour under
 * SOTHSPELL_HOME rather than inside the project tree, so a read-only checkout
 * never gains generated files. The store is a seam: tests keep translations in
 * memory and production writes JSON next to the other local data.
 */

export const TranslationBodySchema = z.object({
  locale: LocaleSchema,
  glossary: z.record(z.string().min(1).max(64), z.string().min(1).max(96)).optional(),
});

export type TranslationBody = z.infer<typeof TranslationBodySchema>;

export interface TranslationStore {
  read(tourId: string, locale: string): Promise<TourTranslation | null>;
  write(tourId: string, locale: string, translation: TourTranslation): Promise<void>;
}

/** Tour ids come from a URL; keep the on-disk directory name boring. */
function safeSegment(value: string): string {
  return value.replace(/[^a-zA-Z0-9._-]/g, '_');
}

export function createFileTranslationStore(root: string): TranslationStore {
  const fileFor = (tourId: string, locale: string): string =>
    path.join(root, safeSegment(tourId), `${safeSegment(locale)}.json`);

  return {
    async read(tourId, locale) {
      try {
        const raw = await readFile(fileFor(tourId, locale), 'utf8');
        return JSON.parse(raw) as TourTranslation;
      } catch {
        return null;
      }
    },
    async write(tourId, locale, translation) {
      const file = fileFor(tourId, locale);
      await mkdir(path.dirname(file), { recursive: true });
      await writeFile(file, `${JSON.stringify(translation, null, 2)}\n`, 'utf8');
    },
  };
}

export interface MemoryTranslationStore extends TranslationStore {
  seed(tourId: string, locale: string, translation: TourTranslation): void;
}

function translationKey(tourId: string, locale: string): string {
  return `${tourId}\u0000${locale}`;
}

export function createMemoryTranslationStore(): MemoryTranslationStore {
  const translations = new Map<string, TourTranslation>();

  return {
    seed(tourId, locale, translation) {
      translations.set(translationKey(tourId, locale), translation);
    },
    async read(tourId, locale) {
      return translations.get(translationKey(tourId, locale)) ?? null;
    },
    async write(tourId, locale, translation) {
      translations.set(translationKey(tourId, locale), translation);
    },
  };
}

export interface TranslationServiceInput {
  tourId: string;
  locale: string;
  glossary?: Record<string, string>;
}

export interface TranslationServiceResult {
  translation: TourTranslation;
  quality: TranslationQuality;
}

export interface TranslationService {
  translate(input: TranslationServiceInput): Promise<TranslationServiceResult>;
}

/** Raised when no authoring model can translate; routes answer 503. */
export class TranslationUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'TranslationUnavailableError';
  }
}

export interface TranslationServiceOptions {
  resolveTourPath: (tourId: string) => Promise<string | null>;
  resolveModel: () => Promise<GuideModel | null>;
  cacheDirectory?: string;
  signal?: AbortSignal;
  onProgress?: (progress: TranslationProgress) => void;
}

export function createTranslationService(
  options: TranslationServiceOptions,
): TranslationService {
  return {
    async translate(input) {
      const tourPath = await options.resolveTourPath(input.tourId);
      if (!tourPath) {
        throw new TranslationError(`unknown tour: ${input.tourId}`, []);
      }
      const document = parseSothspell(
        JSON.parse(await readFile(tourPath, 'utf8')) as unknown,
      );
      if (input.locale === sourceLocaleOf(document)) {
        throw new TranslationError(`the tour is already in ${input.locale}`, [
          `a translation needs a locale other than ${input.locale}`,
        ]);
      }

      const model = await options.resolveModel();
      if (!model) {
        throw new TranslationUnavailableError(
          'translation needs an authoring model; activate a profile in /settings or set SOTHSPELL_MODEL',
        );
      }

      const { translation, quality } = await translateTour({
        tour: document,
        targetLocale: input.locale,
        model,
        ...(input.glossary === undefined ? {} : { glossary: input.glossary }),
        ...(options.cacheDirectory === undefined
          ? {}
          : { cacheDirectory: options.cacheDirectory }),
        ...(options.signal === undefined ? {} : { signal: options.signal }),
        ...(options.onProgress === undefined ? {} : { onProgress: options.onProgress }),
      });

      return { translation, quality };
    },
  };
}

export interface TranslationRouteDependencies {
  service: TranslationService | null;
  store: TranslationStore;
  resolveTourPath: (tourId: string) => Promise<string | null>;
  /** Lets the host drop a cached compile once a translation is stored. */
  onTranslationStored?: (tourId: string, locale: string) => void;
}

/**
 * Registers the translation routes on the API. `POST` translates and stores;
 * `GET` returns a stored translation without invoking any model.
 */
export function registerTranslationRoutes(
  app: Hono,
  dependencies: TranslationRouteDependencies,
): void {
  app.post('/api/tours/:tourId/translations', async (context) => {
    const tourId = context.req.param('tourId');
    if (!(await dependencies.resolveTourPath(tourId))) {
      return context.json({ error: `unknown tour: ${tourId}` }, 404);
    }
    if (!dependencies.service) {
      return context.json(
        { error: 'translation is unavailable; no model is configured' },
        503,
      );
    }

    const body = await context.req.json().catch(() => null);
    const parsed = TranslationBodySchema.safeParse(body);
    if (!parsed.success) {
      return context.json(
        { error: 'invalid translation payload', issues: parsed.error.issues },
        400,
      );
    }

    try {
      const { translation, quality } = await dependencies.service.translate({
        tourId,
        locale: parsed.data.locale,
        ...(parsed.data.glossary === undefined ? {} : { glossary: parsed.data.glossary }),
      });
      await dependencies.store.write(tourId, parsed.data.locale, translation);
      dependencies.onTranslationStored?.(tourId, parsed.data.locale);
      return context.json({ translation, quality }, 201);
    } catch (error) {
      if (error instanceof TranslationUnavailableError) {
        return context.json({ error: error.message }, 503);
      }
      if (error instanceof TranslationError) {
        return context.json({ error: error.message, issues: error.issues }, 422);
      }
      throw error;
    }
  });

  app.get('/api/tours/:tourId/translations/:locale', async (context) => {
    const tourId = context.req.param('tourId');
    if (!(await dependencies.resolveTourPath(tourId))) {
      return context.json({ error: `unknown tour: ${tourId}` }, 404);
    }
    const locale = context.req.param('locale');
    if (!LocaleSchema.safeParse(locale).success) {
      return context.json({ error: `invalid locale: ${locale}` }, 400);
    }

    const translation = await dependencies.store.read(tourId, locale);
    if (!translation) {
      return context.json({ error: `the tour has no ${locale} translation` }, 404);
    }
    context.header('cache-control', 'no-store');
    return context.json({ translation });
  });
}
