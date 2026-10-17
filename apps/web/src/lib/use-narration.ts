import { useEffect, useRef, useState } from 'react';
import type { CompiledBeat } from '@sothspell/core';
import type { NarrationSegment } from '@sothspell/narration';
import { createBrowserNarration } from '@sothspell/narration/browser';
import { wordAt } from '@sothspell/player';

export type NarrationProviderChoice = 'browser' | 'cloud';
export type NarrationStatus = 'idle' | 'loading' | 'playing' | 'paused' | 'error';

export interface NarrationState {
  status: NarrationStatus;
  activeSentenceIndex: number;
  activeWord: string | null;
  error: string | null;
  provider: NarrationProviderChoice;
}

export interface UseNarrationOptions {
  tourId: string;
  beat: CompiledBeat | null;
  enabled: boolean;
  provider: NarrationProviderChoice;
  speed: number;
  onBeatEnd: () => void;
  onProgress?: (offsetMs: number) => void;
}

export interface NarrationController extends NarrationState {
  toggle: () => void;
  pause: () => void;
  resume: () => void;
  stop: () => void;
}

interface ActiveNarration {
  pause: () => void;
  resume: () => void;
  stop: () => void;
}

/**
 * Loads and controls narration for the current beat. Browser speech is the
 * default; cloud narration is opt-in and falls back to browser speech when the
 * API has no provider key or cannot reach the provider. The player still owns
 * the beat; narration reports progress and calls `onBeatEnd` so listen mode can
 * advance at the audio's pace.
 */
export function useNarration(options: UseNarrationOptions): NarrationController {
  const [state, setState] = useState<NarrationState>({
    status: 'idle',
    activeSentenceIndex: -1,
    activeWord: null,
    error: null,
    provider: 'browser',
  });
  const activeRef = useRef<ActiveNarration | null>(null);
  const stoppedRef = useRef(false);
  const callbacksRef = useRef({
    onBeatEnd: options.onBeatEnd,
    onProgress: options.onProgress,
  });
  callbacksRef.current = {
    onBeatEnd: options.onBeatEnd,
    onProgress: options.onProgress,
  };

  const stopActive = () => {
    activeRef.current?.stop();
    activeRef.current = null;
  };

  useEffect(() => {
    stoppedRef.current = false;
    stopActive();

    if (!options.enabled || !options.beat) {
      setState((current) => ({
        ...current,
        status: 'idle',
        activeSentenceIndex: -1,
        activeWord: null,
        error: null,
        provider: options.provider,
      }));
      return;
    }

    const beat = options.beat;

    setState({
      status: 'loading',
      activeSentenceIndex: -1,
      activeWord: null,
      error: null,
      provider: options.provider,
    });

    let cancelled = false;
    let timer: number | undefined;

    const startBrowser = () => {
      if (cancelled) {
        return;
      }
      const narration = createBrowserNarration({
        text: beat.narration,
        rate: options.speed,
        onSentence: (index) => {
          if (!cancelled) {
            setState((current) => ({ ...current, activeSentenceIndex: index }));
          }
        },
      });

      activeRef.current = {
        pause: () => narration.pause(),
        resume: () => narration.resume(),
        stop: () => narration.stop(),
      };

      narration.play();
      setState((current) => ({
        ...current,
        status: 'playing',
        provider: 'browser',
      }));

      timer = window.setInterval(() => {
        if (cancelled) {
          return;
        }
        options.onProgress?.(narration.currentTimeMs());
        const snapshot = narration.getSnapshot();
        if (snapshot.status === 'completed') {
          window.clearInterval(timer);
          if (!stoppedRef.current) {
            callbacksRef.current.onBeatEnd();
          }
        } else if (snapshot.status === 'error') {
          window.clearInterval(timer);
          setState((current) => ({
            ...current,
            status: 'error',
            error: snapshot.error,
          }));
        }
      }, 250);
    };

    const startCloud = async () => {
      try {
        const response = await fetch('/api/narration', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            beatId: beat.id,
            text: beat.narration,
          }),
        });
        if (!response.ok) {
          const body = (await response.json().catch(() => null)) as {
            error?: string;
          } | null;
          throw new Error(body?.error ?? `cloud narration returned ${response.status}`);
        }
        const payload = (await response.json()) as {
          segment: NarrationSegment;
        };
        if (cancelled) {
          return;
        }

        const audio = new Audio(payload.segment.audio?.url);
        audio.playbackRate = options.speed;
        activeRef.current = {
          pause: () => audio.pause(),
          resume: () => void audio.play(),
          stop: () => {
            audio.pause();
            audio.removeAttribute('src');
            audio.load();
          },
        };
        audio.addEventListener('timeupdate', () => {
          if (cancelled) {
            return;
          }
          const timeMs = audio.currentTime * 1000;
          options.onProgress?.(timeMs);
          const word = wordAt(payload.segment.words, timeMs);
          const sentenceIndex = payload.segment.sentences.findIndex(
            (sentence) => timeMs >= sentence.startMs && timeMs <= sentence.endMs,
          );
          setState((current) => ({
            ...current,
            activeSentenceIndex:
              sentenceIndex === -1 ? current.activeSentenceIndex : sentenceIndex,
            activeWord: word?.word ?? current.activeWord,
          }));
        });
        audio.addEventListener('ended', () => {
          if (!cancelled && !stoppedRef.current) {
            callbacksRef.current.onBeatEnd();
          }
        });
        audio.addEventListener('error', () => {
          if (!cancelled) {
            setState((current) => ({
              ...current,
              status: 'error',
              error: 'Cloud audio could not be played.',
            }));
          }
        });
        await audio.play();
        setState((current) => ({
          ...current,
          status: 'playing',
          provider: 'cloud',
        }));
      } catch (error) {
        if (cancelled) {
          return;
        }
        const message =
          error instanceof Error ? error.message : 'Cloud narration failed.';
        setState((current) => ({
          ...current,
          status: 'loading',
          provider: 'browser',
          error: `${message} Using browser speech instead.`,
        }));
        startBrowser();
      }
    };

    if (options.provider === 'cloud') {
      void startCloud();
    } else {
      startBrowser();
    }

    return () => {
      cancelled = true;
      if (timer !== undefined) {
        window.clearInterval(timer);
      }
      stopActive();
    };
  }, [
    options.beat?.id,
    options.beat?.narration,
    options.enabled,
    options.provider,
    options.speed,
  ]);

  return {
    ...state,
    toggle: () => {
      if (state.status === 'playing') {
        activeRef.current?.pause();
        setState((current) => ({ ...current, status: 'paused' }));
      } else if (state.status === 'paused') {
        activeRef.current?.resume();
        setState((current) => ({ ...current, status: 'playing' }));
      }
    },
    pause: () => {
      activeRef.current?.pause();
      setState((current) => ({ ...current, status: 'paused' }));
    },
    resume: () => {
      activeRef.current?.resume();
      setState((current) => ({ ...current, status: 'playing' }));
    },
    stop: () => {
      stoppedRef.current = true;
      stopActive();
      setState((current) => ({ ...current, status: 'idle' }));
    },
  };
}
