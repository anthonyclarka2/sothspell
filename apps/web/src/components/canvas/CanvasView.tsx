import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type {
  FocusEvent as ReactFocusEvent,
  KeyboardEvent as ReactKeyboardEvent,
} from 'react';
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
  buildExportModel,
  codeContainerKey,
  createCanvasSelection,
  diagramCardKey,
  homeCanvasSelection,
  reduceCanvasSelection,
  viewportFor,
  type CanvasPrintModel,
  type CanvasSelectionState,
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
import { captureCanvasImage, waitForCanvasPaint } from '../../lib/canvas-export.js';
import { CanvasCodeContainer } from './CanvasCodeContainer.js';
import { CanvasCompact } from './CanvasCompact.js';
import { CanvasDiagramCard, CanvasObjectCard } from './CanvasDiagramCard.js';
import { CanvasControls } from './CanvasControls.js';
import { CanvasDisplayMenu } from './CanvasDisplayMenu.js';
import { CanvasEvidenceEdge } from './CanvasEvidenceEdge.js';
import { CanvasExportMenu } from './CanvasExportMenu.js';
import { CanvasFlowEdge as CanvasFlowEdgeView } from './CanvasFlowEdge.js';
import { CanvasFullscreenHint } from './CanvasFullscreenHint.js';
import { CanvasNotice, type CanvasNoticeKind } from './CanvasNotice.js';
import { CanvasOutline, type CanvasOutlineActions } from './CanvasOutline.js';
import { CanvasPrintView } from './CanvasPrintView.js';
import { CanvasRelationLegend } from './CanvasRelationLegend.js';
import { CanvasRelationStatusCard } from './CanvasRelationStatusCard.js';
import { CanvasShortcuts } from './CanvasShortcuts.js';
import {
  containerCanvasFocus,
  diagramCanvasFocus,
  diagramItemCanvasFocus,
  directionForKey,
  escapeCanvasFocus,
  itemCanvasFocus,
  itemDeltaForKey,
  moveCanvasItemFocus,
  rootCanvasFocus,
  type CanvasFocusState,
} from '../../lib/canvas-focus.js';
import {
  canvasSceneKey,
  clearCanvasViewports,
  createCanvasPreferenceStore,
  readCanvasViewports,
  writeCanvasViewport,
  type CanvasPreferences,
} from '../../lib/canvas-preferences.js';
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
/** Auto-zoom/auto-arrange use the shorter Phase 19 transform. */
const AUTO_FRAME_DURATION = 220;

function containerSelector(containerId: string): string {
  return `[data-canvas-container="true"][data-container-id="${containerId}"]`;
}

function diagramSelector(diagramId: string): string {
  return `[data-canvas-diagram="true"][data-diagram-id="${diagramId}"]`;
}

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
  const rootRef = useRef<HTMLElement>(null);
  const boardRef = useRef<HTMLDivElement>(null);
  const flow = useReactFlow<CanvasFlowNode, CanvasFlowEdge>();
  const {
    supported: fullscreenSupported,
    active: fullscreenActive,
    toggle: fullscreenToggle,
  } = useFullscreen(rootRef);
  const prefersReducedMotion = useMediaQuery('(prefers-reduced-motion: reduce)');
  const compact = useMediaQuery('(max-width: 767px)');
  const preferenceStore = useMemo(() => createCanvasPreferenceStore(), []);
  const [preferences, setPreferences] = useState<CanvasPreferences>(() =>
    preferenceStore.get(),
  );
  useEffect(
    () => preferenceStore.subscribe((next) => setPreferences(next)),
    [preferenceStore],
  );
  const reducedMotion =
    preferences.motion === 'reduce' ||
    (preferences.motion === 'system' && prefersReducedMotion);
  const duration = reducedMotion ? 0 : FRAME_DURATION;
  const autoDuration = reducedMotion ? 0 : AUTO_FRAME_DURATION;

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
  const pendingFocusStatus = useRef<string | null>(null);
  const pendingReveal = useRef<{
    sourceContainerId: string | null;
    targetContainerId: string;
  } | null>(null);
  const undoSnapshot = useRef<{
    viewport: { x: number; y: number; zoom: number };
    selection: CanvasSelectionState;
    focus: CanvasFocusState;
  } | null>(null);
  const [canUndo, setCanUndo] = useState(false);
  const [notice, setNotice] = useState<{
    kind: CanvasNoticeKind;
    phase: 'action' | 'disabled';
  } | null>(null);
  const [focusState, setFocusState] = useState<CanvasFocusState>(() => rootCanvasFocus());
  const focusStateRef = useRef(focusState);
  // Keyboard transitions must update the ref synchronously: a key can arrive
  // before React has re-rendered the effect that mirrors state into the ref.
  const updateFocus = useCallback((next: CanvasFocusState) => {
    focusStateRef.current = next;
    setFocusState(next);
  }, []);
  useEffect(() => {
    focusStateRef.current = focusState;
  }, [focusState]);
  const selectionRef = useRef<CanvasSelectionState>({
    selection: { level: 'canvas', diagramId: null },
  });
  const suppressLayoutSave = useRef(false);
  const relationGeneration = useRef(new Map<string, number>());
  const [relationState, setRelationState] = useState<CanvasRelationUiState>(() => ({
    activeOwners: new Set(),
    loads: {},
    manualContainerIds: new Set(),
  }));
  const [exportError, setExportError] = useState<string | null>(null);
  const [printView, setPrintView] = useState<CanvasPrintModel | null>(null);

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
  const relationContainerIds = useMemo(() => {
    const baseIds = new Set(baseScene.containers.map((container) => container.id));
    return scene.containers
      .filter((container) => !baseIds.has(container.id))
      .map((container) => container.id);
  }, [baseScene.containers, scene.containers]);
  const layout = useMemo(
    () =>
      layoutRelationCanvas(baseScene, relationScene, size, preferences.textScale / 100),
    [baseScene, preferences.textScale, relationScene, size],
  );
  const sceneKey = useMemo(
    () =>
      canvasSceneKey({
        tourId: tour.id,
        revision: tour.project.revision.commit,
        textScale: preferences.textScale,
        chapterId: chapter.id,
        beatId: beat.id,
        diagramIds: scene.diagrams.map((diagram) => diagram.id),
        containerIds: scene.containers.map((container) => container.id),
      }),
    [
      beat.id,
      chapter.id,
      preferences.textScale,
      scene.containers,
      scene.diagrams,
      tour.id,
      tour.project.revision.commit,
    ],
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

  // Frame the board once, after the first real measurement. A saved viewport
  // for this exact scene wins; later resizes keep the viewer's pan and zoom.
  useEffect(() => {
    if (!flowReady || framed.current || size.width < 200 || size.height < 200) {
      return;
    }
    framed.current = true;
    const raf = requestAnimationFrame(() => {
      const saved = readCanvasViewports()[sceneKey];
      if (saved) {
        void flow.setViewport(saved, { duration: 0 });
        return;
      }
      const homeItem =
        preferences.textScale > 100 && scene.homeDiagramId !== null
          ? layout.items[diagramCardKey(scene.homeDiagramId)]
          : undefined;
      if (homeItem) {
        // Scaling both type and cards makes a full-board fit shrink the larger
        // text back down. At 125% and above, land on the home diagram at a
        // readable zoom instead; Fit all remains available.
        const homeViewport = viewportFor(
          homeItem,
          { width: size.width, height: Math.max(1, size.height - OVERLAY_TOP) },
          VIEWPORT_PADDING,
        );
        void flow.setViewport({
          x: homeViewport.x,
          y: homeViewport.y + OVERLAY_TOP,
          zoom: 1,
        });
        return;
      }
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
  }, [
    flow,
    flowReady,
    layout.bounds,
    layout.items,
    preferences.textScale,
    scene.homeDiagramId,
    sceneKey,
    size,
  ]);

  useEffect(() => {
    const current = selectionRef.current.selection;
    if (
      current.diagramId === null ||
      !scene.diagrams.some((diagram) => diagram.id === current.diagramId)
    ) {
      selectionRef.current = createCanvasSelection(scene);
    }
  }, [scene]);

  // A new text scale changes both type and card geometry; re-frame instead of
  // leaving the viewer looking at a corner of a board that doubled in size.
  const previousTextScale = useRef(preferences.textScale);
  useEffect(() => {
    if (previousTextScale.current === preferences.textScale) {
      return;
    }
    previousTextScale.current = preferences.textScale;
    const raf = requestAnimationFrame(() => {
      const saved = readCanvasViewports()[sceneKey];
      if (saved) {
        void flow.setViewport(saved, { duration: 0 });
        return;
      }
      const homeItem =
        scene.homeDiagramId === null
          ? undefined
          : layout.items[diagramCardKey(scene.homeDiagramId)];
      if (preferences.textScale > 100 && homeItem) {
        const homeViewport = viewportFor(
          homeItem,
          { width: size.width, height: Math.max(1, size.height - OVERLAY_TOP) },
          VIEWPORT_PADDING,
        );
        void flow.setViewport({
          x: homeViewport.x,
          y: homeViewport.y + OVERLAY_TOP,
          zoom: 1,
        });
        return;
      }
      void flow.fitView({
        padding: FIT_PADDING,
        duration: 0,
        maxZoom: 1.2,
      });
    });
    return () => cancelAnimationFrame(raf);
  }, [flow, layout.items, preferences.textScale, scene.homeDiagramId, sceneKey, size]);

  useEffect(
    () => () => {
      window.clearTimeout(arrangeTimeout.current);
    },
    [],
  );

  const announce = useCallback((message: string) => {
    setAnnouncement(message);
  }, []);

  const updatePreferences = useCallback(
    (patch: Partial<CanvasPreferences>) => {
      preferenceStore.update(patch);
      const key = Object.keys(patch)[0] as keyof CanvasPreferences | undefined;
      if (key === undefined) {
        return;
      }
      const preference =
        key === 'autoZoom'
          ? t('canvas.autoZoom')
          : key === 'autoArrange'
            ? t('canvas.autoArrange')
            : key === 'followBeat'
              ? t('canvas.followBeat')
              : key === 'motion'
                ? t('canvas.motion')
                : key === 'contrast'
                  ? t('canvas.contrast')
                  : key === 'palette'
                    ? t('canvas.palette')
                    : t('canvas.textScale');
      const raw = patch[key];
      const value =
        typeof raw === 'boolean'
          ? raw
            ? t('canvas.valueOn')
            : t('canvas.valueOff')
          : key === 'motion'
            ? raw === 'reduce'
              ? t('canvas.motionReduce')
              : raw === 'full'
                ? t('canvas.motionFull')
                : t('canvas.motionSystem')
            : key === 'contrast'
              ? raw === 'more'
                ? t('canvas.contrastMore')
                : t('canvas.contrastSystem')
              : key === 'palette'
                ? raw === 'colorblind'
                  ? t('canvas.paletteColorblind')
                  : t('canvas.paletteDefault')
                : key === 'textScale'
                  ? `${String(raw)}%`
                  : '';
      announce(t('canvas.announce.preference', { preference, value }));
    },
    [announce, preferenceStore, t],
  );

  const focusElement = useCallback((selector: string) => {
    const raf = requestAnimationFrame(() => {
      const element = rootRef.current?.querySelector<HTMLElement>(selector);
      element?.focus({ preventScroll: true });
    });
    return () => cancelAnimationFrame(raf);
  }, []);

  const itemElements = useCallback((containerId: string): HTMLElement[] => {
    const container = rootRef.current?.querySelector<HTMLElement>(
      containerSelector(containerId),
    );
    if (!container) {
      return [];
    }
    return Array.from(
      container.querySelectorAll<HTMLElement>('[data-canvas-item]:not(:disabled)'),
    );
  }, []);

  const diagramItemElements = useCallback((diagramId: string): HTMLElement[] => {
    const root = rootRef.current;
    if (!root) {
      return [];
    }
    // React Flow renders object child nodes beside the diagram card, not inside
    // its article, so the diagram id is carried on each object button.
    return Array.from(
      root.querySelectorAll<HTMLElement>(
        `[data-canvas-item="object"][data-diagram-id="${diagramId}"]:not(:disabled)`,
      ),
    );
  }, []);

  const focusContainerElement = useCallback(
    (containerId: string) => {
      focusElement(containerSelector(containerId));
    },
    [focusElement],
  );

  const focusDiagramElement = useCallback(
    (diagramId: string) => {
      focusElement(diagramSelector(diagramId));
    },
    [focusElement],
  );

  const showNotice = useCallback(
    (kind: CanvasNoticeKind) => {
      const current = preferenceStore.get();
      const seen = kind === 'autoZoom' ? current.seenAutoZoom : current.seenAutoArrange;
      if (seen) {
        return;
      }
      setNotice({ kind, phase: 'action' });
      preferenceStore.update(
        kind === 'autoZoom' ? { seenAutoZoom: true } : { seenAutoArrange: true },
      );
      announce(
        kind === 'autoZoom'
          ? t('canvas.announce.autoZoom')
          : t('canvas.announce.autoArrange'),
      );
    },
    [announce, preferenceStore, t],
  );

  const captureUndo = useCallback(() => {
    undoSnapshot.current = {
      viewport: flow.getViewport(),
      selection: {
        selection: { ...selectionRef.current.selection },
      },
      focus: { ...focusStateRef.current },
    };
    setCanUndo(true);
  }, [flow]);

  const dismissNotice = useCallback(() => {
    setNotice(null);
  }, []);

  const disableAuto = useCallback(
    (kind: CanvasNoticeKind) => {
      const key = kind === 'autoZoom' ? 'autoZoom' : 'autoArrange';
      preferenceStore.update({
        [key]: false,
        ...(kind === 'autoZoom' ? { seenAutoZoom: true } : { seenAutoArrange: true }),
      });
      setNotice({ kind, phase: 'disabled' });
      announce(
        kind === 'autoZoom'
          ? t('canvas.announce.autoZoomOff')
          : t('canvas.announce.autoArrangeOff'),
      );
      // The action that had focus is removed by the confirmation; return focus
      // to the board instead of dropping it on document.body.
      requestAnimationFrame(() => rootRef.current?.focus({ preventScroll: true }));
    },
    [announce, preferenceStore, t],
  );

  const undoLastAction = useCallback(() => {
    const snapshot = undoSnapshot.current;
    if (!snapshot) {
      return;
    }
    undoSnapshot.current = null;
    setCanUndo(false);
    void flow.setViewport(snapshot.viewport, { duration: autoDuration });
    selectionRef.current = snapshot.selection;
    setSelectedObjectId(snapshot.selection.selection.objectId ?? null);
    setFocusedContainerId(snapshot.selection.selection.containerId ?? null);
    updateFocus(snapshot.focus);
    setNotice(null);
    announce(t('canvas.announce.undo'));
    requestAnimationFrame(() => {
      if (snapshot.focus.level === 'container' && snapshot.focus.containerId) {
        focusContainerElement(snapshot.focus.containerId);
      } else if (snapshot.focus.level === 'diagram' && snapshot.focus.diagramId) {
        focusDiagramElement(snapshot.focus.diagramId);
      } else {
        rootRef.current?.focus({ preventScroll: true });
      }
    });
  }, [announce, autoDuration, flow, focusContainerElement, focusDiagramElement, t]);

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

  const runImageExport = useCallback(
    async (format: 'png' | 'jpg', scope: 'view' | 'board'): Promise<boolean> => {
      const root = rootRef.current;
      // The compact canvas is already a normal-flow reading layout; the board
      // capture target only exists on the spatial renderer.
      const board =
        boardRef.current ?? root?.querySelector<HTMLElement>('.canvas-compact') ?? null;
      if (!root || !board) {
        setExportError(t('canvas.export.failed'));
        return false;
      }

      const isBoardElement = board === boardRef.current;
      const previousViewport = flow.getViewport();
      const model = buildExportModel(scene, {
        scope,
        format,
        relationContainerIds,
        ...(isBoardElement
          ? {
              viewport: {
                ...previousViewport,
                width: board.clientWidth,
                height: board.clientHeight,
              },
            }
          : {}),
      });
      const wasSuppressed = suppressLayoutSave.current;
      setExportError(null);

      try {
        await captureCanvasImage({
          root,
          board,
          format,
          filename: model.fileName,
          backgroundColor: getComputedStyle(root).backgroundColor,
          prepare:
            scope === 'board' && isBoardElement
              ? async () => {
                  // One fitted viewport is the whole-board export; a pan must
                  // not leave cards out of the capture or persist the fit.
                  suppressLayoutSave.current = true;
                  await flow.fitView({
                    padding: FIT_PADDING,
                    duration: 0,
                    maxZoom: 1.2,
                  });
                }
              : undefined,
          restore:
            scope === 'board' && isBoardElement
              ? async () => {
                  await flow.setViewport(previousViewport, { duration: 0 });
                }
              : undefined,
        });
        announce(t('canvas.announce.exported', { filename: model.fileName }));
        return true;
      } catch {
        setExportError(t('canvas.export.failed'));
        announce(t('canvas.announce.exportFailed'));
        return false;
      } finally {
        suppressLayoutSave.current = wasSuppressed;
      }
    },
    [announce, flow, relationContainerIds, scene, t],
  );

  const startPrint = useCallback(async (): Promise<boolean> => {
    setExportError(null);
    // Print is the complete beat handout: open every anchor the beat cites,
    // not only the six the board opened first. Relation expansions still merge
    // so a relation the viewer opened prints with its bounded excerpt.
    const printBase = buildCanvasScene(tour, beat, {
      openDiagramIds: [...openDiagramIds],
      containerLimit: beat.anchors.length,
    });
    const printScene = mergeRelationScene(printBase, relationState);
    const printBaseIds = new Set(printBase.containers.map((container) => container.id));
    const printRelations = printScene.scene.containers
      .filter((container) => !printBaseIds.has(container.id))
      .map((container) => container.id);
    const model = buildExportModel(printScene.scene, {
      scope: 'board',
      format: 'pdf',
      relationContainerIds: printRelations,
      exportedAt: new Date().toISOString(),
    });
    if (model.print === null) {
      setExportError(t('canvas.export.failed'));
      return false;
    }
    setPrintView(model.print);
    announce(t('canvas.announce.printReady'));
    return true;
  }, [announce, beat, openDiagramIds, relationState, t, tour]);

  // The print sheet has to be in layout before the print dialog snapshots it.
  // afterprint is the only reliable signal that the dialog closed, so the
  // sheet stays mounted until then and then focus returns to the export button.
  useEffect(() => {
    if (printView === null) {
      return;
    }
    let cancelled = false;
    const restore = () => {
      setPrintView(null);
      requestAnimationFrame(() => {
        rootRef.current
          ?.querySelector<HTMLElement>('[data-testid="canvas-export-button"]')
          ?.focus();
      });
    };
    window.addEventListener('afterprint', restore);
    const frame = requestAnimationFrame(() => {
      void (async () => {
        await waitForCanvasPaint();
        if (cancelled) {
          return;
        }
        try {
          window.print();
        } catch {
          if (!cancelled) {
            setPrintView(null);
            setExportError(t('canvas.export.failed'));
            announce(t('canvas.announce.exportFailed'));
          }
        }
      })();
    });
    return () => {
      cancelled = true;
      cancelAnimationFrame(frame);
      window.removeEventListener('afterprint', restore);
    };
  }, [announce, printView, t]);

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
      selectionRef.current = { selection: { level: 'canvas', diagramId } };
      updateFocus(diagramCanvasFocus(diagramId));
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
    captureUndo();
    setArranged(true);
    window.clearTimeout(arrangeTimeout.current);
    arrangeTimeout.current = window.setTimeout(() => setArranged(false), 700);
    void flow.fitView({ padding: FIT_PADDING, duration, maxZoom: 1.2 });
    announce(t('canvas.announce.arranged'));
    showNotice('autoArrange');
  }, [announce, captureUndo, duration, flow, showNotice, t]);

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
      setSelectedObjectId(null);
      selectionRef.current = {
        selection: {
          level: 'container',
          diagramId: selectionRef.current.selection.diagramId,
          containerId: container.id,
        },
      };
      updateFocus(
        containerCanvasFocus(container.id, selectionRef.current.selection.diagramId),
      );
      void flow.setCenter(item.x + item.width / 2, item.y + item.height / 2, {
        zoom: flow.getZoom(),
        duration,
      });
      announce(t('canvas.announce.object', { label: container.label }));
    },
    [announce, duration, flow, layout.items, scene.containers, t],
  );

  const enterContainer = useCallback(
    (containerId: string) => {
      const container = scene.containers.find(
        (candidate) => candidate.id === containerId,
      );
      if (!container) {
        return;
      }
      const items = itemElements(containerId);
      if (items.length === 0) {
        announce(t('canvas.announce.noItems', { label: container.label }));
        focusContainerElement(containerId);
        return;
      }
      updateFocus(
        itemCanvasFocus(
          containerId,
          selectionRef.current.selection.diagramId,
          0,
          items.length,
        ),
      );
      items[0]?.focus({ preventScroll: true });
      announce(t('canvas.announce.entered', { label: container.label }));
    },
    [announce, focusContainerElement, itemElements, scene.containers, t],
  );

  const enterDiagramItems = useCallback(
    (diagramId: string) => {
      const items = diagramItemElements(diagramId);
      if (items.length === 0) {
        focusDiagramElement(diagramId);
        return;
      }
      updateFocus(diagramItemCanvasFocus(diagramId, 0, items.length));
      items[0]?.focus({ preventScroll: true });
    },
    [diagramItemElements, focusDiagramElement],
  );

  const focusContainerForKeyboard = useCallback(
    (containerId: string) => {
      focusContainer(containerId);
      focusContainerElement(containerId);
    },
    [focusContainer, focusContainerElement],
  );

  const focusDiagramForKeyboard = useCallback(
    (diagramId: string) => {
      focusDiagram(diagramId);
      focusDiagramElement(diagramId);
    },
    [focusDiagram, focusDiagramElement],
  );

  const directionLabel = useCallback(
    (direction: CanvasRelationToggleDirection) =>
      direction === 'incoming' ? t('canvas.incomingCalls') : t('canvas.outgoingCalls'),
    [t],
  );

  const requestDefinition = useCallback(
    (symbolId: string, sourceContainerId?: string) => {
      captureUndo();
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
          pendingReveal.current = {
            sourceContainerId: sourceContainerId ?? null,
            targetContainerId: containerId,
          };
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
    [announce, bumpRelationGeneration, captureUndo, t, tour.id],
  );

  const requestRelations = useCallback(
    (
      containerId: string,
      direction: CanvasRelationToggleDirection,
      symbolId: string,
      label: string,
    ) => {
      captureUndo();
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
          const first = response.relations[0];
          pendingReveal.current =
            first === undefined
              ? null
              : {
                  sourceContainerId: containerId,
                  targetContainerId: relationContainerId(first.symbol.id),
                };
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
    [announce, bumpRelationGeneration, captureUndo, directionLabel, t, tour.id],
  );

  const openDefinition = useCallback(
    (symbolId: string, sourceContainerId?: string) => {
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
        captureUndo();
        const containerId = relationContainerId(load.response.symbol.id);
        setRelationState((current) => {
          if (current.manualContainerIds.has(containerId)) {
            return current;
          }
          const manual = new Set(current.manualContainerIds);
          manual.add(containerId);
          return { ...current, manualContainerIds: manual };
        });
        pendingReveal.current = {
          sourceContainerId: sourceContainerId ?? null,
          targetContainerId: containerId,
        };
        return;
      }
      if (load?.status === 'loading') {
        return;
      }
      requestDefinition(symbolId, sourceContainerId);
    },
    [
      announce,
      baseScene.containers,
      captureUndo,
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
        captureUndo();
        if (load.response.relations.length === 0) {
          announce(
            t('canvas.announce.relationsEmpty', {
              direction: directionWord,
              label,
            }),
          );
          return;
        }
        pendingReveal.current = {
          sourceContainerId: containerId,
          targetContainerId: relationContainerId(load.response.relations[0]!.symbol.id),
        };
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
    updatePreferences({ followBeat: !preferences.followBeat });
  }, [preferences.followBeat, updatePreferences]);

  const resetLayouts = useCallback(() => {
    suppressLayoutSave.current = true;
    clearCanvasViewports();
    undoSnapshot.current = null;
    setCanUndo(false);
    setNotice(null);
    window.setTimeout(() => {
      suppressLayoutSave.current = false;
    }, 500);
    fitAll();
    announce(t('canvas.announce.layoutsReset'));
  }, [announce, fitAll, t]);

  const resetPreferences = useCallback(() => {
    preferenceStore.reset();
    setNotice(null);
    announce(t('canvas.announce.preferencesReset'));
  }, [announce, preferenceStore, t]);

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

      // The shortcut sheet, outline, and display menu own their own keys. The
      // board must not move behind an open overlay.
      if (target?.closest('.canvas-shortcuts')) {
        if (event.key === 'Escape' && shortcutsOpen) {
          handled();
          closeShortcuts();
        }
        return;
      }
      if (target?.closest('.canvas-display')) {
        return;
      }
      if (target?.closest('.canvas-export')) {
        return;
      }
      if (target?.closest('.canvas-outline')) {
        if (event.key === 'Escape' && outlineOpen) {
          handled();
          closeOutline();
        }
        return;
      }

      const focus = focusStateRef.current;

      // Space activates a focused action; on the board it falls through to the
      // player so the player's global play/pause keeps working.
      if (event.key === ' ') {
        if (focus.level === 'item') {
          if (target?.tagName === 'A') {
            handled();
            target.click();
            return;
          }
          // Native buttons activate on Space. Stop the event so the player's
          // window listener cannot toggle playback as well.
          event.stopPropagation();
        }
        return;
      }

      // T is the player's theater toggle and passes through on the board.
      if (event.key === 't' || event.key === 'T') {
        return;
      }

      if (event.key === 'Escape') {
        if (fullscreenActive) {
          handled();
          fullscreenToggle();
          return;
        }
        if (outlineOpen) {
          handled();
          closeOutline();
          return;
        }
        if (focus.level === 'item') {
          handled();
          const next = escapeCanvasFocus(focus, scene.homeDiagramId);
          updateFocus(next);
          if (next.level === 'container' && next.containerId !== undefined) {
            setSelectedObjectId(null);
            setFocusedContainerId(next.containerId);
            focusContainerElement(next.containerId);
          } else if (next.level === 'diagram' && next.diagramId !== null) {
            setSelectedObjectId(null);
            setFocusedContainerId(null);
            selectionRef.current = {
              selection: { level: 'canvas', diagramId: next.diagramId },
            };
            focusDiagramElement(next.diagramId);
          }
          return;
        }
        if (focus.level === 'container') {
          handled();
          const homeId = scene.homeDiagramId;
          setSelectedObjectId(null);
          setFocusedContainerId(null);
          selectionRef.current = { selection: homeCanvasSelection(scene) };
          updateFocus(diagramCanvasFocus(homeId));
          if (homeId !== null) {
            focusDiagramElement(homeId);
          }
          return;
        }
        return;
      }

      // Tab is deliberately not handled: it leaves the single board tab stop.
      if (event.key === 'Tab') {
        return;
      }

      const direction = directionForKey(event.key, event.shiftKey);
      if (direction !== null) {
        handled();
        if (focus.level === 'item') {
          const items =
            focus.containerId !== undefined
              ? itemElements(focus.containerId)
              : focus.diagramId !== null
                ? diagramItemElements(focus.diagramId)
                : [];
          if (items.length === 0) {
            return;
          }
          const next = moveCanvasItemFocus(
            focus,
            itemDeltaForKey(event.key) ?? 0,
            items.length,
          );
          updateFocus(next);
          if (next.itemIndex !== undefined) {
            items[next.itemIndex]?.focus({ preventScroll: true });
          }
          return;
        }

        const next = reduceCanvasSelection(scene, selectionRef.current, {
          type: 'move',
          direction,
        });
        if (next === selectionRef.current) {
          return;
        }
        selectionRef.current = next;
        if (
          next.selection.level === 'container' &&
          next.selection.containerId !== undefined
        ) {
          focusContainerForKeyboard(next.selection.containerId);
        } else if (next.selection.diagramId !== null) {
          focusDiagramForKeyboard(next.selection.diagramId);
        }
        return;
      }

      if (event.key === 'Enter') {
        if (focus.level === 'item') {
          // Enter on a native button or link activates it natively.
          event.stopPropagation();
          return;
        }
        handled();
        if (focus.level === 'container' && focus.containerId !== undefined) {
          enterContainer(focus.containerId);
          return;
        }
        const selected = selectionRef.current.selection;
        if (selected.containerId !== undefined) {
          enterContainer(selected.containerId);
          return;
        }
        if (selected.objectId !== undefined && selected.diagramId !== null) {
          activateObject(selected.diagramId, selected.objectId);
          return;
        }
        if (selected.diagramId !== null) {
          enterDiagramItems(selected.diagramId);
        }
        return;
      }

      if (event.shiftKey && (event.key === 'H' || event.key === 'h')) {
        handled();
        home();
        if (scene.homeDiagramId !== null) {
          focusDiagramForKeyboard(scene.homeDiagramId);
        }
        return;
      }
      if (event.shiftKey && (event.key === 'A' || event.key === 'a')) {
        handled();
        autoArrange();
        return;
      }

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
        default:
          break;
      }
    },
    [
      activateObject,
      autoArrange,
      closeOutline,
      closeShortcuts,
      diagramItemElements,
      enterContainer,
      enterDiagramItems,
      fitAll,
      focusContainerElement,
      focusContainerForKeyboard,
      focusDiagramElement,
      focusDiagramForKeyboard,
      fullscreenActive,
      fullscreenToggle,
      home,
      itemElements,
      openShortcuts,
      outlineOpen,
      resetZoom,
      scene,
      shortcutsOpen,
      toggleFollowBeat,
      toggleFullscreen,
      toggleOutline,
      zoomIn,
      zoomOut,
    ],
  );

  const onFocusCapture = useCallback(
    (event: ReactFocusEvent<HTMLElement>) => {
      const target = event.target as HTMLElement | null;
      if (!target) {
        return;
      }
      const item = target.closest<HTMLElement>('[data-canvas-item]');
      if (item) {
        const container = item.closest<HTMLElement>('[data-canvas-container]');
        const diagram = item.closest<HTMLElement>('[data-canvas-diagram]');
        const containerId = container?.dataset.containerId;
        const diagramId =
          item.dataset.diagramId ??
          diagram?.dataset.diagramId ??
          selectionRef.current.selection.diagramId;
        const items =
          containerId !== undefined
            ? itemElements(containerId)
            : diagramId !== null && diagramId !== undefined
              ? diagramItemElements(diagramId)
              : [];
        const index = items.indexOf(item);
        if (containerId !== undefined && index >= 0) {
          selectionRef.current = {
            selection: {
              level: 'container',
              diagramId: diagramId ?? null,
              containerId,
            },
          };
          updateFocus(
            itemCanvasFocus(containerId, diagramId ?? null, index, items.length),
          );
        } else if (diagramId !== null && diagramId !== undefined && index >= 0) {
          updateFocus(diagramItemCanvasFocus(diagramId, index, items.length));
        }
        return;
      }
      const container = target.closest<HTMLElement>('[data-canvas-container]');
      if (container?.dataset.containerId) {
        selectionRef.current = {
          selection: {
            level: 'container',
            diagramId: selectionRef.current.selection.diagramId,
            containerId: container.dataset.containerId,
          },
        };
        updateFocus(
          containerCanvasFocus(
            container.dataset.containerId,
            selectionRef.current.selection.diagramId,
          ),
        );
        return;
      }
      const diagram = target.closest<HTMLElement>('[data-canvas-diagram]');
      if (diagram?.dataset.diagramId) {
        updateFocus(diagramCanvasFocus(diagram.dataset.diagramId));
      }
    },
    [diagramItemElements, itemElements],
  );
  const previousBeatId = useRef(beat.id);
  useEffect(() => {
    setSelectedObjectId(null);
    setFocusedContainerId(null);
    setShowAllAnchors(false);
    if (previousBeatId.current === beat.id) {
      return;
    }
    previousBeatId.current = beat.id;
    pendingReveal.current = null;
    pendingFocusStatus.current = null;
    setNotice(null);
    updateFocus(rootCanvasFocus());
    selectionRef.current = {
      selection: { level: 'canvas', diagramId: scene.homeDiagramId },
    };
    relationGeneration.current.clear();
    setRelationState({
      activeOwners: new Set(),
      loads: {},
      manualContainerIds: new Set(),
    });
    if (!preferences.followBeat) {
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
  }, [beat.id, duration, flow, preferences.followBeat, scene.homeDiagramId]);

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

  // A newly opened relation or definition sits in a new column. Auto-arrange
  // frames the deterministic layout; auto-zoom frames the source and the new
  // container together with 48 px padding. Both are undoable and both pause
  // for reduced motion.
  useEffect(() => {
    const pending = pendingReveal.current;
    if (!pending) {
      return;
    }
    const targetItem = layout.items[codeContainerKey(pending.targetContainerId)];
    if (!targetItem) {
      return;
    }
    pendingReveal.current = null;
    if (compact) {
      // The compact canvas is a reading layout; a viewport command has no
      // meaning there, and a "board arranged" notice would be misleading.
      return;
    }
    const current = preferenceStore.get();
    if (!current.autoArrange && !current.autoZoom) {
      return;
    }
    const sourceItem =
      pending.sourceContainerId === null
        ? undefined
        : layout.items[codeContainerKey(pending.sourceContainerId)];
    const raf = requestAnimationFrame(() => {
      if (current.autoArrange) {
        setArranged(true);
        window.clearTimeout(arrangeTimeout.current);
        arrangeTimeout.current = window.setTimeout(() => setArranged(false), 700);
        void flow.fitView({
          padding: FIT_PADDING,
          duration: autoDuration,
          maxZoom: 1.2,
        });
        showNotice('autoArrange');
        return;
      }
      const bounds =
        sourceItem === undefined
          ? targetItem
          : {
              x: Math.min(sourceItem.x, targetItem.x),
              y: Math.min(sourceItem.y, targetItem.y),
              width:
                Math.max(
                  sourceItem.x + sourceItem.width,
                  targetItem.x + targetItem.width,
                ) - Math.min(sourceItem.x, targetItem.x),
              height:
                Math.max(
                  sourceItem.y + sourceItem.height,
                  targetItem.y + targetItem.height,
                ) - Math.min(sourceItem.y, targetItem.y),
            };
      const nextViewport = viewportFor(
        bounds,
        { width: size.width, height: Math.max(1, size.height - OVERLAY_TOP) },
        VIEWPORT_PADDING,
      );
      void flow.setViewport(
        {
          x: nextViewport.x,
          y: nextViewport.y + OVERLAY_TOP,
          zoom: nextViewport.zoom,
        },
        { duration: autoDuration },
      );
      showNotice('autoZoom');
    });
    return () => cancelAnimationFrame(raf);
  }, [autoDuration, compact, flow, layout.items, preferenceStore, showNotice, size]);

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
          tourId: tour.id,
          beatId: beat.id,
          sharedSymbolIds,
          relationState,
          relationMeta: relationScene.relationMeta,
          textScale: preferences.textScale,
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
      preferences.textScale,
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

  const exportMenu = (variant: 'tray' | 'compact') => (
    <CanvasExportMenu
      variant={variant}
      cardCount={scene.diagrams.length + scene.containers.length}
      error={exportError}
      onClearError={() => setExportError(null)}
      onImage={runImageExport}
      onPrint={startPrint}
    />
  );

  if (compact) {
    return (
      <section
        ref={rootRef}
        className="canvas-root canvas-root--compact"
        aria-label={t('canvas.boardLabel', { title: beat.title })}
        aria-roledescription={t('canvas.boardRole')}
        data-testid="canvas-view"
        data-motion={preferences.motion}
        data-contrast={preferences.contrast}
        data-palette={preferences.palette}
        data-text-scale={preferences.textScale}
        data-canvas-printing={printView === null ? undefined : 'true'}
      >
        <p
          className="visually-hidden"
          role="status"
          aria-live="polite"
          aria-label={t('canvas.liveRegion')}
        >
          {announcement}
        </p>
        <CanvasCompact
          tour={tour}
          chapter={chapter}
          beat={beat}
          scene={scene}
          relationMeta={relationScene.relationMeta}
          statuses={relationScene.statuses}
          openDiagramIds={openDiagramIds}
          collapsed={collapsed}
          selectedObjectId={selectedObjectId}
          focusedContainerId={focusedContainerId}
          activeOwners={relationState.activeOwners}
          preferences={preferences}
          onPreferenceChange={updatePreferences}
          onResetPreferences={resetPreferences}
          onResetLayouts={resetLayouts}
          fullscreenSupported={fullscreenSupported}
          fullscreenActive={fullscreenActive}
          onToggleFullscreen={toggleFullscreen}
          onShowShortcuts={openShortcuts}
          onRetryRelation={retryRelation}
          actions={outlineActions}
          exportAction={exportMenu('compact')}
          exportRef={boardRef}
        />
        {notice ? (
          <CanvasNotice
            kind={notice.kind}
            phase={notice.phase}
            onUndo={undoLastAction}
            onDisable={() => disableAuto(notice.kind)}
            onDismiss={dismissNotice}
          />
        ) : null}
        {shortcutsOpen ? (
          <CanvasShortcuts
            onClose={closeShortcuts}
            canUndo={canUndo}
            onUndo={undoLastAction}
            autoZoom={preferences.autoZoom}
            autoArrange={preferences.autoArrange}
            onDisableAutoZoom={() => disableAuto('autoZoom')}
            onDisableAutoArrange={() => disableAuto('autoArrange')}
          />
        ) : null}
        {printView === null ? null : <CanvasPrintView model={printView} />}
      </section>
    );
  }

  return (
    <section
      ref={rootRef}
      className={`canvas-root${arranged ? ' canvas-root--arranged' : ''}`}
      role="region"
      aria-roledescription={t('canvas.boardRole')}
      aria-label={t('canvas.boardLabel', { title: beat.title })}
      aria-describedby="canvas-board-instructions"
      data-testid="canvas-view"
      data-motion={preferences.motion}
      data-contrast={preferences.contrast}
      data-palette={preferences.palette}
      data-text-scale={preferences.textScale}
      data-canvas-printing={printView === null ? undefined : 'true'}
      tabIndex={0}
      onKeyDown={onKeyDown}
      onFocusCapture={onFocusCapture}
    >
      <p className="visually-hidden" id="canvas-board-instructions">
        {t('canvas.boardInstructions')}
      </p>
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
              updateFocus(rootCanvasFocus());
              selectionRef.current = { selection: homeCanvasSelection(scene) };
            }}
            onMoveEnd={(_event, viewport) => {
              if (!suppressLayoutSave.current) {
                writeCanvasViewport(sceneKey, viewport);
              }
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
        <CanvasDisplayMenu
          preferences={preferences}
          onChange={updatePreferences}
          onResetPreferences={resetPreferences}
          onResetLayouts={resetLayouts}
        />
        {exportMenu('tray')}
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
          tourId={tour.id}
          beatId={beat.id}
          openDiagramIds={openDiagramIds}
          selectedObjectId={selectedObjectId}
          focusedContainerId={focusedContainerId}
          collapsed={collapsed}
          hiddenContainerCount={scene.hiddenContainerCount}
          relationState={relationState}
          relationMeta={relationScene.relationMeta}
          followBeat={preferences.followBeat}
          fullscreenSupported={fullscreenSupported}
          fullscreenActive={fullscreenActive}
          fullscreenHintVisible={fullscreenActive && hintVisible}
          onDismissFullscreenHint={() => setHintVisible(false)}
          actions={outlineActions}
        />
      ) : null}

      <CanvasControls
        outlineOpen={outlineOpen}
        followBeat={preferences.followBeat}
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

      {notice ? (
        <CanvasNotice
          kind={notice.kind}
          phase={notice.phase}
          onUndo={undoLastAction}
          onDisable={() => disableAuto(notice.kind)}
          onDismiss={dismissNotice}
        />
      ) : null}

      {shortcutsOpen ? (
        <CanvasShortcuts
          onClose={closeShortcuts}
          canUndo={canUndo}
          onUndo={undoLastAction}
          autoZoom={preferences.autoZoom}
          autoArrange={preferences.autoArrange}
          onDisableAutoZoom={() => disableAuto('autoZoom')}
          onDisableAutoArrange={() => disableAuto('autoArrange')}
        />
      ) : null}

      {fullscreenActive && hintVisible ? (
        <CanvasFullscreenHint onDismiss={() => setHintVisible(false)} />
      ) : null}

      {printView === null ? null : <CanvasPrintView model={printView} />}
    </section>
  );
}
