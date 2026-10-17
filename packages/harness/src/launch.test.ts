import { describe, expect, it } from 'vitest';
import { launchPlayer } from './launch.js';

describe('launchPlayer', () => {
  it('resolves the URL even when the platform opener fails', async () => {
    const result = await launchPlayer('http://127.0.0.1:4319/t/tour_demo', {
      openUrl: async () => {
        throw new Error('no browser here');
      },
    });

    expect(result).toEqual({
      url: 'http://127.0.0.1:4319/t/tour_demo',
      opened: false,
      error: 'no browser here',
    });
  });

  it('reports an opened browser through an injected opener', async () => {
    const opened: string[] = [];
    const result = await launchPlayer('http://127.0.0.1:4319', {
      openUrl: async (url) => {
        opened.push(url);
      },
    });

    expect(result).toEqual({ url: 'http://127.0.0.1:4319', opened: true });
    expect(opened).toEqual(['http://127.0.0.1:4319']);
  });
});
