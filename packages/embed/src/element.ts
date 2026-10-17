import { createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { createEmbedController, type EmbedController } from './controller.js';
import type { EmbedEvent, EmbedSnapshot, EmbedTour } from './types.js';
import { App } from './ui/App.js';
import styles from './ui/styles.css?inline';

export const SOTSPELL_TOUR_TAG = 'sothspell-tour';

export interface CustomElementRegistryLike {
  get(name: string): unknown;
  define(name: string, constructor: CustomElementConstructor): void;
}

/**
 * The class extends the real `HTMLElement` in a browser and `Object` under
 * Node (where only registration is tested). Keeping the base dynamic is what
 * lets the package be imported by unit tests without a DOM shim.
 */
const HTMLElementBase = ((globalThis as { HTMLElement?: typeof HTMLElement })
  .HTMLElement ?? Object) as typeof HTMLElement;

function parseProgressAttribute(value: string | null): boolean {
  if (value === null) {
    return true;
  }
  const normalized = value.trim().toLowerCase();
  return normalized !== 'off' && normalized !== 'false' && normalized !== '0';
}

function toDomEvent(event: EmbedEvent): CustomEvent {
  const detail =
    event.snapshot ?? (event.message === undefined ? null : { message: event.message });
  return new CustomEvent(`sothspell:${event.type}`, {
    detail,
    bubbles: true,
    composed: true,
  });
}

/**
 * `<sothspell-tour>` is the embed's public surface in a page. It owns the
 * shadow root (host CSS cannot reach in, player CSS cannot leak out), mounts
 * the React view, and forwards everything to the controller. Methods mirror
 * the host API; state arrives as `sothspell:*` events.
 */
export class SothspellTourElement extends HTMLElementBase {
  static get observedAttributes(): string[] {
    return ['tour', 'locale', 'progress'];
  }

  private root: Root | null = null;
  private controller: EmbedController | null = null;
  private unsubscribe: (() => void) | null = null;
  private progressEnabled = true;
  private connected = false;
  private container: HTMLElement | null = null;

  connectedCallback(): void {
    if (this.connected) {
      return;
    }
    this.connected = true;
    this.progressEnabled = parseProgressAttribute(this.getAttribute('progress'));

    const shadow = this.shadowRoot ?? this.attachShadow({ mode: 'open' });
    if (!shadow.querySelector('style[data-sothspell-styles]')) {
      const style = document.createElement('style');
      style.setAttribute('data-sothspell-styles', '');
      style.textContent = styles;
      shadow.append(style);
    }
    // React empties the container on unmount, so a re-connected element can
    // reuse it instead of stacking empty divs in the shadow root.
    if (!this.container || !this.container.isConnected) {
      this.container = document.createElement('div');
      shadow.append(this.container);
    }

    const controller = createEmbedController({
      // `undefined` asks the controller for the default store; `null` is the
      // explicit opt-out.
      storage: this.progressEnabled ? undefined : null,
      locale: this.getAttribute('locale'),
    });
    this.controller = controller;
    this.unsubscribe = controller.subscribe((event) => {
      this.dispatchEvent(toDomEvent(event));
    });

    const container = this.container;
    this.root = createRoot(container);
    this.render();

    const tourUrl = this.getAttribute('tour');
    if (tourUrl) {
      void this.load(tourUrl).catch(() => {
        // The failure is already visible as an `sothspell:error` event.
      });
    }
  }

  disconnectedCallback(): void {
    this.connected = false;
    this.unsubscribe?.();
    this.unsubscribe = null;
    this.controller?.destroy();
    this.controller = null;
    this.root?.unmount();
    this.root = null;
  }

  attributeChangedCallback(
    name: string,
    _oldValue: string | null,
    value: string | null,
  ): void {
    // Initial attributes are read in connectedCallback; changes before
    // connection are picked up there too.
    if (!this.controller) {
      return;
    }
    switch (name) {
      case 'tour':
        if (value) {
          void this.load(value).catch(() => {
            // Surfaced as `sothspell:error`.
          });
        }
        break;
      case 'locale':
        this.controller.setLocale(value);
        break;
      case 'progress':
        this.progressEnabled = parseProgressAttribute(value);
        this.controller.setProgressEnabled(this.progressEnabled);
        this.render();
        break;
      default:
        break;
    }
  }

  private render(): void {
    if (this.root && this.controller) {
      this.root.render(
        createElement(App, {
          controller: this.controller,
          progressEnabled: this.progressEnabled,
        }),
      );
    }
  }

  load(source: string): Promise<EmbedSnapshot> {
    if (!this.controller) {
      return Promise.reject(new Error('the sothspell-tour element is not connected'));
    }
    return this.controller.load(source);
  }

  play(): void {
    this.controller?.play();
  }

  pause(): void {
    this.controller?.pause();
  }

  toggle(): void {
    this.controller?.toggle();
  }

  seek(fraction: number): void {
    this.controller?.seek(fraction);
  }

  seekToBeat(beatId: string): void {
    this.controller?.seekToBeat(beatId);
  }

  setSpeed(speed: number): void {
    this.controller?.setSpeed(speed);
  }

  next(): void {
    this.controller?.next();
  }

  previous(): void {
    this.controller?.previous();
  }

  setLocale(locale: string | null): void {
    if (locale === null) {
      this.removeAttribute('locale');
    } else {
      this.setAttribute('locale', locale);
    }
  }

  setProgressEnabled(enabled: boolean): void {
    this.setAttribute('progress', enabled ? 'on' : 'off');
  }

  get snapshot(): EmbedSnapshot | null {
    return this.controller?.getSnapshot() ?? null;
  }

  get tour(): EmbedTour | null {
    return this.controller?.getTour() ?? null;
  }

  get locale(): string | null {
    return this.getAttribute('locale');
  }
}

export function defineSothspellTour(
  registry: CustomElementRegistryLike = globalThis.customElements as CustomElementRegistryLike,
): typeof SothspellTourElement {
  if (
    !registry ||
    typeof registry.get !== 'function' ||
    typeof registry.define !== 'function'
  ) {
    throw new Error('no custom element registry is available in this environment');
  }
  if (!registry.get(SOTSPELL_TOUR_TAG)) {
    registry.define(SOTSPELL_TOUR_TAG, SothspellTourElement);
  }
  return SothspellTourElement;
}
