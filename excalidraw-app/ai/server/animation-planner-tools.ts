import { Type } from "@earendil-works/pi-ai";

import {
  compileStoryAnimationPlan,
  prepareStoryAnimationPlan,
  validateSceneLifecycleCueCoverage,
  validateStoryAnimationPlan,
} from "./animation-plan.ts";

import type { Static, TSchema } from "@earendil-works/pi-ai";

import type {
  CanvasDraft,
  StoryAnimationCameraPlan,
  StoryAnimationCue,
  StoryAnimationDraft,
  StoryAnimationPlan,
  StoryAnimationPlanScene,
  StoryChapterTransitionPlan,
  StoryMotionPace,
  StoryMotionTone,
} from "../../../src/ai/story/types";

type ToolResult = {
  content: Array<{ type: "text"; text: string }>;
  details?: unknown;
};

export type AnimationPlannerState = {
  schemaVersion: "1.0";
  durationMs: number | null;
  rationale: string;
  summary: string;
  style: StoryAnimationPlan["style"] | null;
  scenes: StoryAnimationPlanScene[];
  finalized: boolean;
  compiledDraft: StoryAnimationDraft | null;
};

type StyleProperty = NonNullable<StoryAnimationCue["styleProperty"]>;
type StyleTarget = { id: string; type?: string; parentId?: string };

const resultText = (text: string, details?: unknown): ToolResult => ({
  content: [{ type: "text", text }],
  ...(details ? { details } : {}),
});

const ANIMATION_TONE_LABELS: Record<StoryMotionTone, string> = {
  restrained: "克制",
  natural: "自然",
  energetic: "活力",
  playful: "活泼",
};
const ANIMATION_PACE_LABELS: Record<StoryMotionPace, string> = {
  slow: "舒缓",
  normal: "适中",
  fast: "明快",
};

const defineTool = <TSchemaType extends TSchema>(tool: {
  name: string;
  label: string;
  description: string;
  parameters: TSchemaType;
  executionMode: "sequential";
  execute: (id: string, params: Static<TSchemaType>) => Promise<ToolResult>;
}) => tool;

const requirePlanState = (
  state: AnimationPlannerState,
  summary = state.summary,
): StoryAnimationPlan => {
  if (!state.style || state.durationMs === null) {
    throw new Error("动画计划尚未定义 style 或 durationMs");
  }
  return {
    schemaVersion: "1.0",
    durationMs: state.durationMs,
    rationale: state.rationale,
    summary,
    style: state.style,
    scenes: state.scenes,
  };
};

const MIN_SCENE_READING_DURATION_MS = 3000;
const MIN_PAGE_TRANSITION_DURATION_MS = 2000;
const MIN_CAMERA_TRANSITION_DURATION_MS = 1600;
const MAX_ANIMATION_DURATION_MS = 120_000;

const motionCharacterSchema = Type.Union([
  Type.Literal("precise"),
  Type.Literal("gentle"),
  Type.Literal("snappy"),
  Type.Literal("heavy"),
  Type.Literal("elastic"),
  Type.Literal("dramatic"),
]);

const cameraSchema = Type.Object({
  framing: Type.Union([
    Type.Literal("wide"),
    Type.Literal("fit"),
    Type.Literal("medium"),
    Type.Literal("close"),
  ]),
  transition: Type.Union([
    Type.Literal("hold"),
    Type.Literal("cut"),
    Type.Literal("reframe"),
    Type.Literal("pan"),
    Type.Literal("whip-pan"),
    Type.Literal("push-in"),
    Type.Literal("pull-out"),
  ]),
  transitionDurationMs: Type.Optional(
    Type.Number({ minimum: 300, maximum: 5000 }),
  ),
  motion: Type.Optional(motionCharacterSchema),
  zoomMotion: Type.Optional(motionCharacterSchema),
  travelZoomRatio: Type.Optional(Type.Number({ minimum: 0.35, maximum: 0.9 })),
  padding: Type.Optional(Type.Number({ minimum: 24, maximum: 280 })),
  offsetX: Type.Optional(Type.Number({ minimum: -1000, maximum: 1000 })),
  offsetY: Type.Optional(Type.Number({ minimum: -1000, maximum: 1000 })),
});

const chapterTransitionSchema = Type.Object({
  effect: Type.Union([
    Type.Literal("camera"),
    Type.Literal("color-wipe"),
    Type.Literal("directional-wipe"),
    Type.Literal("fade-through-color"),
    Type.Literal("push"),
    Type.Literal("iris"),
  ]),
  durationMs: Type.Number({ minimum: 300, maximum: 5000 }),
  direction: Type.Optional(
    Type.Union([
      Type.Literal("left"),
      Type.Literal("right"),
      Type.Literal("up"),
      Type.Literal("down"),
    ]),
  ),
  origin: Type.Optional(
    Type.Union([
      Type.Literal("center"),
      Type.Literal("top-left"),
      Type.Literal("top-right"),
      Type.Literal("bottom-left"),
      Type.Literal("bottom-right"),
    ]),
  ),
  color: Type.Optional(Type.String({ minLength: 1, maxLength: 32 })),
  backgroundColor: Type.Optional(Type.String({ minLength: 1, maxLength: 32 })),
});

const stylePropertySchema = Type.Union([
  Type.Literal("visual.opacity"),
  Type.Literal("visual.strokeColor"),
  Type.Literal("visual.backgroundColor"),
  Type.Literal("visual.fillStyle"),
  Type.Literal("visual.strokeWidth"),
  Type.Literal("visual.strokeStyle"),
  Type.Literal("visual.roughness"),
  Type.Literal("visual.roundness"),
  Type.Literal("text.fontSize"),
  Type.Literal("text.fontFamily"),
  Type.Literal("text.textAlign"),
  Type.Literal("text.verticalAlign"),
]);

const styleValueSchema = Type.Union([Type.Number(), Type.String()]);

const cueSchema = Type.Object({
  id: Type.String({ minLength: 1, maxLength: 64 }),
  type: Type.Union([
    Type.Literal("enter"),
    Type.Literal("emphasize"),
    Type.Literal("exit"),
    Type.Literal("draw"),
    Type.Literal("style"),
  ]),
  targets: Type.Array(Type.String({ minLength: 1, maxLength: 64 }), {
    minItems: 1,
    maxItems: 80,
  }),
  atMs: Type.Number({ minimum: 0, maximum: 30_000 }),
  durationMs: Type.Optional(Type.Number({ minimum: 100, maximum: 30_000 })),
  effect: Type.Union([
    Type.Literal("fade"),
    Type.Literal("slide"),
    Type.Literal("scale"),
    Type.Literal("pop"),
    Type.Literal("pulse"),
    Type.Literal("highlight"),
    Type.Literal("shake"),
    Type.Literal("bounce"),
    Type.Literal("style"),
  ]),
  direction: Type.Optional(
    Type.Union([
      Type.Literal("left"),
      Type.Literal("right"),
      Type.Literal("up"),
      Type.Literal("down"),
    ]),
  ),
  distance: Type.Optional(Type.Number({ minimum: 1, maximum: 1000 })),
  staggerMs: Type.Optional(Type.Number({ minimum: 0, maximum: 2000 })),
  motion: Type.Optional(motionCharacterSchema),
  count: Type.Optional(Type.Number({ minimum: 1, maximum: 10 })),
  color: Type.Optional(Type.String({ minLength: 1, maxLength: 32 })),
  styleProperty: Type.Optional(stylePropertySchema),
  styleValue: Type.Optional(styleValueSchema),
  fromStyleValue: Type.Optional(styleValueSchema),
});

const repairCueSemantics = (
  cue: StoryAnimationCue,
  repairs: string[],
): void => {
  const effects = {
    enter: new Set(["fade", "slide", "scale", "pop"]),
    exit: new Set(["fade", "slide", "scale", "pop"]),
    emphasize: new Set(["pulse", "highlight", "shake", "bounce"]),
    draw: new Set(["fade"]),
    style: new Set(["style"]),
  };
  if (!effects[cue.type]?.has(cue.effect)) {
    const requestedEffect = cue.effect;
    cue.effect =
      cue.type === "emphasize"
        ? "pulse"
        : cue.type === "style"
        ? "style"
        : "fade";
    repairs.push(
      `Cue ${cue.id} 的 ${cue.type}/${requestedEffect} 组合无效，已改为 ${cue.effect}`,
    );
  }
};

const SHAPE_STYLE_PROPERTIES = [
  "visual.opacity",
  "visual.strokeColor",
  "visual.backgroundColor",
  "visual.fillStyle",
  "visual.strokeWidth",
  "visual.strokeStyle",
  "visual.roughness",
];

export const STYLE_PROPERTIES_BY_TARGET_TYPE = {
  rectangle: new Set([...SHAPE_STYLE_PROPERTIES, "visual.roundness"]),
  ellipse: new Set(SHAPE_STYLE_PROPERTIES),
  diamond: new Set([...SHAPE_STYLE_PROPERTIES, "visual.roundness"]),
  line: new Set([...SHAPE_STYLE_PROPERTIES, "visual.roundness"]),
  arrow: new Set([
    "visual.opacity",
    "visual.strokeColor",
    "visual.strokeWidth",
    "visual.strokeStyle",
    "visual.roughness",
  ]),
  freedraw: new Set([
    "visual.opacity",
    "visual.strokeColor",
    "visual.backgroundColor",
    "visual.fillStyle",
    "visual.strokeWidth",
  ]),
  text: new Set([
    "visual.opacity",
    "text.fontSize",
    "text.fontFamily",
    "text.textAlign",
  ]),
  connector: new Set([
    "visual.opacity",
    "visual.strokeColor",
    "visual.strokeWidth",
    "visual.strokeStyle",
    "visual.roughness",
  ]),
  image: new Set(["visual.opacity", "visual.roundness"]),
  iframe: new Set([
    "visual.opacity",
    "visual.backgroundColor",
    "visual.fillStyle",
    "visual.strokeWidth",
    "visual.strokeStyle",
    "visual.roughness",
    "visual.roundness",
  ]),
  embeddable: new Set([
    "visual.opacity",
    "visual.strokeColor",
    "visual.backgroundColor",
    "visual.fillStyle",
    "visual.strokeWidth",
    "visual.strokeStyle",
    "visual.roughness",
    "visual.roundness",
  ]),
  frame: new Set(["visual.opacity"]),
  magicframe: new Set(["visual.opacity"]),
  asset: new Set(["visual.opacity"]),
};

const getStyleTargetType = (
  target: StyleTarget,
  connectorIds: Set<string>,
  assetIds: Set<string>,
): keyof typeof STYLE_PROPERTIES_BY_TARGET_TYPE | undefined => {
  if (connectorIds.has(target.id)) {
    return "connector";
  }
  if (assetIds.has(target.id)) {
    return "asset";
  }
  return target.type as keyof typeof STYLE_PROPERTIES_BY_TARGET_TYPE;
};

const supportsStyleProperty = (
  target: StyleTarget,
  property: StyleProperty,
  connectorIds: Set<string>,
  assetIds: Set<string>,
): boolean => {
  const targetType = getStyleTargetType(target, connectorIds, assetIds);
  if (
    targetType === "text" &&
    property === "text.verticalAlign" &&
    target.parentId
  ) {
    // Connector labels materialize as bound arrow text. Excalidraw does not
    // expose vertical alignment for arrow-bound text.
    return !connectorIds.has(target.parentId);
  }
  return targetType
    ? STYLE_PROPERTIES_BY_TARGET_TYPE[targetType]?.has(property) ?? false
    : false;
};

const isValidStyleValue = (
  property: StyleProperty,
  value: unknown,
): boolean => {
  if (
    property === "visual.strokeColor" ||
    property === "visual.backgroundColor"
  ) {
    return typeof value === "string" && value.length > 0;
  }
  if (property === "visual.fillStyle") {
    return ["hachure", "cross-hatch", "solid", "zigzag"].some(
      (candidate) => candidate === value,
    );
  }
  if (property === "visual.strokeStyle") {
    return ["solid", "dashed", "dotted"].some(
      (candidate) => candidate === value,
    );
  }
  if (property === "visual.roundness") {
    return ["sharp", "round", 0, 1].some((candidate) => candidate === value);
  }
  if (property === "text.textAlign") {
    return ["left", "center", "right"].some((candidate) => candidate === value);
  }
  if (property === "text.verticalAlign") {
    return ["top", "middle", "bottom"].some((candidate) => candidate === value);
  }
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return false;
  }
  if (property === "visual.opacity") {
    return value >= 0 && value <= 1;
  }
  if (property === "visual.roughness") {
    return Number.isInteger(value) && value >= 0 && value <= 2;
  }
  if (property === "visual.strokeWidth") {
    return value >= 0;
  }
  if (property === "text.fontFamily") {
    return [1, 2, 3, 5].includes(value);
  }
  return value > 0;
};

const normalizeSceneCues = (
  scene: StoryAnimationPlanScene,
  cues: StoryAnimationCue[],
  canvasDraft: CanvasDraft,
): { cues: StoryAnimationCue[]; repairs: string[] } => {
  const targetIds = new Set([
    ...canvasDraft.elements.map((element) => element.id),
    ...(canvasDraft.libraryAssets || []).map((asset) => asset.id),
    ...canvasDraft.connectors.map((connector) => connector.id),
  ]);
  const connectorIds = new Set(
    canvasDraft.connectors.map((connector) => connector.id),
  );
  const assetIds = new Set(
    (canvasDraft.libraryAssets || []).map((asset) => asset.id),
  );
  const targetsById = new Map(
    [
      ...canvasDraft.elements,
      ...(canvasDraft.connectors || []),
      ...(canvasDraft.libraryAssets || []),
    ].map((target) => [target.id, target]),
  );
  const repairs: string[] = [];
  const normalized: StoryAnimationCue[] = [];
  const cueIds = new Set<string>();
  for (const rawCue of cues) {
    const cue = structuredClone(rawCue);
    repairCueSemantics(cue, repairs);
    if (cueIds.has(cue.id)) {
      const originalId = cue.id;
      let suffix = 2;
      const nextId = () =>
        `${originalId.slice(
          0,
          Math.max(1, 63 - String(suffix).length),
        )}-${suffix}`;
      while (cueIds.has(nextId())) {
        suffix += 1;
      }
      cue.id = nextId();
      repairs.push(`Cue id ${originalId} 重复，已改为 ${cue.id}`);
    }
    cueIds.add(cue.id);
    cue.targets = [...new Set(cue.targets)].filter((targetId) => {
      const exists = targetIds.has(targetId);
      if (!exists) {
        repairs.push(`Cue ${cue.id} 已移除不存在的目标 ${targetId}`);
      }
      return exists;
    });
    if (cue.type === "draw") {
      const previousTargetCount = cue.targets.length;
      cue.targets = cue.targets.filter((targetId) =>
        connectorIds.has(targetId),
      );
      if (cue.targets.length !== previousTargetCount) {
        repairs.push(`Draw Cue ${cue.id} 已移除非连接线目标`);
      }
    }
    if (
      cue.type === "style" &&
      (!cue.styleProperty || cue.styleValue === undefined)
    ) {
      repairs.push(`Style Cue ${cue.id} 缺少 styleProperty/styleValue，已跳过`);
      continue;
    }
    if (cue.type === "style") {
      const styleProperty = cue.styleProperty;
      if (!styleProperty || !isValidStyleValue(styleProperty, cue.styleValue)) {
        repairs.push(
          `Style Cue ${cue.id} 的 ${cue.styleProperty} 值无效，已跳过`,
        );
        continue;
      }
      if (
        cue.fromStyleValue !== undefined &&
        !isValidStyleValue(styleProperty, cue.fromStyleValue)
      ) {
        delete cue.fromStyleValue;
        repairs.push(
          `Style Cue ${cue.id} 的 fromStyleValue 无效，已改用画布当前值`,
        );
      }
      const previousTargetCount = cue.targets.length;
      cue.targets = cue.targets.filter((targetId) => {
        const target = targetsById.get(targetId);
        if (!target) {
          return false;
        }
        if (
          styleProperty === "visual.backgroundColor" &&
          "label" in target &&
          typeof target.label === "string" &&
          target.label.trim()
        ) {
          repairs.push(
            `Style Cue ${cue.id} 已移除带文字的背景色动画目标 ${targetId}，避免动画过程中出现低对比度文字`,
          );
          return false;
        }
        const supported = supportsStyleProperty(
          target,
          styleProperty,
          connectorIds,
          assetIds,
        );
        if (!supported) {
          repairs.push(
            `Style Cue ${cue.id} 已移除不支持 ${cue.styleProperty} 的目标 ${targetId}`,
          );
        }
        return supported;
      });
      if (cue.targets.length !== previousTargetCount) {
        cue.targets = [...new Set(cue.targets)];
      }
    }
    if (cue.targets.length === 0) {
      repairs.push(`Cue ${cue.id} 因没有有效目标已跳过`);
      continue;
    }
    const staggerTail =
      Math.max(0, cue.targets.length - 1) * (cue.staggerMs || 0);
    const availableDuration = scene.durationMs - cue.atMs - staggerTail;
    if (availableDuration < 100) {
      repairs.push(`Cue ${cue.id} 因超出场景时间范围已跳过`);
      continue;
    }
    const requestedDuration = cue.durationMs ?? 500;
    cue.durationMs = Math.min(requestedDuration, availableDuration);
    if (cue.durationMs !== requestedDuration) {
      repairs.push(`Cue ${cue.id} 时长已收缩为 ${cue.durationMs}ms`);
    }
    if (cue.effect === "highlight" && !cue.color) {
      cue.color = "#FFD43B88";
      repairs.push(`Cue ${cue.id} 已补充默认高亮颜色`);
    }
    if (cue.effect === "slide" && !cue.direction) {
      cue.direction = cue.type === "exit" ? "down" : "up";
      repairs.push(`Cue ${cue.id} 已补充默认滑动方向`);
    }
    normalized.push(cue);
  }
  return { cues: normalized, repairs };
};

const normalizeScenesForStorySpaces = (
  scenes: StoryAnimationPlanScene[],
  canvasDraft: CanvasDraft,
): { scenes: StoryAnimationPlanScene[]; repairs: string[] } => {
  const beatById = new Map(
    (canvasDraft.beats || []).map((beat) => [beat.id, beat]),
  );
  const hasSpaceContract = [...beatById.values()].every(
    (beat) =>
      typeof beat.spaceId === "string" &&
      (beat.relationFromPrevious === "same-space" ||
        beat.relationFromPrevious === "new-page"),
  );
  if (!hasSpaceContract) {
    return { scenes, repairs: [] };
  }
  const repairs: string[] = [];
  const normalized = scenes.map<StoryAnimationPlanScene>((scene, index) => {
    if (index === 0) {
      return { ...scene, transition: undefined };
    }
    const beat = beatById.get(scene.beatId);
    if (!beat) {
      return scene;
    }
    if (beat.relationFromPrevious === "same-space") {
      const transitionDurationMs = Math.max(
        MIN_CAMERA_TRANSITION_DURATION_MS,
        scene.transition?.durationMs ||
          scene.camera?.transitionDurationMs ||
          MIN_CAMERA_TRANSITION_DURATION_MS,
      );
      const camera: StoryAnimationCameraPlan = scene.camera
        ? {
            ...scene.camera,
            transition:
              scene.camera.transition === "hold"
                ? "reframe"
                : scene.camera.transition,
            transitionDurationMs,
          }
        : {
            framing: "fit",
            transition: "reframe",
            transitionDurationMs,
            motion: "gentle",
          };
      if (
        !scene.camera ||
        scene.transition?.effect !== "camera" ||
        scene.transition.durationMs < MIN_CAMERA_TRANSITION_DURATION_MS
      ) {
        repairs.push(`场景 ${scene.id} 根据 same-space 关系改为可编辑镜头漫游`);
      }
      return {
        ...scene,
        camera,
        transition: {
          effect: "camera",
          durationMs: transitionDurationMs,
        } as StoryChapterTransitionPlan,
      };
    }
    const requestedTransition = scene.transition;
    if (
      scene.camera ||
      !requestedTransition ||
      requestedTransition.effect === "camera"
    ) {
      repairs.push(`场景 ${scene.id} 根据 new-page 关系改为独立页面转场`);
    }
    return {
      ...scene,
      camera: undefined,
      transition: (requestedTransition &&
      requestedTransition.effect !== "camera"
        ? {
            ...requestedTransition,
            durationMs: Math.max(
              MIN_PAGE_TRANSITION_DURATION_MS,
              requestedTransition.durationMs,
            ),
          }
        : {
            effect: "directional-wipe",
            durationMs: Math.max(
              MIN_PAGE_TRANSITION_DURATION_MS,
              requestedTransition?.durationMs || 2200,
            ),
            direction: index % 2 === 0 ? "right" : "left",
          }) as StoryChapterTransitionPlan,
    };
  });
  return { scenes: normalized, repairs };
};

const ensureReadableSceneDurations = (
  scenes: StoryAnimationPlanScene[],
  currentDurationMs: number,
): {
  scenes: StoryAnimationPlanScene[];
  durationMs: number;
  repairs: string[];
} => {
  const repairs: string[] = [];
  let previousScene: StoryAnimationPlanScene | null = null;
  const normalized = scenes.map((scene) => {
    const durationMs = Math.max(
      MIN_SCENE_READING_DURATION_MS,
      scene.durationMs,
    );
    const cameraTransitionDurationMs =
      scene.camera && scene.camera.transition !== "cut"
        ? scene.camera.transitionDurationMs ?? 1200
        : 0;
    const boundaryDurationMs = Math.max(
      scene.transition?.durationMs || 0,
      cameraTransitionDurationMs,
    );
    const minimumStartMs = previousScene
      ? Math.max(
          previousScene.startMs + previousScene.durationMs,
          previousScene.startMs + boundaryDurationMs,
        )
      : 0;
    const startMs = previousScene
      ? Math.max(scene.startMs, minimumStartMs)
      : scene.startMs;

    if (durationMs !== scene.durationMs) {
      repairs.push(
        `场景 ${scene.id} 的阅读时间已从 ${scene.durationMs}ms 延长为 ${durationMs}ms`,
      );
    }
    if (startMs !== scene.startMs) {
      repairs.push(`场景 ${scene.id} 已顺延至 ${startMs}ms`);
    }

    const nextScene = { ...scene, startMs, durationMs };
    previousScene = nextScene;
    return nextScene;
  });
  const requiredDurationMs = Math.max(
    currentDurationMs,
    ...normalized.map((scene) => scene.startMs + scene.durationMs),
  );
  if (requiredDurationMs > MAX_ANIMATION_DURATION_MS) {
    throw new Error(
      `动画场景至少需要 ${MIN_SCENE_READING_DURATION_MS}ms 阅读时间，请减少场景数量或缩短已有长场景`,
    );
  }
  if (requiredDurationMs !== currentDurationMs) {
    repairs.push(`动画总时长已延长为 ${requiredDurationMs}ms`);
  }
  return { scenes: normalized, durationMs: requiredDurationMs, repairs };
};

const createAllAnimationPlannerTools = (
  canvasDraft: CanvasDraft,
  state: AnimationPlannerState,
  lockStoryPlan: boolean,
) => [
  defineTool({
    name: "define_animation_style",
    label: "定义动画风格与总节奏",
    description:
      "在规划场景之前定义故事总时长和全局运动语言。这里表达导演意图，不直接编写动画关键帧；所有说明必须使用中文。",
    parameters: Type.Object({
      durationMs: Type.Number({ minimum: 1000, maximum: 120_000 }),
      rationale: Type.String({ minLength: 1, maxLength: 1000 }),
      tone: Type.Union([
        Type.Literal("restrained"),
        Type.Literal("natural"),
        Type.Literal("energetic"),
        Type.Literal("playful"),
      ]),
      pace: Type.Union([
        Type.Literal("slow"),
        Type.Literal("normal"),
        Type.Literal("fast"),
      ]),
      reducedMotionFallback: Type.Optional(Type.Boolean()),
    }),
    executionMode: "sequential",
    async execute(_id, params) {
      state.durationMs = params.durationMs;
      state.rationale = params.rationale;
      state.style = {
        tone: params.tone,
        pace: params.pace,
        reducedMotionFallback: params.reducedMotionFallback ?? true,
      };
      state.scenes = [];
      state.compiledDraft = null;
      state.finalized = false;
      return resultText(
        `动画风格已定义为${ANIMATION_TONE_LABELS[params.tone]}、${
          ANIMATION_PACE_LABELS[params.pace]
        }，总时长 ${params.durationMs} 毫秒。`,
      );
    },
  }),
  defineTool({
    name: "define_animation_scenes",
    label: "规划动画场景与镜头",
    description:
      "规划有序的故事场景、时间、聚焦目标以及可编辑的章节转场。每个场景必须至少保留 3000ms 阅读时间；不要提供坐标或关键帧，所有场景说明必须使用中文。",
    parameters: Type.Object({
      scenes: Type.Array(
        Type.Object({
          id: Type.String({ minLength: 1, maxLength: 64 }),
          beatId: Type.String({ minLength: 1, maxLength: 64 }),
          startMs: Type.Number({ minimum: 0, maximum: 120_000 }),
          durationMs: Type.Number({ minimum: 300, maximum: 30_000 }),
          focusTargets: Type.Array(Type.String(), {
            minItems: 1,
            maxItems: 80,
          }),
          camera: Type.Optional(cameraSchema),
          transition: Type.Optional(chapterTransitionSchema),
        }),
        { minItems: 1, maxItems: 30 },
      ),
    }),
    executionMode: "sequential",
    async execute(_id, params) {
      if (!state.style || !state.durationMs) {
        throw new Error("必须先调用 define_animation_style");
      }
      const storySpaceResult = normalizeScenesForStorySpaces(
        params.scenes.map((scene) => ({ ...scene, cues: [] })),
        canvasDraft,
      );
      const readingTimeResult = ensureReadableSceneDurations(
        storySpaceResult.scenes,
        state.durationMs,
      );
      state.scenes = readingTimeResult.scenes;
      state.durationMs = readingTimeResult.durationMs;
      validateStoryAnimationPlan(
        requirePlanState(state, "planning"),
        canvasDraft,
      );
      const repairs = [
        ...storySpaceResult.repairs,
        ...readingTimeResult.repairs,
      ];
      return resultText(
        `已规划 ${state.scenes.length} 个动画场景。${
          repairs.length > 0 ? ` 已自动校正 ${repairs.length} 项场景时序。` : ""
        }`,
        repairs.length > 0
          ? {
              kind: "story-space-animation-repairs",
              repairs,
            }
          : undefined,
      );
    },
  }),
  defineTool({
    name: "define_scene_cues",
    label: "规划场景元素动作",
    description:
      "规划可编辑的对象动画层。除 enter、emphasize、exit、draw 外，外观变化使用 style 动作。严格遵守能力范围：rectangle/diamond 支持图形样式和 roundness；ellipse 不支持 roundness；line 支持背景、填充、描边、roughness 和 roundness；arrow 与画布连接线只支持 opacity、描边颜色、宽度、样式和 roughness；freedraw 支持 opacity、描边颜色、宽度、背景和填充，但不支持 strokeStyle、roughness、roundness；独立 text 只支持 opacity、fontSize、fontFamily、textAlign，不能使用图形样式，verticalAlign 仅适用于绑定到非箭头容器的文字；image 只支持 opacity 和 roundness；iframe/embeddable 遵循编辑器原生边框能力；frame/magicframe 和资源库条目只支持 opacity。无效的目标与属性组合会被移除。roundness 是连续属性，界面和智能体写入数值 0/1 端点，并像其他数值或 RGBA 颜色一样需要时长和缓动。fillStyle、strokeStyle、roughness、fontFamily、textAlign、verticalAlign、visibility 是离散状态，只在关键帧处切换，不使用缓动或连接段；roughness 的 0/1/2 是枚举值，不做数值插值。enter 会创建真实可见状态，exit 会在动作后隐藏元素，opacity 不能替代可见性。所有自然语言说明必须使用中文。",
    parameters: Type.Object({
      sceneId: Type.String({ minLength: 1, maxLength: 64 }),
      cues: Type.Array(cueSchema, { minItems: 1, maxItems: 100 }),
    }),
    executionMode: "sequential",
    async execute(_id, params) {
      const scene = state.scenes.find(
        (candidate) => candidate.id === params.sceneId,
      );
      if (!scene) {
        throw new Error(`找不到动画场景 ${params.sceneId}`);
      }
      const normalized = normalizeSceneCues(scene, params.cues, canvasDraft);
      const candidateScenes = state.scenes.map((candidate) =>
        candidate.id === scene.id
          ? { ...candidate, cues: normalized.cues }
          : candidate,
      );
      validateStoryAnimationPlan(
        { ...requirePlanState(state, "planning"), scenes: candidateScenes },
        canvasDraft,
      );
      state.scenes = candidateScenes;
      const sceneTitle =
        (canvasDraft.beats || []).find((beat) => beat.id === scene.beatId)
          ?.title || "当前场景";
      return resultText(
        `场景“${sceneTitle}”已规划 ${normalized.cues.length} 个语义动作。${
          normalized.repairs.length > 0
            ? ` 已自动修复 ${normalized.repairs.length} 项。`
            : ""
        }`,
        normalized.repairs.length > 0
          ? { kind: "animation-cue-repairs", repairs: normalized.repairs }
          : undefined,
      );
    },
  }),
  defineTool({
    name: "finalize_animation_plan",
    label: "编译并冻结动画计划",
    description:
      "校验完整的动画规划描述，并确定性编译为动画运行时使用的 AnimationProject 草稿。所有摘要和修复说明必须使用中文。",
    parameters: Type.Object({
      summary: Type.String({ minLength: 1, maxLength: 500 }),
    }),
    executionMode: "sequential",
    async execute(_id, params) {
      if (!lockStoryPlan) {
        state.summary = params.summary;
      }
      if (lockStoryPlan) {
        validateSceneLifecycleCueCoverage(requirePlanState(state), canvasDraft);
      }
      const prepared = prepareStoryAnimationPlan(
        requirePlanState(state),
        canvasDraft,
      );
      state.scenes = prepared.plan.scenes;
      const draft = compileStoryAnimationPlan(prepared.plan, canvasDraft, {
        repair: false,
      });
      const objectTrackCount = draft.tracks.filter(
        (track) =>
          track.targetType !== "transition" && track.targetType !== "camera",
      ).length;
      if (objectTrackCount === 0) {
        throw new Error("动画计划编译后没有任何对象动画轨道");
      }
      state.compiledDraft = draft;
      state.finalized = true;
      return resultText(
        `动画计划已编译：${state.scenes.length} 个场景，${
          draft.tracks.length
        } 条动画轨道。${
          prepared.repairs.length > 0
            ? ` 已自动修复 ${prepared.repairs.length} 项时间窗口冲突。`
            : ""
        }`,
        {
          kind: "animation-plan",
          sceneCount: state.scenes.length,
          trackCount: draft.tracks.length,
          objectTrackCount,
          durationMs: draft.durationMs,
          repairs: prepared.repairs,
        },
      );
    },
  }),
];

export const createAnimationPlannerTools = (
  canvasDraft: CanvasDraft,
  state: AnimationPlannerState,
  { lockStoryPlan = false }: { lockStoryPlan?: boolean } = {},
) => {
  const tools = createAllAnimationPlannerTools(
    canvasDraft,
    state,
    lockStoryPlan,
  );
  return lockStoryPlan
    ? tools.filter(
        (candidate) =>
          candidate.name === "define_scene_cues" ||
          candidate.name === "finalize_animation_plan",
      )
    : tools;
};
