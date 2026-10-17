import {
  createIframeEmbed,
  mountIframeBridge,
  type BridgeElementEvents,
} from './iframe.js';
import {
  defineSothspellTour,
  SOTSPELL_TOUR_TAG,
  SothspellTourElement,
} from './element.js';
import { EMBED_API_VERSION } from './version.js';
import './ui/host.css';

export * from './index.js';

export interface SothspellEmbedGlobal {
  version: string;
  defineSothspellTour: typeof defineSothspellTour;
  createIframeEmbed: typeof createIframeEmbed;
}

declare global {
  interface Window {
    SothspellEmbed?: SothspellEmbedGlobal;
  }
}

/**
 * The built entry: registering the element is enough for a docs page that
 * writes `<sothspell-tour>`, and the global gives script-only hosts the same
 * API without a module import. The iframe page shipped by `sothspell export`
 * marks its body and is bridged here, so one bundle serves both integration
 * styles.
 */
function bootstrapIframeBridge(): void {
  if (!document.body?.classList.contains('sothspell-iframe')) {
    return;
  }
  const element = document.querySelector(SOTSPELL_TOUR_TAG);
  if (element instanceof SothspellTourElement) {
    mountIframeBridge(element as unknown as BridgeElementEvents, window);
  }
}

defineSothspellTour();

if (typeof window !== 'undefined') {
  window.SothspellEmbed = {
    version: EMBED_API_VERSION,
    defineSothspellTour,
    createIframeEmbed,
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bootstrapIframeBridge, { once: true });
  } else {
    bootstrapIframeBridge();
  }
}
