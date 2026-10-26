import { useCallback, useEffect, useMemo, useState, type RefObject } from 'react';
import { createFullscreen } from './fullscreen.js';

export interface UseFullscreenResult {
  /** False when the browser cannot enter fullscreen; the control should hide. */
  supported: boolean;
  /** The live fullscreen state, kept in sync through `fullscreenchange`. */
  active: boolean;
  toggle: () => void;
}

/**
 * React binding for the fullscreen adapter. The adapter owns browser details;
 * this hook only keeps the active flag in state and exposes a stable toggle for
 * the element behind the ref.
 */
export function useFullscreen<T extends Element>(
  ref: RefObject<T | null>,
): UseFullscreenResult {
  const adapter = useMemo(() => createFullscreen(), []);
  const [active, setActive] = useState(() => adapter.active);

  useEffect(() => {
    setActive(adapter.active);
    return adapter.subscribe((event) => {
      if (event.type === 'change') {
        setActive(event.active);
      }
    });
  }, [adapter]);

  const toggle = useCallback(() => {
    const element = ref.current;
    if (!element) {
      return;
    }
    void adapter.toggle(element);
  }, [adapter, ref]);

  return { supported: adapter.supported, active, toggle };
}
