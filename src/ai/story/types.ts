import type { ExcalidrawElementSkeleton } from "@excalidraw/element";
import type {
  ExcalidrawElement,
  ExcalidrawSelectionElement,
} from "@excalidraw/element/types";

import type {
  AnimationPreset,
  AnimationProject,
  AnimationProperty,
  AnimationTransitionDirection,
  AnimationTransitionEffect,
} from "../../animation/types";

export type CanvasElementStyle = {
  strokeColor?: string;
  backgroundColor?: string;
  fillStyle?: "hachure" | "cross-hatch" | "solid" | "zigzag";
  strokeWidth?: number;
  roughness?: number;
  strokeStyle?: "solid" | "dashed" | "dotted";
  roundness?: "sharp" | "round";
  opacity?: number;
  fontSize?: number;
  fontFamily?: number;
  textAlign?: "left" | "center" | "right";
  verticalAlign?: "top" | "middle" | "bottom";
};

export type StoryBeat = {
  id: string;
  title: string;
  description?: string;
  /** Chapters in one space retain meaningful relative positions. */
  spaceId: string;
  /** Relationship from the previous chapter. The first chapter is new-page. */
  relationFromPrevious: "same-space" | "new-page";
  /** User-visible explanation for the AI director decision. */
  relationReason: string;
  elementIds: string[];
};

export type StoryMotionTone =
  | "restrained"
  | "natural"
  | "energetic"
  | "playful";

export type StoryMotionPace = "slow" | "normal" | "fast";

export type StoryMotionCharacter =
  | "precise"
  | "gentle"
  | "snappy"
  | "heavy"
  | "elastic"
  | "dramatic";

export type StoryAnimationCameraPlan = {
  framing: "wide" | "fit" | "medium" | "close";
  transition:
    | "hold"
    | "cut"
    | "reframe"
    | "pan"
    | "whip-pan"
    | "push-in"
    | "pull-out";
  transitionDurationMs?: number;
  motion?: StoryMotionCharacter;
  zoomMotion?: StoryMotionCharacter;
  travelZoomRatio?: number;
  padding?: number;
  offsetX?: number;
  offsetY?: number;
};

export type StoryChapterTransitionPlan = {
  /** Incoming transition ending at this scene's startMs. */
  effect: AnimationTransitionEffect;
  durationMs: number;
  direction?: AnimationTransitionDirection;
  color?: string;
  backgroundColor?: string;
};

export type StoryAnimationCue = {
  id: string;
  type: "enter" | "emphasize" | "exit" | "draw" | "style";
  targets: string[];
  /** Time relative to the containing scene. */
  atMs: number;
  durationMs?: number;
  effect:
    | "fade"
    | "slide"
    | "scale"
    | "pop"
    | "pulse"
    | "highlight"
    | "shake"
    | "bounce"
    | "style";
  direction?: "left" | "right" | "up" | "down";
  distance?: number;
  staggerMs?: number;
  motion?: StoryMotionCharacter;
  count?: number;
  color?: string;
  styleProperty?:
    | "visual.opacity"
    | "visual.strokeColor"
    | "visual.backgroundColor"
    | "visual.fillStyle"
    | "visual.strokeWidth"
    | "visual.strokeStyle"
    | "visual.roughness"
    | "visual.roundness"
    | "text.fontSize"
    | "text.fontFamily"
    | "text.textAlign"
    | "text.verticalAlign";
  styleValue?: string | number;
  fromStyleValue?: string | number;
};

export type StoryAnimationPlanScene = {
  id: string;
  beatId: string;
  startMs: number;
  durationMs: number;
  focusTargets: string[];
  camera?: StoryAnimationCameraPlan;
  transition?: StoryChapterTransitionPlan;
  cues: StoryAnimationCue[];
};

/** Planner-facing semantic DSL. It is never consumed by Motion directly. */
export type StoryAnimationPlan = {
  schemaVersion: "1.0";
  durationMs: number;
  rationale: string;
  summary: string;
  style: {
    tone: StoryMotionTone;
    pace: StoryMotionPace;
    reducedMotionFallback?: boolean;
  };
  scenes: StoryAnimationPlanScene[];
};

export type CanvasDraftElement = {
  id: string;
  /** Assigned deterministically from beat membership during canvas freeze. */
  spaceId?: string;
  storyScope?: "scene" | "master";
  type: "rectangle" | "ellipse" | "diamond" | "text";
  role?: string;
  label?: string;
  sectionId?: string;
  /** Stable local/preferred geometry used when a Section is re-materialized. */
  layoutFrame?: CanvasLayoutFrame;
  parentId?: string;
  layout?: CanvasChildLayout;
  x: number;
  y: number;
  width: number;
  height: number;
  style?: CanvasElementStyle;
};

export type CanvasChildLayout = {
  slot: "header" | "media" | "body" | "footer" | "badge" | "center";
  align?: "left" | "center" | "right" | "stretch";
  order?: number;
  padding?: number;
  gap?: number;
};

export type CanvasDraftConnector = {
  id: string;
  from: string;
  to: string;
  label?: string;
  role?: string;
  relationship?:
    | "process-flow"
    | "causal"
    | "dependency"
    | "hierarchy"
    | "data-flow";
  meaning?: string;
  style?: CanvasElementStyle;
};

export type CanvasDraftLibraryAsset = {
  id: string;
  spaceId?: string;
  storyScope?: "scene" | "master";
  ref: string;
  role?: string;
  sectionId?: string;
  layoutFrame?: CanvasLayoutFrame;
  parentId?: string;
  layout?: CanvasChildLayout;
  x: number;
  y: number;
  width: number;
  height: number;
  sourceWidth: number;
  sourceHeight: number;
  libraryName: string;
  itemName: string;
  elements: Exclude<ExcalidrawElement, ExcalidrawSelectionElement>[];
};

export type CanvasLayoutFrame = {
  x: number;
  y: number;
  width: number;
  height: number;
  fontSize?: number;
};

export type CanvasLayoutMode = "row" | "column" | "grid" | "overlay" | "free";

export type CanvasLayoutIntent = {
  mode: CanvasLayoutMode;
  columns?: number;
  gap?: number;
  padding?: number;
};

export type CanvasSpaceLayout = {
  spaceId: string;
  layout: Omit<CanvasLayoutIntent, "mode"> & {
    mode: "row" | "column" | "grid";
  };
};

export type CanvasLayoutSection = {
  id: string;
  spaceId: string;
  role?: string;
  order?: number;
  weight?: number;
  layout: CanvasLayoutIntent;
};

export type CanvasDraft = {
  schemaVersion: "1.0";
  id: string;
  title: string;
  summary: string;
  beats: StoryBeat[];
  spaceLayouts: CanvasSpaceLayout[];
  sections: CanvasLayoutSection[];
  elements: CanvasDraftElement[];
  libraryAssets: CanvasDraftLibraryAsset[];
  connectors: CanvasDraftConnector[];
};

export type StoryElementAnimationTrack = {
  id: string;
  /** Relative to the referenced scene when sceneId is present. */
  sceneId?: string;
  targetType?: "element";
  targetId: string;
  startMs: number;
  durationMs: number;
  presets?: AnimationPreset[];
  properties?: AnimationProperty[];
};

export type StoryCameraAnimationTrack = {
  id: string;
  targetType: "camera";
  targetId: "main";
  startMs: number;
  durationMs: number;
  properties: AnimationProperty[];
  presets?: never;
};

export type StoryTransitionAnimationTrack = {
  id: string;
  name: string;
  targetType: "transition";
  targetId: string;
  transitionId: string;
  layerId: string;
  fromSceneId: string;
  toSceneId: string;
  effect: AnimationTransitionEffect;
  direction?: AnimationTransitionDirection;
  role?: "exit" | "bridge" | "enter";
  startMs: number;
  durationMs: number;
  properties: AnimationProperty[];
  presets?: never;
};

export type StoryAnimationTrack =
  | StoryElementAnimationTrack
  | StoryCameraAnimationTrack
  | StoryTransitionAnimationTrack;

export type StoryAnimationDraft = {
  schemaVersion: "1.0";
  id: string;
  durationMs: number;
  frameRate: number;
  rationale: string;
  summary: string;
  /** Semantic source retained for inspection and deterministic recompilation. */
  plan?: StoryAnimationPlan;
  scenes?: Array<{
    id: string;
    name?: string;
    description?: string;
    startMs: number;
    durationMs: number;
  }>;
  tracks: StoryAnimationTrack[];
};

export type StoryArtifact = {
  kind: "story-artifact";
  artifactId: string;
  summary: string;
  canvas: CanvasDraft;
  animation: StoryAnimationDraft;
};

export type CompiledStory = {
  artifactId: string;
  elementIds: string[];
  elements: ExcalidrawElementSkeleton[];
  animation: AnimationProject;
};
