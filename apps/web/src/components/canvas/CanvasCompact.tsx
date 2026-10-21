import type { ReactNode, RefObject } from 'react';
import { Link } from '@tanstack/react-router';
import type { CompiledBeat, CompiledChapter, CompiledTour } from '@sothspell/core';
import type { CanvasScene } from '@sothspell/canvas';
import { useLocale } from '../../i18n/locale.js';
import type { CanvasPreferences } from '../../lib/canvas-preferences.js';
import { CanvasDisplayMenu } from './CanvasDisplayMenu.js';
import { COLLAPSED_LINES, lineCountOf, shikiHtmlForCanvas } from './code-html.js';
import type { CanvasOutlineActions } from './CanvasOutline.js';
import {
  relationOwnerKey,
  type CanvasRelationMeta,
  type CanvasRelationStatusCard,
} from './relation-scene.js';

export interface CanvasCompactProps {
  tour: CompiledTour;
  chapter: CompiledChapter;
  beat: CompiledBeat;
  scene: CanvasScene;
  relationMeta: Record<string, CanvasRelationMeta>;
  statuses: CanvasRelationStatusCard[];
  openDiagramIds: ReadonlySet<string>;
  collapsed: Record<string, boolean>;
  selectedObjectId: string | null;
  focusedContainerId: string | null;
  /** Toggle ownership is separate from status cards, which disappear on success. */
  activeOwners: ReadonlySet<string>;
  preferences: CanvasPreferences;
  onPreferenceChange: (patch: Partial<CanvasPreferences>) => void;
  onResetPreferences: () => void;
  onResetLayouts: () => void;
  fullscreenSupported: boolean;
  fullscreenActive: boolean;
  onToggleFullscreen: () => void;
  onShowShortcuts: () => void;
  onRetryRelation: (status: CanvasRelationStatusCard) => void;
  actions: CanvasOutlineActions;
  /** The export menu lives in the compact toolbar instead of the tray. */
  exportAction?: ReactNode;
  /** The compact reading layout is the capture target on a phone. */
  exportRef?: RefObject<HTMLDivElement | null>;
}

/**
 * Below 768 px the board becomes a reading layout, not a shrunken canvas. It
 * is built from the same scene and actions as the spatial board, so no code,
 * relation, or preference action disappears on a phone.
 */
export function CanvasCompact({
  tour,
  chapter,
  beat,
  scene,
  relationMeta,
  statuses,
  openDiagramIds,
  collapsed,
  selectedObjectId,
  focusedContainerId,
  activeOwners,
  preferences,
  onPreferenceChange,
  onResetPreferences,
  onResetLayouts,
  fullscreenSupported,
  fullscreenActive,
  onToggleFullscreen,
  onShowShortcuts,
  onRetryRelation,
  actions,
  exportAction,
  exportRef,
}: CanvasCompactProps) {
  const { t } = useLocale();
  const homeDiagram = scene.diagrams.find((diagram) => diagram.home);
  const trayDiagrams = chapter.diagrams.filter(
    (diagram) => diagram.id !== homeDiagram?.id,
  );
  const containersById = new Map(
    scene.containers.map((container) => [container.id, container] as const),
  );
  const looseStatuses = statuses.filter((status) => status.containerId === undefined);

  return (
    <div
      ref={exportRef}
      className="canvas-compact"
      data-testid="canvas-compact"
      data-motion={preferences.motion}
      data-contrast={preferences.contrast}
      data-palette={preferences.palette}
      data-text-scale={preferences.textScale}
    >
      <header className="canvas-compact-header">
        <div>
          <span className="canvas-card-kicker">{t('canvas.compact')}</span>
          <h2>{beat.title}</h2>
          <p>{chapter.title}</p>
        </div>
        <div
          className="canvas-compact-toolbar"
          role="toolbar"
          aria-label={t('canvas.controls')}
        >
          <button type="button" onClick={actions.home}>
            {t('canvas.home')}
          </button>
          <button type="button" onClick={actions.zoomIn}>
            {t('canvas.zoomIn')}
          </button>
          <button type="button" onClick={actions.zoomOut}>
            {t('canvas.zoomOut')}
          </button>
          <button type="button" onClick={actions.resetZoom}>
            {t('canvas.resetZoom')}
          </button>
          <button type="button" onClick={actions.fitAll}>
            {t('canvas.fitAll')}
          </button>
          <button type="button" onClick={actions.autoArrange}>
            {t('canvas.autoArrange')}
          </button>
          <button
            type="button"
            aria-pressed={preferences.followBeat}
            onClick={actions.toggleFollowBeat}
          >
            {t('canvas.followBeat')}
          </button>
          {fullscreenSupported ? (
            <button type="button" onClick={onToggleFullscreen}>
              {fullscreenActive ? t('canvas.exitFullscreen') : t('canvas.fullscreen')}
            </button>
          ) : null}
          <button type="button" onClick={onShowShortcuts}>
            {t('canvas.shortcuts')}
          </button>
          <CanvasDisplayMenu
            variant="compact"
            preferences={preferences}
            onChange={onPreferenceChange}
            onResetPreferences={onResetPreferences}
            onResetLayouts={onResetLayouts}
          />
          {exportAction}
        </div>
      </header>

      <section className="canvas-compact-section" aria-label={t('canvas.diagrams')}>
        <h3>{t('canvas.diagrams')}</h3>
        {scene.diagrams.length === 0 ? (
          <p className="canvas-outline-note">{t('canvas.noDiagram')}</p>
        ) : null}
        {scene.diagrams.map((diagram) => (
          <article
            key={diagram.id}
            className="canvas-compact-card"
            data-testid="canvas-diagram-card"
            data-diagram-id={diagram.id}
            data-compact="true"
          >
            <header>
              <span className="canvas-card-kicker">
                {diagram.home ? t('canvas.homeDiagram') : t('canvas.satelliteDiagram')}
              </span>
              <h4>{diagram.title}</h4>
            </header>
            {diagram.objects.length === 0 ? (
              <p className="canvas-outline-note">{t('canvas.noCode')}</p>
            ) : (
              <ul className="canvas-compact-objects">
                {diagram.objects.map((object) => {
                  const resolved =
                    (object.anchorId !== undefined &&
                      scene.containers.some(
                        (container) => container.anchorId === object.anchorId,
                      )) ||
                    object.symbolId !== undefined;
                  return (
                    <li key={object.id}>
                      <button
                        type="button"
                        className="canvas-compact-object"
                        data-testid="canvas-object"
                        data-object-id={object.id}
                        disabled={!resolved}
                        aria-current={selectedObjectId === object.id ? 'true' : undefined}
                        title={
                          resolved
                            ? undefined
                            : t('canvas.objectUnavailable', {
                                label: object.label,
                              })
                        }
                        onClick={() =>
                          resolved
                            ? actions.focusObject(diagram.id, object.id)
                            : undefined
                        }
                      >
                        <span>{object.label}</span>
                        <span className="canvas-object-kind">{object.type}</span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
            {diagram.home ? null : (
              <button
                type="button"
                className="canvas-outline-action"
                onClick={() => actions.removeDiagram(diagram.id)}
              >
                {t('canvas.removeDiagram', { title: diagram.title })}
              </button>
            )}
          </article>
        ))}

        <div className="canvas-compact-tray">
          <h4>{t('canvas.trayLabel')}</h4>
          {trayDiagrams.length === 0 ? (
            <p className="canvas-outline-note">{t('canvas.noOtherDiagrams')}</p>
          ) : (
            trayDiagrams.map((diagram) => {
              const open = openDiagramIds.has(diagram.id);
              return (
                <span key={diagram.id} className="canvas-tray-item">
                  <button
                    type="button"
                    className="canvas-tray-button"
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
                </span>
              );
            })
          )}
        </div>
      </section>

      <section className="canvas-compact-section" aria-label={t('canvas.codeContainers')}>
        <h3>{t('canvas.codeContainers')}</h3>
        {scene.containers.length === 0 ? (
          <p className="canvas-outline-note">{t('canvas.noCode')}</p>
        ) : null}
        {scene.containers.map((container) => {
          const symbolId = container.symbolId;
          const isCollapsed = collapsed[container.id] ?? container.collapsed;
          const totalLines = lineCountOf(container.excerpt);
          const meta = relationMeta[container.id];
          const incomingKey = relationOwnerKey(container.id, 'incoming');
          const outgoingKey = relationOwnerKey(container.id, 'outgoing');
          const incomingActive = activeOwners.has(incomingKey);
          const outgoingActive = activeOwners.has(outgoingKey);
          const containerStatuses = statuses.filter(
            (status) => status.containerId === container.id,
          );
          const flowLinks = scene.links.filter(
            (link) =>
              link.kind === 'flow' &&
              (link.fromContainerId === container.id ||
                link.toContainerId === container.id),
          );
          return (
            <article
              key={container.id}
              className="canvas-compact-card"
              data-testid="canvas-code-container"
              data-container-id={container.id}
              data-compact="true"
              data-symbol-id={symbolId}
              data-focused={focusedContainerId === container.id}
            >
              <header>
                <span className="canvas-card-kicker">{t('player.codeEvidence')}</span>
                <h4>
                  {symbolId === undefined ? (
                    container.label
                  ) : (
                    <button
                      type="button"
                      className="canvas-symbol-link"
                      onClick={() => actions.openDefinition(symbolId, container.id)}
                    >
                      {container.label}
                    </button>
                  )}
                </h4>
                <p className="mono">
                  {t('canvas.codeMeta', {
                    path: container.path,
                    start: container.startLine,
                    end: container.endLine,
                    language: container.language,
                  })}
                </p>
              </header>
              <div className="canvas-compact-actions">
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
                  params={{ projectId: tour.project.slug, _splat: container.path }}
                  search={{
                    anchor: container.anchorId,
                    beat: beat.id,
                    tourId: tour.id,
                  }}
                  className="canvas-outline-action"
                >
                  {t('canvas.openCodePage')}
                </Link>
                <button
                  type="button"
                  className="canvas-relation-toggle"
                  aria-pressed={incomingActive}
                  disabled={symbolId === undefined}
                  aria-describedby={
                    symbolId === undefined
                      ? `canvas-compact-relations-${container.id}`
                      : undefined
                  }
                  onClick={() => actions.toggleRelation(container.id, 'incoming')}
                >
                  {t('canvas.incoming')}
                </button>
                <button
                  type="button"
                  className="canvas-relation-toggle"
                  aria-pressed={outgoingActive}
                  disabled={symbolId === undefined}
                  aria-describedby={
                    symbolId === undefined
                      ? `canvas-compact-relations-${container.id}`
                      : undefined
                  }
                  onClick={() => actions.toggleRelation(container.id, 'outgoing')}
                >
                  {t('canvas.outgoing')}
                </button>
                {meta?.relation === undefined ? null : (
                  <span className="canvas-relation-badge">
                    {t('canvas.relationBadge', {
                      relation: meta.relation,
                      confidence: t('canvas.relationStatic'),
                    })}
                  </span>
                )}
              </div>
              {symbolId === undefined ? (
                <p
                  id={`canvas-compact-relations-${container.id}`}
                  className="canvas-outline-note"
                >
                  {t('canvas.noSymbolTarget')}
                </p>
              ) : null}

              <div className="canvas-compact-code">
                <div
                  className="code-excerpt canvas-code-excerpt"
                  dangerouslySetInnerHTML={{
                    __html: shikiHtmlForCanvas(
                      container.html,
                      isCollapsed ? COLLAPSED_LINES : undefined,
                    ),
                  }}
                />
              </div>

              <div
                className="canvas-compact-relations"
                role="group"
                aria-label={t('canvas.compactRelations')}
              >
                <h5>{t('canvas.compactRelations')}</h5>
                {containerStatuses.length > 0 ? (
                  <ul className="canvas-compact-status-list">
                    {containerStatuses.map((status) => (
                      <li key={status.id} data-state={status.state}>
                        <span>{statusMessage(status, t)}</span>
                        {status.state === 'error' ? (
                          <button
                            type="button"
                            className="canvas-text-action"
                            onClick={() => onRetryRelation(status)}
                          >
                            {t('canvas.relationRetry')}
                          </button>
                        ) : null}
                      </li>
                    ))}
                  </ul>
                ) : null}
                {flowLinks.length === 0 ? (
                  <p className="canvas-outline-note">{t('canvas.compactNoRelations')}</p>
                ) : (
                  <ul className="canvas-compact-relation-list">
                    {flowLinks.map((link) => {
                      if (link.kind !== 'flow') {
                        return null;
                      }
                      const otherId =
                        link.fromContainerId === container.id
                          ? link.toContainerId
                          : link.fromContainerId;
                      const other = containersById.get(otherId);
                      const outgoing = link.fromContainerId === container.id;
                      return (
                        <li key={link.id}>
                          <button
                            type="button"
                            className="canvas-outline-link"
                            onClick={() => actions.focusContainer(otherId)}
                          >
                            {t(
                              outgoing
                                ? 'canvas.compactRelationOut'
                                : 'canvas.compactRelationIn',
                              {
                                relation: link.relation,
                                label: other?.label ?? otherId,
                              },
                            )}
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
            </article>
          );
        })}
      </section>

      {looseStatuses.length > 0 ? (
        <section className="canvas-compact-section" aria-label={t('canvas.relations')}>
          <h3>{t('canvas.relations')}</h3>
          <ul className="canvas-compact-status-list">
            {looseStatuses.map((status) => (
              <li key={status.id} data-state={status.state}>
                <span>{statusMessage(status, t)}</span>
                {status.state === 'error' ? (
                  <button
                    type="button"
                    className="canvas-text-action"
                    onClick={() => onRetryRelation(status)}
                  >
                    {t('canvas.relationRetry')}
                  </button>
                ) : null}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {scene.hiddenContainerCount > 0 ? (
        <button
          type="button"
          className="canvas-outline-action"
          onClick={actions.showAllAnchors}
        >
          {t('canvas.showAllAnchors', { count: scene.hiddenContainerCount })}
        </button>
      ) : null}
    </div>
  );
}

function statusMessage(
  status: CanvasRelationStatusCard,
  t: ReturnType<typeof useLocale>['t'],
): string {
  const direction =
    status.direction === 'incoming'
      ? t('canvas.incomingCalls')
      : status.direction === 'outgoing'
        ? t('canvas.outgoingCalls')
        : t('canvas.definition');
  switch (status.state) {
    case 'loading':
      return t('canvas.relationLoading', { direction });
    case 'empty':
      return t('canvas.relationEmptyHint');
    case 'unavailable':
      return t('canvas.relationUnavailable', {
        reason: status.message ?? t('canvas.relationNoReason'),
      });
    case 'error':
      return t('canvas.relationError');
    default:
      return '';
  }
}
