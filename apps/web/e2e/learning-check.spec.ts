import { expect, test } from '@playwright/test';
import { beatPath, installCheck, prompt } from './learning-check-fixture.js';

const answer = 'Private learning check response 7742';

test('offers a private learning check at the end of Read playback', async ({ page }) => {
  await installCheck(page);
  const requests: string[] = [];
  page.on('request', (request) => {
    if (request.url().includes('/api/')) {
      requests.push(request.url() + (request.postData() ?? ''));
    }
  });
  await page.goto(beatPath);
  await expect(page.getByRole('dialog', { name: 'Learning check' })).toHaveCount(0);
  await page.getByRole('button', { name: 'Play', exact: true }).click();

  const dialog = page.getByRole('dialog', { name: 'Learning check' });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole('heading', { name: 'Learning check' })).toBeFocused();
  await expect(dialog.getByRole('heading', { name: prompt })).toBeVisible();
  const position = await page.getByRole('slider', { includeHidden: true }).inputValue();
  await page.keyboard.press('Tab');
  await expect(dialog.getByRole('textbox')).toBeFocused();
  await page.keyboard.type(answer);
  await dialog.getByText('Code hint').click();
  const codeLink = dialog.getByRole('link', { name: 'Open full code in a new tab' });
  await codeLink.focus();
  const [code] = await Promise.all([
    page.waitForEvent('popup'),
    page.keyboard.press('Enter'),
  ]);
  await expect(code.getByTestId('code-viewport')).toBeVisible();
  await code.close();
  await expect(codeLink).toBeFocused();
  await expect(dialog.getByRole('textbox')).toHaveValue(answer);
  await dialog.getByRole('button', { name: 'Show explanation' }).click();
  await expect(dialog.getByRole('heading', { name: 'Explanation' })).toBeFocused();
  await expect(
    dialog.getByText('The PDS is the source of truth for social data.'),
  ).toBeVisible();
  await expect(page).toHaveURL(beatPath);
  await expect(page.getByRole('slider', { includeHidden: true })).toHaveValue(position);

  const stored = await page.evaluate(async () => {
    const values = await new Promise<unknown[]>((resolve, reject) => {
      const open = indexedDB.open('sothspell');
      open.addEventListener('error', () => reject(open.error), { once: true });
      open.addEventListener(
        'success',
        () => {
          const database = open.result;
          const request = database.transaction('runs').objectStore('runs').getAll();
          request.addEventListener('error', () => reject(request.error), { once: true });
          request.addEventListener(
            'success',
            () => {
              database.close();
              resolve(request.result as unknown[]);
            },
            { once: true },
          );
        },
        { once: true },
      );
    });
    return JSON.stringify({ localStorage, sessionStorage, values });
  });
  expect(stored).not.toContain(answer);
  expect(requests.join('\n')).not.toMatch(new RegExp(`/ask|${answer}`));

  await dialog.getByRole('button', { name: 'Try again' }).click();
  await expect(dialog.getByRole('textbox')).toBeFocused();
  await expect(dialog.getByRole('textbox')).toHaveValue('');
  await dialog.getByRole('button', { name: 'Skip' }).click();
  await expect(dialog).toHaveCount(0);
  await expect(page).toHaveURL(/beat_purpose_02/);
  await expect(page.getByRole('button', { name: 'Pause', exact: true })).toBeVisible();
});

test('keeps a manually opened Stage check optional through reload and navigation', async ({
  page,
}) => {
  await installCheck(page);
  await page.goto(`${beatPath}?view=stage`);
  const dialog = page.getByRole('dialog', { name: 'Learning check' });
  const trigger = page.getByRole('button', { name: 'Learning check' });

  await trigger.click();
  await dialog.getByRole('textbox').fill(answer);
  await page.reload();
  await expect(dialog).toHaveCount(0);
  await trigger.click();
  await expect(dialog.getByRole('textbox')).toHaveValue('');
  await dialog.getByRole('button', { name: 'Skip' }).click();
  await expect(trigger).toBeFocused();

  await page.getByRole('checkbox', { name: 'Automatic learning checks' }).uncheck();
  await page.getByRole('button', { name: 'Play', exact: true }).click();
  await expect(page).toHaveURL(/beat_purpose_02\?view=stage/);
  await expect(dialog).toHaveCount(0);
});

test('pauses Listen at the current position and resumes the same beat', async ({
  page,
}) => {
  await installCheck(page);
  await page.addInitScript(() => {
    class FakeUtterance {
      constructor(readonly text: string) {}
    }
    Object.defineProperty(window, 'SpeechSynthesisUtterance', {
      configurable: true,
      value: FakeUtterance,
    });
    Object.defineProperty(window, 'speechSynthesis', {
      configurable: true,
      value: { speak: () => undefined, cancel: () => undefined },
    });
  });

  await page.goto(`${beatPath}?view=stage`);
  await page.getByRole('button', { name: 'Listen' }).click();
  await expect(page.getByText('Listening · browser voice')).toBeVisible();
  const slider = page.locator('.transport input[type="range"]');
  await expect(slider).not.toHaveValue('0');

  const saved = page.waitForRequest(
    (request) =>
      request.method() === 'PUT' &&
      request.url().includes('/api/runs/') &&
      Number(request.postDataJSON()?.offsetMs) > 0,
  );
  const trigger = page.getByRole('button', { name: 'Learning check' });
  await trigger.click();
  const dialog = page.getByRole('dialog', { name: 'Learning check' });
  await expect(dialog).toBeVisible();
  expect((await saved).postDataJSON()?.mode).toBe('listen');
  const pausedPosition = await slider.inputValue();
  await dialog.getByRole('button', { name: 'Show explanation' }).click();
  await expect(slider).toHaveValue(pausedPosition);
  await dialog.getByRole('button', { name: 'Continue tour' }).click();
  await expect(trigger).toBeFocused();
  await expect(page.getByText('Listening · browser voice')).toBeVisible();
  await expect(slider).not.toHaveValue(pausedPosition);
  await expect(page).toHaveURL(`${beatPath}?view=stage`);
});

test('offers the check when Listen reaches the end of the beat', async ({ page }) => {
  await installCheck(page);
  await page.addInitScript(() => {
    class FakeUtterance {
      onend?: () => void;
    }
    Object.defineProperty(window, 'SpeechSynthesisUtterance', {
      configurable: true,
      value: FakeUtterance,
    });
    Object.defineProperty(window, 'speechSynthesis', {
      configurable: true,
      value: {
        speak: (utterance: FakeUtterance) => {
          document.addEventListener('finish-test-narration', () => utterance.onend?.(), {
            once: true,
          });
        },
        cancel: () => undefined,
      },
    });
  });

  await page.goto(beatPath);
  await page.getByRole('button', { name: 'Listen' }).click();
  await expect(page.getByText('Listening · browser voice')).toBeVisible();
  await page.evaluate(() => document.dispatchEvent(new Event('finish-test-narration')));
  const dialog = page.getByRole('dialog', { name: 'Learning check' });
  await expect(dialog).toBeVisible();
  await expect(page).toHaveURL(beatPath);
  await dialog.getByRole('button', { name: 'Skip' }).click();
  await expect(page).toHaveURL(/beat_purpose_02/);
  await expect(page.getByText('Listening · browser voice')).toBeVisible();
});
