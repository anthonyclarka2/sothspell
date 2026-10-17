import { useEffect, useRef, useState } from 'react';
import {
  createBrowserNarration,
  type BrowserNarrationStatus,
} from '@sothspell/narration/browser';
import type { CompiledBeat } from '../types.js';

export interface NarrationView {
  status: BrowserNarrationStatus | 'idle';
  activeSentenceIndex: number;
  error: string | null;
}

export interface UseNarrationOptions {
  beat: CompiledBeat | null;
  enabled: boolean;
  speed: number;
  onBeatEnd: () => void;
}

const IDLE_VIEW: NarrationView = { status: 'idle', activeSentenceIndex: -1, error: null };

/**
 * Listen mode for the embed: sentence-level browser speech, the same adapter
 * the web player uses. Cloud narration is deliberately absent — the embed has
 * no provider keys and makes no network calls. When a beat finishes speaking,
 * the hook advances the tour so listening behaves like read mode.
 */
export function useNarration({
  beat,
  enabled,
  speed,
  onBeatEnd,
}: UseNarrationOptions): NarrationView {
  const [view, setView] = useState<NarrationView>(IDLE_VIEW);
  const onBeatEndRef = useRef(onBeatEnd);

  useEffect(() => {
    onBeatEndRef.current = onBeatEnd;
  }, [onBeatEnd]);

  const beatId = beat?.id ?? null;
  const narrationText = beat?.narration ?? '';

  useEffect(() => {
    if (!enabled || beatId === null) {
      setView(IDLE_VIEW);
      return;
    }

    const narration = createBrowserNarration({
      text: narrationText,
      rate: speed,
      onSentence: (index) => {
        setView({ status: 'speaking', activeSentenceIndex: index, error: null });
      },
    });
    narration.play();

    const timer = window.setInterval(() => {
      const snapshot = narration.getSnapshot();
      setView({
        status: snapshot.status,
        activeSentenceIndex: snapshot.sentenceIndex,
        error: snapshot.error,
      });
      if (snapshot.status === 'completed') {
        window.clearInterval(timer);
        onBeatEndRef.current();
      }
      if (snapshot.status === 'error') {
        window.clearInterval(timer);
      }
    }, 250);

    return () => {
      window.clearInterval(timer);
      narration.stop();
    };
  }, [beatId, narrationText, enabled, speed]);

  return view;
}
