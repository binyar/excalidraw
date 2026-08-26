import {
  Fragment,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  canChangeRoundness,
  hasBackground,
  hasStrokeColor,
  hasStrokeStyle,
  hasStrokeWidth,
} from "@excalidraw/element";
import {
  EdgeRoundIcon,
  EdgeSharpIcon,
  FillCrossHatchIcon,
  FillHachureIcon,
  FillSolidIcon,
  FillZigZagIcon,
  FontSizeExtraLargeIcon,
  FontSizeLargeIcon,
  FontSizeMediumIcon,
  FontSizeSmallIcon,
  SloppinessArchitectIcon,
  SloppinessArtistIcon,
  SloppinessCartoonistIcon,
  StrokeStyleDashedIcon,
  StrokeStyleDottedIcon,
  StrokeWidthBaseIcon,
  StrokeWidthBoldIcon,
  StrokeWidthExtraBoldIcon,
  TextAlignCenterIcon,
  TextAlignLeftIcon,
  TextAlignRightIcon,
} from "@excalidraw/excalidraw/components/icons";
import { RadioSelection } from "@excalidraw/excalidraw/components/RadioSelection";

import type { NonDeletedExcalidrawElement } from "@excalidraw/element/types";

import { materializeChapterTransition } from "../transitions";

import { isStateAnimationProperty } from "../types";

import {
  EDITABLE_ANIMATION_PROPERTIES,
  addEditableKeyframe,
  addPositionKeyframe,
  deleteKeyframe,
  deletePropertySegment,
  deletePositionKeyframe,
  getColorPropertyValue,
  getFillStylePropertyValue,
  getDiscreteStylePropertyValue,
  getVisibilityPropertyValue,
  getNumericPropertyValue,
  getPositionKeyframeTimes,
  getCameraPositionKeyframeTimes,
  getTrackAbsoluteStartMs,
  getTrackContentEndMs,
  getTrackKeyframeTimes,
  movePropertyKeyframe,
  movePositionKeyframe,
  moveTrackKeyframesAtTime,
  setColorKeyframe,
  setFillStyleKeyframe,
  setDiscreteStyleKeyframe,
  setVisibilityKeyframe,
  setNumericKeyframe,
  setPropertySegmentEasing,
} from "./animationEditorState";

import "./AnimationPanel.scss";

import type { EditableAnimationPropertyName } from "./animationEditorState";

import type {
  AnimationEasing,
  AnimationEasingPresetName,
  AnimationFillStyle,
  AnimationProject,
  AnimationPropertyName,
  AnimationTrack,
  AnimationTransitionDirection,
  AnimationTransitionEffect,
  AnimationTransitionOrigin,
  ElementVisibility,
  NumericAnimationPropertyName,
} from "../types";

import {
  Popover,
  PopoverAnchor,
  PopoverContent,
} from "@/components/ui/popover";

export type AnimationPlaybackController = {
  play: () => void | Promise<void>;
  pause: () => void;
  seek: (timeMs: number) => void;
};

export type AnimationPanelProps = {
  project: AnimationProject;
  currentTimeMs: number;
  isPlaying: boolean;
  playback: AnimationPlaybackController;
  onProjectChange: (project: AnimationProject) => void;
  onAddKeyframe?: (
    trackId: string,
    property: EditableAnimationPropertyName,
    timeMs: number,
    initialValue?: string | number,
  ) => void;
  onAddPositionKeyframe?: (trackId: string, timeMs: number) => void;
  onCaptureCameraKeyframe?: (trackId: string, timeMs: number) => void;
  onCreateCamera?: (timeMs: number) => void;
  onSelectTrack?: (trackId: string) => void;
  onDeleteObject?: (trackId: string) => void;
  getTrackTargetElements?: (
    trackId: string,
  ) => readonly NonDeletedExcalidrawElement[];
  getCanvasElementById?: (
    elementId: string,
  ) => NonDeletedExcalidrawElement | undefined;
  activeTrackId?: string | null;
  className?: string;
};

const POSITION_PATH_PROPERTY = "position.path" as const;
const CAMERA_POSITION_PROPERTY = "camera.position" as const;
const LARGE_PROJECT_TRACK_THRESHOLD = 40;
const TIMELINE_ZOOM_LEVELS = [25, 50, 100, 200, 400, 800, 1600] as const;
const DEFAULT_TIMELINE_VIEWPORT_WIDTH = 720;
const TIMELINE_MAGNETIC_SNAP_PX = 8;

export const scrollAnimationTrackIntoView = (
  editor: Pick<HTMLElement, "clientHeight" | "scrollTop">,
  row: Pick<HTMLElement, "offsetHeight" | "offsetTop">,
) => {
  const rowTop = row.offsetTop;
  const rowBottom = rowTop + row.offsetHeight;
  if (rowTop < editor.scrollTop) {
    editor.scrollTop = rowTop;
  } else if (rowBottom > editor.scrollTop + editor.clientHeight) {
    editor.scrollTop = Math.max(0, rowBottom - editor.clientHeight);
  }
};

type TimelinePropertyName =
  | AnimationPropertyName
  | typeof POSITION_PATH_PROPERTY
  | typeof CAMERA_POSITION_PROPERTY;

type SelectedKeyframe = {
  trackId: string;
  property: TimelinePropertyName;
  atMs: number;
};

type SelectedSegment = {
  trackId: string;
  property: TimelinePropertyName;
  fromAtMs: number;
  toAtMs: number;
};

type KeyframeDragPreview = {
  mode: "object" | "property";
  trackId: string;
  property?: TimelinePropertyName;
  fromAtMs: number;
  toAtMs: number;
};

const PROPERTY_LABELS: Record<TimelinePropertyName, string> = {
  [POSITION_PATH_PROPERTY]: "位置路径",
  [CAMERA_POSITION_PROPERTY]: "位置",
  "transform.x": "水平位置",
  "transform.y": "垂直位置",
  "transform.scale": "缩放",
  "transform.rotate": "旋转",
  "camera.centerX": "中心 X",
  "camera.centerY": "中心 Y",
  "camera.zoom": "镜头缩放",
  "visual.opacity": "不透明度",
  "visual.strokeColor": "描边颜色",
  "visual.backgroundColor": "背景颜色",
  "visual.fillStyle": "填充样式",
  "visual.strokeWidth": "描边宽度",
  "visual.strokeStyle": "边框样式",
  "visual.roughness": "线条风格",
  "visual.roundness": "边角",
  "text.fontSize": "字号",
  "text.fontFamily": "字体",
  "text.textAlign": "文字对齐",
  "text.verticalAlign": "垂直对齐",
  "element.visibility": "显示状态",
  "advanced.path": "运动路径",
  "advanced.drawProgress": "绘制进度",
  "advanced.blur": "模糊",
  "advanced.shadow": "阴影",
  "transition.progress": "转场进度",
  "transition.opacity": "转场不透明度",
  "transition.color": "转场颜色",
  "transition.blur": "转场模糊",
  "transition.scale": "转场缩放",
};

const PROPERTY_COLORS: Record<TimelinePropertyName, string> = {
  [POSITION_PATH_PROPERTY]: "#16a6a1",
  [CAMERA_POSITION_PROPERTY]: "#6d5dfc",
  "transform.x": "#e85959",
  "transform.y": "#35a66f",
  "transform.scale": "#3b82d0",
  "transform.rotate": "#8b5cc7",
  "camera.centerX": "#6d5dfc",
  "camera.centerY": "#8b7cf6",
  "camera.zoom": "#d05b89",
  "visual.opacity": "#d7a400",
  "visual.strokeColor": "#d05b89",
  "visual.backgroundColor": "#e5853d",
  "visual.fillStyle": "#f59f00",
  "visual.strokeWidth": "#6366f1",
  "visual.strokeStyle": "#64748b",
  "visual.roughness": "#475569",
  "visual.roundness": "#8b5cf6",
  "text.fontSize": "#2563eb",
  "text.fontFamily": "#7c3aed",
  "text.textAlign": "#0891b2",
  "text.verticalAlign": "#0d9488",
  "element.visibility": "#64748b",
  "advanced.path": "#16a6a1",
  "advanced.drawProgress": "#64748b",
  "advanced.blur": "#7c83d6",
  "advanced.shadow": "#6f7787",
  "transition.progress": "#0ea5a4",
  "transition.opacity": "#f59e0b",
  "transition.color": "#ef4444",
  "transition.blur": "#8b5cf6",
  "transition.scale": "#3b82f6",
};

const getSegmentPropertyNames = (
  property: TimelinePropertyName,
): AnimationPropertyName[] =>
  property === POSITION_PATH_PROPERTY
    ? ["transform.x", "transform.y"]
    : property === CAMERA_POSITION_PROPERTY
    ? ["camera.centerX", "camera.centerY"]
    : [property];

const isStateTimelineProperty = (property: TimelinePropertyName): boolean =>
  property !== POSITION_PATH_PROPERTY &&
  property !== CAMERA_POSITION_PROPERTY &&
  isStateAnimationProperty(property);

const isDeletedAnimationSegment = (
  property: TimelinePropertyName,
  keyframe: { value?: unknown; hold?: boolean } | undefined,
): boolean =>
  Boolean(
    keyframe?.hold &&
      !(property === "visual.roundness" && typeof keyframe.value === "string"),
  );

export const isPropertySupportedByElement = (
  property: EditableAnimationPropertyName,
  element?: NonDeletedExcalidrawElement,
  getElementById?: (
    elementId: string,
  ) => NonDeletedExcalidrawElement | undefined,
) => {
  if (
    property.startsWith("transform.") ||
    property === "visual.opacity" ||
    property === "element.visibility"
  ) {
    return true;
  }
  if (!element) {
    return false;
  }
  if (
    property === "text.fontSize" ||
    property === "text.fontFamily" ||
    property === "text.textAlign"
  ) {
    return element.type === "text";
  }
  if (property === "text.verticalAlign") {
    if (element.type !== "text" || !element.containerId) {
      return false;
    }
    const container = getElementById?.(element.containerId);
    return !container || container.type !== "arrow";
  }
  if (property === "visual.strokeColor") {
    // Powdoo text color is represented by the text style itself. It must not
    // leak into the animation editor as a shape "stroke" capability.
    return element.type !== "text" && hasStrokeColor(element.type);
  }
  if (
    property === "visual.backgroundColor" ||
    property === "visual.fillStyle"
  ) {
    return hasBackground(element.type);
  }
  if (property === "visual.strokeWidth") {
    return hasStrokeWidth(element.type);
  }
  if (property === "visual.strokeStyle") {
    return hasStrokeStyle(element.type);
  }
  if (property === "visual.roughness") {
    // The native panel exposes sloppiness together with stroke style.
    return hasStrokeStyle(element.type);
  }
  if (property === "visual.roundness") {
    return canChangeRoundness(element.type);
  }
  return false;
};

export const isPropertySupportedByElements = (
  property: EditableAnimationPropertyName,
  elements: readonly NonDeletedExcalidrawElement[],
  getElementById?: (
    elementId: string,
  ) => NonDeletedExcalidrawElement | undefined,
) =>
  elements.length === 0
    ? isPropertySupportedByElement(property)
    : elements.every((element) =>
        isPropertySupportedByElement(property, element, getElementById),
      );

const rematerializePageTransition = (
  project: AnimationProject,
  sourceTrack: AnimationTrack,
  changes: Partial<{
    effect: AnimationTransitionEffect;
    direction: AnimationTransitionDirection;
    origin: AnimationTransitionOrigin;
  }>,
): { project: AnimationProject; firstTrackId: string } | null => {
  if (sourceTrack.target.type !== "transition") {
    return null;
  }
  const transitionId = sourceTrack.target.transitionId;
  const existingTracks = project.tracks.filter(
    (track) =>
      track.target.type === "transition" &&
      track.target.transitionId === transitionId,
  );
  if (!existingTracks.length) {
    return null;
  }
  const startMs = Math.min(
    ...existingTracks.map((track) => track.startMs ?? 0),
  );
  const endMs = Math.max(
    ...existingTracks.map(
      (track) =>
        (track.startMs ?? 0) +
        (track.durationMs ?? Math.max(1, getTrackContentEndMs(track))),
    ),
  );
  const colors = existingTracks.flatMap((track) =>
    (track.properties ?? []).flatMap((property) =>
      property.property === "transition.color" &&
      typeof property.keyframes[0]?.value === "string"
        ? [property.keyframes[0].value]
        : [],
    ),
  );
  const materialized = materializeChapterTransition({
    id: transitionId,
    fromSceneId: sourceTrack.target.fromSceneId,
    toSceneId: sourceTrack.target.toSceneId,
    startMs,
    durationMs: Math.max(1, endMs - startMs),
    preset: changes.effect ?? sourceTrack.target.effect,
    direction: changes.direction ?? sourceTrack.target.direction,
    origin: changes.origin ?? sourceTrack.target.origin,
    ...(colors[0] ? { color: colors[0] } : {}),
    ...(colors[1] ? { backgroundColor: colors[1] } : {}),
  });
  const firstIndex = project.tracks.findIndex(
    (track) =>
      track.target.type === "transition" &&
      track.target.transitionId === transitionId,
  );
  const remaining = project.tracks.filter(
    (track) =>
      track.target.type !== "transition" ||
      track.target.transitionId !== transitionId,
  );
  remaining.splice(firstIndex, 0, ...materialized);
  return {
    project: { ...project, tracks: remaining },
    firstTrackId: materialized[0].id,
  };
};

type SceneBoundary = {
  from: NonNullable<AnimationProject["scenes"]>[number];
  to: NonNullable<AnimationProject["scenes"]>[number];
  tracks: AnimationTrack[];
};

export const createOrReplacePageTransition = (
  project: AnimationProject,
  boundary: SceneBoundary,
): { project: AnimationProject; firstTrackId: string } => {
  const existingStartMs = boundary.tracks.length
    ? Math.min(...boundary.tracks.map((track) => track.startMs ?? 0))
    : undefined;
  const existingEndMs = boundary.tracks.length
    ? Math.max(
        ...boundary.tracks.map(
          (track) =>
            (track.startMs ?? 0) +
            (track.durationMs ?? Math.max(1, getTrackContentEndMs(track))),
        ),
      )
    : undefined;
  const durationMs =
    existingStartMs !== undefined && existingEndMs !== undefined
      ? Math.max(1, existingEndMs - existingStartMs)
      : Math.min(800, Math.max(1, boundary.to.startMs - boundary.from.startMs));
  const transitionId =
    boundary.tracks.flatMap((track) =>
      track.target.type === "transition" ? [track.target.transitionId] : [],
    )[0] ?? `${boundary.from.id}-${boundary.to.id}`;
  const tracks = materializeChapterTransition({
    id: transitionId,
    fromSceneId: boundary.from.id,
    toSceneId: boundary.to.id,
    startMs: existingStartMs ?? boundary.to.startMs - durationMs,
    durationMs,
    preset: "directional-wipe",
    direction: "left",
  });
  const boundaryTrackIds = new Set(boundary.tracks.map((track) => track.id));
  const firstBoundaryTrackIndex = project.tracks.findIndex((track) =>
    boundaryTrackIds.has(track.id),
  );
  const remaining = project.tracks.filter(
    (track) => !boundaryTrackIds.has(track.id),
  );
  remaining.splice(
    firstBoundaryTrackIndex >= 0 ? firstBoundaryTrackIndex : remaining.length,
    0,
    ...tracks,
  );
  return {
    project: { ...project, tracks: remaining },
    firstTrackId: tracks[0].id,
  };
};

export const createManualPageBoundary = (
  project: AnimationProject,
  currentTimeMs: number,
): { project: AnimationProject; boundary: SceneBoundary } => {
  const existingScene = project.scenes?.[0];
  const rangeStartMs = existingScene?.startMs ?? 0;
  const rangeEndMs = existingScene
    ? existingScene.startMs + existingScene.durationMs
    : project.durationMs;
  const midpointMs = Math.round((rangeStartMs + rangeEndMs) / 2);
  const splitAtMs =
    currentTimeMs > rangeStartMs && currentTimeMs < rangeEndMs
      ? Math.round(currentTimeMs)
      : midpointMs;
  const existingSceneIds = new Set(
    (project.scenes ?? []).map((scene) => scene.id),
  );
  const nextSceneId = (() => {
    let index = 2;
    let candidate = existingScene ? `${existingScene.id}-${index}` : "scene-2";
    while (existingSceneIds.has(candidate)) {
      index += 1;
      candidate = existingScene
        ? `${existingScene.id}-${index}`
        : `scene-${index}`;
    }
    return candidate;
  })();
  const from = existingScene
    ? { ...existingScene, durationMs: splitAtMs - rangeStartMs }
    : {
        id: "scene-1",
        name: "场景 1",
        startMs: 0,
        durationMs: splitAtMs,
      };
  const to = {
    id: nextSceneId,
    name: existingScene?.name ? `${existingScene.name} 2` : "场景 2",
    startMs: splitAtMs,
    durationMs: rangeEndMs - splitAtMs,
  };
  const scenes = existingScene
    ? [from, to, ...(project.scenes ?? []).slice(1)]
    : [from, to];
  return {
    project: { ...project, scenes },
    boundary: { from, to, tracks: [] },
  };
};

const getSegmentSourceKeyframe = (
  track: AnimationTrack,
  property: TimelinePropertyName,
  atMs: number,
) =>
  getSegmentPropertyNames(property)
    .map((propertyName) =>
      track.properties
        ?.find((candidate) => candidate.property === propertyName)
        ?.keyframes.find((keyframe) => keyframe.atMs === atMs),
    )
    .find(Boolean);

const LEGACY_NAME_TOKENS: Record<string, string> = {
  bg: "背景",
  background: "背景",
  card: "卡片",
  chart: "图表",
  connector: "连接线",
  decoration: "装饰",
  dot: "圆点",
  frame: "画框",
  grid: "网格",
  h: "横线",
  hero: "主视觉",
  icon: "图标",
  image: "图片",
  label: "文本",
  legend: "图例",
  line: "线条",
  metric: "指标",
  node: "节点",
  scene: "场景",
  subtitle: "副标题",
  text: "文本",
  title: "标题",
  v: "竖线",
};

const getLayerName = (track: AnimationTrack) => {
  if (track.target.type === "camera") {
    return "主镜头";
  }
  if (track.target.type === "transition") {
    return track.name ?? "章节转场";
  }
  const source =
    track.name ??
    (track.target.type === "element"
      ? track.target.elementId
      : track.target.groupId);
  if (/\p{Script=Han}/u.test(source)) {
    return source;
  }
  const translated = source
    .replace(/\s*·\s*/g, "_")
    .split(/[_\s-]+/)
    .filter(Boolean)
    .map(
      (token) =>
        LEGACY_NAME_TOKENS[token.toLowerCase()] ??
        (/^\d+$/.test(token) ? token : ""),
    )
    .filter(Boolean)
    .join(" ");
  return translated || "动画对象";
};

const formatClock = (timeMs: number) => {
  const minutes = Math.floor(timeMs / 60000);
  const seconds = Math.floor((timeMs % 60000) / 1000);
  const milliseconds = Math.floor(timeMs % 1000);
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(
    2,
    "0",
  )}.${String(milliseconds).padStart(3, "0")}`;
};

const parseDuration = (value: string): number | null => {
  const normalized = value.trim().toLowerCase();
  if (!normalized) {
    return null;
  }
  if (/^\d+(?:\.\d+)?ms$/.test(normalized)) {
    return Number.parseFloat(normalized) || null;
  }
  if (/^\d+(?:\.\d+)?s$/.test(normalized)) {
    return Number.parseFloat(normalized) * 1000 || null;
  }
  if (/^\d+(?:\.\d+)?$/.test(normalized)) {
    return Number.parseFloat(normalized) * 1000 || null;
  }
  const clockMatch = normalized.match(/^(?:(\d+):)?(\d{1,2})(?:\.(\d{1,3}))?$/);
  if (!clockMatch) {
    return null;
  }
  const minutes = Number(clockMatch[1] ?? 0);
  const seconds = Number(clockMatch[2]);
  const milliseconds = Number((clockMatch[3] ?? "").padEnd(3, "0"));
  if (seconds >= 60) {
    return null;
  }
  return minutes * 60000 + seconds * 1000 + milliseconds;
};

export const getMinimumProjectDurationMs = (project: AnimationProject) =>
  Math.max(
    1,
    ...(project.scenes ?? []).map((scene) => scene.startMs + scene.durationMs),
    ...project.tracks.map(
      (track) =>
        getTrackAbsoluteStartMs(project, track) +
        (track.durationMs ?? getTrackContentEndMs(track)),
    ),
  );

const getTimelineMinorTickMs = (pixelsPerSecond: number, frameMs: number) => {
  const desiredMs = (18 / Math.max(1, pixelsPerSecond)) * 1000;
  const candidates = [
    frameMs,
    100,
    200,
    500,
    1000,
    2000,
    5000,
    10000,
    30000,
    60000,
    120000,
    300000,
  ].sort((left, right) => left - right);
  return candidates.find((candidate) => candidate >= desiredMs) ?? 600000;
};

const snapTimelineTime = (
  timeMs: number,
  stepMs: number,
  pixelsPerSecond: number,
  magneticTargets: readonly number[],
  frameMs: number,
  precisionMode: boolean,
) => {
  const effectiveStepMs = precisionMode ? frameMs : stepMs;
  const clampedTimeMs = Math.max(0, timeMs);
  if (!precisionMode) {
    const magneticThresholdMs =
      (TIMELINE_MAGNETIC_SNAP_PX / Math.max(1, pixelsPerSecond)) * 1000;
    const magneticTarget = magneticTargets.reduce<number | null>(
      (closest, target) =>
        Math.abs(target - clampedTimeMs) <= magneticThresholdMs &&
        (closest === null ||
          Math.abs(target - clampedTimeMs) < Math.abs(closest - clampedTimeMs))
          ? target
          : closest,
      null,
    );
    if (magneticTarget !== null) {
      return magneticTarget;
    }
  }
  return (
    Math.round(
      Math.round(clampedTimeMs / effectiveStepMs) * effectiveStepMs * 1000,
    ) / 1000
  );
};

const formatRulerTime = (timeMs: number) =>
  timeMs >= 1000
    ? `${(timeMs / 1000).toFixed(timeMs % 1000 === 0 ? 0 : 2)} 秒`
    : `${Math.round(timeMs)} 毫秒`;

const PlayIcon = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true">
    <path d="M8 5v14l11-7z" />
  </svg>
);

const PauseIcon = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true">
    <path d="M6 5h4v14H6zm8 0h4v14h-4z" />
  </svg>
);

const StepIcon = ({ direction }: { direction: "back" | "forward" }) => (
  <svg
    viewBox="0 0 24 24"
    aria-hidden="true"
    style={direction === "back" ? undefined : { transform: "scaleX(-1)" }}
  >
    <path d="M6 5h2v14H6zm3 7 9-7v14z" />
  </svg>
);

export const AnimationPanel = ({
  project,
  currentTimeMs,
  isPlaying,
  playback,
  onProjectChange,
  onAddKeyframe,
  onAddPositionKeyframe,
  onCaptureCameraKeyframe,
  onCreateCamera,
  onSelectTrack,
  onDeleteObject,
  getTrackTargetElements,
  getCanvasElementById,
  activeTrackId,
  className,
}: AnimationPanelProps) => {
  const [selectedTrackId, setSelectedTrackId] = useState<string | null>(
    project.tracks[0]?.id ?? null,
  );
  const [selectedProperty, setSelectedProperty] =
    useState<TimelinePropertyName>(POSITION_PATH_PROPERTY);
  const [selectedKeyframe, setSelectedKeyframe] =
    useState<SelectedKeyframe | null>(null);
  const [selectedSegment, setSelectedSegment] =
    useState<SelectedSegment | null>(null);
  const [segmentEditorOpen, setSegmentEditorOpen] = useState(false);
  const [collapsedTrackIds, setCollapsedTrackIds] = useState<Set<string>>(() =>
    project.tracks.length >= LARGE_PROJECT_TRACK_THRESHOLD
      ? new Set(
          project.tracks
            .filter(
              (track) => track.id !== (activeTrackId ?? project.tracks[0]?.id),
            )
            .map((track) => track.id),
        )
      : new Set(),
  );
  const [dragPreview, setDragPreview] = useState<KeyframeDragPreview | null>(
    null,
  );
  const [timelineZoom, setTimelineZoom] = useState<number | null>(null);
  const [timelineViewportWidth, setTimelineViewportWidth] = useState(
    DEFAULT_TIMELINE_VIEWPORT_WIDTH,
  );
  const [timelineScrollLeft, setTimelineScrollLeft] = useState(0);
  const [durationPreviewMs, setDurationPreviewMs] = useState<number | null>(
    null,
  );
  const [durationDraft, setDurationDraft] = useState(() =>
    formatClock(project.durationMs),
  );
  const [durationError, setDurationError] = useState<string | null>(null);
  const dragCleanupRef = useRef<(() => void) | null>(null);
  const editorRef = useRef<HTMLDivElement | null>(null);
  const objectsHeadingRef = useRef<HTMLDivElement | null>(null);
  const trackRowRefs = useRef(new Map<string, HTMLDivElement>());
  const largeProjectInitializedRef = useRef(
    project.tracks.length >= LARGE_PROJECT_TRACK_THRESHOLD,
  );

  useEffect(() => () => dragCleanupRef.current?.(), []);

  useEffect(() => {
    if (durationPreviewMs === null) {
      setDurationDraft(formatClock(project.durationMs));
    }
  }, [durationPreviewMs, project.durationMs]);

  useLayoutEffect(() => {
    const editor = editorRef.current;
    if (!editor) {
      return;
    }
    const updateViewportWidth = () => {
      const editorWidth = editor.getBoundingClientRect().width;
      if (editorWidth <= 0) {
        return;
      }
      const labelWidth =
        objectsHeadingRef.current?.getBoundingClientRect().width ?? 0;
      setTimelineViewportWidth(
        Math.max(
          1,
          editorWidth -
            (labelWidth ||
              Number.parseFloat(
                getComputedStyle(editor).getPropertyValue(
                  "--animation-panel-label-width",
                ),
              ) ||
              0),
        ),
      );
    };
    updateViewportWidth();
    if (typeof ResizeObserver === "undefined") {
      return;
    }
    const observer = new ResizeObserver(updateViewportWidth);
    observer.observe(editor);
    if (objectsHeadingRef.current) {
      observer.observe(objectsHeadingRef.current);
    }
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const isLargeProject =
      project.tracks.length >= LARGE_PROJECT_TRACK_THRESHOLD;
    if (isLargeProject && !largeProjectInitializedRef.current) {
      const expandedTrackId = activeTrackId ?? selectedTrackId;
      setCollapsedTrackIds(
        new Set(
          project.tracks
            .filter((track) => track.id !== expandedTrackId)
            .map((track) => track.id),
        ),
      );
    }
    largeProjectInitializedRef.current = isLargeProject;
  }, [activeTrackId, project.tracks, selectedTrackId]);

  useLayoutEffect(() => {
    // The selected line becomes the Popover anchor on this render. Open the
    // editor one commit later so Radix can measure a mounted anchor in the
    // browser instead of trying to position against a missing element.
    setSegmentEditorOpen(Boolean(selectedSegment));
  }, [selectedSegment]);

  useEffect(() => {
    if (activeTrackId === null) {
      setSelectedTrackId(null);
      setSelectedKeyframe(null);
      setSelectedSegment(null);
      return;
    }
    if (
      activeTrackId &&
      activeTrackId !== selectedTrackId &&
      project.tracks.some((track) => track.id === activeTrackId)
    ) {
      setSelectedTrackId(activeTrackId);
      setSelectedKeyframe(null);
      setSelectedSegment(null);
      setCollapsedTrackIds((current) => {
        const next = new Set(current);
        next.delete(activeTrackId);
        return next;
      });
      return;
    }
    if (
      !selectedTrackId ||
      !project.tracks.some((track) => track.id === selectedTrackId)
    ) {
      setSelectedTrackId(project.tracks[0]?.id ?? null);
      setSelectedKeyframe(null);
      setSelectedSegment(null);
    }
  }, [activeTrackId, project.tracks, selectedTrackId]);

  useEffect(() => {
    if (!activeTrackId) {
      return;
    }
    const editor = editorRef.current;
    const row = trackRowRefs.current.get(activeTrackId);
    if (editor && row) {
      scrollAnimationTrackIntoView(editor, row);
    }
  }, [activeTrackId, collapsedTrackIds]);

  const safeDurationMs = Math.max(1, project.durationMs);
  const timelineDurationMs = Math.max(1, durationPreviewMs ?? safeDurationMs);
  const safeCurrentTimeMs = Math.max(
    0,
    Math.min(currentTimeMs, safeDurationMs),
  );
  const frameMs = 1000 / Math.max(1, project.frameRate);
  const minimumDurationMs = useMemo(
    () => getMinimumProjectDurationMs(project),
    [project],
  );
  const pixelsPerSecond =
    timelineZoom ??
    (timelineViewportWidth * 1000) / Math.max(1, timelineDurationMs);
  const timelineWidth = Math.max(
    1,
    (timelineDurationMs / 1000) * pixelsPerSecond,
  );
  const minorTickMs = getTimelineMinorTickMs(pixelsPerSecond, frameMs);
  const majorTickMs = minorTickMs * 5;
  const displayTracks = useMemo(
    () => [
      ...project.tracks.filter((track) => track.target.type === "camera"),
      ...project.tracks.filter(
        (track) =>
          track.target.type === "transition" &&
          track.target.effect !== "camera",
      ),
      ...project.tracks.filter(
        (track) =>
          track.target.type !== "camera" && track.target.type !== "transition",
      ),
    ],
    [project.tracks],
  );
  const pendingLargeProjectCollapse =
    project.tracks.length >= LARGE_PROJECT_TRACK_THRESHOLD &&
    !largeProjectInitializedRef.current;
  const largeProjectExpandedTrackId = activeTrackId ?? selectedTrackId;
  const objectTrackCount = project.tracks.filter(
    (track) =>
      track.target.type !== "camera" && track.target.type !== "transition",
  ).length;
  const transitionTrackCount = new Set(
    project.tracks.flatMap((track) =>
      track.target.type === "transition" && track.target.effect !== "camera"
        ? [track.target.transitionId]
        : [],
    ),
  ).size;
  const firstPageTransitionTrack = project.tracks.find(
    (track) =>
      track.target.type === "transition" && track.target.effect !== "camera",
  );
  const hasMultipleScenes = (project.scenes?.length ?? 0) >= 2;
  const transitionBoundaries = useMemo(() => {
    const scenes = [...(project.scenes ?? [])].sort(
      (left, right) => left.startMs - right.startMs,
    );
    const boundaries: SceneBoundary[] = [];
    for (let index = 1; index < scenes.length; index += 1) {
      const from = scenes[index - 1];
      const to = scenes[index];
      const tracks = project.tracks.filter(
        (track) =>
          track.target.type === "transition" &&
          track.target.fromSceneId === from.id &&
          track.target.toSceneId === to.id,
      );
      boundaries.push({ from, to, tracks });
    }
    return boundaries;
  }, [project.scenes, project.tracks]);
  const missingTransitionBoundary = transitionBoundaries.find(
    (boundary) => boundary.tracks.length === 0,
  );
  const cameraTransitionBoundary = transitionBoundaries.find((boundary) =>
    boundary.tracks.some(
      (track) =>
        track.target.type === "transition" && track.target.effect === "camera",
    ),
  );
  const firstTransitionTrackIndex = displayTracks.findIndex(
    (track) => track.target.type === "transition",
  );
  const firstObjectTrackIndex = displayTracks.findIndex(
    (track) =>
      track.target.type !== "camera" && track.target.type !== "transition",
  );
  const magneticSnapTargets = useMemo(
    () => [
      0,
      safeDurationMs,
      ...(project.scenes ?? []).flatMap((scene) => [
        scene.startMs,
        scene.startMs + scene.durationMs,
      ]),
      ...project.tracks.flatMap((track) => {
        const trackStartMs = getTrackAbsoluteStartMs(project, track);
        return [
          trackStartMs,
          trackStartMs +
            (track.durationMs ?? Math.max(1, getTrackContentEndMs(track))),
          ...getTrackKeyframeTimes(track).map((atMs) => trackStartMs + atMs),
        ];
      }),
    ],
    [project, safeDurationMs],
  );
  const rulerMarks = useMemo(() => {
    const visibleStartMs = Math.max(
      0,
      (timelineScrollLeft / pixelsPerSecond) * 1000,
    );
    const visibleEndMs = Math.min(
      timelineDurationMs,
      ((timelineScrollLeft + timelineViewportWidth) / pixelsPerSecond) * 1000,
    );
    const firstMarkMs = Math.max(
      0,
      Math.floor(visibleStartMs / majorTickMs) * majorTickMs,
    );
    const marks: number[] = [];
    for (
      let atMs = firstMarkMs;
      atMs <= visibleEndMs + majorTickMs && marks.length < 100;
      atMs += majorTickMs
    ) {
      if (atMs <= timelineDurationMs) {
        marks.push(atMs);
      }
    }
    if (
      timelineDurationMs >= visibleStartMs &&
      timelineDurationMs <= visibleEndMs + majorTickMs &&
      !marks.some((mark) => Math.abs(mark - timelineDurationMs) < 0.01)
    ) {
      marks.push(timelineDurationMs);
    }
    return marks;
  }, [
    majorTickMs,
    pixelsPerSecond,
    timelineDurationMs,
    timelineScrollLeft,
    timelineViewportWidth,
  ]);

  useEffect(() => {
    if (!isPlaying) {
      return;
    }
    const editor = editorRef.current;
    if (!editor) {
      return;
    }
    const playheadX = (safeCurrentTimeMs / 1000) * pixelsPerSecond;
    const marginPx = Math.min(48, timelineViewportWidth / 4);
    if (playheadX < editor.scrollLeft + marginPx) {
      editor.scrollLeft = Math.max(0, playheadX - marginPx);
    } else if (
      playheadX >
      editor.scrollLeft + timelineViewportWidth - marginPx
    ) {
      editor.scrollLeft = Math.max(
        0,
        playheadX - timelineViewportWidth + marginPx,
      );
    }
  }, [isPlaying, pixelsPerSecond, safeCurrentTimeMs, timelineViewportWidth]);

  const openSegmentEditor = (segment: SelectedSegment) => {
    setSelectedSegment(segment);
  };

  const selectTrack = (trackId: string) => {
    setSelectedTrackId(trackId);
    setSelectedKeyframe(null);
    setSelectedSegment(null);
    onSelectTrack?.(trackId);
  };

  const toggleTrack = (trackId: string) => {
    setCollapsedTrackIds((current) => {
      const next = new Set(current);
      if (next.has(trackId)) {
        next.delete(trackId);
      } else {
        next.add(trackId);
      }
      return next;
    });
  };

  const addPropertyKeyframe = (
    track: AnimationTrack,
    property: EditableAnimationPropertyName,
  ) => {
    const relativeTimeMs = Math.max(
      0,
      safeCurrentTimeMs - getTrackAbsoluteStartMs(project, track),
    );
    if (onAddKeyframe) {
      onAddKeyframe(
        track.id,
        property,
        safeCurrentTimeMs,
        getElementAnimationPropertyValue(
          getTrackTargetElements?.(track.id)[0],
          property,
        ),
      );
    } else {
      onProjectChange(
        addEditableKeyframe(project, track.id, property, safeCurrentTimeMs),
      );
    }
    setSelectedTrackId(track.id);
    setSelectedProperty(property);
    setSelectedSegment(null);
    setSelectedKeyframe({ trackId: track.id, property, atMs: relativeTimeMs });
  };

  const addPositionPathKeyframe = (track: AnimationTrack) => {
    const relativeTimeMs = Math.max(
      0,
      safeCurrentTimeMs - getTrackAbsoluteStartMs(project, track),
    );
    if (onAddPositionKeyframe) {
      onAddPositionKeyframe(track.id, safeCurrentTimeMs);
    } else {
      onProjectChange(
        addPositionKeyframe(project, track.id, safeCurrentTimeMs),
      );
    }
    setSelectedTrackId(track.id);
    setSelectedProperty(POSITION_PATH_PROPERTY);
    setSelectedSegment(null);
    setSelectedKeyframe({
      trackId: track.id,
      property: POSITION_PATH_PROPERTY,
      atMs: relativeTimeMs,
    });
  };

  const deleteSelectedKeyframe = () => {
    if (!selectedKeyframe) {
      return;
    }
    onProjectChange(
      selectedKeyframe.property === POSITION_PATH_PROPERTY
        ? deletePositionKeyframe(
            project,
            selectedKeyframe.trackId,
            selectedKeyframe.atMs,
          )
        : selectedKeyframe.property === CAMERA_POSITION_PROPERTY
        ? (["camera.centerX", "camera.centerY"] as const).reduce(
            (nextProject, property) =>
              deleteKeyframe(
                nextProject,
                selectedKeyframe.trackId,
                property,
                selectedKeyframe.atMs,
              ),
            project,
          )
        : deleteKeyframe(
            project,
            selectedKeyframe.trackId,
            selectedKeyframe.property,
            selectedKeyframe.atMs,
          ),
    );
    setSelectedKeyframe(null);
    setSelectedSegment(null);
  };

  const getPreviewTime = (
    mode: "object" | "property",
    trackId: string,
    property: TimelinePropertyName | undefined,
    atMs: number,
  ) => {
    if (
      !dragPreview ||
      dragPreview.trackId !== trackId ||
      dragPreview.fromAtMs !== atMs
    ) {
      return atMs;
    }
    if (dragPreview.mode === "object") {
      return dragPreview.toAtMs;
    }
    return mode === "property" && dragPreview.property === property
      ? dragPreview.toAtMs
      : atMs;
  };

  const beginKeyframeDrag = (
    event: React.PointerEvent<HTMLButtonElement>,
    lane: HTMLElement,
    drag: Omit<KeyframeDragPreview, "toAtMs">,
  ) => {
    event.preventDefault();
    event.stopPropagation();
    dragCleanupRef.current?.();

    const track = project.tracks.find(
      (candidate) => candidate.id === drag.trackId,
    );
    if (!track) {
      return;
    }
    const trackStartMs = getTrackAbsoluteStartMs(project, track);
    const bounds = lane.getBoundingClientRect();
    let finalAtMs = drag.fromAtMs;

    const timeFromClientX = (clientX: number, precisionMode: boolean) => {
      if (bounds.width <= 0) {
        return drag.fromAtMs;
      }
      const rawProjectTimeMs = Math.max(
        0,
        Math.min(
          safeDurationMs,
          ((clientX - bounds.left) / bounds.width) * safeDurationMs,
        ),
      );
      const snappedProjectTimeMs = snapTimelineTime(
        rawProjectTimeMs,
        minorTickMs,
        pixelsPerSecond,
        magneticSnapTargets,
        frameMs,
        precisionMode,
      );
      return Math.max(
        0,
        Math.min(
          safeDurationMs - trackStartMs,
          snappedProjectTimeMs - trackStartMs,
        ),
      );
    };

    const handlePointerMove = (pointerEvent: PointerEvent) => {
      finalAtMs = timeFromClientX(pointerEvent.clientX, pointerEvent.altKey);
      setDragPreview({ ...drag, toAtMs: finalAtMs });
      playback.seek(trackStartMs + finalAtMs);
    };
    const cleanup = () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
      window.removeEventListener("pointercancel", handlePointerCancel);
      dragCleanupRef.current = null;
    };
    const handlePointerUp = (pointerEvent: PointerEvent) => {
      finalAtMs = timeFromClientX(pointerEvent.clientX, pointerEvent.altKey);
      cleanup();
      setDragPreview(null);
      const projectTimeMs = trackStartMs + finalAtMs;
      if (finalAtMs !== drag.fromAtMs) {
        setSelectedSegment(null);
        onProjectChange(
          drag.mode === "object"
            ? moveTrackKeyframesAtTime(
                project,
                drag.trackId,
                drag.fromAtMs,
                projectTimeMs,
              )
            : drag.property === POSITION_PATH_PROPERTY
            ? movePositionKeyframe(
                project,
                drag.trackId,
                drag.fromAtMs,
                projectTimeMs,
              )
            : drag.property === CAMERA_POSITION_PROPERTY
            ? (["camera.centerX", "camera.centerY"] as const).reduce(
                (nextProject, property) =>
                  movePropertyKeyframe(
                    nextProject,
                    drag.trackId,
                    property,
                    drag.fromAtMs,
                    projectTimeMs,
                  ),
                project,
              )
            : movePropertyKeyframe(
                project,
                drag.trackId,
                drag.property!,
                drag.fromAtMs,
                projectTimeMs,
              ),
        );
      }
      if (drag.mode === "property" && drag.property) {
        setSelectedKeyframe({
          trackId: drag.trackId,
          property: drag.property,
          atMs: finalAtMs,
        });
      } else {
        setSelectedKeyframe(null);
        setSelectedSegment(null);
      }
      playback.seek(projectTimeMs);
    };
    const handlePointerCancel = () => {
      cleanup();
      setDragPreview(null);
    };

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp);
    window.addEventListener("pointercancel", handlePointerCancel);
    dragCleanupRef.current = cleanup;

    setSelectedTrackId(track.id);
    if (drag.mode === "object") {
      setSelectedSegment(null);
    }
    if (drag.mode === "property" && drag.property) {
      setSelectedProperty(drag.property);
      setSelectedKeyframe({
        trackId: drag.trackId,
        property: drag.property,
        atMs: drag.fromAtMs,
      });
    }
    playback.seek(trackStartMs + drag.fromAtMs);
  };

  const selectedSegmentTrack = selectedSegment
    ? project.tracks.find((track) => track.id === selectedSegment.trackId)
    : undefined;
  const selectedSegmentKeyframe =
    selectedSegment && selectedSegmentTrack
      ? getSegmentSourceKeyframe(
          selectedSegmentTrack,
          selectedSegment.property,
          selectedSegment.fromAtMs,
        )
      : undefined;

  const updateSelectedSegmentEasing = (easing: AnimationEasing) => {
    if (!selectedSegment) {
      return;
    }
    onProjectChange(
      getSegmentPropertyNames(selectedSegment.property).reduce(
        (nextProject, propertyName) =>
          setPropertySegmentEasing(
            nextProject,
            selectedSegment.trackId,
            propertyName,
            selectedSegment.fromAtMs,
            easing,
          ),
        project,
      ),
    );
  };

  const removeSelectedSegment = useCallback(() => {
    if (!selectedSegment) {
      return;
    }
    onProjectChange(
      getSegmentPropertyNames(selectedSegment.property).reduce(
        (nextProject, propertyName) =>
          deletePropertySegment(
            nextProject,
            selectedSegment.trackId,
            propertyName,
            selectedSegment.fromAtMs,
            selectedSegment.toAtMs,
          ),
        project,
      ),
    );
    setSelectedSegment(null);
  }, [onProjectChange, project, selectedSegment]);

  useEffect(() => {
    if (!selectedSegment) {
      return;
    }
    const handleDelete = (event: KeyboardEvent) => {
      if (event.key !== "Delete" && event.key !== "Backspace") {
        return;
      }
      const target = event.target;
      if (
        target instanceof HTMLElement &&
        (target.isContentEditable ||
          target instanceof HTMLInputElement ||
          target instanceof HTMLTextAreaElement)
      ) {
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      removeSelectedSegment();
    };
    window.addEventListener("keydown", handleDelete, true);
    return () => window.removeEventListener("keydown", handleDelete, true);
  }, [removeSelectedSegment, selectedSegment]);

  const reconnectSegment = (segment: SelectedSegment) => {
    onProjectChange(
      getSegmentPropertyNames(segment.property).reduce(
        (nextProject, propertyName) =>
          setPropertySegmentEasing(
            nextProject,
            segment.trackId,
            propertyName,
            segment.fromAtMs,
            { type: "preset", name: "ease" },
          ),
        project,
      ),
    );
    setSelectedSegment(null);
  };

  const commitDuration = () => {
    const parsedDurationMs = parseDuration(durationDraft);
    if (parsedDurationMs === null) {
      setDurationError("请输入 01:30.000、90s 或 90000ms 格式的时长");
      return;
    }
    const nextDurationMs =
      Math.round(Math.round(parsedDurationMs / frameMs) * frameMs * 1000) /
      1000;
    if (nextDurationMs < minimumDurationMs) {
      setDurationError(
        `最短可设置为 ${formatClock(minimumDurationMs)}，之后仍存在动画内容`,
      );
      return;
    }
    setDurationError(null);
    setDurationDraft(formatClock(nextDurationMs));
    onProjectChange({ ...project, durationMs: nextDurationMs });
    if (safeCurrentTimeMs > nextDurationMs) {
      playback.seek(nextDurationMs);
    }
  };

  const applyTimelineZoom = (
    nextZoom: number | null,
    anchorPx = timelineViewportWidth / 2,
  ) => {
    const editor = editorRef.current;
    if (!editor) {
      setTimelineZoom(nextZoom);
      return;
    }
    const clampedAnchorPx = Math.max(
      0,
      Math.min(anchorPx, timelineViewportWidth),
    );
    const anchorTimeMs =
      ((editor.scrollLeft + clampedAnchorPx) / pixelsPerSecond) * 1000;
    const nextPixelsPerSecond =
      nextZoom ??
      (timelineViewportWidth * 1000) / Math.max(1, timelineDurationMs);
    setTimelineZoom(nextZoom);
    requestAnimationFrame(() => {
      editor.scrollLeft = Math.max(
        0,
        (anchorTimeMs / 1000) * nextPixelsPerSecond - clampedAnchorPx,
      );
      setTimelineScrollLeft(editor.scrollLeft);
    });
  };

  const stepTimelineZoom = (direction: -1 | 1, anchorPx?: number) => {
    const candidates =
      direction > 0
        ? TIMELINE_ZOOM_LEVELS
        : [...TIMELINE_ZOOM_LEVELS].reverse();
    const nextZoom = candidates.find((zoom) =>
      direction > 0
        ? zoom > pixelsPerSecond + 0.01
        : zoom < pixelsPerSecond - 0.01,
    );
    applyTimelineZoom(
      nextZoom ??
        (direction > 0
          ? TIMELINE_ZOOM_LEVELS[TIMELINE_ZOOM_LEVELS.length - 1]
          : TIMELINE_ZOOM_LEVELS[0]),
      anchorPx,
    );
  };

  const beginDurationDrag = (event: React.PointerEvent<HTMLButtonElement>) => {
    event.preventDefault();
    event.stopPropagation();
    dragCleanupRef.current?.();
    const startClientX = event.clientX;
    const startDurationMs = timelineDurationMs;
    let nextDurationMs = startDurationMs;
    const getDurationFromClientX = (clientX: number) => {
      const rawDurationMs =
        startDurationMs +
        ((clientX - startClientX) / Math.max(1, pixelsPerSecond)) * 1000;
      return Math.max(
        minimumDurationMs,
        snapTimelineTime(
          rawDurationMs,
          minorTickMs,
          pixelsPerSecond,
          [],
          frameMs,
          false,
        ),
      );
    };
    const handlePointerMove = (pointerEvent: PointerEvent) => {
      nextDurationMs = getDurationFromClientX(pointerEvent.clientX);
      setDurationPreviewMs(nextDurationMs);
      setDurationDraft(formatClock(nextDurationMs));
      setDurationError(null);
    };
    const cleanup = () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
      window.removeEventListener("pointercancel", handlePointerCancel);
      dragCleanupRef.current = null;
    };
    const handlePointerUp = (pointerEvent: PointerEvent) => {
      nextDurationMs = getDurationFromClientX(pointerEvent.clientX);
      cleanup();
      setDurationPreviewMs(null);
      setDurationDraft(formatClock(nextDurationMs));
      onProjectChange({ ...project, durationMs: nextDurationMs });
      if (safeCurrentTimeMs > nextDurationMs) {
        playback.seek(nextDurationMs);
      }
    };
    const handlePointerCancel = () => {
      cleanup();
      setDurationPreviewMs(null);
      setDurationDraft(formatClock(safeDurationMs));
    };
    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp);
    window.addEventListener("pointercancel", handlePointerCancel);
    dragCleanupRef.current = cleanup;
  };

  return (
    <Popover
      open={Boolean(
        segmentEditorOpen &&
          selectedSegment &&
          selectedSegment.property !== "element.visibility" &&
          selectedSegmentTrack &&
          selectedSegmentKeyframe,
      )}
      onOpenChange={(open) => {
        if (!open) {
          setSelectedSegment(null);
        }
      }}
    >
      <section
        className={["animation-panel", className].filter(Boolean).join(" ")}
        aria-label="动画面板"
        style={
          {
            ...getTimelinePlayheadPositionStyle(
              safeCurrentTimeMs,
              pixelsPerSecond,
            ),
            "--animation-panel-timeline-width": `${timelineWidth}px`,
            "--animation-panel-minor-tick-width": `${
              (minorTickMs / 1000) * pixelsPerSecond
            }px`,
            "--animation-panel-major-tick-width": `${
              (majorTickMs / 1000) * pixelsPerSecond
            }px`,
          } as React.CSSProperties
        }
      >
        <header className="animation-panel__transport">
          <div className="animation-panel__transport-buttons">
            <button
              type="button"
              aria-label="跳到动画开头"
              onClick={() => playback.seek(0)}
            >
              <StepIcon direction="back" />
            </button>
            <button
              type="button"
              aria-label="上一帧"
              onClick={() =>
                playback.seek(Math.max(0, safeCurrentTimeMs - frameMs))
              }
            >
              <span
                className="animation-panel__transport-glyph"
                aria-hidden="true"
              >
                ‹
              </span>
            </button>
            <button
              type="button"
              className={isPlaying ? "is-active is-primary" : "is-primary"}
              aria-label={isPlaying ? "暂停动画" : "播放动画"}
              aria-pressed={isPlaying}
              onClick={() => {
                if (isPlaying) {
                  playback.pause();
                } else {
                  void playback.play();
                }
              }}
            >
              {isPlaying ? <PauseIcon /> : <PlayIcon />}
            </button>
            <button
              type="button"
              aria-label="下一帧"
              onClick={() =>
                playback.seek(
                  Math.min(safeDurationMs, safeCurrentTimeMs + frameMs),
                )
              }
            >
              <span
                className="animation-panel__transport-glyph"
                aria-hidden="true"
              >
                ›
              </span>
            </button>
            <button
              type="button"
              aria-label="跳到动画结尾"
              onClick={() => playback.seek(safeDurationMs)}
            >
              <StepIcon direction="forward" />
            </button>
          </div>
          <output className="animation-panel__time" aria-live="off">
            <strong>{formatClock(safeCurrentTimeMs)}</strong>
            <span>/</span>
            <input
              className={durationError ? "is-invalid" : ""}
              value={durationDraft}
              aria-label="动画总时长"
              aria-invalid={Boolean(durationError)}
              title={durationError ?? "支持 01:30.000、90s 或 90000ms"}
              onChange={(event) => {
                setDurationDraft(event.target.value);
                setDurationError(null);
              }}
              onBlur={commitDuration}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.currentTarget.blur();
                } else if (event.key === "Escape") {
                  setDurationDraft(formatClock(safeDurationMs));
                  setDurationError(null);
                  event.currentTarget.blur();
                }
              }}
            />
          </output>
          {durationError && (
            <span className="animation-panel__duration-error" role="alert">
              {durationError}
            </span>
          )}
          <div className="animation-panel__timeline-zoom">
            <button
              type="button"
              className={`animation-panel__fit-control ${
                timelineZoom === null ? "is-active" : ""
              }`}
              aria-label="时间轴适应窗口"
              title="显示完整项目时长"
              onClick={() => {
                applyTimelineZoom(null, 0);
                if (editorRef.current) {
                  editorRef.current.scrollLeft = 0;
                  setTimelineScrollLeft(0);
                }
              }}
            >
              <span>适应</span>
              <span className="animation-panel__control-chevron">⌄</span>
            </button>
            <button
              type="button"
              className="animation-panel__zoom-in-control"
              aria-label="放大时间轴"
              title="放大时间轴"
              onClick={() => stepTimelineZoom(1)}
            >
              +
            </button>
            <select
              className="animation-panel__zoom-select"
              aria-label="时间轴缩放比例"
              value={timelineZoom ?? "fit"}
              onChange={(event) => {
                const value = event.target.value;
                applyTimelineZoom(value === "fit" ? null : Number(value));
              }}
            >
              <option value="fit">100%</option>
              {TIMELINE_ZOOM_LEVELS.map((zoom) => (
                <option value={zoom} key={zoom}>
                  {zoom}%
                </option>
              ))}
            </select>
            <select
              className="animation-panel__frame-rate-select"
              aria-label="动画帧率"
              value={project.frameRate}
              onChange={(event) =>
                onProjectChange({
                  ...project,
                  frameRate: Number(event.target.value),
                })
              }
            >
              {[...new Set([24, 30, 60, project.frameRate])]
                .sort((left, right) => left - right)
                .map((frameRate) => (
                  <option value={frameRate} key={frameRate}>
                    {frameRate} fps
                  </option>
                ))}
            </select>
          </div>
        </header>

        <div
          className="animation-panel__editor"
          ref={editorRef}
          onScroll={(event) =>
            setTimelineScrollLeft(event.currentTarget.scrollLeft)
          }
          onWheel={(event) => {
            if (!event.metaKey && !event.ctrlKey) {
              return;
            }
            event.preventDefault();
            const editorBounds = event.currentTarget.getBoundingClientRect();
            const labelWidth =
              objectsHeadingRef.current?.getBoundingClientRect().width ?? 0;
            stepTimelineZoom(
              event.deltaY > 0 ? -1 : 1,
              event.clientX - editorBounds.left - labelWidth,
            );
          }}
        >
          <div className="animation-panel__timeline-grid">
            <div
              className="animation-panel__objects-heading"
              ref={objectsHeadingRef}
            >
              <strong>场景</strong>
              <span className="animation-panel__heading-actions">
                <button
                  type="button"
                  className="animation-panel__add-transition"
                  aria-label={
                    !hasMultipleScenes
                      ? "在当前时间创建场景边界并添加PPT翻页"
                      : missingTransitionBoundary
                      ? `添加 ${
                          missingTransitionBoundary.from.name ??
                          missingTransitionBoundary.from.id
                        } 到 ${
                          missingTransitionBoundary.to.name ??
                          missingTransitionBoundary.to.id
                        } 的章节转场`
                      : cameraTransitionBoundary
                      ? `将 ${
                          cameraTransitionBoundary.from.name ??
                          cameraTransitionBoundary.from.id
                        } 到 ${
                          cameraTransitionBoundary.to.name ??
                          cameraTransitionBoundary.to.id
                        } 从空间运镜切换为PPT翻页`
                      : firstPageTransitionTrack
                      ? "打开PPT翻页转场设置"
                      : "添加PPT翻页转场"
                  }
                  title={
                    !hasMultipleScenes
                      ? "按当前播放头创建两个场景，并添加可编辑的 PPT 翻页转场"
                      : missingTransitionBoundary
                      ? "为下一个场景边界添加可编辑的 PPT 翻页转场"
                      : cameraTransitionBoundary
                      ? "将当前空间运镜转场切换为可编辑的 PPT 翻页转场"
                      : firstPageTransitionTrack
                      ? "定位到已有的 PPT 翻页转场轨道"
                      : "打开已有的 PPT 翻页转场设置"
                  }
                  onClick={() => {
                    if (!hasMultipleScenes) {
                      const manual = createManualPageBoundary(
                        project,
                        safeCurrentTimeMs,
                      );
                      const materialized = createOrReplacePageTransition(
                        manual.project,
                        manual.boundary,
                      );
                      onProjectChange(materialized.project);
                      setCollapsedTrackIds((current) => {
                        const next = new Set(current);
                        next.delete(materialized.firstTrackId);
                        return next;
                      });
                      selectTrack(materialized.firstTrackId);
                      return;
                    }
                    const boundaryToMaterialize =
                      missingTransitionBoundary ?? cameraTransitionBoundary;
                    if (boundaryToMaterialize) {
                      const materialized = createOrReplacePageTransition(
                        project,
                        boundaryToMaterialize,
                      );
                      onProjectChange(materialized.project);
                      setCollapsedTrackIds((current) => {
                        const next = new Set(current);
                        next.delete(materialized.firstTrackId);
                        return next;
                      });
                      selectTrack(materialized.firstTrackId);
                      return;
                    }
                    if (firstPageTransitionTrack) {
                      setCollapsedTrackIds((current) => {
                        const next = new Set(current);
                        next.delete(firstPageTransitionTrack.id);
                        return next;
                      });
                      selectTrack(firstPageTransitionTrack.id);
                    }
                  }}
                >
                  + 翻页
                </button>
                {!project.tracks.some(
                  (track) => track.target.type === "camera",
                ) &&
                  onCreateCamera && (
                    <button
                      type="button"
                      className="animation-panel__add-camera"
                      aria-label="添加空间运镜"
                      title="将当前视图记录为空间运镜镜头"
                      onClick={() => onCreateCamera(safeCurrentTimeMs)}
                    >
                      + 运镜
                    </button>
                  )}
              </span>
            </div>
            <div className="animation-panel__ruler">
              {rulerMarks.map((atMs) => (
                <span
                  key={atMs}
                  className={`${atMs === 0 ? "is-start" : ""} ${
                    Math.abs(atMs - timelineDurationMs) < 0.01 ? "is-end" : ""
                  }`}
                  style={{ left: `${(atMs / 1000) * pixelsPerSecond}px` }}
                >
                  {formatRulerTime(atMs)}
                </span>
              ))}
              <input
                type="range"
                min={0}
                max={timelineDurationMs}
                step={minorTickMs}
                value={safeCurrentTimeMs}
                aria-label="动画时间轴"
                onChange={(event) =>
                  playback.seek(
                    Math.min(timelineDurationMs, Number(event.target.value)),
                  )
                }
              />
              <i className="animation-panel__ruler-playhead" />
              <output
                className="animation-panel__ruler-playhead-label"
                style={{
                  left: `clamp(34px, ${
                    (safeCurrentTimeMs / 1000) * pixelsPerSecond
                  }px, calc(100% - 34px))`,
                }}
              >
                {formatClock(safeCurrentTimeMs)}
              </output>
              <button
                type="button"
                className="animation-panel__duration-handle"
                aria-label="拖动调整动画总时长"
                title={`项目结束：${formatClock(timelineDurationMs)}`}
                onPointerDown={beginDurationDrag}
              />
            </div>

            {project.tracks.length === 0 ? (
              <div className="animation-panel__empty">暂无动画对象</div>
            ) : (
              displayTracks.map((track, trackIndex) => {
                const isCamera = track.target.type === "camera";
                const isTransition = track.target.type === "transition";
                const transitionTarget =
                  track.target.type === "transition" ? track.target : null;
                const targetElements = getTrackTargetElements?.(track.id) ?? [];
                const targetElement = targetElements[0];
                const trackStartMs = getTrackAbsoluteStartMs(project, track);
                const isCollapsed =
                  collapsedTrackIds.has(track.id) ||
                  (pendingLargeProjectCollapse &&
                    track.id !== largeProjectExpandedTrackId);
                const objectKeyframeTimes = getTrackKeyframeTimes(track);
                const propertiesByName = new Map(
                  (track.properties ?? []).map((property) => [
                    property.property,
                    property,
                  ]),
                );
                const fixedPropertyNames: TimelinePropertyName[] = isCamera
                  ? [CAMERA_POSITION_PROPERTY, "camera.zoom"]
                  : isTransition
                  ? [
                      "transition.progress",
                      "transition.opacity",
                      "transition.color",
                      "transition.blur",
                      "transition.scale",
                    ]
                  : [
                      POSITION_PATH_PROPERTY,
                      ...EDITABLE_ANIMATION_PROPERTIES.filter(
                        (property) =>
                          !isPositionProperty(property) &&
                          !property.startsWith("transition.") &&
                          isPropertySupportedByElements(
                            property,
                            targetElements,
                            getCanvasElementById,
                          ),
                      ),
                    ];
                const visiblePropertyNames: TimelinePropertyName[] =
                  isCamera || isTransition
                    ? fixedPropertyNames
                    : [
                        ...fixedPropertyNames,
                        ...(track.properties ?? [])
                          .map((property) => property.property)
                          .filter(
                            (property) =>
                              !isPositionProperty(property) &&
                              property !== "advanced.drawProgress" &&
                              property !== "advanced.blur" &&
                              isPropertySupportedByElements(
                                property as EditableAnimationPropertyName,
                                targetElements,
                                getCanvasElementById,
                              ) &&
                              !fixedPropertyNames.includes(property),
                          ),
                      ];
                const spanDuration =
                  track.durationMs ?? Math.max(1, getTrackContentEndMs(track));
                return (
                  <Fragment key={track.id}>
                    {trackIndex === firstTransitionTrackIndex && (
                      <>
                        <div className="animation-panel__section-heading is-transition">
                          <strong>PPT 翻页</strong>
                          <span>{transitionTrackCount}</span>
                        </div>
                        <div
                          className="animation-panel__section-divider"
                          aria-hidden="true"
                        >
                          <Playhead
                            currentTimeMs={safeCurrentTimeMs}
                            durationMs={safeDurationMs}
                          />
                        </div>
                      </>
                    )}
                    {trackIndex === firstObjectTrackIndex && (
                      <>
                        <div className="animation-panel__section-heading">
                          <strong>动画对象</strong>
                          <span>{objectTrackCount}</span>
                        </div>
                        <div
                          className="animation-panel__section-divider"
                          aria-hidden="true"
                        >
                          <Playhead
                            currentTimeMs={safeCurrentTimeMs}
                            durationMs={safeDurationMs}
                          />
                        </div>
                      </>
                    )}
                    <div
                      ref={(element) => {
                        if (element) {
                          trackRowRefs.current.set(track.id, element);
                        } else {
                          trackRowRefs.current.delete(track.id);
                        }
                      }}
                      data-animation-track-id={track.id}
                      className={`animation-panel__object-group ${
                        selectedTrackId === track.id ? "is-selected" : ""
                      } ${isCamera ? "is-camera" : ""} ${
                        isTransition ? "is-transition" : ""
                      }`}
                    >
                      <div className="animation-panel__object-cell">
                        <button
                          type="button"
                          className="animation-panel__disclosure"
                          aria-label={`${
                            isCollapsed ? "展开" : "收起"
                          } ${getLayerName(track)}`}
                          aria-expanded={!isCollapsed}
                          onClick={() => toggleTrack(track.id)}
                        >
                          <svg
                            className={isCollapsed ? "" : "is-expanded"}
                            viewBox="0 0 16 16"
                            aria-hidden="true"
                          >
                            <path d="m6 3.5 4.5 4.5L6 12.5" />
                          </svg>
                        </button>
                        <button
                          type="button"
                          className="animation-panel__object-name"
                          aria-pressed={selectedTrackId === track.id}
                          onClick={() => selectTrack(track.id)}
                        >
                          <span className="animation-panel__object-icon">
                            {isCamera ? "⌾" : isTransition ? "⇄" : ""}
                          </span>
                          <span>
                            <strong>{getLayerName(track)}</strong>
                            <small>
                              {isCamera
                                ? "场景 · "
                                : transitionTarget
                                ? `${transitionTarget.fromSceneId} → ${transitionTarget.toSceneId} · `
                                : ""}
                              {objectKeyframeTimes.length} 个关键帧时间点
                            </small>
                          </span>
                        </button>
                        {!isCamera && !isTransition && onDeleteObject && (
                          <button
                            type="button"
                            className="animation-panel__object-delete"
                            aria-label={`删除 ${getLayerName(
                              track,
                            )} 动画及画布元素`}
                            title="删除动画及画布元素"
                            onClick={() => onDeleteObject(track.id)}
                          >
                            <svg viewBox="0 0 20 20" aria-hidden="true">
                              <path d="M6.5 6.5v8m3.5-8v8m3.5-8v8M4.5 4.5h11m-8.5 0 .7-1.5h3.6l.7 1.5m-7 0 .7 12h8.6l.7-12" />
                            </svg>
                          </button>
                        )}
                        {isTransition && (
                          <TransitionTargetEditor
                            track={track}
                            onChange={(changes) => {
                              const rematerialized =
                                rematerializePageTransition(
                                  project,
                                  track,
                                  changes,
                                );
                              if (!rematerialized) {
                                return;
                              }
                              onProjectChange(rematerialized.project);
                              selectTrack(rematerialized.firstTrackId);
                            }}
                            onDelete={() => {
                              const transitionId =
                                transitionTarget?.transitionId;
                              if (!transitionId) {
                                return;
                              }
                              onProjectChange({
                                ...project,
                                tracks: project.tracks.filter(
                                  (candidate) =>
                                    candidate.target.type !== "transition" ||
                                    candidate.target.transitionId !==
                                      transitionId,
                                ),
                              });
                              setSelectedTrackId(null);
                            }}
                          />
                        )}
                      </div>
                      <div
                        className="animation-panel__lane is-object"
                        onPointerDown={(event) =>
                          seekTimelineFromPointer(
                            event.currentTarget,
                            event.clientX,
                            safeDurationMs,
                            minorTickMs,
                            pixelsPerSecond,
                            magneticSnapTargets,
                            frameMs,
                            event.altKey,
                            playback.seek,
                          )
                        }
                      >
                        <span
                          className="animation-panel__object-span"
                          style={getTimelineSegmentPositionStyle(
                            trackStartMs,
                            trackStartMs + spanDuration,
                            pixelsPerSecond,
                          )}
                        />
                        {objectKeyframeTimes.map((atMs) => {
                          const displayAtMs = getPreviewTime(
                            "object",
                            track.id,
                            undefined,
                            atMs,
                          );
                          const absoluteTimeMs = trackStartMs + displayAtMs;
                          return (
                            <button
                              type="button"
                              className="animation-panel__keyframe is-object"
                              style={getTimelineMarkerPositionStyle(
                                absoluteTimeMs,
                                pixelsPerSecond,
                              )}
                              aria-label={`${getLayerName(
                                track,
                              )}对象关键帧，位于 ${formatRulerTime(
                                trackStartMs + atMs,
                              )}`}
                              key={`object-${atMs}`}
                              onPointerDown={(event) =>
                                beginKeyframeDrag(
                                  event,
                                  event.currentTarget.parentElement!,
                                  {
                                    mode: "object",
                                    trackId: track.id,
                                    fromAtMs: atMs,
                                  },
                                )
                              }
                            />
                          );
                        })}
                        <Playhead
                          currentTimeMs={safeCurrentTimeMs}
                          durationMs={safeDurationMs}
                        />
                      </div>

                      {!isCollapsed &&
                        visiblePropertyNames.map((propertyName) => {
                          const isPositionPath =
                            propertyName === POSITION_PATH_PROPERTY;
                          const isCameraPosition =
                            propertyName === CAMERA_POSITION_PROPERTY;
                          const property =
                            isPositionPath || isCameraPosition
                              ? undefined
                              : propertiesByName.get(propertyName);
                          const positionKeyframeTimes = isPositionPath
                            ? getPositionKeyframeTimes(track)
                            : isCameraPosition
                            ? getCameraPositionKeyframeTimes(track)
                            : [];
                          const keyframes =
                            isPositionPath || isCameraPosition
                              ? positionKeyframeTimes.map((atMs) => ({ atMs }))
                              : property?.keyframes ?? [];
                          const canAddKeyframe =
                            isPositionPath ||
                            isCamera ||
                            isEditableProperty(propertyName);
                          const editableProperty = canAddKeyframe
                            ? isPositionPath || isCamera
                              ? null
                              : (propertyName as EditableAnimationPropertyName)
                            : null;
                          const isSelectedProperty =
                            selectedTrackId === track.id &&
                            selectedProperty === propertyName;
                          const hasSelectedKeyframe =
                            selectedKeyframe?.trackId === track.id &&
                            selectedKeyframe.property === propertyName;
                          return (
                            <div
                              className={`animation-panel__property-row ${
                                isSelectedProperty ? "is-selected" : ""
                              } ${keyframes.length > 0 ? "" : "is-empty"}`}
                              key={propertyName}
                            >
                              <div className="animation-panel__property-cell">
                                <span
                                  className="animation-panel__property-color"
                                  style={{
                                    background: PROPERTY_COLORS[propertyName],
                                  }}
                                />
                                <button
                                  type="button"
                                  className="animation-panel__property-name"
                                  onClick={() => {
                                    setSelectedTrackId(track.id);
                                    setSelectedProperty(propertyName);
                                  }}
                                >
                                  {PROPERTY_LABELS[propertyName]}
                                </button>
                                <PropertyValueEditor
                                  project={project}
                                  track={track}
                                  property={propertyName}
                                  projectTimeMs={
                                    hasSelectedKeyframe
                                      ? trackStartMs + selectedKeyframe.atMs
                                      : safeCurrentTimeMs
                                  }
                                  onProjectChange={onProjectChange}
                                  element={targetElement}
                                />
                                <button
                                  type="button"
                                  className="animation-panel__property-keyframe-toggle"
                                  disabled={!canAddKeyframe}
                                  aria-label={`${getLayerName(track)}添加${
                                    PROPERTY_LABELS[propertyName]
                                  }关键帧`}
                                  title="在播放头处添加关键帧"
                                  onClick={() =>
                                    isPositionPath
                                      ? addPositionPathKeyframe(track)
                                      : isCamera
                                      ? onCaptureCameraKeyframe?.(
                                          track.id,
                                          safeCurrentTimeMs,
                                        )
                                      : editableProperty &&
                                        addPropertyKeyframe(
                                          track,
                                          editableProperty,
                                        )
                                  }
                                >
                                  ◇
                                </button>
                                {hasSelectedKeyframe && (
                                  <button
                                    type="button"
                                    className="animation-panel__property-delete"
                                    aria-label="删除选中的关键帧"
                                    title="删除选中的关键帧"
                                    onClick={deleteSelectedKeyframe}
                                  >
                                    ×
                                  </button>
                                )}
                              </div>
                              <div
                                className="animation-panel__lane is-property"
                                onPointerDown={(event) =>
                                  seekTimelineFromPointer(
                                    event.currentTarget,
                                    event.clientX,
                                    safeDurationMs,
                                    minorTickMs,
                                    pixelsPerSecond,
                                    magneticSnapTargets,
                                    frameMs,
                                    event.altKey,
                                    playback.seek,
                                  )
                                }
                              >
                                {keyframes
                                  .slice(0, -1)
                                  .map((fromKeyframe, index) => {
                                    const toKeyframe = keyframes[index + 1];
                                    if (isStateTimelineProperty(propertyName)) {
                                      return null;
                                    }
                                    const sourceKeyframe =
                                      getSegmentSourceKeyframe(
                                        track,
                                        propertyName,
                                        fromKeyframe.atMs,
                                      );
                                    const fromTimeMs =
                                      trackStartMs + fromKeyframe.atMs;
                                    const toTimeMs =
                                      trackStartMs + toKeyframe.atMs;
                                    if (
                                      isDeletedAnimationSegment(
                                        propertyName,
                                        sourceKeyframe,
                                      )
                                    ) {
                                      return (
                                        <button
                                          type="button"
                                          className="animation-panel__reconnect-segment"
                                          style={{
                                            left: `${
                                              ((fromTimeMs + toTimeMs) /
                                                2 /
                                                1000) *
                                              pixelsPerSecond
                                            }px`,
                                            color:
                                              PROPERTY_COLORS[propertyName],
                                          }}
                                          aria-label={`连接${getLayerName(
                                            track,
                                          )}${
                                            PROPERTY_LABELS[propertyName]
                                          }，从 ${formatRulerTime(
                                            fromTimeMs,
                                          )} 到 ${formatRulerTime(toTimeMs)}`}
                                          title="连接到下一个关键帧"
                                          key={`reconnect-${fromKeyframe.atMs}-${toKeyframe.atMs}`}
                                          onPointerDown={(event) => {
                                            event.preventDefault();
                                            event.stopPropagation();
                                          }}
                                          onClick={(event) => {
                                            event.stopPropagation();
                                            reconnectSegment({
                                              trackId: track.id,
                                              property: propertyName,
                                              fromAtMs: fromKeyframe.atMs,
                                              toAtMs: toKeyframe.atMs,
                                            });
                                          }}
                                        >
                                          <svg
                                            viewBox="0 0 12 12"
                                            aria-hidden="true"
                                          >
                                            <path d="M6 3v6M3 6h6" />
                                          </svg>
                                        </button>
                                      );
                                    }
                                    const isSelectedSegment =
                                      selectedSegment?.trackId === track.id &&
                                      selectedSegment.property ===
                                        propertyName &&
                                      selectedSegment.fromAtMs ===
                                        fromKeyframe.atMs &&
                                      selectedSegment.toAtMs ===
                                        toKeyframe.atMs;
                                    const segmentButton = (
                                      <button
                                        type="button"
                                        className={`animation-panel__property-segment ${
                                          isSelectedSegment ? "is-selected" : ""
                                        }`}
                                        style={{
                                          ...getTimelineSegmentPositionStyle(
                                            fromTimeMs,
                                            toTimeMs,
                                            pixelsPerSecond,
                                          ),
                                          color: PROPERTY_COLORS[propertyName],
                                        }}
                                        aria-label={`${getLayerName(track)}${
                                          PROPERTY_LABELS[propertyName]
                                        }动画函数，从 ${formatRulerTime(
                                          fromTimeMs,
                                        )} 到 ${formatRulerTime(toTimeMs)}`}
                                        key={`segment-${fromKeyframe.atMs}-${toKeyframe.atMs}`}
                                        onPointerDown={(event) => {
                                          event.preventDefault();
                                          event.stopPropagation();
                                          event.currentTarget.focus();
                                          selectTrack(track.id);
                                          setSelectedProperty(propertyName);
                                          setSelectedKeyframe(null);
                                          openSegmentEditor({
                                            trackId: track.id,
                                            property: propertyName,
                                            fromAtMs: fromKeyframe.atMs,
                                            toAtMs: toKeyframe.atMs,
                                          });
                                          playback.seek(fromTimeMs);
                                        }}
                                        onClick={(event) => {
                                          event.stopPropagation();
                                          selectTrack(track.id);
                                          setSelectedProperty(propertyName);
                                          setSelectedKeyframe(null);
                                          openSegmentEditor({
                                            trackId: track.id,
                                            property: propertyName,
                                            fromAtMs: fromKeyframe.atMs,
                                            toAtMs: toKeyframe.atMs,
                                          });
                                          playback.seek(fromTimeMs);
                                        }}
                                      />
                                    );
                                    return isSelectedSegment ? (
                                      <PopoverAnchor
                                        asChild
                                        key={`segment-anchor-${fromKeyframe.atMs}-${toKeyframe.atMs}`}
                                      >
                                        {segmentButton}
                                      </PopoverAnchor>
                                    ) : (
                                      segmentButton
                                    );
                                  })}
                                {keyframes.map((keyframe, keyframeIndex) => {
                                  const displayAtMs = getPreviewTime(
                                    "property",
                                    track.id,
                                    propertyName,
                                    keyframe.atMs,
                                  );
                                  const absoluteTimeMs =
                                    trackStartMs + displayAtMs;
                                  const isSelected =
                                    selectedKeyframe?.trackId === track.id &&
                                    selectedKeyframe.property ===
                                      propertyName &&
                                    selectedKeyframe.atMs === keyframe.atMs;
                                  const nextKeyframe =
                                    keyframes[keyframeIndex + 1];
                                  const anchorsDeletedSegment = Boolean(
                                    isDeletedAnimationSegment(
                                      propertyName,
                                      selectedSegmentKeyframe,
                                    ) &&
                                      nextKeyframe &&
                                      selectedSegment?.trackId === track.id &&
                                      selectedSegment.property ===
                                        propertyName &&
                                      selectedSegment.fromAtMs ===
                                        keyframe.atMs &&
                                      selectedSegment.toAtMs ===
                                        nextKeyframe.atMs,
                                  );
                                  const keyframeButton = (
                                    <button
                                      key={`${propertyName}-${keyframe.atMs}`}
                                      type="button"
                                      className={`animation-panel__keyframe ${
                                        isSelected ? "is-selected" : ""
                                      }`}
                                      style={{
                                        ...getTimelineMarkerPositionStyle(
                                          absoluteTimeMs,
                                          pixelsPerSecond,
                                        ),
                                        color: PROPERTY_COLORS[propertyName],
                                      }}
                                      aria-label={`${getLayerName(track)}${
                                        PROPERTY_LABELS[propertyName]
                                      }关键帧，位于 ${formatRulerTime(
                                        trackStartMs + keyframe.atMs,
                                      )}`}
                                      onPointerDown={(event) => {
                                        beginKeyframeDrag(
                                          event,
                                          event.currentTarget.parentElement!,
                                          {
                                            mode: "property",
                                            trackId: track.id,
                                            property: propertyName,
                                            fromAtMs: keyframe.atMs,
                                          },
                                        );
                                        if (nextKeyframe) {
                                          openSegmentEditor({
                                            trackId: track.id,
                                            property: propertyName,
                                            fromAtMs: keyframe.atMs,
                                            toAtMs: nextKeyframe.atMs,
                                          });
                                        } else {
                                          setSelectedSegment(null);
                                        }
                                      }}
                                    />
                                  );
                                  return anchorsDeletedSegment ? (
                                    <PopoverAnchor
                                      asChild
                                      key={`deleted-segment-anchor-${propertyName}-${keyframe.atMs}`}
                                    >
                                      {keyframeButton}
                                    </PopoverAnchor>
                                  ) : (
                                    keyframeButton
                                  );
                                })}
                                <Playhead
                                  currentTimeMs={safeCurrentTimeMs}
                                  durationMs={safeDurationMs}
                                />
                              </div>
                            </div>
                          );
                        })}
                    </div>
                  </Fragment>
                );
              })
            )}
          </div>
        </div>
      </section>
      {selectedSegment &&
        selectedSegment.property !== "element.visibility" &&
        selectedSegmentTrack &&
        selectedSegmentKeyframe && (
          <PopoverContent
            className="animation-panel__easing-popover"
            side="bottom"
            align="center"
            sideOffset={8}
            collisionPadding={8}
            onOpenAutoFocus={(event) => event.preventDefault()}
            onCloseAutoFocus={(event) => event.preventDefault()}
          >
            <EasingEditor
              trackName={getLayerName(selectedSegmentTrack)}
              propertyName={PROPERTY_LABELS[selectedSegment.property]}
              fromAtMs={selectedSegment.fromAtMs}
              toAtMs={selectedSegment.toAtMs}
              easing={selectedSegmentKeyframe.easing}
              deleted={isDeletedAnimationSegment(
                selectedSegment.property,
                selectedSegmentKeyframe,
              )}
              onChange={updateSelectedSegmentEasing}
              onDelete={removeSelectedSegment}
              onClose={() => setSelectedSegment(null)}
            />
          </PopoverContent>
        )}
    </Popover>
  );
};

const TRANSITION_EFFECT_OPTIONS: ReadonlyArray<{
  value: AnimationTransitionEffect;
  label: string;
}> = [
  { value: "color-wipe", label: "PPT 颜色扫过" },
  { value: "directional-wipe", label: "PPT 方向擦除" },
  { value: "fade-through-color", label: "PPT 淡入淡出" },
  { value: "push", label: "PPT 画布推移" },
  { value: "iris", label: "PPT 圆形开合" },
];

const TRANSITION_DIRECTION_OPTIONS: ReadonlyArray<{
  value: AnimationTransitionDirection;
  label: string;
}> = [
  { value: "left", label: "向左" },
  { value: "right", label: "向右" },
  { value: "up", label: "向上" },
  { value: "down", label: "向下" },
];

const TRANSITION_ORIGIN_OPTIONS: ReadonlyArray<{
  value: AnimationTransitionOrigin;
  label: string;
}> = [
  { value: "center", label: "中心展开" },
  { value: "top-left", label: "左上角展开" },
  { value: "top-right", label: "右上角展开" },
  { value: "bottom-left", label: "左下角展开" },
  { value: "bottom-right", label: "右下角展开" },
];

const TransitionTargetEditor = ({
  track,
  onChange,
  onDelete,
}: {
  track: AnimationTrack;
  onChange: (
    changes: Partial<
      Pick<
        Extract<AnimationTrack["target"], { type: "transition" }>,
        "effect" | "direction" | "origin"
      >
    >,
  ) => void;
  onDelete: () => void;
}) => {
  if (track.target.type !== "transition") {
    return null;
  }
  const isCameraTransition = track.target.effect === "camera";
  return (
    <span className="animation-panel__transition-controls">
      <select
        aria-label={`${getLayerName(track)}转场类型`}
        value={track.target.effect}
        disabled={isCameraTransition}
        title={
          isCameraTransition
            ? "空间运镜请通过镜头轨道配置"
            : "选择 PPT 翻页效果"
        }
        onClick={(event) => event.stopPropagation()}
        onChange={(event) =>
          onChange({ effect: event.target.value as AnimationTransitionEffect })
        }
      >
        {isCameraTransition && (
          <option value="camera">空间运镜（使用镜头轨道配置）</option>
        )}
        {TRANSITION_EFFECT_OPTIONS.map((option) => (
          <option value={option.value} key={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      {track.target.effect !== "camera" &&
        track.target.effect !== "fade-through-color" &&
        track.target.effect !== "iris" && (
          <select
            aria-label={`${getLayerName(track)}转场方向`}
            value={track.target.direction ?? "left"}
            onClick={(event) => event.stopPropagation()}
            onChange={(event) =>
              onChange({
                direction: event.target.value as AnimationTransitionDirection,
              })
            }
          >
            {TRANSITION_DIRECTION_OPTIONS.map((option) => (
              <option value={option.value} key={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        )}
      {track.target.effect === "iris" && (
        <select
          aria-label={`${getLayerName(track)}转场起点`}
          value={track.target.origin ?? "center"}
          onClick={(event) => event.stopPropagation()}
          onChange={(event) =>
            onChange({
              origin: event.target.value as AnimationTransitionOrigin,
            })
          }
        >
          {TRANSITION_ORIGIN_OPTIONS.map((option) => (
            <option value={option.value} key={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      )}
      <button
        type="button"
        aria-label={`删除${getLayerName(track)}`}
        title="删除整个章节转场"
        onClick={(event) => {
          event.stopPropagation();
          onDelete();
        }}
      >
        ×
      </button>
    </span>
  );
};

const NUMERIC_VALUE_CONFIG: Partial<
  Record<
    TimelinePropertyName,
    {
      property: AnimationPropertyName;
      multiplier?: number;
      unit?: string;
      min?: number;
      max?: number;
    }
  >
> = {
  "transform.scale": {
    property: "transform.scale",
    multiplier: 100,
    unit: "%",
    min: 0,
  },
  "transform.rotate": { property: "transform.rotate", unit: "°" },
  "camera.zoom": {
    property: "camera.zoom",
    multiplier: 100,
    unit: "%",
    min: 1,
  },
  "visual.opacity": {
    property: "visual.opacity",
    multiplier: 100,
    unit: "%",
    min: 0,
    max: 100,
  },
  "advanced.drawProgress": {
    property: "advanced.drawProgress",
    multiplier: 100,
    unit: "%",
    min: 0,
    max: 100,
  },
  "advanced.blur": {
    property: "advanced.blur",
    unit: "px",
    min: 0,
  },
  "transition.progress": {
    property: "transition.progress",
    multiplier: 100,
    unit: "%",
    min: 0,
    max: 100,
  },
  "transition.opacity": {
    property: "transition.opacity",
    multiplier: 100,
    unit: "%",
    min: 0,
    max: 100,
  },
  "transition.blur": {
    property: "transition.blur",
    unit: "px",
    min: 0,
  },
  "transition.scale": {
    property: "transition.scale",
    multiplier: 100,
    unit: "%",
    min: 0,
  },
};

const VerticalAlignIcon = ({
  position,
}: {
  position: "top" | "middle" | "bottom";
}) => (
  <svg viewBox="0 0 20 20" aria-hidden="true">
    <path d="M4 4h12M6 8h8M6 11h8M4 16h12" />
    <path
      d={
        position === "top"
          ? "M10 5v2"
          : position === "middle"
          ? "M10 9v2"
          : "M10 13v2"
      }
    />
  </svg>
);

const VisibilityIcon = ({ hidden = false }: { hidden?: boolean }) => (
  <svg viewBox="0 0 20 20" aria-hidden="true">
    <path d="M2.5 10s2.7-4 7.5-4 7.5 4 7.5 4-2.7 4-7.5 4-7.5-4-7.5-4Z" />
    <circle cx="10" cy="10" r="1.8" />
    {hidden && <path d="m3 3 14 14" />}
  </svg>
);

const VisualPropertyOptions = <T extends string | number>({
  group,
  value,
  options,
  onChange,
}: {
  group: string;
  value: T;
  options: Array<{ value: T; text: string; icon: React.JSX.Element }>;
  onChange: (value: T) => void;
}) => (
  <span className="animation-panel__property-values is-visual-options">
    <RadioSelection<any>
      group={group}
      value={value}
      options={options}
      onChange={onChange}
    />
  </span>
);

const closestOption = (value: number, options: readonly number[]) =>
  options.reduce((closest, option) =>
    Math.abs(option - value) < Math.abs(closest - value) ? option : closest,
  );

const getElementNumericPropertyValue = (
  element: NonDeletedExcalidrawElement | undefined,
  property: NumericAnimationPropertyName,
): number | undefined => {
  if (!element) {
    return undefined;
  }
  switch (property) {
    case "visual.opacity":
      return element.opacity / 100;
    case "visual.strokeWidth":
      return element.strokeWidth;
    case "visual.roughness":
      return element.roughness;
    case "text.fontSize":
      return element.type === "text" ? element.fontSize : undefined;
    case "text.fontFamily":
      return element.type === "text" ? element.fontFamily : undefined;
    default:
      return undefined;
  }
};

const getElementAnimationPropertyValue = (
  element: NonDeletedExcalidrawElement | undefined,
  property: EditableAnimationPropertyName,
): string | number | undefined => {
  if (!element) {
    return undefined;
  }
  if (
    property === "visual.opacity" ||
    property === "visual.strokeWidth" ||
    property === "visual.roughness" ||
    property === "text.fontSize" ||
    property === "text.fontFamily"
  ) {
    return getElementNumericPropertyValue(element, property);
  }
  switch (property) {
    case "visual.strokeColor":
      return element.strokeColor;
    case "visual.backgroundColor":
      return element.backgroundColor;
    case "visual.fillStyle":
      return element.fillStyle;
    case "visual.strokeStyle":
    case "visual.roundness":
    case "text.textAlign":
    case "text.verticalAlign":
      return getElementDiscretePropertyValue(element, property);
    default:
      return undefined;
  }
};

const getNumericOrElementValue = (
  project: AnimationProject,
  track: AnimationTrack,
  property: NumericAnimationPropertyName,
  projectTimeMs: number,
  element?: NonDeletedExcalidrawElement,
) =>
  track.properties?.some((candidate) => candidate.property === property)
    ? getNumericPropertyValue(project, track, property, projectTimeMs)
    : getElementNumericPropertyValue(element, property) ??
      getNumericPropertyValue(project, track, property, projectTimeMs);

const getElementDiscretePropertyValue = (
  element: NonDeletedExcalidrawElement | undefined,
  property:
    | "visual.strokeStyle"
    | "visual.roundness"
    | "text.textAlign"
    | "text.verticalAlign",
) => {
  if (!element) {
    return undefined;
  }
  switch (property) {
    case "visual.strokeStyle":
      return element.strokeStyle;
    case "visual.roundness":
      return element.roundness ? 1 : 0;
    case "text.textAlign":
      return element.type === "text" ? element.textAlign : undefined;
    case "text.verticalAlign":
      return element.type === "text" ? element.verticalAlign : undefined;
  }
};

const getDiscreteStyleOptions = (
  property:
    | "visual.strokeStyle"
    | "visual.roundness"
    | "text.textAlign"
    | "text.verticalAlign",
) => {
  switch (property) {
    case "visual.strokeStyle":
      return {
        options: [
          { value: "solid", text: "实线", icon: StrokeWidthBaseIcon },
          { value: "dashed", text: "虚线", icon: StrokeStyleDashedIcon },
          { value: "dotted", text: "点线", icon: StrokeStyleDottedIcon },
        ],
      };
    case "visual.roundness":
      return {
        options: [
          { value: 0, text: "直角", icon: EdgeSharpIcon },
          { value: 1, text: "圆角", icon: EdgeRoundIcon },
        ],
      };
    case "text.textAlign":
      return {
        options: [
          { value: "left", text: "左对齐", icon: TextAlignLeftIcon },
          { value: "center", text: "居中", icon: TextAlignCenterIcon },
          { value: "right", text: "右对齐", icon: TextAlignRightIcon },
        ],
      };
    case "text.verticalAlign":
      return {
        options: [
          {
            value: "top",
            text: "顶部对齐",
            icon: <VerticalAlignIcon position="top" />,
          },
          {
            value: "middle",
            text: "垂直居中",
            icon: <VerticalAlignIcon position="middle" />,
          },
          {
            value: "bottom",
            text: "底部对齐",
            icon: <VerticalAlignIcon position="bottom" />,
          },
        ],
      };
  }
};

const DraggableNumberInput = ({
  value,
  step,
  min,
  max,
  ariaLabel,
  onValueChange,
}: {
  value: number;
  step: number;
  min?: number;
  max?: number;
  ariaLabel: string;
  onValueChange: (value: number) => void;
}) => {
  const dragCleanupRef = useRef<(() => void) | null>(null);
  const suppressClickRef = useRef(false);

  useEffect(() => () => dragCleanupRef.current?.(), []);

  const beginDrag = (event: React.PointerEvent<HTMLInputElement>) => {
    if (event.button > 0) {
      return;
    }
    dragCleanupRef.current?.();
    const startX = event.clientX;
    const startValue = value;
    let dragged = false;

    document.body.classList.add("powdoo-cursor-resize");

    const clampValue = (nextValue: number) =>
      Math.min(
        max ?? Number.POSITIVE_INFINITY,
        Math.max(min ?? Number.NEGATIVE_INFINITY, nextValue),
      );
    const handlePointerMove = (pointerEvent: PointerEvent) => {
      const distance = pointerEvent.clientX - startX;
      if (!dragged && Math.abs(distance) < 2) {
        return;
      }
      dragged = true;
      pointerEvent.preventDefault();
      const modifier = pointerEvent.shiftKey
        ? 10
        : pointerEvent.altKey
        ? 0.1
        : 1;
      const steps = distance / 2;
      onValueChange(
        formatParameterValue(clampValue(startValue + steps * step * modifier)),
      );
    };
    const cleanup = () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
      window.removeEventListener("pointercancel", handlePointerUp);
      document.body.classList.remove("powdoo-cursor-resize");
      dragCleanupRef.current = null;
    };
    const handlePointerUp = () => {
      suppressClickRef.current = dragged;
      cleanup();
    };

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp);
    window.addEventListener("pointercancel", handlePointerUp);
    dragCleanupRef.current = cleanup;
  };

  return (
    <input
      className="animation-panel__draggable-number"
      type="number"
      step={step}
      min={min}
      max={max}
      aria-label={ariaLabel}
      value={value}
      onPointerDown={beginDrag}
      onClick={(event) => {
        if (suppressClickRef.current) {
          event.preventDefault();
          suppressClickRef.current = false;
        }
      }}
      onDoubleClick={(event) => event.currentTarget.select()}
      onChange={(event) => {
        const nextValue = Number(event.target.value);
        if (Number.isFinite(nextValue)) {
          onValueChange(nextValue);
        }
      }}
    />
  );
};

const EASING_PRESETS: ReadonlyArray<{
  value: AnimationEasingPresetName;
  label: string;
}> = [
  { value: "linear", label: "线性" },
  { value: "ease", label: "标准缓动" },
  { value: "ease-in", label: "缓入" },
  { value: "ease-out", label: "缓出" },
  { value: "ease-in-out", label: "缓入缓出" },
  { value: "smooth", label: "平滑" },
  { value: "sharp", label: "锐利" },
  { value: "bounce", label: "弹跳" },
  { value: "back-in", label: "回拉进入" },
  { value: "back-out", label: "回拉退出" },
  { value: "back-in-out", label: "双向回拉" },
];

const EASING_BEZIER_VALUES: Record<
  AnimationEasingPresetName,
  [number, number, number, number]
> = {
  linear: [0, 0, 1, 1],
  ease: [0.25, 0.1, 0.25, 1],
  "ease-in": [0.42, 0, 1, 1],
  "ease-out": [0, 0, 0.58, 1],
  "ease-in-out": [0.42, 0, 0.58, 1],
  smooth: [0.22, 1, 0.36, 1],
  sharp: [0.4, 0, 0.6, 1],
  bounce: [0.34, 1.56, 0.64, 1],
  "back-in": [0.36, 0, 0.66, -0.56],
  "back-out": [0.34, 1.56, 0.64, 1],
  "back-in-out": [0.68, -0.6, 0.32, 1.6],
};

const easingToBezier = (
  easing: AnimationEasing | undefined,
): [number, number, number, number] =>
  easing?.type === "cubic-bezier"
    ? [easing.x1, easing.y1, easing.x2, easing.y2]
    : easing?.type === "preset"
    ? EASING_BEZIER_VALUES[easing.name]
    : EASING_BEZIER_VALUES.ease;

const EasingEditor = ({
  trackName,
  propertyName,
  fromAtMs,
  toAtMs,
  easing,
  deleted,
  onChange,
  onDelete,
  onClose,
}: {
  trackName: string;
  propertyName: string;
  fromAtMs: number;
  toAtMs: number;
  easing?: AnimationEasing;
  deleted: boolean;
  onChange: (easing: AnimationEasing) => void;
  onDelete: () => void;
  onClose: () => void;
}) => {
  const [draftEasing, setDraftEasing] = useState<AnimationEasing>(
    easing ?? { type: "preset", name: "ease" },
  );
  useEffect(() => {
    setDraftEasing(easing ?? { type: "preset", name: "ease" });
  }, [easing, fromAtMs, propertyName, toAtMs, trackName]);

  const bezier = easingToBezier(draftEasing);
  const mode = draftEasing.type === "preset" ? draftEasing.name : "custom";
  const updateBezierValue = (index: number, value: number) => {
    const next = [...bezier] as [number, number, number, number];
    next[index] = value;
    setDraftEasing({
      type: "cubic-bezier",
      x1: next[0],
      y1: next[1],
      x2: next[2],
      y2: next[3],
    });
  };

  return (
    <aside
      className="animation-panel__easing-editor"
      aria-label="动画函数编辑器"
    >
      <header>
        <div>
          <strong>贝塞尔曲线编辑器</strong>
          <span>
            {trackName} · {propertyName} · {formatRulerTime(fromAtMs)}–
            {formatRulerTime(toAtMs)}
          </span>
        </div>
        <button type="button" aria-label="关闭动画函数编辑器" onClick={onClose}>
          ×
        </button>
      </header>

      {deleted && (
        <p className="animation-panel__easing-deleted">
          该段已删除，数值将在终点直接跳变。
        </p>
      )}

      <label className="animation-panel__easing-preset">
        <span>预设曲线</span>
        <div className="animation-panel__easing-select">
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M4 18c4 0 4-12 8-12s4 8 8 8" />
          </svg>
          <select
            aria-label="动画函数预设"
            value={mode}
            onChange={(event) => {
              if (event.target.value === "custom") {
                setDraftEasing({
                  type: "cubic-bezier",
                  x1: bezier[0],
                  y1: bezier[1],
                  x2: bezier[2],
                  y2: bezier[3],
                });
                return;
              }
              setDraftEasing({
                type: "preset",
                name: event.target.value as AnimationEasingPresetName,
              });
            }}
          >
            {EASING_PRESETS.map((preset) => (
              <option value={preset.value} key={preset.value}>
                {preset.label}
              </option>
            ))}
            <option value="custom">自定义贝塞尔</option>
          </select>
        </div>
      </label>

      <BezierCurveEditor
        value={bezier}
        onChange={(value) =>
          setDraftEasing({
            type: "cubic-bezier",
            x1: value[0],
            y1: value[1],
            x2: value[2],
            y2: value[3],
          })
        }
      />

      <div className="animation-panel__bezier-values">
        {(["X1", "Y1", "X2", "Y2"] as const).map((label, index) => (
          <label key={label}>
            <span>{label}</span>
            <DraggableNumberInput
              value={formatParameterValue(bezier[index])}
              step={0.01}
              min={label.startsWith("X") ? 0 : -2}
              max={label.startsWith("X") ? 1 : 2}
              ariaLabel={`贝塞尔曲线 ${label}`}
              onValueChange={(value) => updateBezierValue(index, value)}
            />
          </label>
        ))}
      </div>

      <footer>
        <div className="animation-panel__easing-footer-start">
          <button
            type="button"
            onClick={() =>
              setDraftEasing(easing ?? { type: "preset", name: "ease" })
            }
          >
            ↶ 重置
          </button>
          {deleted ? (
            <button
              type="button"
              className="animation-panel__restore-segment"
              onClick={() => onChange(draftEasing)}
            >
              恢复连线
            </button>
          ) : (
            <button
              type="button"
              className="animation-panel__delete-segment"
              onClick={onDelete}
            >
              删除连线
            </button>
          )}
        </div>
        <div className="animation-panel__easing-footer-end">
          <button type="button" onClick={onClose}>
            取消
          </button>
          <button
            type="button"
            className="animation-panel__apply-easing"
            onClick={() => {
              onChange(draftEasing);
              onClose();
            }}
          >
            应用
          </button>
        </div>
      </footer>
    </aside>
  );
};

const BezierCurveEditor = ({
  value,
  onChange,
}: {
  value: [number, number, number, number];
  onChange: (value: [number, number, number, number]) => void;
}) => {
  const svgRef = useRef<SVGSVGElement | null>(null);
  const dragCleanupRef = useRef<(() => void) | null>(null);
  const [x1, y1, x2, y2] = value;
  const viewBoxWidth = 360;
  const viewBoxHeight = 220;
  const left = 38;
  const right = 338;
  const top = 18;
  const bottom = 190;
  const width = right - left;
  const height = bottom - top;
  const minY = Math.min(0, y1, y2);
  const maxY = Math.max(1, y1, y2);
  const yTicks = [minY, (minY + maxY) / 2, maxY];
  const pointX = (x: number) => left + x * width;
  const pointY = (y: number) => top + ((maxY - y) / (maxY - minY)) * height;
  const start = { x: left, y: pointY(0) };
  const end = { x: right, y: pointY(1) };
  const control1 = { x: pointX(x1), y: pointY(y1) };
  const control2 = { x: pointX(x2), y: pointY(y2) };

  useEffect(() => () => dragCleanupRef.current?.(), []);

  const beginHandleDrag = (
    event: React.PointerEvent<SVGCircleElement>,
    handle: 0 | 1,
  ) => {
    event.preventDefault();
    event.stopPropagation();
    dragCleanupRef.current?.();
    const handlePointerMove = (pointerEvent: PointerEvent) => {
      const bounds = svgRef.current?.getBoundingClientRect();
      if (!bounds?.width || !bounds.height) {
        return;
      }
      const viewX =
        ((pointerEvent.clientX - bounds.left) / bounds.width) * viewBoxWidth;
      const viewY =
        ((pointerEvent.clientY - bounds.top) / bounds.height) * viewBoxHeight;
      const x = Math.max(0, Math.min(1, (viewX - left) / width));
      const y = Math.max(
        minY,
        Math.min(maxY, maxY - ((viewY - top) / height) * (maxY - minY)),
      );
      const next = [...value] as [number, number, number, number];
      next[handle * 2] = formatParameterValue(x);
      next[handle * 2 + 1] = formatParameterValue(y);
      onChange(next);
    };
    const cleanup = () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", cleanup);
      window.removeEventListener("pointercancel", cleanup);
      dragCleanupRef.current = null;
    };
    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", cleanup);
    window.addEventListener("pointercancel", cleanup);
    dragCleanupRef.current = cleanup;
  };

  return (
    <svg
      ref={svgRef}
      className="animation-panel__bezier-curve"
      viewBox={`0 0 ${viewBoxWidth} ${viewBoxHeight}`}
      role="img"
      aria-label="贝塞尔动画曲线"
    >
      {yTicks.map((value) => (
        <line
          className="is-grid"
          x1={left}
          y1={pointY(value)}
          x2={right}
          y2={pointY(value)}
          key={`grid-y-${formatParameterValue(value)}`}
        />
      ))}
      {[0, 0.5, 1].map((value) => (
        <line
          className="is-grid"
          x1={pointX(value)}
          y1={top}
          x2={pointX(value)}
          y2={bottom}
          key={`grid-x-${value}`}
        />
      ))}
      <line className="is-axis" x1={left} y1={top} x2={left} y2={bottom} />
      <line
        className="is-axis"
        x1={left}
        y1={pointY(0)}
        x2={right}
        y2={pointY(0)}
      />
      <path
        className="is-curve-fill"
        d={`M ${start.x} ${start.y} C ${control1.x} ${control1.y}, ${
          control2.x
        } ${control2.y}, ${end.x} ${end.y} L ${right} ${pointY(0)} Z`}
      />
      <line
        className="is-handle"
        x1={start.x}
        y1={start.y}
        x2={control1.x}
        y2={control1.y}
      />
      <line
        className="is-handle"
        x1={end.x}
        y1={end.y}
        x2={control2.x}
        y2={control2.y}
      />
      <path
        className="is-curve"
        d={`M ${start.x} ${start.y} C ${control1.x} ${control1.y}, ${control2.x} ${control2.y}, ${end.x} ${end.y}`}
      />
      <circle className="is-endpoint" cx={start.x} cy={start.y} r="5" />
      <circle className="is-endpoint" cx={end.x} cy={end.y} r="5" />
      <circle
        className="is-control"
        cx={control1.x}
        cy={control1.y}
        r="7"
        aria-label="贝塞尔控制点 1"
        onPointerDown={(event) => beginHandleDrag(event, 0)}
      />
      <circle
        className="is-control"
        cx={control2.x}
        cy={control2.y}
        r="7"
        aria-label="贝塞尔控制点 2"
        onPointerDown={(event) => beginHandleDrag(event, 1)}
      />
      {[0, 0.5, 1].map((value) => (
        <text
          className="is-axis-label"
          x={pointX(value)}
          y={211}
          textAnchor="middle"
          key={`label-x-${value}`}
        >
          {value}
        </text>
      ))}
      {yTicks.map((value) => (
        <text
          className="is-axis-label"
          x={28}
          y={pointY(value) + 4}
          textAnchor="end"
          key={`label-y-${formatParameterValue(value)}`}
        >
          {formatParameterValue(value)}
        </text>
      ))}
      <text className="is-axis-name" x={348} y={211} textAnchor="end">
        X
      </text>
      <text className="is-axis-name" x={28} y={12} textAnchor="end">
        Y
      </text>
    </svg>
  );
};

const PropertyValueEditor = ({
  project,
  track,
  property,
  projectTimeMs,
  onProjectChange,
  element,
}: {
  project: AnimationProject;
  track: AnimationTrack;
  property: TimelinePropertyName;
  projectTimeMs: number;
  onProjectChange: (project: AnimationProject) => void;
  element?: NonDeletedExcalidrawElement;
}) => {
  const layerName = getLayerName(track);
  const updateNumericValue = (
    propertyName: NumericAnimationPropertyName,
    value: number,
  ) => {
    if (Number.isFinite(value)) {
      onProjectChange(
        setNumericKeyframe(
          project,
          track.id,
          propertyName,
          projectTimeMs,
          value,
        ),
      );
    }
  };

  if (
    property === POSITION_PATH_PROPERTY ||
    property === CAMERA_POSITION_PROPERTY
  ) {
    const [xProperty, yProperty] =
      property === POSITION_PATH_PROPERTY
        ? (["transform.x", "transform.y"] as const)
        : (["camera.centerX", "camera.centerY"] as const);
    return (
      <span className="animation-panel__property-values is-position">
        {(
          [
            ["X", xProperty],
            ["Y", yProperty],
          ] as const
        ).map(([axis, propertyName]) => (
          <label key={propertyName}>
            <span>{axis}</span>
            <DraggableNumberInput
              step={1}
              ariaLabel={`${layerName}${PROPERTY_LABELS[property]} ${axis}`}
              value={formatParameterValue(
                getNumericPropertyValue(
                  project,
                  track,
                  propertyName,
                  projectTimeMs,
                ),
              )}
              onValueChange={(value) => updateNumericValue(propertyName, value)}
            />
          </label>
        ))}
      </span>
    );
  }

  const numericConfig = NUMERIC_VALUE_CONFIG[property];
  if (numericConfig) {
    const numericProperty =
      numericConfig.property as NumericAnimationPropertyName;
    const animated = track.properties?.some(
      (candidate) => candidate.property === numericProperty,
    );
    const elementFallback = getElementNumericPropertyValue(
      element,
      numericProperty,
    );
    const value = animated
      ? getNumericPropertyValue(project, track, numericProperty, projectTimeMs)
      : elementFallback ??
        getNumericPropertyValue(project, track, numericProperty, projectTimeMs);
    const multiplier = numericConfig.multiplier ?? 1;
    return (
      <label className="animation-panel__property-values is-single">
        <DraggableNumberInput
          step={multiplier === 100 ? 1 : 0.1}
          min={numericConfig.min}
          max={numericConfig.max}
          ariaLabel={`${layerName}${PROPERTY_LABELS[property]}数值`}
          value={formatParameterValue(value * multiplier)}
          onValueChange={(value) =>
            updateNumericValue(
              numericConfig.property as NumericAnimationPropertyName,
              value / multiplier,
            )
          }
        />
        {numericConfig.unit && <span>{numericConfig.unit}</span>}
      </label>
    );
  }

  if (
    property === "visual.backgroundColor" ||
    property === "visual.strokeColor" ||
    property === "transition.color"
  ) {
    const fallback =
      property === "visual.strokeColor"
        ? element?.strokeColor ?? "#000000FF"
        : property === "visual.backgroundColor"
        ? element?.backgroundColor ?? "#00000000"
        : "#FFFFFFFF";
    const value = getColorPropertyValue(
      track,
      property,
      projectTimeMs,
      project,
      fallback,
    );
    const htmlColor = normalizeParameterColor(value);
    return (
      <span className="animation-panel__property-values is-color">
        <input
          type="color"
          aria-label={`${layerName}${PROPERTY_LABELS[property]}数值`}
          value={htmlColor.slice(0, 7)}
          onChange={(event) =>
            onProjectChange(
              setColorKeyframe(
                project,
                track.id,
                property,
                projectTimeMs,
                `${event.target.value.toUpperCase()}FF`,
              ),
            )
          }
        />
        <output>
          {htmlColor.endsWith("00") ? "透明" : htmlColor.slice(0, 7)}
        </output>
      </span>
    );
  }

  if (property === "visual.fillStyle") {
    const value = getFillStylePropertyValue(
      track,
      projectTimeMs,
      project,
      element?.fillStyle ?? "hachure",
    );
    return (
      <VisualPropertyOptions
        group={`${track.id}-${property}`}
        value={value}
        options={[
          { value: "hachure", text: "斜线", icon: FillHachureIcon },
          { value: "cross-hatch", text: "交叉线", icon: FillCrossHatchIcon },
          { value: "solid", text: "纯色", icon: FillSolidIcon },
          { value: "zigzag", text: "锯齿线", icon: FillZigZagIcon },
        ]}
        onChange={(nextValue) =>
          onProjectChange(
            setFillStyleKeyframe(
              project,
              track.id,
              projectTimeMs,
              nextValue as AnimationFillStyle,
            ),
          )
        }
      />
    );
  }

  if (property === "visual.strokeWidth") {
    const value = getNumericOrElementValue(
      project,
      track,
      property,
      projectTimeMs,
      element,
    );
    return (
      <VisualPropertyOptions
        group={`${track.id}-${property}`}
        value={closestOption(value, [1, 2, 4])}
        options={[
          { value: 1, text: "细", icon: StrokeWidthBaseIcon },
          { value: 2, text: "中", icon: StrokeWidthBoldIcon },
          { value: 4, text: "粗", icon: StrokeWidthExtraBoldIcon },
        ]}
        onChange={(nextValue) => updateNumericValue(property, nextValue)}
      />
    );
  }

  if (property === "visual.roughness") {
    const value = getDiscreteStylePropertyValue(
      track,
      property,
      projectTimeMs,
      project,
      element?.roughness ?? 1,
    );
    return (
      <VisualPropertyOptions
        group={`${track.id}-${property}`}
        value={closestOption(value, [0, 1, 2])}
        options={[
          { value: 0, text: "建筑师", icon: SloppinessArchitectIcon },
          { value: 1, text: "艺术家", icon: SloppinessArtistIcon },
          { value: 2, text: "漫画家", icon: SloppinessCartoonistIcon },
        ]}
        onChange={(nextValue) =>
          onProjectChange(
            setDiscreteStyleKeyframe(
              project,
              track.id,
              property,
              projectTimeMs,
              nextValue,
            ),
          )
        }
      />
    );
  }

  if (property === "text.fontSize") {
    const value = getNumericOrElementValue(
      project,
      track,
      property,
      projectTimeMs,
      element,
    );
    return (
      <VisualPropertyOptions
        group={`${track.id}-${property}`}
        value={closestOption(value, [16, 20, 28, 36])}
        options={[
          { value: 16, text: "小", icon: FontSizeSmallIcon },
          { value: 20, text: "中", icon: FontSizeMediumIcon },
          { value: 28, text: "大", icon: FontSizeLargeIcon },
          { value: 36, text: "特大", icon: FontSizeExtraLargeIcon },
        ]}
        onChange={(nextValue) => updateNumericValue(property, nextValue)}
      />
    );
  }

  if (property === "text.fontFamily") {
    const value = getNumericOrElementValue(
      project,
      track,
      property,
      projectTimeMs,
      element,
    );
    return (
      <VisualPropertyOptions
        group={`${track.id}-${property}`}
        value={closestOption(value, [1, 2, 3, 5])}
        options={[
          {
            value: 1,
            text: "手写体",
            icon: <span className="is-font-preview is-hand">Aa</span>,
          },
          {
            value: 2,
            text: "无衬线",
            icon: <span className="is-font-preview is-sans">Aa</span>,
          },
          {
            value: 3,
            text: "等宽体",
            icon: <span className="is-font-preview is-mono">Aa</span>,
          },
          {
            value: 5,
            text: "Excalifont",
            icon: <span className="is-font-preview is-excalifont">Aa</span>,
          },
        ]}
        onChange={(nextValue) =>
          onProjectChange(
            setDiscreteStyleKeyframe(
              project,
              track.id,
              property,
              projectTimeMs,
              nextValue,
            ),
          )
        }
      />
    );
  }

  if (
    property === "visual.strokeStyle" ||
    property === "visual.roundness" ||
    property === "text.textAlign" ||
    property === "text.verticalAlign"
  ) {
    const config = getDiscreteStyleOptions(property);
    const fallback =
      getElementDiscretePropertyValue(element, property) ??
      config.options[0].value;
    const value = getDiscreteStylePropertyValue(
      track,
      property,
      projectTimeMs,
      project,
      fallback as never,
    );
    return (
      <VisualPropertyOptions
        group={`${track.id}-${property}`}
        value={value}
        options={config.options as any}
        onChange={(nextValue) =>
          onProjectChange(
            setDiscreteStyleKeyframe(
              project,
              track.id,
              property,
              projectTimeMs,
              nextValue as never,
            ),
          )
        }
      />
    );
  }

  if (property === "element.visibility") {
    const value = getVisibilityPropertyValue(track, projectTimeMs, project);
    return (
      <VisualPropertyOptions
        group={`${track.id}-${property}`}
        value={value}
        options={[
          { value: "visible", text: "显示", icon: <VisibilityIcon /> },
          { value: "hidden", text: "隐藏", icon: <VisibilityIcon hidden /> },
        ]}
        onChange={(nextValue) =>
          onProjectChange(
            setVisibilityKeyframe(
              project,
              track.id,
              projectTimeMs,
              nextValue as ElementVisibility,
            ),
          )
        }
      />
    );
  }

  const discreteValue = getDiscretePropertyValue(
    project,
    track,
    property,
    projectTimeMs,
  );
  return discreteValue ? (
    <output className="animation-panel__property-values is-readonly">
      {discreteValue}
    </output>
  ) : null;
};

const formatParameterValue = (value: number) =>
  Math.round((value + Number.EPSILON) * 100) / 100;

const normalizeParameterColor = (value: string) => {
  if (value === "transparent") {
    return "#00000000";
  }
  if (/^#[0-9a-f]{6}$/i.test(value)) {
    return `${value.toUpperCase()}FF`;
  }
  if (/^#[0-9a-f]{8}$/i.test(value)) {
    return value.toUpperCase();
  }
  return "#00000000";
};

const getDiscretePropertyValue = (
  project: AnimationProject,
  track: AnimationTrack,
  propertyName: TimelinePropertyName,
  projectTimeMs: number,
) => {
  const relativeTimeMs = Math.max(
    0,
    projectTimeMs - getTrackAbsoluteStartMs(project, track),
  );
  const property = track.properties?.find(
    (candidate) => candidate.property === propertyName,
  );
  const keyframe = [...(property?.keyframes ?? [])]
    .sort((left, right) => left.atMs - right.atMs)
    .reverse()
    .find((candidate) => candidate.atMs <= relativeTimeMs);
  const value = keyframe?.value;
  if (propertyName === "advanced.path" && value && typeof value === "object") {
    if ("points" in value && Array.isArray(value.points)) {
      return `${value.points.length} 个点`;
    }
    if ("segments" in value && Array.isArray(value.segments)) {
      return `${value.segments.length} 段`;
    }
    return "SVG 路径";
  }
  if (
    propertyName === "advanced.shadow" &&
    value &&
    typeof value === "object"
  ) {
    return `X ${"offsetX" in value ? value.offsetX : 0}  Y ${
      "offsetY" in value ? value.offsetY : 0
    }`;
  }
  return undefined;
};

const Playhead = (_props: { currentTimeMs: number; durationMs: number }) => (
  <i className="animation-panel__lane-playhead" aria-hidden="true" />
);

const getTimelinePlayheadPositionStyle = (
  timeMs: number,
  pixelsPerSecond: number,
): React.CSSProperties =>
  ({
    "--animation-panel-playhead-position": `${
      (timeMs / 1000) * pixelsPerSecond
    }px`,
  } as React.CSSProperties);

const getTimelineMarkerPositionStyle = (
  timeMs: number,
  pixelsPerSecond: number,
): React.CSSProperties =>
  ({
    "--animation-panel-marker-position": `${
      (timeMs / 1000) * pixelsPerSecond
    }px`,
  } as React.CSSProperties);

const getTimelineSegmentPositionStyle = (
  fromTimeMs: number,
  toTimeMs: number,
  pixelsPerSecond: number,
): React.CSSProperties =>
  ({
    "--animation-panel-segment-start-position": `${
      (fromTimeMs / 1000) * pixelsPerSecond
    }px`,
    "--animation-panel-segment-end-position": `${
      (toTimeMs / 1000) * pixelsPerSecond
    }px`,
  } as React.CSSProperties);

const isEditableProperty = (
  property: TimelinePropertyName,
): property is EditableAnimationPropertyName =>
  EDITABLE_ANIMATION_PROPERTIES.some((candidate) => candidate === property);

const isPositionProperty = (
  property: AnimationPropertyName,
): property is "transform.x" | "transform.y" =>
  property === "transform.x" || property === "transform.y";

const seekTimelineFromPointer = (
  lane: HTMLElement,
  clientX: number,
  durationMs: number,
  snapStepMs: number,
  pixelsPerSecond: number,
  magneticTargets: readonly number[],
  frameMs: number,
  precisionMode: boolean,
  seek: (timeMs: number) => void,
) => {
  const bounds = lane.getBoundingClientRect();
  if (bounds.width <= 0) {
    return;
  }
  const rawTimeMs = Math.max(
    0,
    Math.min(durationMs, ((clientX - bounds.left) / bounds.width) * durationMs),
  );
  seek(
    Math.min(
      durationMs,
      snapTimelineTime(
        rawTimeMs,
        snapStepMs,
        pixelsPerSecond,
        magneticTargets,
        frameMs,
        precisionMode,
      ),
    ),
  );
};
