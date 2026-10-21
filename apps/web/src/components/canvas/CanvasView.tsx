import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { KeyboardEvent as ReactKeyboardEvent } from 'react';
import {
  Background,
  ReactFlow,
  ReactFlowProvider,
  useReactFlow,
  type EdgeTypes,
  type NodeTypes,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import {
  buildCanvasScene,
  codeContainerKey,
  diagramCardKey,
  viewportFor,
} from '@sothspell/canvas';
import type { CompiledBeat, CompiledChapter, CompiledTour } from '@sothspell/core';
import { X } from '@phosphor-icons/react';
import {
  CanvasRelationRequestError,
  CanvasRelationUnavailableError,
  fetchCanvasSymbol,
} from '../../lib/canvas-api.js';
import { useLocale } from '../../i18n/locale.js';
import { useFullscreen } from '../../lib/use-fullscreen.js';
import { useMediaQuery } from '../../lib/use-media-query.js';
import { CanvasCodeContainer } from './CanvasCodeContainer.js';
import { CanvasDiagramCard, CanvasObjectCard } from './CanvasDiagramCard.js';
import { CanvasControls } from './CanvasControls.js';
import { CanvasEvidenceEdge } from './CanvasEvidenceEdge.js';
import { CanvasFlowEdge as CanvasFlowEdgeView } from './CanvasFlowEdge.js';
import { CanvasFullscreenHint } from './CanvasFullscreenHint.js';
import { CanvasOutline, type CanvasOutlineActions } from './CanvasOutline.js';
import { CanvasRelationLegend } from './CanvasRelationLegend.js';
import { CanvasRelationStatusCard } from './CanvasRelationStatusCard.js';
import { CanvasShortcuts } from './CanvasShortcuts.js';
import {
  buildCanvasEdges,
  buildCanvasNodes,
  buildCanvasRelationStatusNodes,
  CANVAS_CODE_NODE,
  CANVAS_DIAGRAM_NODE,
  CANVAS_EVIDENCE_EDGE,
  CANVAS_FLOW_EDGE,
  CANVAS_OBJECT_NODE,
  CANVAS_RELATION_STATUS_NODE,
  type CanvasFlowActions,
  type CanvasFlowEdge,
  type CanvasFlowNode,
} from './canvas-flow.js';
import {
  definitionOwnerKey,
  definitionSymbolId,
  layoutRelationCanvas,
  mergeRelationScene,
  parseRelationOwnerKey,
  relationContainerId,
  relationOwnerKey,
  relationStatusKey,
  type CanvasRelationLoad,
  type CanvasRelationStatusCard as RelationStatusCard,
  type CanvasRelationToggleDirection,
  type CanvasRelationUiState,
} from './relation-scene.js';

const nodeTypes = {
  [CANVAS_DIAGRAM_NODE]: CanvasDiagramCard,
  [CANVAS_OBJECT_NODE]: CanvasObjectCard,
  [CANVAS_CODE_NODE]: CanvasCodeContainer,
  [CANVAS_RELATION_STATUS_NODE]: CanvasRelationStatusCard,
} satisfies NodeTypes;

const edgeTypes = {
  [CANVAS_EVIDENCE_EDGE]: CanvasEvidenceEdge,
  [CANVAS_FLOW_EDGE]: CanvasFlowEdgeView,
} satisfies EdgeTypes;

const MIN_ZOOM = 0.25;
const MAX_ZOOM = 1.4;
/** Keep the cards clear of the tray (top) and controls (bottom). */
const FIT_PADDING = {
  top: '80px',
  right: '48px',
  bottom: '72px',
  left: '48px',
} as const;
const VIEWPORT_PADDING = 48;
const OVERLAY_TOP = 56;
const FRAME_DURATION = 280;

export interface CanvasViewProps {
  tour: CompiledTour;
  chapter: CompiledChapter;
  beat: CompiledBeat;
}

/** React Flow state is scoped to one canvas view, never to the player route. */
export function CanvasView(props: CanvasViewProps) {
  return (
    <ReactFlowProvider>
      <CanvasBoard {...props} />
    </ReactFlowProvider>
  );
}

function CanvasBoard({ tour, chapter, beat }: CanvasViewProps) {
  const { t } = useLocale();
  const rootRef = useRef<HTMLDivElement>(null);
  const boardRef = useRef<HTMLDivElement>(null);
  const flow = useReactFlow<CanvasFlowNode, CanvasFlowEdge>();
  const {
    supported: fullscreenSupported,
    active: fullscreenActive,
    toggle: fullscreenToggle,
  } = useFullscreen(rootRef);
  const reducedMotion = useMediaQuery('(prefers-reduced-motion: reduce)');
  const duration = reducedMotion ? 0 : FRAME_DURATION;

  const [size, setSize] = useState({ width: 0, height: 0 });
  const [flowReady, setFlowReady] = useState(false);
  const [openDiagramIds, setOpenDiagramIds] = useState<ReadonlySet<string>>(
    () => new Set(),
  );
  const [selectedObjectId, setSelectedObjectId] = useState<string | null>(null);
  const [focusedContainerId, setFocusedContainerId] = useState<string | null>(null);
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const [outlineOpen, setOutlineOpen] = useState(false);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const [followBeat, setFollowBeat] = useState(true);
  const [showAllAnchors, setShowAllAnchors] = useState(false);
  const [announcement, setAnnouncement] = useState('');
  const [hintVisible, setHintVisible] = useState(false);
  const [fullscreenPulse, setFullscreenPulse] = useState(false);
  const wasFullscreen = useRef(false);
  const shortcutsReturnFocus = useRef<HTMLElement | null>(null);
  const [arranged, setArranged] = useState(false);
  const arrangeTimeout = useRef<number | undefined>(undefined);
  const framed = useRef(false);
  const pendingFocusDiagram = useRef<string | null>(null);
  const pendingFocusSymbol = useRef<string | null>(null);
  const pendingFocusStatus = useRef<string | null>(null);
  const relationGeneration = useRef(new Map<string, number>());
  const [relationState, setRelationState] = useState<CanvasRelationUiState>(() => ({
    activeOwners: new Set(),
    loads: {},
    manualContainerIds: new Set(),
  }));

  const baseScene = useMemo(
    () =>
      buildCanvasScene(tour, beat, {
        openDiagramIds: [...openDiagramIds],
        ...(showAllAnchors ? { containerLimit: beat.anchors.length } : {}),
      }),
    [beat, openDiagramIds, showAllAnchors, tour],
  );
  const relationScene = useMemo(
    () => mergeRelationScene(baseScene, relationState),
    [baseScene, relationState],
  );
  const scene = relationScene.scene;
  const layout = useMemo(
    () => layoutRelationCanvas(baseScene, relationScene, size),
    [baseScene, relationScene, size],
  );

  // A symbol present in two open diagrams is one identity. Either object opens
  // the same definition container, marked so the viewer can see the bridge.
  const sharedSymbolIds = useMemo(() => {
    const diagramsBySymbol = new Map<string, Set<string>>();
    for (const diagram of scene.diagrams) {
      for (const object of diagram.objects) {
        if (object.symbolId === undefined) {
          continue;
        }
        const diagrams = diagramsBySymbol.get(object.symbolId) ?? new Set<string>();
        diagrams.add(diagram.id);
        diagramsBySymbol.set(object.symbolId, diagrams);
      }
    }
    return new Set(
      [...diagramsBySymbol.entries()]
        .filter(([, diagrams]) => diagrams.size > 1)
        .map(([symbolId]) => symbolId),
    );
  }, [scene.diagrams]);

  useEffect(() => {
    const board = boardRef.current;
    if (!board) {
      return;
    }
    const measure = () => {
      const rect = board.getBoundingClientRect();
      const width = Math.round(rect.width);
      const height = Math.round(rect.height);
      setSize((current) =>
        current.width === width && current.height === height
          ? current
          : { width, height },
      );
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(board);
    return () => observer.disconnect();
  }, []);

  // Frame the board once, after the first real measurement. Later window
  // resizes keep the viewer's pan and zoom instead of stealing the viewport.
  useEffect(() => {
    if (!flowReady || framed.current || size.width < 200 || size.height < 200) {
      return;
    }
    framed.current = true;
    const raf = requestAnimationFrame(() => {
      const nextViewport = viewportFor(
        layout.bounds,
        { width: size.width, height: Math.max(1, size.height - OVERLAY_TOP) },
        VIEWPORT_PADDING,
      );
      void flow.setViewport({
        x: nextViewport.x,
        y: nextViewport.y + OVERLAY_TOP,
        zoom: nextViewport.zoom,
      });
    });
    return () => cancelAnimationFrame(raf);
  }, [flow, flowReady, layout.bounds, size]);

  useEffect(
    () => () => {
      window.clearTimeout(arrangeTimeout.current);
    },
    [],
  );

  const announce = useCallback((message: string) => {
    setAnnouncement(message);
  }, []);

  const bumpRelationGeneration = useCallback((ownerKey: string) => {
    const current = relationGeneration.current.get(ownerKey) ?? 0;
    relationGeneration.current.set(ownerKey, current + 1);
    return current + 1;
  }, []);

  const fitAll = useCallback(() => {
    void flow.fitView({
      padding: FIT_PADDING,
      duration,
      maxZoom: 1.2,
    });
    announce(t('canvas.announce.fit'));
  }, [announce, duration, flow, t]);

  const zoomIn = useCallback(() => {
    const next = Math.min(MAX_ZOOM, flow.getZoom() * 1.2);
    void flow.zoomTo(next, { duration });
    announce(t('canvas.announce.zoom', { percent: Math.round(next * 100) }));
  }, [announce, duration, flow, t]);

  const zoomOut = useCallback(() => {
    const next = Math.max(MIN_ZOOM, flow.getZoom() / 1.2);
    void flow.zoomTo(next, { duration });
    announce(t('canvas.announce.zoom', { percent: Math.round(next * 100) }));
  }, [announce, duration, flow, t]);

  const resetZoom = useCallback(() => {
    void flow.zoomTo(1, { duration });
    announce(t('canvas.announce.zoom', { percent: 100 }));
  }, [announce, duration, flow, t]);

  const focusDiagram = useCallback(
    (diagramId: string) => {
      const diagram = scene.diagrams.find((candidate) => candidate.id === diagramId);
      const item = layout.items[diagramCardKey(diagramId)];
      if (!diagram || !item) {
        return;
      }
      setSelectedObjectId(null);
      setFocusedContainerId(null);
      void flow.setCenter(item.x + item.width / 2, item.y + item.height / 2, {
        zoom: flow.getZoom(),
        duration,
      });
      announce(t('canvas.announce.focused', { title: diagram.title }));
    },
    [announce, duration, flow, layout.items, scene.diagrams, t],
  );

  const home = useCallback(() => {
    const homeId = scene.homeDiagramId;
    if (homeId === null) {
      return;
    }
    focusDiagram(homeId);
    announce(t('canvas.announce.home'));
  }, [announce, focusDiagram, scene.homeDiagramId, t]);

  const autoArrange = useCallback(() => {
    setArranged(true);
    window.clearTimeout(arrangeTimeout.current);
    arrangeTimeout.current = window.setTimeout(() => setArranged(false), 700);
    void flow.fitView({ padding: FIT_PADDING, duration, maxZoom: 1.2 });
    announce(t('canvas.announce.arranged'));
  }, [announce, duration, flow, t]);

  const addDiagram = useCallback(
    (diagramId: string) => {
      setOpenDiagramIds((current) => {
        if (current.has(diagramId)) {
          return current;
        }
        const next = new Set(current);
        next.add(diagramId);
        return next;
      });
      pendingFocusDiagram.current = diagramId;
      const diagram = chapter.diagrams.find((candidate) => candidate.id === diagramId);
      if (diagram) {
        announce(t('canvas.announce.added', { title: diagram.title }));
      }
    },
    [announce, chapter.diagrams, t],
  );

  const removeDiagram = useCallback(
    (diagramId: string) => {
      setOpenDiagramIds((current) => {
        if (!current.has(diagramId)) {
          return current;
        }
        const next = new Set(current);
        next.delete(diagramId);
        return next;
      });
      const diagram = chapter.diagrams.find((candidate) => candidate.id === diagramId);
      if (diagram) {
        announce(t('canvas.announce.removed', { title: diagram.title }));
      }
    },
    [announce, chapter.diagrams, t],
  );

  const focusContainer = useCallback(
    (containerId: string) => {
      const container = scene.containers.find(
        (candidate) => candidate.id === containerId,
      );
      const item = layout.items[codeContainerKey(containerId)];
      if (!container || !item) {
        return;
      }
      setFocusedContainerId(container.id);
      void flow.setCenter(item.x + item.width / 2, item.y + item.height / 2, {
        zoom: flow.getZoom(),
        duration,
      });
      announce(t('canvas.announce.object', { label: container.label }));
    },
    [announce, duration, flow, layout.items, scene.containers, t],
  );

  const directionLabel = useCallback(
    (direction: CanvasRelationToggleDirection) =>
      direction === 'incoming' ? t('canvas.incomingCalls') : t('canvas.outgoingCalls'),
    [t],
  );

  const requestDefinition = useCallback(
    (symbolId: string) => {
      const ownerKey = definitionOwnerKey(symbolId);
      const generation = bumpRelationGeneration(ownerKey);
      pendingFocusStatus.current = relationStatusKey(`relation-status:${ownerKey}`);
      const label = symbolId.split('#')[1] ?? symbolId;
      setRelationState((current) => ({
        ...current,
        loads: {
          ...current.loads,
          [ownerKey]: { status: 'loading' },
        },
      }));
      announce(t('canvas.announce.definitionLoading', { label }));

      void fetchCanvasSymbol({
        tourId: tour.id,
        symbolId,
        direction: 'definition',
      })
        .then((response) => {
          if (relationGeneration.current.get(ownerKey) !== generation) {
            return;
          }
          pendingFocusStatus.current = null;
          const containerId = relationContainerId(response.symbol.id);
          setRelationState((current) => {
            const manual = new Set(current.manualContainerIds);
            manual.add(containerId);
            return {
              ...current,
              manualContainerIds: manual,
              loads: {
                ...current.loads,
                [ownerKey]: { status: 'ready', response },
              },
            };
          });
          pendingFocusSymbol.current = response.symbol.id;
          announce(
            t('canvas.announce.definitionOpened', {
              label: response.symbol.qualifiedName,
            }),
          );
        })
        .catch((error: unknown) => {
          if (relationGeneration.current.get(ownerKey) !== generation) {
            return;
          }
          const unavailable = error instanceof CanvasRelationUnavailableError;
          const message =
            error instanceof CanvasRelationUnavailableError ||
            error instanceof CanvasRelationRequestError
              ? error.message
              : t('canvas.relationError');
          setRelationState((current) => ({
            ...current,
            loads: {
              ...current.loads,
              [ownerKey]: {
                status: unavailable ? 'unavailable' : 'error',
                message,
              },
            },
          }));
          announce(
            t('canvas.announce.definitionFailed', {
              label: symbolId.split('#')[1] ?? symbolId,
            }),
          );
        });
    },
    [announce, bumpRelationGeneration, t, tour.id],
  );

  const requestRelations = useCallback(
    (
      containerId: string,
      direction: CanvasRelationToggleDirection,
      symbolId: string,
      label: string,
    ) => {
      const ownerKey = relationOwnerKey(containerId, direction);
      const generation = bumpRelationGeneration(ownerKey);
      const directionWord = directionLabel(direction);
      pendingFocusStatus.current = relationStatusKey(`relation-status:${ownerKey}`);
      setRelationState((current) => ({
        ...current,
        loads: {
          ...current.loads,
          [ownerKey]: { status: 'loading' },
        },
      }));
      announce(
        t('canvas.announce.relationsLoading', {
          direction: directionWord,
          label,
        }),
      );

      void fetchCanvasSymbol({
        tourId: tour.id,
        symbolId,
        direction,
        limit: 8,
      })
        .then((response) => {
          if (relationGeneration.current.get(ownerKey) !== generation) {
            return;
          }
          pendingFocusStatus.current = null;
          setRelationState((current) => ({
            ...current,
            loads: {
              ...current.loads,
              [ownerKey]: { status: 'ready', response },
            },
          }));
          if (response.relations.length === 0) {
            announce(
              t('canvas.announce.relationsEmpty', {
                direction: directionWord,
                label,
              }),
            );
            return;
          }
          pendingFocusSymbol.current = response.relations[0]?.symbol.id ?? null;
          announce(
            t('canvas.announce.relationsOpened', {
              count: response.relations.length,
              direction: directionWord,
              label,
            }),
          );
        })
        .catch((error: unknown) => {
          if (relationGeneration.current.get(ownerKey) !== generation) {
            return;
          }
          const unavailable = error instanceof CanvasRelationUnavailableError;
          const message =
            error instanceof CanvasRelationUnavailableError ||
            error instanceof CanvasRelationRequestError
              ? error.message
              : t('canvas.relationError');
          setRelationState((current) => ({
            ...current,
            loads: {
              ...current.loads,
              [ownerKey]: {
                status: unavailable ? 'unavailable' : 'error',
                message,
              },
            },
          }));
          announce(
            t('canvas.announce.relationsFailed', {
              direction: directionWord,
              label,
            }),
          );
        });
    },
    [announce, bumpRelationGeneration, directionLabel, t, tour.id],
  );

  const openDefinition = useCallback(
    (symbolId: string) => {
      const existing = scene.containers.find(
        (container) => container.symbolId === symbolId,
      );
      if (existing) {
        const isBase = baseScene.containers.some(
          (container) => container.id === existing.id,
        );
        if (!isBase) {
          setRelationState((current) => {
            if (current.manualContainerIds.has(existing.id)) {
              return current;
            }
            const manual = new Set(current.manualContainerIds);
            manual.add(existing.id);
            return { ...current, manualContainerIds: manual };
          });
        }
        focusContainer(existing.id);
        announce(t('canvas.announce.definitionOpened', { label: existing.label }));
        return;
      }

      const ownerKey = definitionOwnerKey(symbolId);
      const load: CanvasRelationLoad | undefined = relationState.loads[ownerKey];
      if (load?.status === 'ready') {
        const containerId = relationContainerId(load.response.symbol.id);
        setRelationState((current) => {
          if (current.manualContainerIds.has(containerId)) {
            return current;
          }
          const manual = new Set(current.manualContainerIds);
          manual.add(containerId);
          return { ...current, manualContainerIds: manual };
        });
        pendingFocusSymbol.current = load.response.symbol.id;
        return;
      }
      if (load?.status === 'loading') {
        return;
      }
      requestDefinition(symbolId);
    },
    [
      announce,
      baseScene.containers,
      focusContainer,
      relationState.loads,
      requestDefinition,
      scene.containers,
      t,
    ],
  );

  const toggleRelation = useCallback(
    (containerId: string, direction: CanvasRelationToggleDirection) => {
      const container = scene.containers.find(
        (candidate) => candidate.id === containerId,
      );
      const symbolId = container?.symbolId;
      if (!container || symbolId === undefined) {
        return;
      }
      const ownerKey = relationOwnerKey(containerId, direction);
      const label = container.label;
      const directionWord = directionLabel(direction);

      if (relationState.activeOwners.has(ownerKey)) {
        // Keep an in-flight response: it is cached for the next time this
        // toggle opens, and it must not strand the owned cards on "loading".
        setRelationState((current) => {
          const active = new Set(current.activeOwners);
          active.delete(ownerKey);
          return { ...current, activeOwners: active };
        });
        announce(
          t('canvas.announce.relationsClosed', {
            direction: directionWord,
            label,
          }),
        );
        return;
      }

      setRelationState((current) => {
        const active = new Set(current.activeOwners);
        active.add(ownerKey);
        return { ...current, activeOwners: active };
      });

      const load = relationState.loads[ownerKey];
      if (load?.status === 'ready') {
        if (load.response.relations.length === 0) {
          announce(
            t('canvas.announce.relationsEmpty', {
              direction: directionWord,
              label,
            }),
          );
          return;
        }
        pendingFocusSymbol.current = load.response.relations[0]?.symbol.id ?? null;
        announce(
          t('canvas.announce.relationsOpened', {
            count: load.response.relations.length,
            direction: directionWord,
            label,
          }),
        );
        return;
      }
      if (load?.status === 'loading') {
        return;
      }
      requestRelations(containerId, direction, symbolId, label);
    },
    [
      announce,
      directionLabel,
      relationState.activeOwners,
      relationState.loads,
      requestRelations,
      scene.containers,
      t,
    ],
  );

  const retryRelation = useCallback(
    (status: RelationStatusCard) => {
      const definitionId = definitionSymbolId(status.ownerKey);
      if (definitionId !== null) {
        requestDefinition(definitionId);
        return;
      }
      const owner = parseRelationOwnerKey(status.ownerKey);
      if (!owner || status.symbolId === undefined) {
        return;
      }
      const container = scene.containers.find(
        (candidate) => candidate.id === owner.containerId,
      );
      requestRelations(
        owner.containerId,
        owner.direction,
        status.symbolId,
        container?.label ?? status.symbolId,
      );
    },
    [requestDefinition, requestRelations, scene.containers],
  );

  const toggleContainer = useCallback(
    (containerId: string) => {
      const container = scene.containers.find(
        (candidate) => candidate.id === containerId,
      );
      if (!container) {
        return;
      }
      setCollapsed((current) => ({
        ...current,
        [containerId]: !(current[containerId] ?? container.collapsed),
      }));
    },
    [scene.containers],
  );

  const activateObject = useCallback(
    (diagramId: string, objectId: string) => {
      const diagram = scene.diagrams.find((candidate) => candidate.id === diagramId);
      const object = diagram?.objects.find((candidate) => candidate.id === objectId);
      if (!object) {
        return;
      }

      if (object.anchorId !== undefined) {
        const container = scene.containers.find(
          (candidate) => candidate.anchorId === object.anchorId,
        );
        if (container) {
          setSelectedObjectId(object.id);
          setFocusedContainerId(container.id);
          const item = layout.items[codeContainerKey(container.id)];
          if (item) {
            void flow.setCenter(item.x + item.width / 2, item.y + item.height / 2, {
              zoom: flow.getZoom(),
              duration,
            });
          }
          announce(t('canvas.announce.object', { label: container.label }));
          return;
        }
      }

      if (object.symbolId !== undefined) {
        setSelectedObjectId(object.id);
        openDefinition(object.symbolId);
        return;
      }

      announce(t('canvas.objectUnavailable', { label: object.label }));
    },
    [announce, duration, flow, layout.items, openDefinition, scene, t],
  );

  const toggleOutline = useCallback(() => {
    const next = !outlineOpen;
    setOutlineOpen(next);
    announce(next ? t('canvas.announce.outlineOn') : t('canvas.announce.outlineOff'));
  }, [announce, outlineOpen, t]);

  const toggleFollowBeat = useCallback(() => {
    const next = !followBeat;
    setFollowBeat(next);
    announce(next ? t('canvas.announce.followOn') : t('canvas.announce.followOff'));
  }, [announce, followBeat, t]);

  const toggleFullscreen = useCallback(() => {
    if (!fullscreenSupported) {
      return;
    }
    fullscreenToggle();
  }, [fullscreenSupported, fullscreenToggle]);

  const showAll = useCallback(() => {
    setShowAllAnchors(true);
    announce(t('canvas.announce.showAll'));
  }, [announce, t]);

  const closeOutline = useCallback(() => {
    setOutlineOpen(false);
    announce(t('canvas.announce.outlineOff'));
  }, [announce, t]);

  const openShortcuts = useCallback(() => {
    shortcutsReturnFocus.current = document.activeElement as HTMLElement | null;
    setShortcutsOpen(true);
    announce(t('canvas.announce.shortcutsOn'));
  }, [announce, t]);

  const closeShortcuts = useCallback(() => {
    setShortcutsOpen(false);
    announce(t('canvas.announce.shortcutsOff'));
    shortcutsReturnFocus.current?.focus();
    shortcutsReturnFocus.current = null;
  }, [announce, t]);

  const onKeyDown = useCallback(
    (event: ReactKeyboardEvent<HTMLElement>) => {
      if (event.defaultPrevented) {
        return;
      }
      if (event.metaKey || event.ctrlKey || event.altKey) {
        return;
      }
      const target = event.target as HTMLElement | null;
      if (
        target?.isContentEditable ||
        target?.tagName === 'INPUT' ||
        target?.tagName === 'TEXTAREA' ||
        target?.tagName === 'SELECT'
      ) {
        return;
      }

      const handled = () => {
        event.preventDefault();
        event.stopPropagation();
      };

      switch (event.key) {
        case 'f':
        case 'F':
          handled();
          toggleFullscreen();
          break;
        case '+':
        case '=':
          handled();
          zoomIn();
          break;
        case '-':
        case '_':
          handled();
          zoomOut();
          break;
        case '0':
          handled();
          fitAll();
          break;
        case '1':
          handled();
          resetZoom();
          break;
        case 'H':
          if (event.shiftKey) {
            handled();
            home();
          }
          break;
        case 'A':
          if (event.shiftKey) {
            handled();
            autoArrange();
          }
          break;
        case 'o':
        case 'O':
          handled();
          toggleOutline();
          break;
        case 'b':
        case 'B':
          handled();
          toggleFollowBeat();
          break;
        case '?':
          handled();
          openShortcuts();
          break;
        case 'Escape':
          if (shortcutsOpen) {
            handled();
            closeShortcuts();
          } else if (fullscreenActive) {
            handled();
            fullscreenToggle();
          } else if (outlineOpen) {
            handled();
            closeOutline();
          }
          break;
        default:
          break;
      }
    },
    [
      autoArrange,
      closeOutline,
      closeShortcuts,
      fitAll,
      fullscreenActive,
      fullscreenToggle,
      home,
      openShortcuts,
      outlineOpen,
      resetZoom,
      shortcutsOpen,
      toggleFollowBeat,
      toggleFullscreen,
      toggleOutline,
      zoomIn,
      zoomOut,
    ],
  );

  // A beat change resets the local focus but never the player. Follow beat is
  // the only behaviour that moves the viewport, and it can be turned off.
  const previousBeatId = useRef(beat.id);
  useEffect(() => {
    setSelectedObjectId(null);
    setFocusedContainerId(null);
    setShowAllAnchors(false);
    if (previousBeatId.current === beat.id) {
      return;
    }
    previousBeatId.current = beat.id;
    pendingFocusSymbol.current = null;
    pendingFocusStatus.current = null;
    relationGeneration.current.clear();
    setRelationState({
      activeOwners: new Set(),
      loads: {},
      manualContainerIds: new Set(),
    });
    if (!followBeat) {
      return;
    }
    const raf = requestAnimationFrame(() => {
      void flow.fitView({
        padding: FIT_PADDING,
        duration,
        maxZoom: 1.1,
      });
    });
    return () => cancelAnimationFrame(raf);
  }, [beat.id, duration, flow, followBeat]);

  useEffect(() => {
    const diagramId = pendingFocusDiagram.current;
    if (diagramId === null) {
      return;
    }
    const item = layout.items[diagramCardKey(diagramId)];
    if (!item) {
      return;
    }
    pendingFocusDiagram.current = null;
    const raf = requestAnimationFrame(() => {
      void flow.setCenter(item.x + item.width / 2, item.y + item.height / 2, {
        zoom: flow.getZoom(),
        duration,
      });
    });
    return () => cancelAnimationFrame(raf);
  }, [duration, flow, layout.items]);

  // A newly opened relation or definition sits in a new column, so bring it
  // into view once its layout item exists without refitting the whole board.
  useEffect(() => {
    const symbolId = pendingFocusSymbol.current;
    if (symbolId === null) {
      return;
    }
    const container = scene.containers.find(
      (candidate) => candidate.symbolId === symbolId,
    );
    const item = container ? layout.items[codeContainerKey(container.id)] : undefined;
    if (!container || !item) {
      return;
    }
    pendingFocusSymbol.current = null;
    const raf = requestAnimationFrame(() => {
      void flow.setCenter(item.x + item.width / 2, item.y + item.height / 2, {
        zoom: flow.getZoom(),
        duration,
      });
    });
    return () => cancelAnimationFrame(raf);
  }, [duration, flow, layout.items, scene.containers]);

  // Loading, empty, and failure cards sit in the relation columns too. Bring
  // the card that just answered into view so the state is readable and its
  // retry action is reachable.
  useEffect(() => {
    const statusId = pendingFocusStatus.current;
    if (statusId === null) {
      return;
    }
    const item = layout.items[statusId];
    if (!item) {
      return;
    }
    pendingFocusStatus.current = null;
    const raf = requestAnimationFrame(() => {
      void flow.setCenter(item.x + item.width / 2, item.y + item.height / 2, {
        zoom: flow.getZoom(),
        duration,
      });
    });
    return () => cancelAnimationFrame(raf);
  }, [duration, flow, layout.items]);

  useEffect(() => {
    setHintVisible(fullscreenActive);
    if (!fullscreenActive) {
      setFullscreenPulse(false);
      if (wasFullscreen.current) {
        announce(t('canvas.announce.fullscreenOff'));
      }
      wasFullscreen.current = false;
      return;
    }
    wasFullscreen.current = true;
    setFullscreenPulse(true);
    announce(t('canvas.announce.fullscreenOn'));
    const timeout = window.setTimeout(() => setFullscreenPulse(false), 2000);
    return () => window.clearTimeout(timeout);
  }, [announce, fullscreenActive, t]);

  useEffect(() => {
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as HTMLElement | null;
      if (target?.closest('button, a, input, textarea, select')) {
        return;
      }
      rootRef.current?.focus();
    };
    const root = rootRef.current;
    root?.addEventListener('pointerdown', onPointerDown);
    return () => root?.removeEventListener('pointerdown', onPointerDown);
  }, []);

  const flowActions = useMemo<CanvasFlowActions>(
    () => ({
      activateObject,
      focusContainer,
      toggleContainer,
      toggleRelation,
      openDefinition,
      retryRelation,
    }),
    [
      activateObject,
      focusContainer,
      openDefinition,
      retryRelation,
      toggleContainer,
      toggleRelation,
    ],
  );
  const nodes = useMemo(
    () => [
      ...buildCanvasNodes(
        scene,
        layout,
        {
          selectedObjectId,
          focusedContainerId,
          collapsed,
          projectSlug: tour.project.slug,
          beatId: beat.id,
          sharedSymbolIds,
          relationState,
          relationMeta: relationScene.relationMeta,
        },
        flowActions,
      ),
      ...buildCanvasRelationStatusNodes(relationScene.statuses, layout, flowActions),
    ],
    [
      beat.id,
      collapsed,
      flowActions,
      focusedContainerId,
      layout,
      relationScene.relationMeta,
      relationScene.statuses,
      relationState,
      scene,
      selectedObjectId,
      sharedSymbolIds,
      tour.project.slug,
    ],
  );
  const edges = useMemo(() => buildCanvasEdges(scene), [scene]);

  const outlineActions = useMemo<CanvasOutlineActions>(
    () => ({
      focusDiagram,
      addDiagram,
      removeDiagram,
      focusObject: activateObject,
      focusContainer,
      toggleContainer,
      showAllAnchors: showAll,
      zoomIn,
      zoomOut,
      resetZoom,
      fitAll,
      home,
      autoArrange,
      toggleFollowBeat,
      toggleFullscreen,
      toggleRelation,
      openDefinition,
      close: closeOutline,
    }),
    [
      activateObject,
      addDiagram,
      autoArrange,
      closeOutline,
      fitAll,
      focusContainer,
      focusDiagram,
      home,
      openDefinition,
      removeDiagram,
      resetZoom,
      showAll,
      toggleContainer,
      toggleFollowBeat,
      toggleFullscreen,
      toggleRelation,
      zoomIn,
      zoomOut,
    ],
  );

  const trayDiagrams = chapter.diagrams.filter(
    (diagram) => diagram.id !== scene.homeDiagramId,
  );
  const showDiagram = scene.diagrams.length > 0;

  return (
    <section
      ref={rootRef}
      className={`canvas-root${arranged ? ' canvas-root--arranged' : ''}`}
      aria-label={t('canvas.canvasView')}
      data-testid="canvas-view"
      tabIndex={0}
      onKeyDown={onKeyDown}
    >
      <p
        className="visually-hidden"
        role="status"
        aria-live="polite"
        aria-label={t('canvas.liveRegion')}
      >
        {announcement}
      </p>

      <div ref={boardRef} className="canvas-board">
        {size.width > 0 && size.height > 0 ? (
          <ReactFlow<CanvasFlowNode, CanvasFlowEdge>
            nodes={nodes}
            edges={edges}
            nodeTypes={nodeTypes}
            edgeTypes={edgeTypes}
            minZoom={MIN_ZOOM}
            maxZoom={MAX_ZOOM}
            nodesDraggable={false}
            nodesConnectable={false}
            nodesFocusable={false}
            edgesFocusable={false}
            elementsSelectable={false}
            disableKeyboardA11y
            panOnDrag
            zoomOnScroll
            zoomOnPinch
            onPaneClick={() => {
              setSelectedObjectId(null);
              setFocusedContainerId(null);
            }}
            onInit={() => setFlowReady(true)}
          >
            <Background gap={18} size={1.2} color="var(--line-strong)" />
          </ReactFlow>
        ) : null}
      </div>

      <div className="canvas-tray" role="group" aria-label={t('canvas.trayLabel')}>
        <span className="canvas-tray-label">{t('canvas.tray')}</span>
        {trayDiagrams.length === 0 ? (
          <span className="canvas-tray-empty">{t('canvas.noOtherDiagrams')}</span>
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
                    open ? focusDiagram(diagram.id) : addDiagram(diagram.id)
                  }
                >
                  {open
                    ? t('canvas.focusDiagram', { title: diagram.title })
                    : t('canvas.addDiagram', { title: diagram.title })}
                </button>
                {open ? (
                  <button
                    type="button"
                    className="canvas-icon-button canvas-tray-remove"
                    aria-label={t('canvas.removeDiagram', {
                      title: diagram.title,
                    })}
                    onClick={() => removeDiagram(diagram.id)}
                  >
                    <X size={14} aria-hidden="true" />
                  </button>
                ) : null}
              </span>
            );
          })
        )}
        {scene.hiddenContainerCount > 0 ? (
          <button
            type="button"
            className="canvas-tray-button canvas-tray-more"
            onClick={showAll}
          >
            {t('canvas.showAllAnchors', { count: scene.hiddenContainerCount })}
          </button>
        ) : null}
      </div>

      {showDiagram ? null : <p className="canvas-empty-note">{t('canvas.noDiagram')}</p>}
      {showDiagram && scene.containers.length === 0 ? (
        <p className="canvas-empty-note">{t('canvas.noCode')}</p>
      ) : null}

      <CanvasRelationLegend />

      {outlineOpen ? (
        <CanvasOutline
          scene={scene}
          chapterDiagrams={chapter.diagrams}
          projectSlug={tour.project.slug}
          beatId={beat.id}
          openDiagramIds={openDiagramIds}
          selectedObjectId={selectedObjectId}
          focusedContainerId={focusedContainerId}
          collapsed={collapsed}
          hiddenContainerCount={scene.hiddenContainerCount}
          relationState={relationState}
          relationMeta={relationScene.relationMeta}
          followBeat={followBeat}
          fullscreenSupported={fullscreenSupported}
          fullscreenActive={fullscreenActive}
          fullscreenHintVisible={fullscreenActive && hintVisible}
          onDismissFullscreenHint={() => setHintVisible(false)}
          actions={outlineActions}
        />
      ) : null}

      <CanvasControls
        outlineOpen={outlineOpen}
        followBeat={followBeat}
        fullscreenSupported={fullscreenSupported}
        fullscreenActive={fullscreenActive}
        fullscreenPulse={fullscreenPulse}
        onZoomIn={zoomIn}
        onZoomOut={zoomOut}
        onResetZoom={resetZoom}
        onFitAll={fitAll}
        onHome={home}
        onAutoArrange={autoArrange}
        onToggleOutline={toggleOutline}
        onToggleFollowBeat={toggleFollowBeat}
        onToggleFullscreen={toggleFullscreen}
        onShowShortcuts={openShortcuts}
      />

      {shortcutsOpen ? <CanvasShortcuts onClose={closeShortcuts} /> : null}

      {fullscreenActive && hintVisible ? (
        <CanvasFullscreenHint onDismiss={() => setHintVisible(false)} />
      ) : null}
    </section>
  );
}
