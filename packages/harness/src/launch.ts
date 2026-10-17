import { spawn } from 'node:child_process';
import type { LaunchResult } from './types.js';

/**
 * Opens the player without making browser launch a failure condition. A headless
 * machine still gets the URL back so the caller can print it. Every adapter
 * shares this implementation; none of them embeds a second server.
 */
export async function launchPlayer(
  url: string,
  options: {
    platform?: NodeJS.Platform;
    openUrl?: (url: string) => Promise<void>;
  } = {},
): Promise<LaunchResult> {
  if (options.openUrl) {
    try {
      await options.openUrl(url);
      return { url, opened: true };
    } catch (error) {
      return {
        url,
        opened: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  const platform = options.platform ?? process.platform;
  const [command, args] =
    platform === 'darwin'
      ? ['open', [url]]
      : platform === 'win32'
        ? ['cmd', ['/c', 'start', '', url]]
        : ['xdg-open', [url]];

  try {
    await new Promise<void>((resolve, reject) => {
      const child = spawn(command, args, { stdio: 'ignore', detached: true });
      child.once('error', reject);
      child.once('spawn', () => {
        child.unref();
        resolve();
      });
    });
    return { url, opened: true };
  } catch (error) {
    return {
      url,
      opened: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}
