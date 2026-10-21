/**
 * The parts of the Fullscreen API this app uses. The interfaces are structural
 * so tests can pass a fake browser and the adapter never depends on a DOM
 * implementation.
 */
export interface FullscreenDocument {
  readonly fullscreenEnabled?: boolean;
  readonly fullscreenElement?: unknown;
  exitFullscreen?: () => Promise<void>;
  addEventListener(
    type: 'fullscreenchange' | 'fullscreenerror',
    listener: () => void,
  ): void;
  removeEventListener(
    type: 'fullscreenchange' | 'fullscreenerror',
    listener: () => void,
  ): void;
}

export interface FullscreenElement {
  requestFullscreen?: () => Promise<void>;
}

export type FullscreenEvent =
  { type: 'change'; active: boolean } | { type: 'error'; message: string };

export type FullscreenListener = (event: FullscreenEvent) => void;

export interface FullscreenAdapter {
  /** True when the browser exposes the Fullscreen API and allows its use. */
  readonly supported: boolean;
  /** Live fullscreen state; subscribers are told when this changes. */
  readonly active: boolean;
  request(element: FullscreenElement): Promise<boolean>;
  exit(): Promise<boolean>;
  toggle(element: FullscreenElement): Promise<boolean>;
  subscribe(listener: FullscreenListener): () => void;
}

export interface FullscreenOptions {
  /** Injected document for tests; defaults to the global document in a browser. */
  document?: FullscreenDocument;
}

const FULLSCREEN_ERROR_MESSAGE = 'The browser refused the fullscreen request.';

function currentDocument(): FullscreenDocument | null {
  return typeof document === 'undefined' ? null : document;
}

function messageOf(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return typeof error === 'string' ? error : FULLSCREEN_ERROR_MESSAGE;
}

/**
 * Adapts the Fullscreen API into a small, testable controller. The player never
 * touches `requestFullscreen` directly: it asks this adapter, so support
 * detection, event wiring, and failed requests stay in one place.
 */
export function createFullscreen(options: FullscreenOptions = {}): FullscreenAdapter {
  const document = options.document ?? currentDocument();
  const supported =
    document !== null &&
    document.fullscreenEnabled === true &&
    typeof document.exitFullscreen === 'function';

  const isActive = () => document !== null && document.fullscreenElement != null;
  const listeners = new Set<FullscreenListener>();

  const emit = (event: FullscreenEvent) => {
    // Snapshot the listeners so one may unsubscribe while an event is delivered.
    for (const listener of Array.from(listeners)) {
      listener(event);
    }
  };

  const onChange = () => emit({ type: 'change', active: isActive() });
  const onError = () => emit({ type: 'error', message: FULLSCREEN_ERROR_MESSAGE });

  const request = async (element: FullscreenElement): Promise<boolean> => {
    if (!supported || !document || typeof element.requestFullscreen !== 'function') {
      return false;
    }
    try {
      await element.requestFullscreen();
      return true;
    } catch (error) {
      emit({ type: 'error', message: messageOf(error) });
      return false;
    }
  };

  const exit = async (): Promise<boolean> => {
    if (!supported || !document?.exitFullscreen) {
      return false;
    }
    if (!isActive()) {
      return true;
    }
    try {
      await document.exitFullscreen();
      return true;
    } catch (error) {
      emit({ type: 'error', message: messageOf(error) });
      return false;
    }
  };

  return {
    supported,
    get active() {
      return isActive();
    },
    request,
    exit,
    toggle: (element) => (isActive() ? exit() : request(element)),
    subscribe(listener) {
      if (!document) {
        return () => {};
      }
      listeners.add(listener);
      if (listeners.size === 1) {
        document.addEventListener('fullscreenchange', onChange);
        document.addEventListener('fullscreenerror', onError);
      }
      return () => {
        listeners.delete(listener);
        if (listeners.size === 0) {
          document.removeEventListener('fullscreenchange', onChange);
          document.removeEventListener('fullscreenerror', onError);
        }
      };
    },
  };
}
