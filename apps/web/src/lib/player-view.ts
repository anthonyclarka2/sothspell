/**
 * The player view is a URL choice, not a stored preference. Keeping it in one
 * pure module makes the default reversible and keeps the router, player, and
 * code page agreeing on what an unknown `view` value means.
 */
export type PlayerView = 'canvas' | 'stage';

export const DEFAULT_PLAYER_VIEW: PlayerView = 'canvas';

export function parsePlayerView(value: unknown): PlayerView | undefined {
  return value === 'canvas' || value === 'stage' ? value : undefined;
}

export function resolvePlayerView(search: { view?: unknown }): PlayerView {
  return parsePlayerView(search.view) ?? DEFAULT_PLAYER_VIEW;
}
