/**
 * Inline icons for the embed chrome. The embed bundle must not pull an icon
 * package for six glyphs; these are the same shapes the web player uses, sized
 * to 18px and drawn with `currentColor`.
 */

import type { JSX } from 'react';

export function PlayIcon(): JSX.Element {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 256 256"
      aria-hidden="true"
      focusable="false"
    >
      <path
        d="M240 128a15.8 15.8 0 0 1-7.8 13.6l-152 96A16 16 0 0 1 56 224V32a16 16 0 0 1 24.2-13.6l152 96A15.8 15.8 0 0 1 240 128Z"
        fill="currentColor"
      />
    </svg>
  );
}

export function PauseIcon(): JSX.Element {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 256 256"
      aria-hidden="true"
      focusable="false"
    >
      <path
        d="M88 32H56a16 16 0 0 0-16 16v160a16 16 0 0 0 16 16h32a16 16 0 0 0 16-16V48a16 16 0 0 0-16-16Zm112 0h-32a16 16 0 0 0-16 16v160a16 16 0 0 0 16 16h32a16 16 0 0 0 16-16V48a16 16 0 0 0-16-16Z"
        fill="currentColor"
      />
    </svg>
  );
}

export function PreviousIcon(): JSX.Element {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 256 256"
      aria-hidden="true"
      focusable="false"
    >
      <path
        d="M224 48v160a16 16 0 0 1-24.2 13.6L96 154.5V208a16 16 0 0 1-32 0V48a16 16 0 0 1 32 0v53.5l103.8-67.1A16 16 0 0 1 224 48Z"
        fill="currentColor"
      />
    </svg>
  );
}

export function NextIcon(): JSX.Element {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 256 256"
      aria-hidden="true"
      focusable="false"
    >
      <path
        d="M32 48v160a16 16 0 0 0 24.2 13.6L160 154.5V208a16 16 0 0 0 32 0V48a16 16 0 0 0-32 0v53.5L56.2 34.4A16 16 0 0 0 32 48Z"
        fill="currentColor"
      />
    </svg>
  );
}

export function SpeakerIcon(): JSX.Element {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 256 256"
      aria-hidden="true"
      focusable="false"
    >
      <path
        d="M160 32a8 8 0 0 0-8.5 1L83.4 80H48a16 16 0 0 0-16 16v64a16 16 0 0 0 16 16h35.4l68.1 47a8 8 0 0 0 8.5 1 8.3 8.3 0 0 0 4-7.2V39.2a8.3 8.3 0 0 0-4-7.2Zm64.6 63.4a8 8 0 0 0-11.3 11.3 40 40 0 0 1 0 56.6 8 8 0 0 0 0 11.3 8 8 0 0 0 11.3 0 56 56 0 0 0 0-79.2Z"
        fill="currentColor"
      />
    </svg>
  );
}
