import { describe, expect, it, vi } from 'vitest';
import {
  defineSothspellTour,
  SOTSPELL_TOUR_TAG,
  SothspellTourElement,
  type CustomElementRegistryLike,
} from './element.js';

function fakeRegistry(): CustomElementRegistryLike & {
  definitions: Map<string, unknown>;
} {
  const definitions = new Map<string, unknown>();
  return {
    definitions,
    get: (name) => definitions.get(name),
    define: (name, constructor) => {
      definitions.set(name, constructor);
    },
  };
}

describe('sothspell-tour element registration', () => {
  it('registers the custom element under its tag name', () => {
    const registry = fakeRegistry();

    defineSothspellTour(registry);

    expect(registry.definitions.get(SOTSPELL_TOUR_TAG)).toBe(SothspellTourElement);
  });

  it('is idempotent across repeated definitions', () => {
    const registry = fakeRegistry();
    const define = vi.fn(registry.define);

    defineSothspellTour({ get: registry.get, define });
    defineSothspellTour({ get: registry.get, define });

    expect(define).toHaveBeenCalledTimes(1);
  });

  it('fails loudly when no registry exists', () => {
    expect(() =>
      defineSothspellTour(null as unknown as CustomElementRegistryLike),
    ).toThrow(/registry/i);
  });
});
