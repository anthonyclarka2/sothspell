import { describe, expect, it, vi } from 'vitest';
import { embedCommand, embedMessage, EMBED_CHANNEL } from './protocol.js';
import {
  applyHostCommand,
  mountIframeBridge,
  withEmbedParams,
  type BridgeElement,
  type BridgeElementEvents,
  type BridgeScope,
} from './iframe.js';

function fakeElement(): BridgeElementEvents & {
  calls: string[];
  attributes: Map<string, string>;
  emit(type: string, detail: unknown): void;
} {
  const listeners = new Map<string, Set<(event: Event) => void>>();
  const calls: string[] = [];
  const attributes = new Map<string, string>();
  const element = {
    calls,
    attributes,
    load: (source: string) => {
      calls.push(`load:${source}`);
    },
    play: () => calls.push('play'),
    pause: () => calls.push('pause'),
    toggle: () => calls.push('toggle'),
    seek: (fraction: number) => calls.push(`seek:${fraction}`),
    next: () => calls.push('next'),
    previous: () => calls.push('previous'),
    setLocale: (locale: string | null) => calls.push(`locale:${locale ?? 'null'}`),
    setAttribute: (name: string, value: string) => {
      attributes.set(name, value);
    },
    addEventListener: (type: string, listener: (event: Event) => void) => {
      const set = listeners.get(type) ?? new Set();
      set.add(listener);
      listeners.set(type, set);
    },
    removeEventListener: (type: string, listener: (event: Event) => void) => {
      listeners.get(type)?.delete(listener);
    },
    emit: (type: string, detail: unknown) => {
      for (const listener of listeners.get(type) ?? []) {
        listener({ detail } as unknown as Event);
      }
    },
  };
  return element;
}

function fakeScope(search: string): BridgeScope & {
  postMessage: ReturnType<typeof vi.fn>;
  deliver(data: unknown): void;
  listenerCount(): number;
} {
  const listeners = new Set<(event: MessageEvent) => void>();
  const scope = {
    parent: { postMessage: vi.fn() },
    location: { search },
    addEventListener: (_type: 'message', listener: (event: MessageEvent) => void) => {
      listeners.add(listener);
    },
    removeEventListener: (_type: 'message', listener: (event: MessageEvent) => void) => {
      listeners.delete(listener);
    },
    postMessage: vi.fn(),
    deliver: (data: unknown) => {
      for (const listener of listeners) {
        listener({ source: scope.parent, data } as unknown as MessageEvent);
      }
    },
    listenerCount: () => listeners.size,
  };
  return scope;
}

describe('embed iframe fallback', () => {
  it('builds relative iframe URLs with tour, locale, and progress parameters', () => {
    expect(withEmbedParams('./embed.html', { tour: './tour.json', progress: true })).toBe(
      './embed.html?tour=./tour.json&progress=on',
    );

    expect(
      withEmbedParams('https://docs.example/embed.html', {
        tour: './tour.json',
        locale: 'de',
        progress: false,
      }),
    ).toBe('https://docs.example/embed.html?tour=./tour.json&locale=de&progress=off');
  });

  it('applies host commands to the element', () => {
    const element = fakeElement();

    expect(applyHostCommand(element as BridgeElement, embedCommand('play'))).toBe(true);
    applyHostCommand(element as BridgeElement, embedCommand('seek', 0.5));
    applyHostCommand(element as BridgeElement, embedCommand('seek', 2));
    applyHostCommand(element as BridgeElement, embedCommand('locale', 'de'));
    applyHostCommand(element as BridgeElement, embedCommand('load', './other.json'));

    expect(element.calls).toEqual([
      'play',
      'seek:0.5',
      'seek:1',
      'locale:de',
      'load:./other.json',
    ]);
    expect(applyHostCommand(element as BridgeElement, embedCommand('destroy'))).toBe(
      false,
    );
  });

  it('reads URL parameters into the element and relays events to the parent', () => {
    const element = fakeElement();
    const scope = fakeScope('?tour=./tour.json&locale=de&progress=off');

    mountIframeBridge(element, scope);

    expect(element.attributes.get('tour')).toBe('./tour.json');
    expect(element.attributes.get('locale')).toBe('de');
    expect(element.attributes.get('progress')).toBe('off');

    element.emit('sothspell:progress', { progress: 0.25 });

    expect(scope.parent.postMessage).toHaveBeenCalledWith(
      embedMessage('progress', { progress: 0.25 }),
      '*',
    );
  });

  it('applies commands from the parent and ignores other sources', () => {
    const element = fakeElement();
    const scope = fakeScope('');

    mountIframeBridge(element, scope);
    scope.deliver(embedCommand('next'));
    scope.deliver({ channel: EMBED_CHANNEL, type: 'not-a-command' });
    scope.deliver({ nonsense: true });

    expect(element.calls).toEqual(['next']);
  });

  it('tears down listeners and stops relaying after destroy', () => {
    const element = fakeElement();
    const scope = fakeScope('');

    const teardown = mountIframeBridge(element, scope);
    expect(scope.listenerCount()).toBe(1);

    scope.deliver(embedCommand('destroy'));

    expect(scope.listenerCount()).toBe(0);
    element.emit('sothspell:progress', { progress: 1 });
    expect(scope.parent.postMessage).not.toHaveBeenCalled();
    teardown();
    expect(scope.listenerCount()).toBe(0);
  });
});
