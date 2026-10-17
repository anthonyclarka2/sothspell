import { expect, test, type Page } from '@playwright/test';

/**
 * Browser coverage for the exported embed bundle: the custom element and the
 * iframe fallback, playing from the static docs fixture with no Sóþspell
 * server in the loop.
 */

const ELEMENT = '#element-embed';

interface EmbedElement extends HTMLElement {
  snapshot: Record<string, unknown> | null;
  play(): void;
  pause(): void;
  seek(fraction: number): void;
}

async function snapshotOf(page: Page): Promise<Record<string, unknown>> {
  return page.evaluate(() => {
    const element = document.querySelector<EmbedElement>('#element-embed');
    return element?.snapshot ?? {};
  });
}

async function openDocs(page: Page): Promise<void> {
  await page.goto('/');
  await expect(page.locator(`${ELEMENT} button[aria-label="Play"]`)).toBeVisible();
}

test.describe('custom element', () => {
  test('registers the element, exposes the global, and renders in a shadow root', async ({
    page,
  }) => {
    await page.goto('/');

    const state = await page.evaluate(() => {
      const element = document.querySelector('sothspell-tour');
      const globalScope = window as { SothspellEmbed?: { version?: string } };
      return {
        defined: Boolean(customElements.get('sothspell-tour')),
        hasShadow: element !== null && element.shadowRoot !== null,
        version: globalScope.SothspellEmbed?.version ?? null,
      };
    });

    expect(state.defined).toBe(true);
    expect(state.hasShadow).toBe(true);
    expect(state.version).toBe('1.0.0');
  });

  test('plays, emits progress events, and pauses', async ({ page }) => {
    await openDocs(page);
    await page.evaluate(() => {
      const globalScope = window as { sothspellTestEvents?: unknown[] };
      globalScope.sothspellTestEvents = [];
      document.addEventListener('sothspell:progress', (event) => {
        globalScope.sothspellTestEvents?.push((event as CustomEvent).detail);
      });
    });

    await page.locator(`${ELEMENT} button[aria-label="Play"]`).click();

    await expect.poll(async () => (await snapshotOf(page)).status).toBe('playing');
    await expect
      .poll(async () =>
        page.evaluate(
          () =>
            (window as { sothspellTestEvents?: unknown[] }).sothspellTestEvents?.length ??
            0,
        ),
      )
      .toBeGreaterThan(0);

    await page.waitForTimeout(700);
    const playing = await snapshotOf(page);
    expect(Number(playing.elapsedMs)).toBeGreaterThan(0);

    await page.locator(`${ELEMENT} button[aria-label="Pause"]`).click();
    await expect.poll(async () => (await snapshotOf(page)).status).toBe('paused');
    const paused = await snapshotOf(page);
    await page.waitForTimeout(500);
    const stillPaused = await snapshotOf(page);
    expect(stillPaused.elapsedMs).toBe(paused.elapsedMs);

    const payload = (await page.evaluate(() =>
      (window as { sothspellTestEvents?: unknown[] }).sothspellTestEvents?.at(-1),
    )) as { beatId?: unknown; progress?: unknown; status?: unknown };
    expect(typeof payload.beatId).toBe('string');
    expect(typeof payload.progress).toBe('number');
    expect(typeof payload.status).toBe('string');
  });

  test('seeks through the tour and moves beat by beat', async ({ page }) => {
    await openDocs(page);

    await page.evaluate(() => {
      document.querySelector<EmbedElement>('#element-embed')?.seek(0.6);
    });
    await expect
      .poll(async () => Number((await snapshotOf(page)).progress))
      .toBeGreaterThan(0.55);

    const beatBefore = String((await snapshotOf(page)).beatId);
    await page.locator(`${ELEMENT} button[aria-label="Next beat"]`).click();
    await expect
      .poll(async () => String((await snapshotOf(page)).beatId))
      .not.toBe(beatBefore);

    await page.locator(`${ELEMENT} button[aria-label="Previous beat"]`).click();
    await expect
      .poll(async () => String((await snapshotOf(page)).beatId))
      .toBe(beatBefore);

    await page.locator(`${ELEMENT} input[type="range"]`).focus();
    await page.locator(`${ELEMENT} input[type="range"]`).press('Home');
    await expect
      .poll(async () => Number((await snapshotOf(page)).progress))
      .toBeLessThan(0.05);
  });

  test('stores local progress and restores it on reload', async ({ page }) => {
    await openDocs(page);
    // Wait for the iframe embed to load first so its own ready write cannot
    // land after this seek and overwrite the position.
    await expect(
      page.frameLocator('#iframe-slot iframe').locator('button[aria-label="Play"]'),
    ).toBeVisible();

    await page.evaluate(() => {
      document.querySelector<EmbedElement>('#element-embed')?.seek(0.4);
    });
    await expect
      .poll(async () =>
        page.evaluate(() => localStorage.getItem('sothspell:embed:tour_bunbun_golden')),
      )
      .not.toBeNull();

    await page.reload();
    await expect(page.locator(`${ELEMENT} button[aria-label="Play"]`)).toBeVisible();
    await expect
      .poll(async () => Number((await snapshotOf(page)).progress))
      .toBeGreaterThan(0.35);
  });

  test('stops emitting events after the element is removed', async ({ page }) => {
    await openDocs(page);
    await page.evaluate(() => {
      const globalScope = window as { sothspellTestEvents?: unknown[] };
      globalScope.sothspellTestEvents = [];
      document.addEventListener('sothspell:progress', () => {
        globalScope.sothspellTestEvents?.push(1);
      });
      document.querySelector<EmbedElement>('#element-embed')?.play();
    });

    await page.waitForTimeout(600);
    const beforeRemoval = await page.evaluate(
      () =>
        (window as { sothspellTestEvents?: unknown[] }).sothspellTestEvents?.length ?? 0,
    );
    expect(beforeRemoval).toBeGreaterThan(0);

    await page.evaluate(() => {
      document.querySelector('#element-embed')?.remove();
    });
    await page.waitForTimeout(300);
    const afterRemoval = await page.evaluate(
      () =>
        (window as { sothspellTestEvents?: unknown[] }).sothspellTestEvents?.length ?? 0,
    );
    await page.waitForTimeout(800);
    const later = await page.evaluate(
      () =>
        (window as { sothspellTestEvents?: unknown[] }).sothspellTestEvents?.length ?? 0,
    );
    expect(later).toBe(afterRemoval);
  });

  test('writes nothing when progress is opted out', async ({ page }) => {
    await page.goto('/opt-out.html');
    await expect(page.locator('#optout-embed button[aria-label="Play"]')).toBeVisible();

    await page.locator('#optout-embed button[aria-label="Play"]').click();
    await page.waitForTimeout(700);

    const keys = await page.evaluate(() =>
      Object.keys(localStorage).filter((key) => key.startsWith('sothspell:embed:')),
    );
    expect(keys).toEqual([]);
  });

  test('makes no network requests beyond the static bundle', async ({ page }) => {
    const requests: string[] = [];
    page.on('request', (request) => requests.push(request.url()));

    await openDocs(page);
    await page.locator(`${ELEMENT} button[aria-label="Play"]`).click();
    await page.waitForTimeout(800);

    const external = requests.filter((url) => !url.startsWith('http://127.0.0.1:4320/'));
    expect(external).toEqual([]);
  });
});

test.describe('iframe fallback', () => {
  test('plays through postMessage and relays progress to the host', async ({ page }) => {
    await page.goto('/');
    const frame = page.frameLocator('#iframe-slot iframe');
    await expect(frame.locator('button[aria-label="Play"]')).toBeVisible();

    await page.evaluate(() => {
      const globalScope = window as { sothspellTestMessages?: unknown[] };
      globalScope.sothspellTestMessages = [];
      window.addEventListener('message', (event) => {
        globalScope.sothspellTestMessages?.push(event.data);
      });
    });

    await page.evaluate(() => {
      (window as { iframeEmbed?: { play(): void } }).iframeEmbed?.play();
    });
    await expect(frame.locator('button[aria-label="Pause"]')).toBeVisible();

    await expect
      .poll(async () =>
        page.evaluate(() => {
          const messages =
            (window as { sothspellTestMessages?: Array<{ type?: string }> })
              .sothspellTestMessages ?? [];
          return messages.filter((message) => message.type === 'progress').length;
        }),
      )
      .toBeGreaterThan(0);
  });
});
