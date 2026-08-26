import { deriveSceneLifecycles } from "../animation-plan.ts";

import type {
  StoryAnimationCue,
  StoryAnimationDraft,
  StoryAnimationPlan,
  StoryAnimationPlanScene,
  StoryDirectorContent,
  StoryDirectorPlan,
} from "../../../../src/ai/story/types.ts";
import type {
  AnimationTransitionDirection,
  AnimationTransitionEffect,
  AnimationTransitionOrigin,
} from "../../../../src/animation/types.ts";
import type { CanvasDraftState } from "./state.ts";

export type DirectorMotionPlan = Omit<StoryAnimationPlan, "schemaVersion"> & {
  content: StoryDirectorContent[];
};

type CueType = StoryAnimationCue["type"];
type CueEffect = StoryAnimationCue["effect"];
type StyleProperty = NonNullable<StoryAnimationCue["styleProperty"]>;
type ContentKind = StoryDirectorContent["kind"];
type PageTransitionEffect = Exclude<AnimationTransitionEffect, "camera">;
type RandomSource = () => number;

const DIRECTOR_ALLOWED_CUE_EFFECTS: Record<CueType, ReadonlySet<CueEffect>> = {
  enter: new Set(["fade", "slide", "scale", "pop"]),
  exit: new Set(["fade", "slide", "scale", "pop"]),
  emphasize: new Set(["pulse", "highlight", "shake", "bounce"]),
  draw: new Set(["fade"]),
  style: new Set(["style"]),
};

const DIRECTOR_DEFAULT_CUE_EFFECT: Record<CueType, CueEffect> = {
  enter: "fade",
  exit: "fade",
  emphasize: "pulse",
  draw: "fade",
  style: "style",
};

const DIRECTOR_DEFAULT_CUE_DURATION: Record<
  StoryAnimationPlan["style"]["pace"],
  number
> = {
  slow: 700,
  normal: 500,
  fast: 320,
};

const DIRECTOR_STYLE_PROPERTIES_BY_CONTENT_KIND: Record<
  ContentKind,
  ReadonlySet<StyleProperty>
> = {
  text: new Set([
    "visual.opacity",
    "text.fontSize",
    "text.fontFamily",
    "text.textAlign",
  ]),
  shape: new Set([
    "visual.opacity",
    "visual.strokeColor",
    "visual.backgroundColor",
    "visual.fillStyle",
    "visual.strokeWidth",
    "visual.strokeStyle",
    "visual.roughness",
    "visual.roundness",
  ]),
  visual: new Set(["visual.opacity"]),
  connector: new Set([
    "visual.opacity",
    "visual.strokeColor",
    "visual.strokeWidth",
    "visual.strokeStyle",
    "visual.roughness",
  ]),
};

const normalizeOptionalDirectorString = (value: unknown) => {
  const normalized = typeof value === "string" ? value.trim() : "";
  return normalized || undefined;
};

const parseDirectorNumber = (
  value: unknown,
  fallback: number,
  { time = false }: { time?: boolean } = {},
) => {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value !== "string") {
    return fallback;
  }
  const normalized = value.trim().toLowerCase().replaceAll(",", "");
  const match = normalized.match(/^(-?\d+(?:\.\d+)?)\s*(ms|s)?$/);
  if (!match) {
    return fallback;
  }
  const parsed = Number(match[1]);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }
  return time && match[2] === "s" ? parsed * 1000 : parsed;
};

const clampDirectorNumber = (value: number, minimum: number, maximum: number) =>
  Math.min(maximum, Math.max(minimum, value));

const PAGE_TRANSITION_EFFECTS: PageTransitionEffect[] = [
  "color-wipe",
  "directional-wipe",
  "fade-through-color",
  "push",
  "iris",
];
const PAGE_TRANSITION_DIRECTIONS: AnimationTransitionDirection[] = [
  "left",
  "right",
  "up",
  "down",
];
const IRIS_TRANSITION_ORIGINS: AnimationTransitionOrigin[] = [
  "center",
  "top-left",
  "top-right",
  "bottom-left",
  "bottom-right",
];
const MIN_PAGE_TRANSITION_DURATION_MS = 2000;
const MIN_CAMERA_TRANSITION_DURATION_MS = 1600;
const randomItem = <T>(items: readonly T[], random: RandomSource): T =>
  items[Math.min(items.length - 1, Math.floor(random() * items.length))];

export const selectRandomPageTransition = (
  random: RandomSource = Math.random,
  previousEffect: PageTransitionEffect | null = null,
) => {
  const effect = randomItem(
    PAGE_TRANSITION_EFFECTS.filter((candidate) => candidate !== previousEffect),
    random,
  );
  const direction = ["color-wipe", "directional-wipe", "push"].includes(effect)
    ? randomItem(PAGE_TRANSITION_DIRECTIONS, random)
    : undefined;
  const origin =
    effect === "iris" ? randomItem(IRIS_TRANSITION_ORIGINS, random) : undefined;
  return {
    effect,
    ...(direction ? { direction } : {}),
    ...(origin ? { origin } : {}),
  };
};

export const normalizeDirectorPlan = (
  state: CanvasDraftState,
  inputPlan: DirectorMotionPlan,
  random: RandomSource = Math.random,
) => {
  const story = state.story;
  if (!story) {
    throw new Error("必须先完成故事规划");
  }
  const plan = structuredClone(inputPlan);
  const repairs: string[] = [];
  const repair = (message: string) => repairs.push(message);

  const requestedDurationMs = plan.durationMs;
  plan.durationMs = Math.round(
    clampDirectorNumber(
      parseDirectorNumber(plan.durationMs, 3000, { time: true }),
      1000,
      120_000,
    ),
  );
  if (plan.durationMs !== requestedDurationMs) {
    repair(`故事总时长已解析并规范化为 ${plan.durationMs}ms`);
  }

  plan.content = plan.content.map((content) => {
    const normalized = {
      ...content,
      label: normalizeOptionalDirectorString(content.label),
      sectionId: normalizeOptionalDirectorString(content.sectionId),
      from: normalizeOptionalDirectorString(content.from),
      to: normalizeOptionalDirectorString(content.to),
    };
    if (content.label !== undefined && normalized.label === undefined) {
      repair(`内容 ${content.id} 的空 label 已按未设置处理`);
    }
    if (normalized.kind === "visual" && normalized.label !== undefined) {
      delete normalized.label;
      repair(`视觉内容 ${content.id} 的 label 已移除，避免与素材名称混淆`);
    }
    if (normalized.kind === "connector") {
      if (normalized.sectionId !== undefined) {
        delete normalized.sectionId;
        repair(`连接 ${content.id} 的 Section 声明已移除`);
      }
    } else {
      delete normalized.from;
      delete normalized.to;
    }
    for (const field of ["label", "sectionId", "from", "to"] as const) {
      if (normalized[field] === undefined) {
        delete normalized[field];
      }
    }
    return normalized;
  });

  plan.scenes = plan.scenes.map((scene, sceneIndex) => {
    const normalizedScene = structuredClone(scene);
    const requestedStartMs = normalizedScene.startMs;
    const requestedSceneDurationMs = normalizedScene.durationMs;
    normalizedScene.startMs = Math.round(
      clampDirectorNumber(
        parseDirectorNumber(normalizedScene.startMs, sceneIndex * 3000, {
          time: true,
        }),
        0,
        120_000,
      ),
    );
    normalizedScene.durationMs = Math.round(
      clampDirectorNumber(
        parseDirectorNumber(normalizedScene.durationMs, 3000, { time: true }),
        300,
        30_000,
      ),
    );
    if (
      normalizedScene.startMs !== requestedStartMs ||
      normalizedScene.durationMs !== requestedSceneDurationMs
    ) {
      repair(`场景 ${scene.id} 的时间字段已解析为毫秒数值`);
    }
    if (normalizedScene.camera) {
      const camera = normalizedScene.camera;
      if (camera.transitionDurationMs !== undefined) {
        camera.transitionDurationMs = Math.round(
          clampDirectorNumber(
            parseDirectorNumber(camera.transitionDurationMs, 900, {
              time: true,
            }),
            300,
            5000,
          ),
        );
      }
      if (camera.travelZoomRatio !== undefined) {
        camera.travelZoomRatio = clampDirectorNumber(
          parseDirectorNumber(camera.travelZoomRatio, 0.72),
          0.35,
          0.9,
        );
      }
      if (camera.padding !== undefined) {
        camera.padding = Math.round(
          clampDirectorNumber(
            parseDirectorNumber(camera.padding, 100),
            24,
            280,
          ),
        );
      }
      for (const field of ["offsetX", "offsetY"] as const) {
        if (camera[field] !== undefined) {
          camera[field] = Math.round(
            clampDirectorNumber(
              parseDirectorNumber(camera[field], 0),
              -1000,
              1000,
            ),
          );
        }
      }
    }
    if (normalizedScene.transition) {
      normalizedScene.transition.durationMs = Math.round(
        clampDirectorNumber(
          parseDirectorNumber(normalizedScene.transition.durationMs, 700, {
            time: true,
          }),
          300,
          5000,
        ),
      );
    }
    normalizedScene.cues = normalizedScene.cues.map((cue, cueIndex) => {
      const normalizedCue = structuredClone(cue);
      normalizedCue.atMs = Math.round(
        clampDirectorNumber(
          parseDirectorNumber(normalizedCue.atMs, cueIndex * 500, {
            time: true,
          }),
          0,
          30_000,
        ),
      );
      if (normalizedCue.durationMs !== undefined) {
        normalizedCue.durationMs = Math.round(
          clampDirectorNumber(
            parseDirectorNumber(normalizedCue.durationMs, 500, { time: true }),
            100,
            30_000,
          ),
        );
      }
      if (normalizedCue.staggerMs !== undefined) {
        normalizedCue.staggerMs = Math.round(
          clampDirectorNumber(
            parseDirectorNumber(normalizedCue.staggerMs, 0, { time: true }),
            0,
            2000,
          ),
        );
      }
      if (normalizedCue.distance !== undefined) {
        normalizedCue.distance = clampDirectorNumber(
          parseDirectorNumber(normalizedCue.distance, 24),
          1,
          1000,
        );
      }
      if (normalizedCue.count !== undefined) {
        normalizedCue.count = Math.round(
          clampDirectorNumber(
            parseDirectorNumber(normalizedCue.count, 1),
            1,
            10,
          ),
        );
      }
      if (
        normalizedCue.atMs !== cue.atMs ||
        normalizedCue.durationMs !== cue.durationMs ||
        normalizedCue.staggerMs !== cue.staggerMs
      ) {
        repair(`Cue ${cue.id} 的时间字段已解析为毫秒数值`);
      }
      return normalizedCue;
    });
    return normalizedScene;
  });

  plan.scenes.sort(
    (left, right) =>
      left.startMs - right.startMs || left.id.localeCompare(right.id),
  );
  const firstStartMs = plan.scenes[0]?.startMs || 0;
  if (firstStartMs !== 0) {
    plan.scenes.forEach((scene) => {
      scene.startMs = Math.max(0, scene.startMs - firstStartMs);
    });
    repair(`全部场景已前移 ${firstStartMs}ms，使首场景从 0ms 开始`);
  }
  plan.scenes.forEach((scene, sceneIndex) => {
    if (scene.durationMs < 1000) {
      scene.durationMs = 1000;
      repair(`场景 ${scene.id} 已延长到最小可执行时长 1000ms`);
    }
    const previousScene = plan.scenes[sceneIndex - 1];
    if (
      previousScene &&
      scene.startMs < previousScene.startMs + previousScene.durationMs
    ) {
      scene.startMs = previousScene.startMs + previousScene.durationMs;
      repair(`场景 ${scene.id} 已后移以消除场景时间重叠`);
    }
  });
  const finalScene = plan.scenes.at(-1);
  const requiredDurationMs = finalScene
    ? finalScene.startMs + finalScene.durationMs
    : plan.durationMs;
  if (requiredDurationMs > plan.durationMs) {
    plan.durationMs = requiredDurationMs;
    repair(`故事总时长已延长到 ${plan.durationMs}ms 以覆盖全部场景`);
  }

  const beatById = new Map(story.beats.map((beat) => [beat.id, beat]));
  const contentById = new Map(
    plan.content.map((content) => [content.id, content]),
  );
  let previousPageTransitionEffect: PageTransitionEffect | null = null;
  plan.scenes.forEach((scene, sceneIndex) => {
    const beat = beatById.get(scene.beatId);
    if (sceneIndex === 0) {
      if (scene.transition) {
        delete scene.transition;
        repair(`首场景 ${scene.id} 的无效章节转场已移除`);
      }
      if (scene.camera && scene.camera.transition !== "hold") {
        scene.camera.transition = "hold";
        delete scene.camera.transitionDurationMs;
        repair(`首场景 ${scene.id} 的 Camera 已改为初始 hold`);
      }
    } else {
      const previousScene = plan.scenes[sceneIndex - 1];
      const maxBoundaryDurationMs = Math.max(
        300,
        Math.min(
          5000,
          previousScene.durationMs - 200,
          scene.startMs - previousScene.startMs - 200,
        ),
      );
      if (beat?.relationFromPrevious === "same-space") {
        const requestedDurationMs =
          scene.camera?.transitionDurationMs ??
          scene.transition?.durationMs ??
          900;
        const durationMs = Math.min(
          maxBoundaryDurationMs,
          Math.max(MIN_CAMERA_TRANSITION_DURATION_MS, requestedDurationMs),
        );
        const requestedTransition = scene.camera?.transition;
        scene.camera = {
          ...scene.camera,
          framing: scene.camera?.framing || "fit",
          transition:
            !requestedTransition ||
            ["hold", "cut", "push-in", "pull-out"].includes(requestedTransition)
              ? "reframe"
              : requestedTransition,
          transitionDurationMs: durationMs,
        };
        scene.transition = { effect: "camera", durationMs };
        repair(`场景 ${scene.id} 已按 same-space 合同归一为 Camera 漫游`);
      } else if (beat?.relationFromPrevious === "new-page") {
        const requestedDurationMs = scene.transition?.durationMs ?? 2200;
        const durationMs = Math.min(
          maxBoundaryDurationMs,
          Math.max(MIN_PAGE_TRANSITION_DURATION_MS, requestedDurationMs),
        );
        if (scene.camera) {
          delete scene.camera;
          repair(`场景 ${scene.id} 的 Camera 已移除，因为该章是独立页面`);
        }
        const existingTransition = state.existingPageTransitions?.[scene.id];
        const selection =
          existingTransition && existingTransition.effect !== "camera"
            ? existingTransition
            : selectRandomPageTransition(random, previousPageTransitionEffect);
        const effect = selection.effect as PageTransitionEffect;
        const direction = ["color-wipe", "directional-wipe", "push"].includes(
          effect,
        )
          ? selection.direction ||
            randomItem(PAGE_TRANSITION_DIRECTIONS, random)
          : undefined;
        const origin =
          effect === "iris"
            ? selection.origin || randomItem(IRIS_TRANSITION_ORIGINS, random)
            : undefined;
        scene.transition = {
          effect,
          durationMs,
          ...(direction ? { direction } : {}),
          ...(origin ? { origin } : {}),
          ...(scene.transition?.color ? { color: scene.transition.color } : {}),
          ...(scene.transition?.backgroundColor
            ? { backgroundColor: scene.transition.backgroundColor }
            : {}),
        };
        previousPageTransitionEffect = effect;
        repair(
          `场景 ${scene.id} 已${
            existingTransition ? "保留" : "随机冻结为"
          } ${effect}${
            direction ? `/${direction}` : origin ? `/${origin}` : ""
          } 页面转场`,
        );
      }

      const boundaryDurationMs = Math.max(
        scene.transition?.durationMs || 0,
        scene.camera?.transition === "cut"
          ? 0
          : scene.camera?.transitionDurationMs || 0,
      );
      const previousSceneCueDeadlineMs = Math.max(
        0,
        scene.startMs - boundaryDurationMs - previousScene.startMs,
      );
      previousScene.cues.forEach((cue) => {
        const cueSpanMs =
          (cue.durationMs ?? 500) +
          Math.max(0, cue.targets.length - 1) * (cue.staggerMs || 0);
        if (cue.atMs + cueSpanMs > previousSceneCueDeadlineMs) {
          cue.atMs = Math.max(0, previousSceneCueDeadlineMs - cueSpanMs);
          repair(`Cue ${cue.id} 已前移，为 ${scene.id} 保留舒缓转场窗口`);
        }
      });
    }

    if (scene.camera) {
      const drawableFocusTargets = scene.focusTargets.filter(
        (targetId) => contentById.get(targetId)?.kind !== "connector",
      );
      if (drawableFocusTargets.length === 0) {
        const fallbackTarget = (beat?.elementIds || []).find(
          (targetId) => contentById.get(targetId)?.kind !== "connector",
        );
        if (fallbackTarget) {
          scene.focusTargets = [fallbackTarget];
          repair(
            `场景 ${scene.id} 的 Camera 已改用可取景内容 ${fallbackTarget}`,
          );
        }
      } else if (drawableFocusTargets.length !== scene.focusTargets.length) {
        scene.focusTargets = drawableFocusTargets;
        repair(`场景 ${scene.id} 的 Camera 已移除不可取景的连接线目标`);
      }
    }

    scene.cues = scene.cues.map((cue) => {
      const normalized = {
        ...cue,
        targets: [...new Set(cue.targets)],
      };
      if (!DIRECTOR_ALLOWED_CUE_EFFECTS[cue.type]?.has(cue.effect)) {
        normalized.effect = DIRECTOR_DEFAULT_CUE_EFFECT[cue.type];
        repair(`Cue ${cue.id} 已改用与 ${cue.type} 兼容的效果`);
      }
      if (normalized.type === "draw") {
        const connectorTargets = normalized.targets.filter(
          (targetId) => contentById.get(targetId)?.kind === "connector",
        );
        if (connectorTargets.length > 0) {
          normalized.targets = connectorTargets;
        } else {
          normalized.type = "enter";
          normalized.effect = "fade";
          repair(`Cue ${cue.id} 没有连接线目标，已改为普通进入动作`);
        }
      }
      if (normalized.type === "style") {
        normalized.effect = "style";
        normalized.styleProperty ||= "visual.opacity";
        normalized.styleValue ??= 1;
        const styleProperty = normalized.styleProperty;
        const unsupportedTarget = normalized.targets.find((targetId) => {
          const kind = contentById.get(targetId)?.kind;
          return (
            !kind ||
            !DIRECTOR_STYLE_PROPERTIES_BY_CONTENT_KIND[kind].has(styleProperty)
          );
        });
        if (unsupportedTarget) {
          normalized.styleProperty = "visual.opacity";
          normalized.fromStyleValue = 0;
          normalized.styleValue = 1;
          repair(
            `Cue ${cue.id} 的样式属性不适用于 ${unsupportedTarget}，已改为透明度变化`,
          );
        }
      } else {
        delete normalized.styleProperty;
        delete normalized.styleValue;
        delete normalized.fromStyleValue;
      }
      return normalized;
    });
  });

  plan.scenes.forEach((scene, sceneIndex) => {
    const nextScene = plan.scenes[sceneIndex + 1];
    const nextBoundaryDurationMs = nextScene
      ? Math.max(
          nextScene.transition?.durationMs || 0,
          nextScene.camera?.transition === "cut"
            ? 0
            : nextScene.camera?.transitionDurationMs || 0,
        )
      : 0;
    const cueWindowEndMs = Math.min(
      scene.durationMs,
      nextScene
        ? nextScene.startMs - nextBoundaryDurationMs - scene.startMs
        : scene.durationMs,
    );
    scene.cues.forEach((cue) => {
      const defaultDurationMs =
        DIRECTOR_DEFAULT_CUE_DURATION[plan.style.pace] || 500;
      const targetGapCount = Math.max(0, cue.targets.length - 1);
      if (targetGapCount > 0) {
        const maxStaggerMs = Math.max(
          0,
          Math.floor((cueWindowEndMs - 100) / targetGapCount),
        );
        if ((cue.staggerMs || 0) > maxStaggerMs) {
          cue.staggerMs = maxStaggerMs;
          repair(`Cue ${cue.id} 的 stagger 已缩短到可执行范围`);
        }
      }
      const tailMs = targetGapCount * (cue.staggerMs || 0);
      const availableCueWindowMs = Math.max(100, cueWindowEndMs - tailMs);
      const durationMs = Math.max(
        100,
        Math.min(cue.durationMs ?? defaultDurationMs, availableCueWindowMs),
      );
      const latestStartMs = Math.max(0, cueWindowEndMs - durationMs - tailMs);
      if (cue.atMs > latestStartMs) {
        cue.atMs = latestStartMs;
        repair(`Cue ${cue.id} 已前移到场景可执行时间窗口内`);
      }
      if (cue.durationMs !== durationMs) {
        cue.durationMs = durationMs;
        repair(`Cue ${cue.id} 的时长已调整为 ${durationMs}ms`);
      }
    });
  });

  return { plan, repairs };
};

export const validateDirectorPlan = (
  state: CanvasDraftState,
  plan: DirectorMotionPlan,
) => {
  if (!state.story || !state.storySpacesDefined) {
    throw new Error("必须先完成故事、章节空间和 Section 规划");
  }
  const story = state.story;
  if (state.spaceLayouts.length === 0 || state.sections.length === 0) {
    throw new Error("完整故事 DSL 必须包含页面与 Section 布局");
  }
  if (
    !Number.isFinite(plan.durationMs) ||
    plan.durationMs < 1000 ||
    plan.durationMs > 120_000
  ) {
    throw new Error("完整故事 DSL 的总时长必须在 1000ms 到 120000ms 之间");
  }
  const beatById = new Map(story.beats.map((beat) => [beat.id, beat]));
  const declaredTargetIds = new Set(
    story.beats.flatMap((beat) => beat.elementIds),
  );
  if (declaredTargetIds.size === 0) {
    throw new Error("故事节拍必须预先声明需要执行的内容语义 id");
  }
  const contentById = new Map<string, StoryDirectorContent>();
  plan.content.forEach((content) => {
    if (contentById.has(content.id)) {
      throw new Error(`导演 DSL 内容 id 重复：${content.id}`);
    }
    if (
      content.sectionId &&
      !state.sections.some((section) => section.id === content.sectionId)
    ) {
      throw new Error(
        `导演 DSL 内容 ${content.id} 引用了未知 Section ${content.sectionId}`,
      );
    }
    if (
      content.kind !== "connector" &&
      (content.from !== undefined || content.to !== undefined)
    ) {
      throw new Error(`非连接内容 ${content.id} 不能声明 from/to`);
    }
    contentById.set(content.id, content);
  });
  plan.content
    .filter((content) => content.kind === "connector")
    .forEach((content) => {
      if (
        !content.from ||
        !content.to ||
        !contentById.has(content.from) ||
        !contentById.has(content.to)
      ) {
        throw new Error(`导演 DSL 连接 ${content.id} 缺少有效业务端点`);
      }
    });
  const missingContentIds = [...declaredTargetIds].filter(
    (id) => !contentById.has(id),
  );
  if (missingContentIds.length > 0) {
    throw new Error(`导演 DSL 缺少内容定义：${missingContentIds.join("、")}`);
  }
  const coveredBeatIds = new Set<string>();
  const sceneIds = new Set<string>();
  let previousScene: StoryAnimationPlanScene | null = null;
  plan.scenes.forEach((scene, sceneIndex) => {
    if (sceneIds.has(scene.id)) {
      throw new Error(`导演 DSL 场景 id 重复：${scene.id}`);
    }
    sceneIds.add(scene.id);
    const beat = beatById.get(scene.beatId);
    if (!beat) {
      throw new Error(`场景 ${scene.id} 引用了未知故事节拍 ${scene.beatId}`);
    }
    coveredBeatIds.add(scene.beatId);
    if (sceneIndex === 0 && scene.startMs !== 0) {
      throw new Error("导演 DSL 的首场景必须从 0ms 开始");
    }
    if (sceneIndex === 0 && scene.transition) {
      throw new Error("导演 DSL 的首场景不能配置章节转场");
    }
    if (sceneIndex > 0 && beat.relationFromPrevious === "new-page") {
      if (
        scene.camera ||
        !scene.transition ||
        scene.transition.effect === "camera"
      ) {
        throw new Error(
          `场景 ${scene.id} 是独立页面，必须使用非 Camera 章节转场`,
        );
      }
    }
    if (sceneIndex > 0 && beat.relationFromPrevious === "same-space") {
      if (!scene.camera || scene.transition?.effect !== "camera") {
        throw new Error(
          `场景 ${scene.id} 延续同一空间，必须使用 Camera 漫游转场`,
        );
      }
    }
    if (sceneIndex > 0 && scene.camera?.transition === "hold") {
      throw new Error(`非首场景 ${scene.id} 不能使用 hold 镜头切换`);
    }
    if (
      scene.startMs + scene.durationMs > plan.durationMs ||
      (previousScene &&
        previousScene.startMs + previousScene.durationMs > scene.startMs)
    ) {
      throw new Error(`场景 ${scene.id} 的时间范围无效或与上一场景重叠`);
    }
    const targetIds = [
      ...scene.focusTargets,
      ...scene.cues.flatMap((cue) => cue.targets),
    ];
    const undeclared = targetIds.filter((id) => !contentById.has(id));
    if (undeclared.length > 0) {
      throw new Error(
        `场景 ${scene.id} 引用了未在 Director content 声明的内容：${[
          ...new Set(undeclared),
        ].join("、")}`,
      );
    }
    if (
      scene.camera &&
      scene.focusTargets.every(
        (targetId) => contentById.get(targetId)?.kind === "connector",
      )
    ) {
      throw new Error(`场景 ${scene.id} 的 Camera 缺少可取景内容`);
    }
    const cueIds = new Set();
    if (scene.cues.length === 0) {
      throw new Error(`场景 ${scene.id} 必须由主 Agent 明确规划对象 Cue`);
    }
    scene.cues.forEach((cue) => {
      if (cueIds.has(cue.id)) {
        throw new Error(`场景 ${scene.id} 的 Cue id 重复：${cue.id}`);
      }
      cueIds.add(cue.id);
      if (!DIRECTOR_ALLOWED_CUE_EFFECTS[cue.type]?.has(cue.effect)) {
        throw new Error(`Cue ${cue.id} 的 ${cue.type}/${cue.effect} 组合无效`);
      }
      if (
        cue.type === "draw" &&
        cue.targets.some(
          (targetId) => contentById.get(targetId)?.kind !== "connector",
        )
      ) {
        throw new Error(`Draw Cue ${cue.id} 只能引用连接内容`);
      }
      if (
        cue.type === "style" &&
        (!cue.styleProperty || cue.styleValue === undefined)
      ) {
        throw new Error(`Style Cue ${cue.id} 缺少属性或目标值`);
      }
      const cueDuration = cue.durationMs ?? 500;
      const cueEnd =
        cue.atMs +
        cueDuration +
        Math.max(0, cue.targets.length - 1) * (cue.staggerMs || 0);
      if (cueEnd > scene.durationMs) {
        throw new Error(`Cue ${cue.id} 超出场景 ${scene.id} 的时间范围`);
      }
    });
    previousScene = scene;
  });
  plan.scenes.forEach((scene, sceneIndex) => {
    const nextScene = plan.scenes[sceneIndex + 1];
    if (!nextScene) {
      return;
    }
    const boundaryDurationMs = Math.max(
      nextScene.transition?.durationMs || 0,
      nextScene.camera?.transition === "cut"
        ? 0
        : nextScene.camera?.transitionDurationMs || 0,
    );
    const boundaryStartMs = nextScene.startMs - boundaryDurationMs;
    for (const cue of scene.cues) {
      const cueEndMs =
        scene.startMs +
        cue.atMs +
        (cue.durationMs ?? 500) +
        Math.max(0, cue.targets.length - 1) * (cue.staggerMs || 0);
      if (cueEndMs > boundaryStartMs) {
        throw new Error(`Cue ${cue.id} 与下一场景的镜头或页面转场重叠`);
      }
    }
  });
  const missingBeatIds = [...beatById.keys()].filter(
    (beatId) => !coveredBeatIds.has(beatId),
  );
  if (missingBeatIds.length > 0) {
    throw new Error(`导演 DSL 未覆盖故事节拍：${missingBeatIds.join("、")}`);
  }
};

export const directorPlanSnapshot = (
  state: CanvasDraftState,
  motionPlan: DirectorMotionPlan,
): StoryDirectorPlan => {
  if (!state.story) {
    throw new Error("必须先完成故事规划");
  }
  const story = state.story;
  const scenes = structuredClone(motionPlan.scenes);
  return {
    schemaVersion: "2.0",
    id: story.id,
    title: story.title,
    summary: story.summary,
    durationMs: motionPlan.durationMs,
    rationale: motionPlan.rationale,
    directionSummary: motionPlan.summary,
    style: structuredClone(motionPlan.style),
    beats: structuredClone(story.beats),
    spaceLayouts: structuredClone(state.spaceLayouts),
    sections: structuredClone(state.sections),
    content: structuredClone(motionPlan.content),
    scenes,
    lifecycles: deriveSceneLifecycles(scenes, {
      beats: story.beats,
      elements: motionPlan.content
        .filter((content) => content.kind !== "connector")
        .map(({ id }) => ({ id })),
      libraryAssets: [],
      connectors: motionPlan.content
        .filter((content) => content.kind === "connector")
        .map(({ id }) => ({ id })),
    }),
  };
};

export const assertAnimationPreservesDirectorPlan = (
  animation: StoryAnimationDraft,
  directorPlan: StoryDirectorPlan,
) => {
  if (
    !animation?.plan ||
    animation.durationMs !== directorPlan.durationMs ||
    animation.plan.durationMs !== directorPlan.durationMs ||
    animation.plan.rationale !== directorPlan.rationale ||
    animation.plan.summary !== directorPlan.directionSummary ||
    JSON.stringify(animation.plan.style) !== JSON.stringify(directorPlan.style)
  ) {
    throw new Error("动画子智能体改变了 Director DSL 的冻结元数据");
  }
  const withoutCues = (scenes: StoryAnimationPlanScene[]) =>
    scenes.map(({ cues: _cues, ...scene }) => scene);
  if (
    JSON.stringify(withoutCues(animation.plan.scenes)) !==
    JSON.stringify(withoutCues(directorPlan.scenes))
  ) {
    throw new Error("动画子智能体改变了 Director DSL 的场景结构");
  }
};
