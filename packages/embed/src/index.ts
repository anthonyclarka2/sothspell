/**
 * Public API of the embed bundle. A docs page normally imports `player.js`
 * (the built entry), which registers `<sothspell-tour>` and exposes
 * `window.SothspellEmbed`; this module is the typed surface behind it.
 */

export { createEmbedController, type EmbedController } from './controller.js';

export {
  defineSothspellTour,
  SOTSPELL_TOUR_TAG,
  SothspellTourElement,
  type CustomElementRegistryLike,
} from './element.js';

export {
  applyHostCommand,
  createIframeEmbed,
  mountIframeBridge,
  withEmbedParams,
  type BridgeElement,
  type BridgeElementEvents,
  type BridgeScope,
  type EmbedParams,
  type IframeEmbed,
  type IframeEmbedOptions,
} from './iframe.js';

export {
  EMBED_CHANNEL,
  embedCommand,
  embedMessage,
  isEmbedCommand,
  isEmbedMessage,
  postEmbedMessage,
  type EmbedCommand,
  type EmbedCommandType,
  type EmbedMessage,
  type MessageTarget,
} from './protocol.js';

export {
  clearEmbedProgress,
  defaultStorage,
  progressStorageKey,
  readEmbedProgress,
  writeEmbedProgress,
  type StorageLike,
  type StoredEmbedProgress,
} from './progress.js';

export { EMBED_API_VERSION } from './version.js';

export type {
  CompiledAnchor,
  CompiledBeat,
  CompiledChapter,
  CompiledTour,
  EmbedClock,
  EmbedControllerOptions,
  EmbedEvent,
  EmbedEventType,
  EmbedListener,
  EmbedSnapshot,
  EmbedTour,
  TourTranslation,
} from './types.js';
