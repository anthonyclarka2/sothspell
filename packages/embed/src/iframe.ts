import {
  embedCommand,
  embedMessage,
  isEmbedCommand,
  isEmbedMessage,
  postEmbedMessage,
  type EmbedCommand,
  type EmbedCommandType,
  type EmbedEventType,
  type EmbedMessage,
} from './protocol.js';

/** The element surface the bridge and the host helper need; keeps the module testable. */
export interface BridgeElement {
  load(source: string): unknown;
  play(): void;
  pause(): void;
  toggle(): void;
  seek(fraction: number): void;
  next(): void;
  previous(): void;
  setLocale(locale: string | null): void;
}

/**
 * Applies one host command to a player element. Returns `false` for `destroy`
 * (the bridge owns teardown) so the caller can act on it.
 */
export function applyHostCommand(element: BridgeElement, command: EmbedCommand): boolean {
  const payload = command.payload;
  switch (command.type) {
    case 'load':
      if (typeof payload === 'string') {
        void element.load(payload);
      }
      return true;
    case 'play':
      element.play();
      return true;
    case 'pause':
      element.pause();
      return true;
    case 'toggle':
      element.toggle();
      return true;
    case 'seek':
      if (typeof payload === 'number' && Number.isFinite(payload)) {
        element.seek(Math.min(Math.max(payload, 0), 1));
      }
      return true;
    case 'next':
      element.next();
      return true;
    case 'previous':
      element.previous();
      return true;
    case 'locale':
      element.setLocale(typeof payload === 'string' ? payload : null);
      return true;
    case 'destroy':
      return false;
    default:
      return false;
  }
}

export interface EmbedParams {
  tour?: string;
  locale?: string | null;
  progress?: boolean;
}

/**
 * Adds embed parameters to a page URL while keeping relative URLs relative, so
 * a bundle can be served from any directory. Path-like values keep their
 * slashes; everything else is percent-encoded.
 */
function encodeParam(value: string): string {
  return encodeURIComponent(value).replaceAll('%2F', '/').replaceAll('%3A', ':');
}

export function withEmbedParams(source: string, params: EmbedParams): string {
  const parts: string[] = [];
  if (params.tour !== undefined) {
    parts.push(`tour=${encodeParam(params.tour)}`);
  }
  if (params.locale) {
    parts.push(`locale=${encodeParam(params.locale)}`);
  }
  parts.push(`progress=${params.progress === false ? 'off' : 'on'}`);
  const separator = source.includes('?') ? '&' : '?';
  return `${source}${separator}${parts.join('&')}`;
}

export interface IframeEmbedOptions {
  /** URL of the exported `embed.html`. */
  src: string;
  /** URL of the exported `tour.json`, relative to the iframe page or absolute. */
  tour: string;
  locale?: string | null;
  /** Local progress in the iframe page; defaults to on. */
  progress?: boolean;
  /** Accessible iframe title. */
  title?: string;
  height?: number | string;
  /** Defaults to `*`; pass the docs origin to lock the channel down. */
  targetOrigin?: string;
  onEvent?: (message: EmbedMessage) => void;
}

export interface IframeEmbed {
  element: HTMLIFrameElement;
  load(tourUrl: string): void;
  play(): void;
  pause(): void;
  toggle(): void;
  seek(fraction: number): void;
  next(): void;
  previous(): void;
  setLocale(locale: string | null): void;
  destroy(): void;
}

const EVENT_TYPES: readonly EmbedEventType[] = ['ready', 'progress', 'complete', 'error'];

function embedEventName(type: EmbedEventType): string {
  return `sothspell:${type}`;
}

/**
 * The host-side half of the iframe fallback: builds the iframe, forwards
 * commands, and relays `postMessage` events. The iframe page runs the same
 * custom element, so both integration styles share one player.
 */
export function createIframeEmbed(options: IframeEmbedOptions): IframeEmbed {
  const iframe = document.createElement('iframe');
  iframe.src = withEmbedParams(options.src, {
    tour: options.tour,
    locale: options.locale ?? null,
    progress: options.progress !== false,
  });
  iframe.title = options.title ?? 'Sóþspell tour';
  iframe.setAttribute('loading', 'lazy');
  iframe.style.width = '100%';
  iframe.style.border = '0';
  if (options.height !== undefined) {
    iframe.style.height =
      typeof options.height === 'number' ? `${options.height}px` : options.height;
  }

  const targetOrigin = options.targetOrigin ?? '*';
  const send = (type: EmbedCommandType, payload?: unknown): void => {
    const target = iframe.contentWindow;
    if (target) {
      postEmbedMessage(target, embedCommand(type, payload), targetOrigin);
    }
  };

  const onMessage = (event: MessageEvent): void => {
    if (event.source !== iframe.contentWindow || !isEmbedMessage(event.data)) {
      return;
    }
    options.onEvent?.(event.data);
  };
  window.addEventListener('message', onMessage);

  return {
    element: iframe,
    load: (tourUrl) => send('load', tourUrl),
    play: () => send('play'),
    pause: () => send('pause'),
    toggle: () => send('toggle'),
    seek: (fraction) => send('seek', fraction),
    next: () => send('next'),
    previous: () => send('previous'),
    setLocale: (locale) => send('locale', locale),
    destroy: () => {
      window.removeEventListener('message', onMessage);
      iframe.remove();
    },
  };
}

export interface BridgeScope {
  parent: MessageTargetLike;
  location: { search: string };
  addEventListener(type: 'message', listener: (event: MessageEvent) => void): void;
  removeEventListener(type: 'message', listener: (event: MessageEvent) => void): void;
}

interface MessageTargetLike {
  postMessage(message: unknown, targetOrigin: string): void;
}

export interface BridgeElementEvents extends BridgeElement {
  addEventListener(type: string, listener: (event: Event) => void): void;
  removeEventListener(type: string, listener: (event: Event) => void): void;
  setAttribute(name: string, value: string): void;
}

/**
 * Runs inside the bundled iframe page. It reads the URL parameters into the
 * element, relays element events to the parent as protocol messages, and
 * applies host commands to the element. Returns a teardown function.
 */
export function mountIframeBridge(
  element: BridgeElementEvents,
  scope: BridgeScope,
  targetOrigin = '*',
): () => void {
  const params = new URLSearchParams(scope.location.search);
  const tour = params.get('tour');
  if (tour) {
    element.setAttribute('tour', tour);
  }
  const locale = params.get('locale');
  if (locale) {
    element.setAttribute('locale', locale);
  }
  if (params.get('progress') === 'off') {
    element.setAttribute('progress', 'off');
  }

  const listeners = new Map<EmbedEventType, (event: Event) => void>();
  for (const type of EVENT_TYPES) {
    const listener = (event: Event): void => {
      const detail = (event as CustomEvent).detail;
      postEmbedMessage(scope.parent, embedMessage(type, detail), targetOrigin);
    };
    listeners.set(type, listener);
    element.addEventListener(embedEventName(type), listener);
  }

  const onMessage = (event: MessageEvent): void => {
    if (event.source !== scope.parent || !isEmbedCommand(event.data)) {
      return;
    }
    if (event.data.type === 'destroy') {
      teardown();
      return;
    }
    applyHostCommand(element, event.data);
  };
  scope.addEventListener('message', onMessage);

  let active = true;
  const teardown = (): void => {
    if (!active) {
      return;
    }
    active = false;
    scope.removeEventListener('message', onMessage);
    for (const [type, listener] of listeners) {
      element.removeEventListener(embedEventName(type), listener);
    }
    listeners.clear();
  };
  return teardown;
}
