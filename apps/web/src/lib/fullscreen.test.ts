import { describe, expect, it } from 'vitest';
import {
  createFullscreen,
  type FullscreenDocument,
  type FullscreenElement,
  type FullscreenEvent,
} from './fullscreen.js';

/**
 * A small document/element pair that behaves like the parts of the Fullscreen
 * API the adapter uses. The adapter is browser glue, so the fake browser is the
 * test double at that system seam; no internal module is mocked.
 */
class FakeDocument implements FullscreenDocument {
  fullscreenEnabled = true;
  fullscreenElement: unknown = null;
  exitCalls = 0;

  private readonly listeners = new Map<string, Set<() => void>>();

  addEventListener(type: string, listener: () => void): void {
    const listeners = this.listeners.get(type) ?? new Set<() => void>();
    listeners.add(listener);
    this.listeners.set(type, listeners);
  }

  removeEventListener(type: string, listener: () => void): void {
    this.listeners.get(type)?.delete(listener);
  }

  async exitFullscreen(): Promise<void> {
    this.exitCalls += 1;
    this.fullscreenElement = null;
    this.emit('fullscreenchange');
  }

  emit(type: string): void {
    for (const listener of this.listeners.get(type) ?? []) {
      listener();
    }
  }

  listenerCount(type: string): number {
    return this.listeners.get(type)?.size ?? 0;
  }
}

function createElement(document: FakeDocument): FullscreenElement {
  const element: FullscreenElement = {
    requestFullscreen: async () => {
      document.fullscreenElement = element;
      document.emit('fullscreenchange');
    },
  };
  return element;
}

describe('fullscreen adapter', () => {
  it('reports support and enters fullscreen', async () => {
    const document = new FakeDocument();
    const element = createElement(document);
    const adapter = createFullscreen({ document });
    const events: FullscreenEvent[] = [];
    adapter.subscribe((event) => events.push(event));

    expect(adapter.supported).toBe(true);
    expect(adapter.active).toBe(false);

    await expect(adapter.request(element)).resolves.toBe(true);

    expect(document.fullscreenElement).toBe(element);
    expect(adapter.active).toBe(true);
    expect(events).toEqual([{ type: 'change', active: true }]);
  });

  it('reports fullscreen as unsupported when the document disables it', async () => {
    const document = new FakeDocument();
    document.fullscreenEnabled = false;
    const element = createElement(document);
    const adapter = createFullscreen({ document });

    expect(adapter.supported).toBe(false);

    await expect(adapter.request(element)).resolves.toBe(false);
    expect(document.fullscreenElement).toBeNull();
  });

  it('reports a refused request without throwing', async () => {
    const document = new FakeDocument();
    const element: FullscreenElement = {
      requestFullscreen: async () => {
        throw new Error('denied by policy');
      },
    };
    const adapter = createFullscreen({ document });
    const events: FullscreenEvent[] = [];
    adapter.subscribe((event) => events.push(event));

    await expect(adapter.request(element)).resolves.toBe(false);

    expect(adapter.active).toBe(false);
    expect(events).toEqual([{ type: 'error', message: 'denied by policy' }]);
  });

  it('forwards a browser fullscreenerror event', () => {
    const document = new FakeDocument();
    const adapter = createFullscreen({ document });
    const events: FullscreenEvent[] = [];
    adapter.subscribe((event) => events.push(event));

    document.emit('fullscreenerror');

    expect(events).toEqual([
      { type: 'error', message: 'The browser refused the fullscreen request.' },
    ]);
  });

  it('exits fullscreen and toggles between the two states', async () => {
    const document = new FakeDocument();
    const element = createElement(document);
    const adapter = createFullscreen({ document });
    const events: FullscreenEvent[] = [];
    adapter.subscribe((event) => events.push(event));

    await adapter.request(element);
    await expect(adapter.toggle(element)).resolves.toBe(true);

    expect(document.exitCalls).toBe(1);
    expect(adapter.active).toBe(false);

    await expect(adapter.toggle(element)).resolves.toBe(true);

    expect(adapter.active).toBe(true);
    expect(events).toEqual([
      { type: 'change', active: true },
      { type: 'change', active: false },
      { type: 'change', active: true },
    ]);
  });

  it('treats exit while already out of fullscreen as a successful no-op', async () => {
    const document = new FakeDocument();
    const adapter = createFullscreen({ document });

    await expect(adapter.exit()).resolves.toBe(true);

    expect(document.exitCalls).toBe(0);
  });

  it('removes the document listeners when the last subscriber leaves', () => {
    const document = new FakeDocument();
    const adapter = createFullscreen({ document });
    const events: FullscreenEvent[] = [];
    const unsubscribe = adapter.subscribe((event) => events.push(event));

    expect(document.listenerCount('fullscreenchange')).toBe(1);
    expect(document.listenerCount('fullscreenerror')).toBe(1);

    unsubscribe();

    expect(document.listenerCount('fullscreenchange')).toBe(0);
    expect(document.listenerCount('fullscreenerror')).toBe(0);

    document.emit('fullscreenchange');
    expect(events).toEqual([]);
  });

  it('keeps one document listener while another subscriber remains', () => {
    const document = new FakeDocument();
    const adapter = createFullscreen({ document });
    const unsubscribeFirst = adapter.subscribe(() => {});
    const unsubscribeSecond = adapter.subscribe(() => {});

    expect(document.listenerCount('fullscreenchange')).toBe(1);

    unsubscribeFirst();

    expect(document.listenerCount('fullscreenchange')).toBe(1);

    unsubscribeSecond();

    expect(document.listenerCount('fullscreenchange')).toBe(0);
  });
});
