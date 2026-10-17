/*
 * Host page wiring for the docs fixture. The custom element is declared in the
 * HTML; this script only creates the iframe through the public helper, which is
 * the same call a real docs site makes.
 */
import { createIframeEmbed } from './dist/sothspell/player.js';

const slot = document.querySelector('#iframe-slot');

const embed = createIframeEmbed({
  // `tour` is resolved by embed.html, so it is relative to the bundle
  // directory, not to this page.
  src: './dist/sothspell/embed.html',
  tour: './tour.json',
  title: 'Sóþspell tour (iframe fallback)',
  height: 460,
  progress: true,
});

slot.append(embed.element);

// The browser tests use this handle to drive the iframe host API directly.
window.iframeEmbed = embed;
