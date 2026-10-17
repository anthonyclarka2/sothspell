/**
 * The embed speaks two protocols over one channel string: DOM events inside the
 * page, and `postMessage` envelopes across an iframe boundary. Keeping the
 * envelope shape and its guards in one module means the custom element, the
 * iframe page, and the host-side helper cannot drift apart.
 */

export const EMBED_CHANNEL = 'sothspell-embed/1' as const;

export type EmbedEventType = 'ready' | 'progress' | 'complete' | 'error';

export type EmbedCommandType =
  | 'load'
  | 'play'
  | 'pause'
  | 'toggle'
  | 'seek'
  | 'next'
  | 'previous'
  | 'locale'
  | 'destroy';

export interface EmbedMessage {
  channel: typeof EMBED_CHANNEL;
  type: EmbedEventType;
  payload?: unknown;
}

export interface EmbedCommand {
  channel: typeof EMBED_CHANNEL;
  type: EmbedCommandType;
  payload?: unknown;
}

const EVENT_TYPES: readonly EmbedEventType[] = ['ready', 'progress', 'complete', 'error'];

const COMMAND_TYPES: readonly EmbedCommandType[] = [
  'load',
  'play',
  'pause',
  'toggle',
  'seek',
  'next',
  'previous',
  'locale',
  'destroy',
];

function hasChannel(data: unknown): data is { channel: string; type: string } {
  return (
    typeof data === 'object' &&
    data !== null &&
    (data as { channel?: unknown }).channel === EMBED_CHANNEL &&
    typeof (data as { type?: unknown }).type === 'string'
  );
}

export function embedMessage(type: EmbedEventType, payload?: unknown): EmbedMessage {
  return payload === undefined
    ? { channel: EMBED_CHANNEL, type }
    : { channel: EMBED_CHANNEL, type, payload };
}

export function embedCommand(type: EmbedCommandType, payload?: unknown): EmbedCommand {
  return payload === undefined
    ? { channel: EMBED_CHANNEL, type }
    : { channel: EMBED_CHANNEL, type, payload };
}

export function isEmbedMessage(data: unknown): data is EmbedMessage {
  return hasChannel(data) && (EVENT_TYPES as readonly string[]).includes(data.type);
}

export function isEmbedCommand(data: unknown): data is EmbedCommand {
  return hasChannel(data) && (COMMAND_TYPES as readonly string[]).includes(data.type);
}

export interface MessageTarget {
  postMessage(message: unknown, targetOrigin: string): void;
}

/**
 * The target origin is `*` by default because the iframe page is served from
 * the same bundle as the tour and is often opened from `file://` during
 * testing; hosts that care can pass their exact origin.
 */
export function postEmbedMessage(
  target: MessageTarget,
  message: EmbedMessage | EmbedCommand,
  targetOrigin = '*',
): void {
  target.postMessage(message, targetOrigin);
}
