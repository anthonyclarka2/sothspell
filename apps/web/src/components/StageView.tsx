import type { CompiledBeat, CompiledChapter } from '@sothspell/core';
import { useLocale } from '../i18n/locale.js';
import { CodePane } from './CodePane.js';
import { DiagramStage } from './DiagramStage.js';

export interface StageViewProps {
  chapter: CompiledChapter;
  beat: CompiledBeat;
  projectSlug: string;
  tourId: string;
  onOpenAnchor: (anchorId: string) => void;
}

/**
 * The Stage layout: the beat diagram and its code evidence side by side. It is
 * extracted from the player route so the canvas view can replace it without
 * duplicating playback, narration, or the surrounding player chrome.
 */
export function StageView({
  chapter,
  beat,
  projectSlug,
  tourId,
  onOpenAnchor,
}: StageViewProps) {
  const { t } = useLocale();

  return (
    <div className="stage">
      <section className="diagram-panel" aria-label={t('player.diagram')}>
        <div className="panel-header">
          <strong>{chapter.diagrams[0]?.title ?? t('player.diagram')}</strong>
          <span>{chapter.title}</span>
        </div>
        <DiagramStage chapter={chapter} beat={beat} onOpenAnchor={onOpenAnchor} />
      </section>

      <section className="code-panel" aria-label={t('player.codeEvidence')}>
        <div className="panel-header">
          <strong>{beat.anchors[0]?.label ?? t('player.codeEvidence')}</strong>
          <span className="mono">{beat.anchors[0]?.language ?? 'text'}</span>
        </div>
        <CodePane projectSlug={projectSlug} tourId={tourId} beat={beat} />
      </section>
    </div>
  );
}
