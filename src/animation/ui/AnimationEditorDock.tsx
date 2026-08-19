import { CaptureUpdateAction } from "@excalidraw/element";
import {
  useExcalidrawAPI,
  useExcalidrawElements,
} from "@excalidraw/excalidraw/components/App";
import { isRuntimeElementVisible } from "@excalidraw/excalidraw/renderer/runtimeElementRenderHook";
import { memo, useEffect, useRef, useState, useSyncExternalStore } from "react";

import type { ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types";

import { animationWorkspace } from "../inspector";
import {
  applyCameraSnapshot,
  MAIN_CAMERA_RUNTIME_ID,
  readCameraViewport,
  restoreCameraViewport,
  type CameraViewport,
} from "../excalidraw/CameraViewportBinding";

import { AnimationPanel, type AnimationPanelProps } from "./AnimationPanel";
import { StageTransitionOverlay } from "./StageTransitionOverlay";

import "./AnimationEditorDock.scss";

import type { AnimationTrack } from "../types";
import type { AnimationRuntimeSnapshot } from "../runtime/AnimationRuntime";

const DEFAULT_DOCK_HEIGHT = 320;
const MIN_DOCK_HEIGHT = 160;
const MAX_DOCK_HEIGHT = 560;
const COLLAPSED_DOCK_HEIGHT = 36;
const RESIZE_DRAG_THRESHOLD = 4;

export const areAnimationPanelPlaybackPropsEqual = (
  previous: AnimationPanelProps,
  next: AnimationPanelProps,
) =>
  previous.isPlaying &&
  next.isPlaying &&
  previous.project === next.project &&
  previous.activeTrackId === next.activeTrackId &&
  previous.className === next.className;

const StableAnimationPanel = memo(
  AnimationPanel,
  areAnimationPanelPlaybackPropsEqual,
);

const clampDockHeight = (height: number) =>
  Math.min(MAX_DOCK_HEIGHT, Math.max(MIN_DOCK_HEIGHT, height));

const formatDockTime = (timeMs: number) => {
  const totalSeconds = Math.max(0, Math.floor(timeMs / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(
    2,
    "0",
  )}`;
};

const formatPanelTime = (timeMs: number) => {
  const minutes = Math.floor(timeMs / 60000);
  const seconds = Math.floor((timeMs % 60000) / 1000);
  const milliseconds = Math.floor(timeMs % 1000);
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(
    2,
    "0",
  )}.${String(milliseconds).padStart(3, "0")}`;
};

export const updateAnimationPanelPlaybackUi = (
  dock: HTMLElement,
  timeMs: number,
  durationMs: number,
) => {
  const safeDurationMs = Math.max(1, durationMs);
  const safeTimeMs = Math.min(safeDurationMs, Math.max(0, timeMs));
  const percentage = (safeTimeMs / safeDurationMs) * 100;
  const panel = dock.querySelector<HTMLElement>(".animation-panel");
  panel?.style.setProperty(
    "--animation-panel-playhead-position",
    `${percentage}%`,
  );
  const formatted = formatPanelTime(safeTimeMs);
  const transportTime = dock.querySelector<HTMLElement>(
    ".animation-panel__time strong",
  );
  if (transportTime) {
    transportTime.textContent = formatted;
  }
  const rulerLabel = dock.querySelector<HTMLElement>(
    ".animation-panel__ruler-playhead-label",
  );
  if (rulerLabel) {
    rulerLabel.textContent = formatted;
    rulerLabel.style.left = `clamp(34px, ${percentage}%, calc(100% - 34px))`;
  }
  const ruler = dock.querySelector<HTMLInputElement>(
    '.animation-panel__ruler input[type="range"]',
  );
  if (ruler) {
    ruler.value = String(safeTimeMs);
  }
};

const DockPlayIcon = ({ paused }: { paused: boolean }) => (
  <svg viewBox="0 0 20 20" aria-hidden="true">
    {paused ? (
      <path d="M7 5.5v9l7-4.5z" />
    ) : (
      <path d="M6 5.5h3v9H6zm5 0h3v9h-3z" />
    )}
  </svg>
);

const DockGripIcon = () => (
  <svg
    className="animation-editor-dock__grip"
    viewBox="0 0 44 16"
    aria-hidden="true"
  >
    <path className="is-line" d="M2 8h40" />
    <path className="is-collapse" d="m3 3 19 10L41 3" />
    <path className="is-expand" d="m3 13 19-10 19 10" />
    <path className="is-resize" d="m9 6 13-5 13 5M9 10l13 5 13-5" />
  </svg>
);

export const clearCanvasSelectionForPlayback = (
  excalidrawAPI: Pick<ExcalidrawImperativeAPI, "updateScene"> | null,
) => {
  excalidrawAPI?.updateScene({
    appState: {
      activeEmbeddable: null,
      editingGroupId: null,
      selectedElementIds: {},
      selectedGroupIds: {},
      selectedLinearElement: null,
      selectionElement: null,
      showHyperlinkPopup: false,
      suggestedBinding: null,
      frameToHighlight: null,
    },
    captureUpdate: CaptureUpdateAction.NEVER,
  });
};

type CameraPreviewState = {
  active: boolean;
  editorViewport: CameraViewport | null;
};

/**
 * Keeps camera playback correct even when playback is started outside the
 * timeline controls (for example, immediately after AI story generation).
 */
export const syncCameraPreviewForPlayback = (
  excalidrawAPI: Pick<ExcalidrawImperativeAPI, "getAppState" | "updateScene">,
  snapshot: AnimationRuntimeSnapshot,
  hasCameraTrack: boolean,
  state: CameraPreviewState,
): CameraPreviewState => {
  if (!hasCameraTrack || !snapshot.values[MAIN_CAMERA_RUNTIME_ID]) {
    return state;
  }

  const nextState =
    snapshot.status === "playing" && !state.active
      ? {
          active: true,
          editorViewport:
            state.editorViewport ?? readCameraViewport(excalidrawAPI),
        }
      : state;

  if (nextState.active) {
    applyCameraSnapshot(excalidrawAPI, snapshot);
  }
  return nextState;
};

export const selectCanvasElementsForTrack = (
  excalidrawAPI: Pick<
    ExcalidrawImperativeAPI,
    "getSceneElements" | "updateScene"
  > | null,
  track: AnimationTrack | undefined,
  targetElementIds?: readonly string[],
) => {
  if (
    !excalidrawAPI ||
    !track ||
    (track.target.type !== "element" && track.target.type !== "group")
  ) {
    return;
  }
  const targetIds = new Set(
    targetElementIds ??
      (track.target.type === "element" ? [track.target.elementId] : []),
  );
  const selectedElementIds = excalidrawAPI
    .getSceneElements()
    .filter(
      (element) =>
        targetIds.has(element.id) && isRuntimeElementVisible(element),
    )
    .reduce<Record<string, true>>((selection, element) => {
      selection[element.id] = true;
      return selection;
    }, {});
  excalidrawAPI.updateScene({
    appState: {
      activeEmbeddable: null,
      editingGroupId: null,
      selectedElementIds,
      selectedGroupIds: {},
      selectedLinearElement: null,
      selectionElement: null,
      showHyperlinkPopup: false,
      suggestedBinding: null,
      frameToHighlight: null,
    },
    captureUpdate: CaptureUpdateAction.NEVER,
  });
};

export const deleteCanvasElementsForTrack = (
  excalidrawAPI: Pick<ExcalidrawImperativeAPI, "deleteElements"> | null,
  targetElementIds: readonly string[],
) => {
  excalidrawAPI?.deleteElements(targetElementIds);
};

export const AnimationEditorDock = () => {
  const [height, setHeight] = useState(DEFAULT_DOCK_HEIGHT);
  const [collapsed, setCollapsed] = useState(false);
  const [resizing, setResizing] = useState(false);
  const lastExpandedHeightRef = useRef(DEFAULT_DOCK_HEIGHT);
  const resizeCleanupRef = useRef<(() => void) | null>(null);
  const dockRef = useRef<HTMLDivElement>(null);
  const editorViewportRef = useRef<CameraViewport | null>(null);
  const cameraPreviewActiveRef = useRef(false);
  const excalidrawAPI = useExcalidrawAPI();
  const canvasElements = useExcalidrawElements();
  const snapshot = useSyncExternalStore(
    animationWorkspace.subscribe,
    animationWorkspace.getSnapshot,
    animationWorkspace.getSnapshot,
  );

  useEffect(() => () => resizeCleanupRef.current?.(), []);

  useEffect(() => {
    if (!excalidrawAPI) {
      return;
    }
    return animationWorkspace.subscribe(() => {
      const current = animationWorkspace.getSnapshot();
      if (dockRef.current) {
        updateAnimationPanelPlaybackUi(
          dockRef.current,
          current.timeMs,
          current.project.durationMs,
        );
      }
      if (
        current.activeElementId &&
        cameraPreviewActiveRef.current &&
        current.status !== "playing"
      ) {
        if (editorViewportRef.current) {
          restoreCameraViewport(excalidrawAPI, editorViewportRef.current);
        }
        cameraPreviewActiveRef.current = false;
        editorViewportRef.current = null;
        return;
      }
      if (!current.values) {
        return;
      }
      const nextCameraPreview = syncCameraPreviewForPlayback(
        excalidrawAPI,
        {
          timeMs: current.timeMs,
          durationMs: current.project.durationMs,
          status:
            current.status === "playing" ||
            current.status === "paused" ||
            current.status === "stopped"
              ? current.status
              : "paused",
          values: current.values,
        },
        Boolean(animationWorkspace.getCameraTrack()),
        {
          active: cameraPreviewActiveRef.current,
          editorViewport: editorViewportRef.current,
        },
      );
      cameraPreviewActiveRef.current = nextCameraPreview.active;
      editorViewportRef.current = nextCameraPreview.editorViewport;
    });
  }, [excalidrawAPI]);

  useEffect(
    () => () => {
      if (excalidrawAPI && editorViewportRef.current) {
        restoreCameraViewport(excalidrawAPI, editorViewportRef.current);
      }
    },
    [excalidrawAPI],
  );

  const enterCameraPreview = () => {
    if (excalidrawAPI && !editorViewportRef.current) {
      editorViewportRef.current = readCameraViewport(excalidrawAPI);
    }
    cameraPreviewActiveRef.current = true;
  };

  const exitCameraPreview = () => {
    if (
      excalidrawAPI &&
      cameraPreviewActiveRef.current &&
      editorViewportRef.current
    ) {
      restoreCameraViewport(excalidrawAPI, editorViewportRef.current);
    }
    cameraPreviewActiveRef.current = false;
    editorViewportRef.current = null;
  };

  const toggleCollapsed = () => {
    setCollapsed((current) => {
      if (current) {
        setHeight(lastExpandedHeightRef.current);
      } else {
        lastExpandedHeightRef.current = height;
      }
      return !current;
    });
  };

  const beginResize = (event: React.PointerEvent<HTMLDivElement>) => {
    event.preventDefault();
    resizeCleanupRef.current?.();
    if (collapsed) {
      toggleCollapsed();
      return;
    }
    const startY = event.clientY;
    const startHeight = height;
    let dragged = false;
    const previousCursor = document.body.style.cursor;
    const previousUserSelect = document.body.style.userSelect;

    const handlePointerMove = (pointerEvent: PointerEvent) => {
      const deltaY = startY - pointerEvent.clientY;
      if (!dragged && Math.abs(deltaY) < RESIZE_DRAG_THRESHOLD) {
        return;
      }
      if (!dragged) {
        dragged = true;
        setResizing(true);
        document.body.style.cursor = "ns-resize";
        document.body.style.userSelect = "none";
      }
      const nextHeight = clampDockHeight(startHeight + deltaY);
      lastExpandedHeightRef.current = nextHeight;
      setHeight(nextHeight);
    };
    const cleanup = (pointerEvent?: PointerEvent) => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
      window.removeEventListener("pointercancel", handlePointerCancel);
      document.body.style.cursor = previousCursor;
      document.body.style.userSelect = previousUserSelect;
      resizeCleanupRef.current = null;
      setResizing(false);
      if (pointerEvent?.type === "pointerup" && !dragged) {
        toggleCollapsed();
      }
    };
    const handlePointerUp = (pointerEvent: PointerEvent) =>
      cleanup(pointerEvent);
    const handlePointerCancel = () => cleanup();

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp);
    window.addEventListener("pointercancel", handlePointerCancel);
    resizeCleanupRef.current = cleanup;
  };

  return (
    <>
      <StageTransitionOverlay
        project={snapshot.project}
        values={snapshot.values}
      />
      <div
        ref={dockRef}
        className="animation-editor-dock"
        data-testid="animation-editor-dock"
        data-collapsed={collapsed || undefined}
        data-resizing={resizing || undefined}
        style={{ height: collapsed ? COLLAPSED_DOCK_HEIGHT : height }}
      >
        <div
          className="animation-editor-dock__resize-handle"
          role="separator"
          aria-label={collapsed ? "展开动画面板" : "调整动画面板高度"}
          aria-orientation="horizontal"
          aria-valuemin={MIN_DOCK_HEIGHT}
          aria-valuemax={MAX_DOCK_HEIGHT}
          aria-valuenow={collapsed ? COLLAPSED_DOCK_HEIGHT : height}
          tabIndex={0}
          onPointerDown={beginResize}
          onKeyDown={(event) => {
            if (event.key === "Enter" || event.key === " ") {
              event.preventDefault();
              toggleCollapsed();
              return;
            }
            if (collapsed) {
              return;
            }
            if (event.key !== "ArrowUp" && event.key !== "ArrowDown") {
              return;
            }
            event.preventDefault();
            setHeight((current) => {
              const nextHeight = clampDockHeight(
                current + (event.key === "ArrowUp" ? 20 : -20),
              );
              lastExpandedHeightRef.current = nextHeight;
              return nextHeight;
            });
          }}
        >
          {collapsed && (
            <div
              className="animation-editor-dock__compact-playback"
              onPointerDown={(event) => event.stopPropagation()}
            >
              <button
                type="button"
                aria-label={
                  snapshot.status === "playing"
                    ? "在折叠面板中暂停动画"
                    : "在折叠面板中播放动画"
                }
                aria-pressed={snapshot.status === "playing"}
                onClick={() => {
                  if (snapshot.status === "playing") {
                    animationWorkspace.pause();
                  } else {
                    if (animationWorkspace.getCameraTrack()) {
                      enterCameraPreview();
                    }
                    clearCanvasSelectionForPlayback(excalidrawAPI);
                    void animationWorkspace.play();
                  }
                }}
              >
                <DockPlayIcon paused={snapshot.status !== "playing"} />
              </button>
              <output aria-label="折叠面板动画时间" aria-live="off">
                <strong>{formatDockTime(snapshot.timeMs)}</strong>
                <span> / {formatDockTime(snapshot.project.durationMs)}</span>
              </output>
              <input
                className="animation-editor-dock__compact-progress"
                type="range"
                aria-label="动画播放进度"
                min={0}
                max={Math.max(1, snapshot.project.durationMs)}
                step={1}
                value={Math.min(
                  snapshot.timeMs,
                  Math.max(1, snapshot.project.durationMs),
                )}
                style={
                  {
                    "--animation-progress": `${Math.min(
                      100,
                      Math.max(
                        0,
                        (snapshot.timeMs /
                          Math.max(1, snapshot.project.durationMs)) *
                          100,
                      ),
                    )}%`,
                  } as React.CSSProperties
                }
                onChange={(event) =>
                  animationWorkspace.seek(Number(event.currentTarget.value))
                }
              />
            </div>
          )}
          <DockGripIcon />
        </div>
        <StableAnimationPanel
          className="animation-panel--docked"
          project={snapshot.project}
          currentTimeMs={snapshot.timeMs}
          isPlaying={snapshot.status === "playing"}
          activeTrackId={
            snapshot.activeTrackId ??
            (snapshot.activeElementId
              ? animationWorkspace.getElementTrack(snapshot.activeElementId)?.id
              : null)
          }
          playback={{
            play: async () => {
              if (animationWorkspace.getCameraTrack()) {
                enterCameraPreview();
              }
              clearCanvasSelectionForPlayback(excalidrawAPI);
              await animationWorkspace.play();
            },
            pause: () => animationWorkspace.pause(),
            seek: (timeMs) => animationWorkspace.seek(timeMs),
          }}
          onProjectChange={(project) =>
            animationWorkspace.loadProject(project, false)
          }
          onAddKeyframe={(trackId, property, timeMs, initialValue) =>
            animationWorkspace.addTrackPropertyKeyframe(
              trackId,
              property,
              timeMs,
              initialValue,
            )
          }
          onAddPositionKeyframe={(trackId, timeMs) =>
            animationWorkspace.addTrackPositionKeyframe(trackId, timeMs)
          }
          onSelectTrack={(trackId) => {
            const track = snapshot.project.tracks.find(
              (candidate) => candidate.id === trackId,
            );
            if (track?.target.type === "camera") {
              enterCameraPreview();
            } else {
              exitCameraPreview();
            }
            animationWorkspace.setActiveTrack(trackId);
            selectCanvasElementsForTrack(
              excalidrawAPI,
              track,
              animationWorkspace.getTrackTargetElementIds(trackId),
            );
          }}
          onDeleteObject={(trackId) => {
            const targetElementIds =
              animationWorkspace.getTrackTargetElementIds(trackId);
            deleteCanvasElementsForTrack(excalidrawAPI, targetElementIds);
            animationWorkspace.removeObjectAndAnimations(trackId);
          }}
          getTrackTargetElements={(trackId) => {
            const targetIds = new Set(
              animationWorkspace.getTrackTargetElementIds(trackId),
            );
            return (excalidrawAPI?.getSceneElements() ?? canvasElements).filter(
              (element) =>
                element.isDeleted === false && targetIds.has(element.id),
            );
          }}
          getCanvasElementById={(elementId) =>
            (excalidrawAPI?.getSceneElements() ?? canvasElements).find(
              (element) =>
                element.isDeleted === false && element.id === elementId,
            )
          }
          onCaptureCameraKeyframe={(_trackId, timeMs) => {
            if (!excalidrawAPI) {
              return;
            }
            enterCameraPreview();
            animationWorkspace.setCameraKeyframe(
              readCameraViewport(excalidrawAPI),
              timeMs,
            );
          }}
          onCreateCamera={(timeMs) => {
            if (!excalidrawAPI) {
              return;
            }
            editorViewportRef.current ??= readCameraViewport(excalidrawAPI);
            animationWorkspace.setCameraKeyframe(
              readCameraViewport(excalidrawAPI),
              timeMs,
            );
          }}
        />
      </div>
    </>
  );
};
