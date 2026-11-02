import { useEffect, useId, useRef, useState } from 'react';
import { CaretDown, ListBullets } from '@phosphor-icons/react';
import { useLocale } from '../i18n/locale.js';
import { useMediaQuery } from '../lib/use-media-query.js';
import { ChapterRail, type ChapterRailProps } from './ChapterRail.js';

export type ChapterDrawerProps = Omit<ChapterRailProps, 'variant'> & {
  /** Theater hides the player chrome, so the drawer closes instead of trapping focus. */
  theater: boolean;
};

/**
 * Below 1081 px the persistent chapter rail becomes a disclosure opened from the
 * viewbar. The panel stays inside `.player-viewbar` instead of a body portal so
 * it remains visible when `.player-page` is the fullscreen element, and it is
 * mounted only while open so the player never exposes duplicate landmarks or
 * hidden focus targets. One owner holds the open state, positioning, and focus
 * return; `ChapterRail` keeps supplying the chapter list itself.
 */
export function ChapterDrawer({
  chapters,
  activeChapterId,
  activeBeatId,
  completedBeatIds,
  onSeekBeat,
  theater,
}: ChapterDrawerProps) {
  const { t } = useLocale();
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const panelId = useId();
  const wide = useMediaQuery('(min-width: 1081px)');

  // Widening hides the trigger with CSS and theater hides the whole drawer;
  // closing first prevents a focused element from disappearing while open.
  useEffect(() => {
    if (wide || theater) {
      setOpen(false);
    }
  }, [theater, wide]);

  useEffect(() => {
    if (!open) {
      return;
    }
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node | null;
      if (
        target !== null &&
        (panelRef.current?.contains(target) || triggerRef.current?.contains(target))
      ) {
        return;
      }
      // A click elsewhere is the user's next action; do not pull focus back.
      setOpen(false);
    };
    document.addEventListener('pointerdown', onPointerDown, true);
    return () => document.removeEventListener('pointerdown', onPointerDown, true);
  }, [open]);

  useEffect(() => {
    if (!open) {
      return;
    }
    const frame = requestAnimationFrame(() => {
      const panel = panelRef.current;
      const active = panel?.querySelector<HTMLButtonElement>('[aria-current="true"]');
      const first = panel?.querySelector<HTMLButtonElement>('.beat-rail button');
      (active ?? first)?.focus();
    });
    return () => cancelAnimationFrame(frame);
  }, [open]);

  const close = (returnFocus: boolean) => {
    setOpen(false);
    if (returnFocus) {
      triggerRef.current?.focus();
    }
  };

  return (
    <div
      className="chapter-drawer"
      onKeyDown={(event) => {
        if (event.key === 'Escape' && open) {
          // Consume Escape so the player does not also exit theater/fullscreen.
          event.preventDefault();
          event.stopPropagation();
          close(true);
        }
      }}
    >
      <button
        ref={triggerRef}
        type="button"
        className="chapter-drawer-toggle"
        aria-expanded={open}
        aria-controls={open ? panelId : undefined}
        onClick={() => {
          if (open) {
            close(true);
          } else {
            setOpen(true);
          }
        }}
      >
        <ListBullets size={14} aria-hidden="true" />
        <span>{t('rail.drawerTrigger')}</span>
        <CaretDown size={12} aria-hidden="true" className="chapter-drawer-caret" />
      </button>

      {open ? (
        <div ref={panelRef} id={panelId} className="chapter-drawer-panel">
          <ChapterRail
            chapters={chapters}
            activeChapterId={activeChapterId}
            activeBeatId={activeBeatId}
            completedBeatIds={completedBeatIds}
            onSeekBeat={(beatId) => {
              onSeekBeat(beatId);
              close(true);
            }}
            variant="drawer"
          />
        </div>
      ) : null}
    </div>
  );
}
