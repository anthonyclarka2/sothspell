import { Link } from '@tanstack/react-router';
import { X } from '@phosphor-icons/react';
import type { CanvasScene } from '@sothspell/canvas';
import type { PositionedDiagram } from '@sothspell/diagram';
import { useLocale } from '../../i18n/locale.js';
import { COLLAPSED_LINES } from './code-html.js';
import {
  relationOwnerKey,
  type CanvasRelationMeta,
  type CanvasRelationToggleDirection,
  type CanvasRelationUiState,
} from './relation-scene.js';

export interface CanvasOutlineActions {
  focusDiagram: (diagramId: string) => void;
  addDiagram: (diagramId: string) => void;
  removeDiagram: (diagramId: string) => void;
  focusObject: (diagramId: string, objectId: string) => void;
  focusContainer: (containerId: string) => void;
  toggleContainer: (containerId: string) => void;
  toggleRelation: (containerId: string, direction: CanvasRelationToggleDirection) => void;
  openDefinition: (symbolId: string, sourceContainerId?: string) => void;
  showAllAnchors: () => void;
  zoomIn: () => void;
  zoomOut: () => void;
  resetZoom: () => void;
  fitAll: () => void;
  home: () => void;
  autoArrange: () => void;
  toggleFollowBeat: () => void;
  toggleFullscreen: () => void;
  close: () => void;
}

export interface CanvasOutlineProps {
  scene: CanvasScene;
  chapterDiagrams: PositionedDiagram[];
  projectSlug: string;
  tourId: string;
  beatId: string;
  openDiagramIds: ReadonlySet<string>;
  selectedObjectId: string | null;
  focusedContainerId: string | null;
  collapsed: Record<string, boolean>;
  hiddenContainerCount: number;
  relationState: CanvasRelationUiState;
  relationMeta: Record<string, CanvasRelationMeta>;
  followBeat: boolean;
  fullscreenSupported: boolean;
  fullscreenActive: boolean;
  fullscreenHintVisible: boolean;
  onDismissFullscreenHint: () => void;
  actions: CanvasOutlineActions;
}

/**
 * The Phase 17 text equivalent of the board. It lists the same diagrams,
 * objects, containers, and actions in reading order so every spatial action
 * has a keyboard path before Phase 19 ships the full screen-reader model.
 */
export function CanvasOutline({
  scene,
  chapterDiagrams,
  projectSlug,
  tourId,
  beatId,
  openDiagramIds,
  selectedObjectId,
  focusedContainerId,
  collapsed,
  hiddenContainerCount,
  relationState,
  relationMeta,
  followBeat,
  fullscreenSupported,
  fullscreenActive,
  fullscreenHintVisible,
  onDismissFullscreenHint,
  actions,
}: CanvasOutlineProps) {
  const { t } = useLocale();
  const homeDiagram = scene.diagrams.find((diagram) => diagram.home);
  const trayDiagrams = chapterDiagrams.filter(
    (diagram) => diagram.id !== homeDiagram?.id,
  );

  return (
    <aside
      className="canvas-outline"
      aria-label={t('canvas.outline')}
      data-testid="canvas-outline"
    >
      <header className="canvas-outline-header">
        <h2>{t('canvas.outline')}</h2>
        <button
          type="button"
          className="canvas-icon-button"
          aria-label={t('canvas.outlineHide')}
          onClick={actions.close}
        >
          <X size={16} aria-hidden="true" />
        </button>
      </header>

      <ol className="canvas-outline-list">
        <li>
          <h3>{t('canvas.diagrams')}</h3>
          <ol>
            {scene.diagrams.map((diagram) => (
              <li key={diagram.id}>
                <div className="canvas-outline-row">
                  <button
                    type="button"
                    className="canvas-outline-link"
                    onClick={() => actions.focusDiagram(diagram.id)}
                  >
                    {diagram.title}
                  </button>
                  {diagram.home ? (
                    <span className="canvas-outline-badge">
                      {t('canvas.homeDiagram')}
                    </span>
                  ) : (
                    <button
                      type="button"
                      className="canvas-outline-action"
                      onClick={() => actions.removeDiagram(diagram.id)}
                    >
                      {t('canvas.removeDiagram', { title: diagram.title })}
                    </button>
                  )}
                </div>
                {diagram.objects.length === 0 ? null : (
                  <ol>
                    {diagram.objects.map((object) => {
                      const resolved =
                        (object.anchorId !== undefined &&
                          scene.containers.some(
                            (container) => container.anchorId === object.anchorId,
                          )) ||
                        object.symbolId !== undefined;
                      return (
                        <li key={object.id}>
                          {resolved ? (
                            <button
                              type="button"
                              className="canvas-outline-link"
                              aria-current={
                                selectedObjectId === object.id ? 'true' : undefined
                              }
                              onClick={() => actions.focusObject(diagram.id, object.id)}
                            >
                              {t('canvas.focus', { label: object.label })}
                            </button>
                          ) : (
                            <>
                              <button
                                type="button"
                                className="canvas-outline-link"
                                disabled
                                aria-describedby={`canvas-outline-object-${diagram.id}-${object.id}`}
                              >
                                {t('canvas.focus', { label: object.label })}
                              </button>
                              <span
                                id={`canvas-outline-object-${diagram.id}-${object.id}`}
                                className="canvas-outline-note"
                              >
                                {t('canvas.objectUnavailable', {
                                  label: object.label,
                                })}
                              </span>
                            </>
                          )}
                        </li>
                      );
                    })}
                  </ol>
                )}
              </li>
            ))}
          </ol>
          {scene.diagrams.length === 0 ? (
            <p className="canvas-outline-note">{t('canvas.noDiagram')}</p>
          ) : null}
        </li>

        <li>
          <h3>{t('canvas.codeContainers')}</h3>
          {scene.containers.length === 0 ? (
            <p className="canvas-outline-note">{t('canvas.noCode')}</p>
          ) : (
            <ol>
              {scene.containers.map((container) => {
                const isCollapsed = collapsed[container.id] ?? container.collapsed;
                const totalLines = container.excerpt.split('\n').length;
                const meta = relationMeta[container.id];
                const symbolId = container.symbolId;
                const incomingKey = relationOwnerKey(container.id, 'incoming');
                const outgoingKey = relationOwnerKey(container.id, 'outgoing');
                const incomingActive = relationState.activeOwners.has(incomingKey);
                const outgoingActive = relationState.activeOwners.has(outgoingKey);
                return (
                  <li key={container.id}>
                    <div className="canvas-outline-row">
                      <button
                        type="button"
                        className="canvas-outline-link"
                        aria-current={
                          focusedContainerId === container.id ? 'true' : undefined
                        }
                        onClick={() => actions.focusContainer(container.id)}
                      >
                        {t('canvas.focus', { label: container.label })}
                      </button>
                      <span className="canvas-outline-meta mono">
                        {container.path}:{container.startLine}–{container.endLine}
                      </span>
                    </div>
                    <div className="canvas-outline-row">
                      {symbolId === undefined ? (
                        <span className="canvas-outline-note">
                          {t('canvas.noSymbolTarget')}
                        </span>
                      ) : (
                        <button
                          type="button"
                          className="canvas-outline-action"
                          onClick={() => actions.openDefinition(symbolId, container.id)}
                        >
                          {t('canvas.openDefinition', { label: container.label })}
                        </button>
                      )}
                      <button
                        type="button"
                        className="canvas-outline-action"
                        aria-pressed={incomingActive}
                        disabled={symbolId === undefined}
                        onClick={() => actions.toggleRelation(container.id, 'incoming')}
                      >
                        {t('canvas.incoming')}
                      </button>
                      <button
                        type="button"
                        className="canvas-outline-action"
                        aria-pressed={outgoingActive}
                        disabled={symbolId === undefined}
                        onClick={() => actions.toggleRelation(container.id, 'outgoing')}
                      >
                        {t('canvas.outgoing')}
                      </button>
                      {meta?.relation === undefined ? null : (
                        <span className="canvas-outline-meta">
                          {t('canvas.relationBadge', {
                            relation: meta.relation,
                            confidence: t('canvas.relationStatic'),
                          })}
                        </span>
                      )}
                    </div>
                    <div className="canvas-outline-row">
                      {totalLines > COLLAPSED_LINES ? (
                        <button
                          type="button"
                          className="canvas-outline-action"
                          aria-expanded={!isCollapsed}
                          onClick={() => actions.toggleContainer(container.id)}
                        >
                          {isCollapsed
                            ? t('canvas.showAll', { count: totalLines })
                            : t('canvas.collapse')}
                        </button>
                      ) : null}
                      <Link
                        to="/p/$projectId/source/$"
                        params={{ projectId: projectSlug, _splat: container.path }}
                        search={{ anchor: container.anchorId, beat: beatId, tourId }}
                        className="canvas-outline-action"
                      >
                        {t('canvas.openCodePage')}
                      </Link>
                    </div>
                  </li>
                );
              })}
            </ol>
          )}
          {hiddenContainerCount > 0 ? (
            <button
              type="button"
              className="canvas-outline-action"
              onClick={actions.showAllAnchors}
            >
              {t('canvas.showAllAnchors', { count: hiddenContainerCount })}
            </button>
          ) : null}
        </li>

        <li>
          <h3>{t('canvas.trayLabel')}</h3>
          {trayDiagrams.length === 0 ? (
            <p className="canvas-outline-note">{t('canvas.noOtherDiagrams')}</p>
          ) : (
            <ol>
              {trayDiagrams.map((diagram) => {
                const open = openDiagramIds.has(diagram.id);
                return (
                  <li key={diagram.id} className="canvas-outline-row">
                    <button
                      type="button"
                      className="canvas-outline-link"
                      aria-pressed={open}
                      onClick={() =>
                        open
                          ? actions.focusDiagram(diagram.id)
                          : actions.addDiagram(diagram.id)
                      }
                    >
                      {open
                        ? t('canvas.focusDiagram', { title: diagram.title })
                        : t('canvas.addDiagram', { title: diagram.title })}
                    </button>
                    {open ? (
                      <button
                        type="button"
                        className="canvas-outline-action"
                        onClick={() => actions.removeDiagram(diagram.id)}
                      >
                        {t('canvas.removeDiagram', { title: diagram.title })}
                      </button>
                    ) : null}
                  </li>
                );
              })}
            </ol>
          )}
        </li>

        <li>
          <h3>{t('canvas.actions')}</h3>
          <div className="canvas-outline-actions">
            <button
              type="button"
              className="canvas-outline-action"
              onClick={actions.zoomIn}
            >
              {t('canvas.zoomIn')}
            </button>
            <button
              type="button"
              className="canvas-outline-action"
              onClick={actions.zoomOut}
            >
              {t('canvas.zoomOut')}
            </button>
            <button
              type="button"
              className="canvas-outline-action"
              onClick={actions.resetZoom}
            >
              {t('canvas.resetZoom')}
            </button>
            <button
              type="button"
              className="canvas-outline-action"
              onClick={actions.fitAll}
            >
              {t('canvas.fitAll')}
            </button>
            <button
              type="button"
              className="canvas-outline-action"
              onClick={actions.home}
            >
              {t('canvas.home')}
            </button>
            <button
              type="button"
              className="canvas-outline-action"
              onClick={actions.autoArrange}
            >
              {t('canvas.autoArrange')}
            </button>
            <button
              type="button"
              className="canvas-outline-action"
              aria-pressed={followBeat}
              onClick={actions.toggleFollowBeat}
            >
              {t('canvas.followBeat')}
            </button>
            {fullscreenSupported ? (
              <button
                type="button"
                className="canvas-outline-action"
                onClick={actions.toggleFullscreen}
              >
                {fullscreenActive ? t('canvas.exitFullscreen') : t('canvas.fullscreen')}
              </button>
            ) : null}
            {fullscreenActive && fullscreenHintVisible ? (
              <button
                type="button"
                className="canvas-outline-action"
                onClick={onDismissFullscreenHint}
              >
                {t('canvas.dismissHint')}
              </button>
            ) : null}
          </div>
        </li>
      </ol>
    </aside>
  );
}
