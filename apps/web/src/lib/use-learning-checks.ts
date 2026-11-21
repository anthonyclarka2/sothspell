import { useEffect, useMemo, useRef, useState, type RefObject } from 'react';
import type { CompiledTour } from '@sothspell/core';
import type { Playback } from '@sothspell/player';
import type { NarrationController } from './use-narration.js';

const AUTOMATIC_CHECKS_KEY = 'sothspell:automatic-learning-checks';

interface OpenLearningCheck {
  tourId: string;
  beatId: string;
  returnFocus: HTMLElement | null;
  resume: 'read' | 'listen' | 'next' | null;
}

interface LearningChecksOptions {
  tour: CompiledTour | null;
  currentBeatId: string | undefined;
  playback: Playback | null;
  narration: NarrationController;
  narrationMode: 'read' | 'listen';
  askOpen: boolean;
  pageRef: RefObject<HTMLDivElement | null>;
}

/** Coordinates the interlude with playback. The dialog owns the private input. */
export function useLearningChecks({
  tour,
  currentBeatId,
  playback,
  narration,
  narrationMode,
  askOpen,
  pageRef,
}: LearningChecksOptions) {
  const [automaticChecks, setAutomaticChecks] = useState(
    () => window.localStorage.getItem(AUTOMATIC_CHECKS_KEY) !== 'off',
  );
  const [openCheck, setOpenCheck] = useState<OpenLearningCheck | null>(null);
  const presentedChecks = useRef(new Set<string>());
  const available = useMemo(
    () =>
      tour?.chapters.some((chapter) => chapter.beats.some((beat) => beat.learningCheck)),
    [tour],
  );

  function offer(beatId: string, trigger: 'manual' | 'read-end' | 'listen-end'): boolean {
    const check = tour?.chapters
      .find((chapter) => chapter.beats.some((beat) => beat.id === beatId))
      ?.beats.find((beat) => beat.id === beatId)?.learningCheck;
    if (!tour || !check || !playback || openCheck || askOpen) {
      return false;
    }
    const key = `${tour.id}:${check.id}`;
    if (
      trigger !== 'manual' &&
      (!automaticChecks ||
        presentedChecks.current.has(key) ||
        pageRef.current?.querySelector(
          'dialog[open], [role="dialog"], .chapter-drawer-panel, .canvas-outline, .canvas-display-panel',
        ))
    ) {
      return false;
    }

    const active = document.activeElement;
    const returnFocus =
      active instanceof HTMLElement && active !== document.body ? active : null;
    const playing =
      narrationMode === 'listen'
        ? narration.status === 'playing'
        : playback.getSnapshot().status === 'playing';
    presentedChecks.current.add(key);
    setOpenCheck({
      tourId: tour.id,
      beatId,
      returnFocus,
      resume: trigger === 'listen-end' ? 'next' : playing ? narrationMode : null,
    });
    if (narrationMode === 'listen') {
      narration.pause();
    } else if (trigger === 'manual') {
      playback.pause();
    }
    return true;
  }

  const active =
    openCheck?.tourId === tour?.id && openCheck?.beatId === currentBeatId
      ? openCheck
      : null;

  useEffect(() => {
    if (openCheck && !active) {
      setOpenCheck(null);
    }
  }, [openCheck, active]);

  function finish(): void {
    setOpenCheck(null);
    if (!openCheck || playback?.getSnapshot().beatId !== openCheck.beatId) {
      return;
    }
    if (openCheck.resume === 'next') {
      narration.stop();
      playback.next();
    } else if (openCheck.resume === 'listen') {
      narration.resume();
    } else if (openCheck.resume === 'read') {
      playback.play();
    }
    requestAnimationFrame(() => {
      const fallback = pageRef.current?.querySelector<HTMLElement>('.transport-primary');
      (openCheck.returnFocus?.isConnected ? openCheck.returnFocus : fallback)?.focus();
    });
  }

  const setAutomatic = (value: boolean) => {
    setAutomaticChecks(value);
    window.localStorage.setItem(AUTOMATIC_CHECKS_KEY, value ? 'on' : 'off');
  };

  return {
    active: active !== null,
    available,
    automatic: automaticChecks,
    setAutomatic,
    offer,
    finish,
  };
}
