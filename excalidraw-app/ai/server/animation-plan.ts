import type {
  CanvasDraft,
  CanvasDraftConnector,
  CanvasDraftElement,
  CanvasDraftLibraryAsset,
  CanvasElementStyle,
  StoryAnimationCue,
  StoryAnimationCameraPlan,
  StoryAnimationDraft,
  StoryAnimationPlan,
  StoryAnimationPlanScene,
  StoryAnimationTrack,
  StoryCameraAnimationTrack,
  StoryChapterTransitionPlan,
  StoryElementAnimationTrack,
  StoryMotionCharacter,
  StoryMotionPace,
  StoryMotionTone,
  StorySceneLifecycle,
  StoryTransitionAnimationTrack,
} from "../../../src/ai/story/types";
import type {
  AnimationEasing,
  AnimationKeyframe,
  AnimationPreset,
  AnimationProperty,
  AnimationPropertyName,
} from "../../../src/animation/types";

type ObjectWindow = { cueId: string; startMs: number; endMs: number };
type DrawableTarget = CanvasDraftElement | CanvasDraftLibraryAsset;
type CanvasTarget = DrawableTarget | CanvasDraftConnector;
type CanvasDraftTargetIndex = {
  beats: CanvasDraft["beats"];
  elements: Array<Pick<CanvasDraftElement, "id">>;
  libraryAssets: Array<Pick<CanvasDraftLibraryAsset, "id">>;
  connectors: Array<Pick<CanvasDraftConnector, "id">>;
};
type StyleProperty = NonNullable<StoryAnimationCue["styleProperty"]>;
type DraftKeyframe = AnimationKeyframe<unknown> & { label?: string };
type CameraField = "centerX" | "centerY" | "zoom";
type CompiledCameraPlan = Omit<
  Partial<StoryAnimationCameraPlan>,
  "transition"
> & {
  transition: StoryAnimationCameraPlan["transition"] | "return-to-page";
};
type CameraValue = Record<CameraField, number> & {
  scene: StoryAnimationPlanScene;
  camera: CompiledCameraPlan;
  kind: "focus" | "page";
};
type EmptyAnimationPlan = {
  schemaVersion: "1.0";
  durationMs: number | null;
  rationale: string;
  summary: string;
  style: StoryAnimationPlan["style"] | null;
  scenes: StoryAnimationPlanScene[];
  finalized: boolean;
  compiledDraft: StoryAnimationDraft | null;
};

const CAMERA_VIEWPORT = { width: 1280, height: 720 };
const PAGE_CAMERA = {
  centerX: CAMERA_VIEWPORT.width / 2,
  centerY: CAMERA_VIEWPORT.height / 2,
  zoom: 1,
};

const clamp = (value: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, value));
const stableIdHash = (value: string): string => {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
};
export const sanitizeAnimationId = (value: unknown): string => {
  const normalized = String(value).normalize("NFKC");
  const slug = normalized
    .replace(/[^a-zA-Z0-9_-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
  if (slug === normalized && slug.length <= 64 && slug.length > 0) {
    return slug;
  }
  const readable = slug.slice(0, 48) || "id";
  return `${readable}-${stableIdHash(normalized)}`.slice(0, 64);
};
const sanitizeId = sanitizeAnimationId;

const uniquifyDraftTrackIds = <T extends { id: string }>(tracks: T[]): T[] => {
  const used = new Set<string>();
  return tracks.map((track) => {
    const base = sanitizeId(track.id);
    let id = base;
    let suffix = 2;
    while (used.has(id)) {
      const marker = `-${suffix++}`;
      id = `${base.slice(0, Math.max(1, 64 - marker.length))}${marker}`;
    }
    used.add(id);
    return id === track.id ? track : { ...track, id };
  });
};

const MOTION_CHARACTER_EASING: Record<StoryMotionCharacter, AnimationEasing> = {
  precise: { type: "cubic-bezier", x1: 0.22, y1: 1, x2: 0.36, y2: 1 },
  gentle: { type: "cubic-bezier", x1: 0.25, y1: 0.1, x2: 0.25, y2: 1 },
  snappy: { type: "spring", stiffness: 180, damping: 24, mass: 1 },
  heavy: { type: "spring", stiffness: 110, damping: 22, mass: 1.6 },
  elastic: { type: "spring", stiffness: 220, damping: 14, mass: 0.8 },
  dramatic: { type: "cubic-bezier", x1: 0.16, y1: 1, x2: 0.3, y2: 1 },
};

const DEFAULT_MOTION_BY_TONE: Record<StoryMotionTone, StoryMotionCharacter> = {
  restrained: "precise",
  natural: "gentle",
  energetic: "snappy",
  playful: "elastic",
};

const DEFAULT_DURATION_BY_PACE: Record<StoryMotionPace, number> = {
  slow: 700,
  normal: 500,
  fast: 320,
};

const DEFAULT_HIGHLIGHT_COLOR = "#FFD43B88";
const DISCRETE_STYLE_PROPERTIES = new Set<StyleProperty>([
  "visual.fillStyle",
  "visual.strokeStyle",
  "visual.roughness",
  "text.fontFamily",
  "text.textAlign",
  "text.verticalAlign",
]);

const DEFAULT_STYLE_VALUES: Record<StyleProperty, string | number> = {
  "visual.opacity": 1,
  "visual.strokeColor": "#1E1E1EFF",
  "visual.backgroundColor": "#00000000",
  "visual.fillStyle": "hachure",
  "visual.strokeWidth": 1,
  "visual.strokeStyle": "solid",
  "visual.roughness": 1,
  "visual.roundness": 0,
  "text.fontSize": 20,
  "text.fontFamily": 1,
  "text.textAlign": "left",
  "text.verticalAlign": "top",
};

const CANVAS_STYLE_KEY_BY_ANIMATION_PROPERTY: Record<
  StyleProperty,
  keyof CanvasElementStyle
> = {
  "visual.opacity": "opacity",
  "visual.strokeColor": "strokeColor",
  "visual.backgroundColor": "backgroundColor",
  "visual.fillStyle": "fillStyle",
  "visual.strokeWidth": "strokeWidth",
  "visual.strokeStyle": "strokeStyle",
  "visual.roughness": "roughness",
  "visual.roundness": "roundness",
  "text.fontSize": "fontSize",
  "text.fontFamily": "fontFamily",
  "text.textAlign": "textAlign",
  "text.verticalAlign": "verticalAlign",
};

const supportsDistance = (cue: StoryAnimationCue): boolean =>
  cue.effect === "slide" || cue.effect === "shake" || cue.effect === "bounce";

const supportsCount = (cue: StoryAnimationCue): boolean =>
  cue.type === "emphasize" &&
  new Set(["pulse", "highlight", "shake", "bounce"]).has(cue.effect);

const easingFor = (
  motion: StoryMotionCharacter | undefined,
  style: StoryAnimationPlan["style"],
): AnimationEasing =>
  structuredClone(
    MOTION_CHARACTER_EASING[
      motion || DEFAULT_MOTION_BY_TONE[style.tone] || "gentle"
    ],
  );

const getTargetIds = (canvasDraft: CanvasDraftTargetIndex): Set<string> =>
  new Set([
    ...canvasDraft.elements.map((element) => element.id),
    ...(canvasDraft.libraryAssets || []).map((asset) => asset.id),
    ...canvasDraft.connectors.map((connector) => connector.id),
  ]);

const cueEndMs = (
  cue: StoryAnimationCue,
  pace: StoryMotionPace = "normal",
): number =>
  cue.atMs +
  (cue.durationMs ?? DEFAULT_DURATION_BY_PACE[pace] ?? 500) +
  Math.max(0, cue.targets.length - 1) * (cue.staggerMs || 0);

const uniqueCueId = (
  scene: StoryAnimationPlanScene,
  requestedId: string,
): string => {
  const used = new Set((scene.cues || []).map((cue) => cue.id));
  let id = requestedId;
  let suffix = 2;
  while (used.has(id)) {
    id = `${requestedId}-${suffix++}`;
  }
  return id;
};

const appendCoverageCue = (
  scene: StoryAnimationPlanScene,
  cue: StoryAnimationCue,
): void => {
  scene.cues ||= [];
  scene.cues.push({
    ...cue,
    id: uniqueCueId(scene, cue.id),
  });
};

const beatTargetIds = (
  scene: StoryAnimationPlanScene,
  canvasDraft: CanvasDraftTargetIndex,
  validTargetIds: Set<string>,
): string[] => {
  const beat = (canvasDraft.beats || []).find(
    (candidate) => candidate.id === scene.beatId,
  );
  return [...new Set(beat?.elementIds || [])].filter((id) =>
    validTargetIds.has(id),
  );
};

export const deriveSceneLifecycles = (
  scenes: StoryAnimationPlanScene[],
  canvasDraft: CanvasDraftTargetIndex,
): StorySceneLifecycle[] => {
  const validTargetIds = getTargetIds(canvasDraft);
  const targetsByScene = scenes.map((scene) =>
    beatTargetIds(scene, canvasDraft, validTargetIds),
  );

  return scenes.map((scene, sceneIndex) => {
    const currentTargets = targetsByScene[sceneIndex];
    const previousTargets = new Set(targetsByScene[sceneIndex - 1] || []);
    const nextTargets = new Set(targetsByScene[sceneIndex + 1] || []);
    return {
      sceneId: scene.id,
      enterTargetIds:
        sceneIndex === 0
          ? []
          : currentTargets.filter((targetId) => !previousTargets.has(targetId)),
      persistentTargetIds:
        sceneIndex === scenes.length - 1
          ? []
          : currentTargets.filter((targetId) => nextTargets.has(targetId)),
      exitTargetIds:
        sceneIndex === scenes.length - 1
          ? []
          : currentTargets.filter((targetId) => !nextTargets.has(targetId)),
    };
  });
};

export const validateSceneLifecycleCueCoverage = (
  plan: StoryAnimationPlan,
  canvasDraft: CanvasDraft,
): StorySceneLifecycle[] => {
  const lifecycles = deriveSceneLifecycles(plan.scenes, canvasDraft);
  for (const [sceneIndex, scene] of plan.scenes.entries()) {
    if (!scene.cues?.length) {
      throw new Error(`场景 ${scene.id} 缺少动画 Agent 规划的对象动作`);
    }
    const lifecycle = lifecycles[sceneIndex];
    const enteredTargetIds = new Set(
      scene.cues
        .filter((cue) => cue.type === "enter" || cue.type === "draw")
        .flatMap((cue) => cue.targets),
    );
    const exitedTargetIds = new Set(
      scene.cues
        .filter((cue) => cue.type === "exit")
        .flatMap((cue) => cue.targets),
    );
    const missingEntrances = lifecycle.enterTargetIds.filter(
      (targetId) => !enteredTargetIds.has(targetId),
    );
    const missingExits = lifecycle.exitTargetIds.filter(
      (targetId) => !exitedTargetIds.has(targetId),
    );
    const invalidPersistentExits = lifecycle.persistentTargetIds.filter(
      (targetId) => exitedTargetIds.has(targetId),
    );
    if (missingEntrances.length > 0) {
      throw new Error(
        `场景 ${scene.id} 缺少新增元素的入场动画：${missingEntrances.join(
          "、",
        )}`,
      );
    }
    if (missingExits.length > 0) {
      throw new Error(
        `场景 ${scene.id} 缺少离场元素的退场动画：${missingExits.join("、")}`,
      );
    }
    if (invalidPersistentExits.length > 0) {
      throw new Error(
        `场景 ${
          scene.id
        } 错误退场了下一幕仍需复用的元素：${invalidPersistentExits.join("、")}`,
      );
    }
  }
  return lifecycles;
};

/**
 * Keeps AI-authored cues intact, but closes the planner contract hole where an
 * agent could finalize a transition-only story by submitting empty cue lists.
 * The generated cues remain ordinary editable Object tracks in the artifact.
 */
export const ensureObjectCueCoverage = (
  inputPlan: StoryAnimationPlan,
  canvasDraft: CanvasDraft,
): StoryAnimationPlan => {
  const plan = structuredClone(inputPlan);
  const validTargetIds = getTargetIds(canvasDraft);
  const connectorIds = new Set(
    canvasDraft.connectors.map((connector) => connector.id),
  );
  const targetsByScene = plan.scenes.map((scene) =>
    beatTargetIds(scene, canvasDraft, validTargetIds),
  );
  const defaultDuration = DEFAULT_DURATION_BY_PACE[plan.style.pace] ?? 500;

  plan.scenes.forEach((scene, sceneIndex) => {
    scene.cues ||= [];
    const currentTargets = targetsByScene[sceneIndex];
    const previousTargets = new Set(targetsByScene[sceneIndex - 1] || []);
    const enteringTargets = currentTargets.filter(
      (targetId, targetIndex) =>
        !previousTargets.has(targetId) &&
        !(sceneIndex === 0 && targetIndex === 0),
    );
    const coveredEntrances = new Set(
      scene.cues
        .filter((cue) => cue.type === "enter" || cue.type === "draw")
        .flatMap((cue) => cue.targets),
    );
    const uncoveredEntering = enteringTargets.filter(
      (targetId) => !coveredEntrances.has(targetId),
    );
    const entranceAtMs = sceneIndex === 0 ? 120 : 80;
    const entranceDurationMs = Math.min(
      defaultDuration,
      Math.max(100, Math.floor(scene.durationMs * 0.28)),
      Math.max(100, scene.durationMs - entranceAtMs),
    );
    const addEntranceGroup = (
      targets: string[],
      type: "enter" | "draw",
      effect: "fade" | "slide",
    ): void => {
      if (targets.length === 0 || scene.durationMs - entranceAtMs < 100) {
        return;
      }
      const staggerMs =
        targets.length > 1
          ? Math.min(
              80,
              Math.max(
                0,
                Math.floor(
                  (scene.durationMs - entranceAtMs - entranceDurationMs) /
                    (targets.length - 1),
                ),
              ),
            )
          : 0;
      appendCoverageCue(scene, {
        id: `auto-${sanitizeId(scene.id)}-${type}`,
        type,
        targets,
        atMs: entranceAtMs,
        durationMs: entranceDurationMs,
        effect,
        ...(staggerMs > 0 ? { staggerMs } : {}),
        motion: plan.style.tone === "energetic" ? "snappy" : "gentle",
      });
    };
    addEntranceGroup(
      uncoveredEntering.filter((targetId) => !connectorIds.has(targetId)),
      "enter",
      sceneIndex % 2 === 0 ? "fade" : "slide",
    );
    addEntranceGroup(
      uncoveredEntering.filter((targetId) => connectorIds.has(targetId)),
      "draw",
      "fade",
    );

    // Every chapter gets a readable internal beat, even when the model only
    // planned its boundary transition. Prefer an AI-authored emphasis when one
    // already exists.
    if (!scene.cues.some((cue) => cue.type === "emphasize")) {
      const emphasisTarget =
        scene.focusTargets.find((targetId) => validTargetIds.has(targetId)) ||
        currentTargets.find((targetId) => !connectorIds.has(targetId));
      const latestEntranceEnd = Math.max(
        0,
        ...scene.cues
          .filter((cue) => cue.type === "enter" || cue.type === "draw")
          .map((cue) => cueEndMs(cue, plan.style.pace)),
      );
      const emphasisAtMs = Math.max(
        latestEntranceEnd + 120,
        Math.floor(scene.durationMs * 0.45),
      );
      const emphasisDurationMs = Math.min(
        defaultDuration,
        scene.durationMs - emphasisAtMs,
      );
      if (emphasisTarget && emphasisDurationMs >= 100) {
        appendCoverageCue(scene, {
          id: `auto-${sanitizeId(scene.id)}-emphasize`,
          type: "emphasize",
          targets: [emphasisTarget],
          atMs: emphasisAtMs,
          durationMs: emphasisDurationMs,
          effect: plan.style.tone === "restrained" ? "highlight" : "pulse",
          motion: plan.style.tone === "energetic" ? "snappy" : "precise",
          ...(plan.style.tone === "restrained"
            ? { color: DEFAULT_HIGHLIGHT_COLOR }
            : {}),
        });
      }
    }
  });

  // Pair every stage transition with explicit outgoing Object tracks. Shared
  // chapter objects stay visible; only objects not used by the next beat exit.
  for (
    let sceneIndex = 0;
    sceneIndex < plan.scenes.length - 1;
    sceneIndex += 1
  ) {
    const scene = plan.scenes[sceneIndex];
    const nextScene = plan.scenes[sceneIndex + 1];
    if (!nextScene.transition && !nextScene.camera) {
      continue;
    }
    const nextTargets = new Set(targetsByScene[sceneIndex + 1]);
    const coveredExits = new Set(
      scene.cues
        .filter((cue) => cue.type === "exit")
        .flatMap((cue) => cue.targets),
    );
    const outgoingTargets = targetsByScene[sceneIndex].filter(
      (targetId) => !nextTargets.has(targetId) && !coveredExits.has(targetId),
    );
    if (outgoingTargets.length === 0) {
      continue;
    }
    const cameraDuration =
      nextScene.camera && nextScene.camera.transition !== "cut"
        ? nextScene.camera.transitionDurationMs ?? 1200
        : 0;
    const transitionStartMs =
      nextScene.startMs -
      Math.max(nextScene.transition?.durationMs || 0, cameraDuration);
    const availableUntilMs = Math.min(
      scene.durationMs,
      transitionStartMs - scene.startMs,
    );
    const exitDurationMs = Math.min(
      defaultDuration,
      Math.max(100, Math.floor(scene.durationMs * 0.2)),
      availableUntilMs,
    );
    if (availableUntilMs < 100 || exitDurationMs < 100) {
      continue;
    }
    appendCoverageCue(scene, {
      id: `auto-${sanitizeId(scene.id)}-exit`,
      type: "exit",
      targets: outgoingTargets,
      atMs: availableUntilMs - exitDurationMs,
      durationMs: exitDurationMs,
      effect: "fade",
      motion: "precise",
    });
  }

  return plan;
};

const cueSpanMs = (cue: StoryAnimationCue, pace: StoryMotionPace): number =>
  (cue.durationMs ?? DEFAULT_DURATION_BY_PACE[pace] ?? 500) +
  Math.max(0, cue.targets.length - 1) * (cue.staggerMs || 0);

/**
 * Resolves planner choices which are semantically valid but cannot be compiled
 * together on the same time window. These are recoverable authoring details,
 * so they must not force the model to submit the whole plan a second time.
 */
export const prepareStoryAnimationPlan = (
  inputPlan: StoryAnimationPlan,
  canvasDraft: CanvasDraft,
): { plan: StoryAnimationPlan; repairs: string[] } => {
  const validated = validateStoryAnimationPlan(inputPlan, canvasDraft);
  const plan = ensureObjectCueCoverage(validated, canvasDraft);
  const repairs: string[] = [];
  const drawableTargetIds = new Set([
    ...canvasDraft.elements.map((element) => element.id),
    ...(canvasDraft.libraryAssets || []).map((asset) => asset.id),
  ]);
  const beatById = new Map(
    (canvasDraft.beats || []).map((beat) => [beat.id, beat]),
  );

  plan.scenes.forEach((scene, sceneIndex) => {
    if (scene.camera) {
      const originalTargets = scene.focusTargets;
      const drawableTargets = originalTargets.filter((targetId) =>
        drawableTargetIds.has(targetId),
      );
      const beatFallback = (
        beatById.get(scene.beatId)?.elementIds || []
      ).filter((targetId) => drawableTargetIds.has(targetId));
      const globalFallback = [...drawableTargetIds];
      const nextTargets =
        drawableTargets.length > 0
          ? drawableTargets
          : beatFallback.length > 0
          ? beatFallback
          : globalFallback.slice(0, 1);
      if (
        nextTargets.length > 0 &&
        (nextTargets.length !== originalTargets.length ||
          nextTargets.some(
            (targetId, index) => targetId !== originalTargets[index],
          ))
      ) {
        scene.focusTargets = nextTargets;
        repairs.push(`场景 ${scene.id} 已移除不可取景的连接线目标`);
      }
      if (
        sceneIndex > 0 &&
        (scene.camera.transition === "push-in" ||
          scene.camera.transition === "pull-out")
      ) {
        scene.camera.transition = "reframe";
        repairs.push(`场景 ${scene.id} 的不确定推拉镜头已改为稳定重构图`);
      }
    }

    if (sceneIndex === 0) {
      return;
    }
    const previousScene = plan.scenes[sceneIndex - 1];
    const availableBoundaryMs = scene.startMs - previousScene.startMs;
    if (scene.transition && scene.transition.durationMs > availableBoundaryMs) {
      scene.transition.durationMs = availableBoundaryMs;
      repairs.push(`场景 ${scene.id} 的章节转场时长已收缩`);
    }
    if (
      scene.camera &&
      scene.camera.transition !== "cut" &&
      (scene.camera.transitionDurationMs || 0) > availableBoundaryMs
    ) {
      scene.camera.transitionDurationMs = availableBoundaryMs;
      repairs.push(`场景 ${scene.id} 的镜头转场时长已收缩`);
    }

    const cameraDuration =
      scene.camera && scene.camera.transition !== "cut"
        ? scene.camera.transitionDurationMs ?? 1200
        : 0;
    const boundaryDurationMs = Math.max(
      scene.transition?.durationMs || 0,
      cameraDuration,
    );
    if (boundaryDurationMs <= 0) {
      return;
    }
    const boundaryStartMs = scene.startMs - boundaryDurationMs;
    for (const candidateScene of plan.scenes.slice(0, sceneIndex)) {
      const boundaryLocalMs = boundaryStartMs - candidateScene.startMs;
      candidateScene.cues = (candidateScene.cues || []).filter((cue) => {
        const globalStartMs = candidateScene.startMs + cue.atMs;
        const globalEndMs = globalStartMs + cueSpanMs(cue, plan.style.pace);
        if (globalStartMs >= scene.startMs || globalEndMs <= boundaryStartMs) {
          return true;
        }
        if (boundaryLocalMs < 100) {
          repairs.push(`Cue ${cue.id} 因没有转场前时间窗口已跳过`);
          return false;
        }
        const requestedDuration =
          cue.durationMs ?? DEFAULT_DURATION_BY_PACE[plan.style.pace] ?? 500;
        const tailMs =
          Math.max(0, cue.targets.length - 1) * (cue.staggerMs || 0);
        const durationAtCurrentPosition = boundaryLocalMs - cue.atMs - tailMs;
        if (durationAtCurrentPosition >= 100) {
          cue.durationMs = Math.min(
            requestedDuration,
            durationAtCurrentPosition,
          );
        } else {
          cue.staggerMs = 0;
          cue.durationMs = Math.min(requestedDuration, boundaryLocalMs);
          cue.atMs = Math.max(0, boundaryLocalMs - cue.durationMs);
        }
        repairs.push(`Cue ${cue.id} 已移动到章节转场开始前`);
        return true;
      });
    }
  });

  return {
    plan: validateStoryAnimationPlan(plan, canvasDraft),
    repairs,
  };
};

const elementsById = (canvasDraft: CanvasDraft): Map<string, DrawableTarget> =>
  new Map(
    [...canvasDraft.elements, ...(canvasDraft.libraryAssets || [])].map(
      (element) => [element.id, element],
    ),
  );

const cameraValueForScene = (
  scene: StoryAnimationPlanScene,
  canvasElementsById: Map<string, DrawableTarget>,
): { centerX: number; centerY: number; zoom: number } => {
  const targets = scene.focusTargets.map((targetId) => {
    const element = canvasElementsById.get(targetId);
    if (!element) {
      throw new Error(`场景 ${scene.id} 的镜头引用了不可取景元素 ${targetId}`);
    }
    return element;
  });
  const left = Math.min(...targets.map((element) => element.x));
  const top = Math.min(...targets.map((element) => element.y));
  const right = Math.max(
    ...targets.map((element) => element.x + element.width),
  );
  const bottom = Math.max(
    ...targets.map((element) => element.y + element.height),
  );
  const padding = scene.camera?.padding ?? 100;
  const framingScale = {
    wide: 0.82,
    fit: 1,
    medium: 1.2,
    close: 1.5,
  }[scene.camera?.framing || "fit"];
  const zoom = Math.min(
    (CAMERA_VIEWPORT.width - padding * 2) / Math.max(1, right - left),
    (CAMERA_VIEWPORT.height - padding * 2) / Math.max(1, bottom - top),
  );
  return {
    centerX: (left + right) / 2 + (scene.camera?.offsetX || 0),
    centerY: (top + bottom) / 2 + (scene.camera?.offsetY || 0),
    zoom: clamp(zoom * framingScale, 0.1, 4),
  };
};

const appendKeyframe = (
  keyframes: DraftKeyframe[],
  keyframe: DraftKeyframe,
): void => {
  const last = keyframes.at(-1);
  if (last?.atMs === keyframe.atMs) {
    keyframes[keyframes.length - 1] = { ...last, ...keyframe };
  } else {
    keyframes.push(keyframe);
  }
};

const compileCameraTrack = (
  plan: StoryAnimationPlan,
  canvasDraft: CanvasDraft,
  objectWindows: ObjectWindow[],
): StoryCameraAnimationTrack | null => {
  if (!plan.scenes.some((scene) => scene.camera)) {
    return null;
  }
  const byId = elementsById(canvasDraft);
  const beatById = new Map(
    (canvasDraft.beats || []).map((beat) => [beat.id, beat]),
  );
  const values: CameraValue[] = [];
  for (const [sceneIndex, scene] of plan.scenes.entries()) {
    if (scene.camera) {
      values.push({
        scene,
        camera: scene.camera as CompiledCameraPlan,
        kind: "focus" as const,
        ...cameraValueForScene(scene, byId),
      });
      continue;
    }
    const isInitialScene = sceneIndex === 0;
    const isNewPage =
      beatById.get(scene.beatId)?.relationFromPrevious === "new-page";
    if (!isInitialScene && !isNewPage) {
      continue;
    }
    if (values.at(-1)?.kind === "page") {
      continue;
    }
    values.push({
      scene,
      camera: {
        transition: isInitialScene ? "hold" : "return-to-page",
        transitionDurationMs: scene.transition?.durationMs ?? 900,
      },
      kind: "page" as const,
      ...PAGE_CAMERA,
    });
  }
  const channels: Record<CameraField, DraftKeyframe[]> = {
    centerX: [{ atMs: 0, value: values[0].centerX, label: values[0].scene.id }],
    centerY: [{ atMs: 0, value: values[0].centerY, label: values[0].scene.id }],
    zoom: [{ atMs: 0, value: values[0].zoom, label: values[0].scene.id }],
  };

  for (let index = 1; index < values.length; index += 1) {
    const previous = values[index - 1];
    const target = values[index];
    const transition = target.camera.transition || "reframe";
    const arrivalMs = target.scene.startMs;
    if (transition === "cut") {
      for (const field of ["centerX", "centerY", "zoom"] as const) {
        channels[field][channels[field].length - 1].hold = true;
        appendKeyframe(channels[field], {
          atMs: arrivalMs,
          value: target[field],
          label: target.scene.id,
        });
      }
      continue;
    }
    const durationMs = target.camera.transitionDurationMs ?? 1200;
    const startMs = arrivalMs - durationMs;
    if (startMs < previous.scene.startMs) {
      throw new Error(`场景 ${target.scene.id} 的镜头切换侵入上一场景起点`);
    }
    const overlaps = objectWindows.filter(
      (window) => window.startMs < arrivalMs && window.endMs > startMs,
    );
    if (overlaps.length > 0) {
      throw new Error(
        `场景 ${target.scene.id} 的镜头运动与 Object Cue 重叠：${overlaps
          .map((window) => window.cueId)
          .join(", ")}`,
      );
    }
    const positionEasing = easingFor(target.camera.motion, plan.style);
    const zoomEasing = easingFor(
      target.camera.zoomMotion ||
        (transition === "return-to-page" ? target.camera.motion : "precise"),
      plan.style,
    );

    if (transition === "return-to-page") {
      for (const field of ["centerX", "centerY"] as const) {
        appendKeyframe(channels[field], {
          atMs: startMs,
          value: previous[field],
          easing: positionEasing,
        });
        appendKeyframe(channels[field], {
          atMs: arrivalMs,
          value: target[field],
          label: target.scene.id,
        });
      }
      appendKeyframe(channels.zoom, {
        atMs: startMs,
        value: previous.zoom,
        easing: zoomEasing,
      });
      appendKeyframe(channels.zoom, {
        atMs: arrivalMs,
        value: target.zoom,
        label: target.scene.id,
      });
    } else if (transition === "reframe") {
      const zoomOutEndMs = startMs + Math.round(durationMs * 0.25);
      const positionEndMs = startMs + Math.round(durationMs * 0.75);
      const travelZoom = clamp(
        Math.min(previous.zoom, target.zoom) *
          (target.camera.travelZoomRatio ?? 0.72),
        0.1,
        4,
      );
      for (const field of ["centerX", "centerY"] as const) {
        appendKeyframe(channels[field], {
          atMs: startMs,
          value: previous[field],
          hold: true,
        });
        appendKeyframe(channels[field], {
          atMs: zoomOutEndMs,
          value: previous[field],
          easing: positionEasing,
        });
        appendKeyframe(channels[field], {
          atMs: positionEndMs,
          value: target[field],
          hold: true,
        });
        appendKeyframe(channels[field], {
          atMs: arrivalMs,
          value: target[field],
          label: target.scene.id,
        });
      }
      appendKeyframe(channels.zoom, {
        atMs: startMs,
        value: previous.zoom,
        easing: zoomEasing,
      });
      appendKeyframe(channels.zoom, {
        atMs: zoomOutEndMs,
        value: travelZoom,
        hold: true,
      });
      appendKeyframe(channels.zoom, {
        atMs: positionEndMs,
        value: travelZoom,
        easing: zoomEasing,
      });
      appendKeyframe(channels.zoom, {
        atMs: arrivalMs,
        value: target.zoom,
        label: target.scene.id,
      });
    } else if (transition === "pan" || transition === "whip-pan") {
      for (const field of ["centerX", "centerY"] as const) {
        appendKeyframe(channels[field], {
          atMs: startMs,
          value: previous[field],
          easing: positionEasing,
        });
        appendKeyframe(channels[field], {
          atMs: arrivalMs,
          value: target[field],
          label: target.scene.id,
        });
      }
      target.zoom = previous.zoom;
      appendKeyframe(channels.zoom, {
        atMs: arrivalMs,
        value: target.zoom,
        label: target.scene.id,
      });
    } else {
      const push = transition === "push-in";
      if (
        (push && target.zoom <= previous.zoom) ||
        (!push && target.zoom >= previous.zoom)
      ) {
        throw new Error(
          `场景 ${target.scene.id} 的 ${transition} 与景别不一致`,
        );
      }
      for (const field of ["centerX", "centerY"] as const) {
        target[field] = previous[field];
        appendKeyframe(channels[field], {
          atMs: arrivalMs,
          value: previous[field],
          label: target.scene.id,
        });
      }
      appendKeyframe(channels.zoom, {
        atMs: startMs,
        value: previous.zoom,
        easing: zoomEasing,
      });
      appendKeyframe(channels.zoom, {
        atMs: arrivalMs,
        value: target.zoom,
        label: target.scene.id,
      });
    }
  }

  return {
    id: "camera-main",
    targetType: "camera",
    targetId: "main",
    startMs: 0,
    durationMs: plan.durationMs,
    properties: [
      {
        property: "camera.centerX",
        fill: "both",
        keyframes: channels.centerX,
      } as AnimationProperty,
      {
        property: "camera.centerY",
        fill: "both",
        keyframes: channels.centerY,
      } as AnimationProperty,
      {
        property: "camera.zoom",
        fill: "both",
        keyframes: channels.zoom,
      } as AnimationProperty,
    ],
  };
};

const transitionProperty = (
  property: AnimationPropertyName,
  keyframes: DraftKeyframe[],
): AnimationProperty => ({ property, keyframes } as AnimationProperty);

const compileChapterTransitionTracks = (
  plan: StoryAnimationPlan,
  objectWindows: ObjectWindow[],
): StoryTransitionAnimationTrack[] => {
  const tracks: StoryTransitionAnimationTrack[] = [];
  for (let index = 1; index < plan.scenes.length; index += 1) {
    const scene = plan.scenes[index];
    const previousScene = plan.scenes[index - 1];
    const transition = scene.transition;
    if (!transition) {
      continue;
    }
    const durationMs = Math.round(transition.durationMs);
    const startMs = scene.startMs - durationMs;
    if (startMs < previousScene.startMs) {
      throw new Error(`场景 ${scene.id} 的章节转场侵入上一场景起点`);
    }
    const overlaps = objectWindows.filter(
      (window) => window.startMs < scene.startMs && window.endMs > startMs,
    );
    if (overlaps.length > 0) {
      throw new Error(
        `场景 ${scene.id} 的章节转场与 Object Cue 重叠：${overlaps
          .map((window) => window.cueId)
          .join(", ")}`,
      );
    }
    if (transition.effect === "camera" && !scene.camera) {
      throw new Error(`场景 ${scene.id} 使用镜头漫游转场时必须配置 Camera`);
    }
    if (transition.effect !== "camera" && scene.camera) {
      throw new Error(
        `场景 ${scene.id} 已使用舞台转场，不能同时执行 Camera 切换`,
      );
    }

    const transitionId = `chapter-${sanitizeId(previousScene.id)}-${sanitizeId(
      scene.id,
    )}`;
    const smooth: AnimationEasing = { type: "preset", name: "smooth" };
    const primary = transition.color || "#EF4444FF";
    const background = transition.backgroundColor || "#FFFFFFFF";
    const base = (
      layerId: string,
      name: string,
      role: NonNullable<StoryTransitionAnimationTrack["role"]>,
      effect: StoryChapterTransitionPlan["effect"],
      properties: AnimationProperty[],
    ): StoryTransitionAnimationTrack => ({
      id: `transition-${transitionId}-${layerId}`,
      name,
      targetType: "transition" as const,
      targetId: `${transitionId}:${layerId}`,
      transitionId,
      layerId,
      fromSceneId: previousScene.id,
      toSceneId: scene.id,
      effect,
      direction: transition.direction || "left",
      ...(transition.origin ? { origin: transition.origin } : {}),
      role,
      startMs,
      durationMs,
      properties,
    });
    const progress = (from = 0, to = 1) =>
      transitionProperty("transition.progress", [
        { atMs: 0, value: from, easing: smooth },
        {
          atMs: Math.round(durationMs * 0.58),
          value: from + (to - from) * 0.44,
          easing: smooth,
        },
        { atMs: durationMs, value: to },
      ]);
    const opacity = (keyframes: DraftKeyframe[]) =>
      transitionProperty("transition.opacity", keyframes);
    const color = (value: string) =>
      transitionProperty("transition.color", [{ atMs: 0, value, hold: true }]);

    if (transition.effect === "color-wipe") {
      const firstEnd = Math.round(durationMs * 0.64);
      const overlap = Math.round(durationMs * 0.18);
      tracks.push(
        base("color", "颜色扫过 · 主色", "exit", transition.effect, [
          transitionProperty("transition.progress", [
            { atMs: 0, value: 0, easing: smooth },
            { atMs: firstEnd, value: 1 },
          ]),
          opacity([
            { atMs: 0, value: 1, hold: true },
            { atMs: firstEnd + overlap, value: 1, easing: smooth },
            { atMs: durationMs, value: 0 },
          ]),
          color(primary),
        ]),
        base("background", "颜色扫过 · 背景色", "enter", transition.effect, [
          transitionProperty("transition.progress", [
            { atMs: firstEnd - overlap, value: 0, easing: smooth },
            { atMs: durationMs, value: 1 },
          ]),
          opacity([
            { atMs: 0, value: 0, hold: true },
            { atMs: firstEnd - overlap, value: 1, easing: smooth },
            { atMs: durationMs, value: 1 },
          ]),
          color(background),
        ]),
      );
      continue;
    }

    if (transition.effect === "fade-through-color") {
      tracks.push(
        base("fade", "淡入淡出转场", "bridge", transition.effect, [
          progress(),
          opacity([
            { atMs: 0, value: 0, easing: smooth },
            { atMs: Math.round(durationMs / 2), value: 1, easing: smooth },
            { atMs: durationMs, value: 0 },
          ]),
          color(primary),
        ]),
      );
      continue;
    }

    const names = {
      camera: "镜头漫游转场",
      "directional-wipe": "方向擦除转场",
      push: "画布推移转场",
      iris: "圆形开合转场",
    };
    tracks.push(
      base("main", names[transition.effect], "bridge", transition.effect, [
        progress(),
        opacity([
          { atMs: 0, value: transition.effect === "camera" ? 0 : 1 },
          { atMs: durationMs, value: transition.effect === "camera" ? 0 : 1 },
        ]),
        color(primary),
        ...(transition.effect === "iris"
          ? [
              transitionProperty("transition.scale", [
                { atMs: 0, value: 0.96, easing: smooth },
                {
                  atMs: Math.round(durationMs * 0.72),
                  value: 1.06,
                  easing: {
                    type: "spring",
                    mass: 1,
                    stiffness: 170,
                    damping: 18,
                  },
                },
                { atMs: durationMs, value: 1, easing: smooth },
              ]),
            ]
          : []),
        ...(transition.effect === "push"
          ? [
              transitionProperty("transition.scale", [
                { atMs: 0, value: 1, easing: smooth },
                {
                  atMs: Math.round(durationMs * 0.68),
                  value: 1.04,
                  easing: {
                    type: "spring",
                    mass: 1,
                    stiffness: 150,
                    damping: 20,
                  },
                },
                { atMs: durationMs, value: 1, easing: smooth },
              ]),
            ]
          : []),
      ]),
    );
  }
  return tracks;
};

const effectName = (cue: StoryAnimationCue): string => {
  if (cue.type === "enter") {
    return cue.effect === "fade" ? "fade-in" : `${cue.effect}-in`;
  }
  if (cue.type === "exit") {
    return cue.effect === "fade" ? "fade-out" : `${cue.effect}-out`;
  }
  return cue.effect;
};

const visibilityPropertyForCue = (
  cue: StoryAnimationCue,
  durationMs: number,
): AnimationProperty | null => {
  if (cue.type === "enter") {
    return {
      property: "element.visibility",
      fill: "forwards",
      keyframes: [
        { atMs: 0, value: "hidden", hold: true },
        { atMs: Math.min(1, durationMs), value: "visible", hold: true },
      ],
    };
  }
  if (cue.type === "exit") {
    return {
      property: "element.visibility",
      fill: "forwards",
      keyframes: [
        { atMs: 0, value: "visible", hold: true },
        { atMs: durationMs, value: "hidden", hold: true },
      ],
    };
  }
  return null;
};

const compileCue = ({
  cue,
  scene,
  targetId,
  targetIndex,
  plan,
  connectors,
  canvasTarget,
}: {
  cue: StoryAnimationCue;
  scene: StoryAnimationPlanScene;
  targetId: string;
  targetIndex: number;
  plan: StoryAnimationPlan;
  connectors: Set<string>;
  canvasTarget: CanvasTarget | undefined;
}): StoryElementAnimationTrack => {
  // A track carrying sceneId uses scene-local time. Runtime scheduling adds the
  // scene start exactly once.
  const startMs = cue.atMs + targetIndex * (cue.staggerMs || 0);
  const durationMs =
    cue.durationMs ?? DEFAULT_DURATION_BY_PACE[plan.style.pace] ?? 500;
  const id = `${sanitizeId(scene.id)}-${sanitizeId(cue.id)}-${sanitizeId(
    targetId,
  )}`;
  if (cue.type === "style") {
    const property = cue.styleProperty;
    if (!property || cue.styleValue === undefined) {
      throw new Error(`Style Cue ${cue.id} 缺少属性或目标值`);
    }
    const styleKey = CANVAS_STYLE_KEY_BY_ANIMATION_PROPERTY[property];
    const canvasStyle =
      canvasTarget && "style" in canvasTarget ? canvasTarget.style : undefined;
    const canvasValue = canvasStyle?.[styleKey];
    let fromValue =
      cue.fromStyleValue ?? canvasValue ?? DEFAULT_STYLE_VALUES[property];
    let toValue = cue.styleValue;
    if (property === "visual.roundness") {
      const normalizeRoundness = (value: unknown): number =>
        value === "round" || value === 1 ? 1 : 0;
      fromValue = normalizeRoundness(fromValue);
      toValue = normalizeRoundness(toValue);
    }
    const discrete = DISCRETE_STYLE_PROPERTIES.has(property);
    return {
      id,
      sceneId: scene.id,
      targetId,
      startMs,
      durationMs,
      properties: [
        {
          property,
          fill: "both",
          keyframes: discrete
            ? [{ atMs: 0, value: toValue, hold: true }]
            : [
                {
                  atMs: 0,
                  value: fromValue,
                  easing: easingFor(cue.motion, plan.style),
                },
                { atMs: durationMs, value: toValue },
              ],
        } as AnimationProperty,
      ],
    };
  }
  if (
    cue.type === "draw" ||
    (cue.type === "enter" && connectors.has(targetId))
  ) {
    const visibility = visibilityPropertyForCue(cue, durationMs);
    return {
      id,
      sceneId: scene.id,
      targetId,
      startMs,
      durationMs,
      properties: [
        {
          property: "advanced.drawProgress",
          fill: "both",
          keyframes: [
            { atMs: 0, value: 0, easing: easingFor(cue.motion, plan.style) },
            { atMs: durationMs, value: 1 },
          ],
        },
        ...(visibility ? [visibility] : []),
      ],
    };
  }
  const category =
    cue.type === "enter"
      ? "entrance"
      : cue.type === "exit"
      ? "exit"
      : "emphasis";
  const visibility = visibilityPropertyForCue(cue, durationMs);
  return {
    id,
    sceneId: scene.id,
    targetId,
    startMs,
    durationMs,
    ...(visibility ? { properties: [visibility] } : {}),
    presets: [
      {
        category,
        name: effectName(cue),
        atMs: 0,
        durationMs,
        easing: easingFor(cue.motion, plan.style),
        fill: cue.type === "exit" ? "forwards" : "both",
        ...(cue.effect === "slide"
          ? {
              direction: cue.direction || (cue.type === "exit" ? "down" : "up"),
            }
          : {}),
        ...(supportsDistance(cue) && cue.distance
          ? { distance: cue.distance }
          : {}),
        ...(supportsCount(cue) && cue.count ? { count: cue.count } : {}),
        ...(cue.effect === "highlight"
          ? { color: cue.color || DEFAULT_HIGHLIGHT_COLOR }
          : {}),
      } as AnimationPreset,
    ],
  };
};

export const validateStoryAnimationPlan = (
  plan: StoryAnimationPlan,
  canvasDraft: CanvasDraft,
): StoryAnimationPlan => {
  if (!plan?.style || !plan.durationMs || plan.durationMs < 1000) {
    throw new Error("动画计划必须先定义 style 和 durationMs");
  }
  if (!Array.isArray(plan.scenes) || plan.scenes.length === 0) {
    throw new Error("动画计划至少需要一个场景");
  }
  const targetIds = getTargetIds(canvasDraft);
  const connectorIds = new Set(
    canvasDraft.connectors.map((connector) => connector.id),
  );
  const beatIds = new Set((canvasDraft.beats || []).map((beat) => beat.id));
  const beatById = new Map(
    (canvasDraft.beats || []).map((beat) => [beat.id, beat]),
  );
  const sceneIds = new Set();
  let previousStart = -1;
  for (const [sceneIndex, scene] of plan.scenes.entries()) {
    if (sceneIds.has(scene.id) || scene.startMs <= previousStart) {
      throw new Error("动画计划的场景 id 必须唯一并按 startMs 严格递增");
    }
    sceneIds.add(scene.id);
    previousStart = scene.startMs;
    if (sceneIndex === 0 && scene.startMs !== 0) {
      throw new Error("动画计划的首场景必须从 0ms 开始");
    }
    if (sceneIndex === 0 && scene.transition) {
      throw new Error("动画计划的首场景不能配置章节转场");
    }
    if (!beatIds.has(scene.beatId)) {
      throw new Error(
        `场景 ${scene.id} 引用了不存在的故事节拍 ${scene.beatId}`,
      );
    }
    const storyBeat = beatById.get(scene.beatId);
    if (sceneIndex > 0 && storyBeat?.relationFromPrevious === "new-page") {
      if (
        scene.camera ||
        !scene.transition ||
        scene.transition.effect === "camera"
      ) {
        throw new Error(
          `场景 ${scene.id} 属于 new-page，必须使用非 Camera 的独立页面转场`,
        );
      }
    }
    if (sceneIndex > 0 && storyBeat?.relationFromPrevious === "same-space") {
      if (!scene.camera || scene.transition?.effect !== "camera") {
        throw new Error(
          `场景 ${scene.id} 属于 same-space，必须使用可编辑 Camera 漫游`,
        );
      }
    }
    if (scene.startMs + scene.durationMs > plan.durationMs) {
      throw new Error(`场景 ${scene.id} 超出故事总时长`);
    }
    const previousScene = plan.scenes[sceneIndex - 1];
    if (
      previousScene &&
      previousScene.startMs + previousScene.durationMs > scene.startMs
    ) {
      throw new Error(`场景 ${scene.id} 与上一场景时间范围重叠`);
    }
    if (
      scene.transition &&
      (!Number.isFinite(scene.transition.durationMs) ||
        scene.transition.durationMs < 300 ||
        scene.transition.durationMs > 5000 ||
        scene.startMs - scene.transition.durationMs < previousScene.startMs)
    ) {
      throw new Error(`场景 ${scene.id} 的章节转场时长无效`);
    }
    for (const targetId of scene.focusTargets) {
      if (!targetIds.has(targetId)) {
        throw new Error(`场景 ${scene.id} 引用了不存在的元素 ${targetId}`);
      }
    }
    if (scene.camera && scene.focusTargets.length === 0) {
      throw new Error(`场景 ${scene.id} 使用 Camera 时必须提供 focusTargets`);
    }
    if (sceneIndex > 0 && scene.camera?.transition === "hold") {
      throw new Error(`非首场景 ${scene.id} 不能使用 hold 镜头切换`);
    }
    const cueIds = new Set();
    for (const cue of scene.cues || []) {
      if (cueIds.has(cue.id)) {
        throw new Error(`场景 ${scene.id} 的 cue id 重复：${cue.id}`);
      }
      cueIds.add(cue.id);
      for (const targetId of cue.targets) {
        if (!targetIds.has(targetId)) {
          throw new Error(`Cue ${cue.id} 引用了不存在的元素 ${targetId}`);
        }
      }
      if (
        cue.type === "draw" &&
        cue.targets.some((targetId) => !connectorIds.has(targetId))
      ) {
        throw new Error(`Draw Cue ${cue.id} 只能引用真实连接线`);
      }
      const durationMs =
        cue.durationMs ?? DEFAULT_DURATION_BY_PACE[plan.style.pace] ?? 500;
      const cueEndMs =
        cue.atMs +
        durationMs +
        Math.max(0, cue.targets.length - 1) * (cue.staggerMs || 0);
      if (cue.atMs < 0 || cueEndMs > scene.durationMs) {
        throw new Error(`Cue ${cue.id} 超出场景 ${scene.id} 的时间范围`);
      }
    }
  }
  return plan;
};

export const compileStoryAnimationPlan = (
  inputPlan: StoryAnimationPlan,
  canvasDraft: CanvasDraft,
  { repair = true }: { repair?: boolean } = {},
): StoryAnimationDraft => {
  const plan = repair
    ? prepareStoryAnimationPlan(inputPlan, canvasDraft).plan
    : structuredClone(validateStoryAnimationPlan(inputPlan, canvasDraft));
  const connectors = new Set(
    canvasDraft.connectors.map((connector) => connector.id),
  );
  const canvasTargets = new Map(
    [
      ...canvasDraft.elements,
      ...(canvasDraft.connectors || []),
      ...(canvasDraft.libraryAssets || []),
    ].map((target) => [target.id, target]),
  );
  const tracks: StoryAnimationTrack[] = [];
  const objectWindows: ObjectWindow[] = [];
  for (const scene of plan.scenes) {
    for (const cue of scene.cues || []) {
      cue.targets.forEach((targetId, targetIndex) => {
        const track = compileCue({
          cue,
          scene,
          targetId,
          targetIndex,
          plan,
          connectors,
          canvasTarget: canvasTargets.get(targetId),
        });
        tracks.push(track);
        objectWindows.push({
          cueId: cue.id,
          startMs: scene.startMs + track.startMs,
          endMs: scene.startMs + track.startMs + track.durationMs,
        });
      });
    }
  }
  const cameraTrack = compileCameraTrack(plan, canvasDraft, objectWindows);
  if (cameraTrack) {
    tracks.unshift(cameraTrack);
  }
  tracks.unshift(...compileChapterTransitionTracks(plan, objectWindows));
  return {
    schemaVersion: "1.0",
    id: `animation-${canvasDraft.id}`,
    durationMs: plan.durationMs,
    frameRate: 60,
    rationale: plan.rationale,
    summary: plan.summary,
    plan: {
      schemaVersion: "1.0",
      durationMs: plan.durationMs,
      rationale: plan.rationale,
      summary: plan.summary,
      style: structuredClone(plan.style),
      scenes: structuredClone(plan.scenes),
    },
    scenes: plan.scenes.map((scene) => {
      const beat = (canvasDraft.beats || []).find(
        (candidate) => candidate.id === scene.beatId,
      );
      const relationLabel =
        beat?.relationFromPrevious === "same-space" ? "镜头漫游" : "独立页面";
      return {
        id: scene.id,
        name: beat?.title || scene.id,
        description: `${relationLabel} · ${
          beat?.relationReason || `Story beat: ${scene.beatId}`
        }`,
        startMs: scene.startMs,
        durationMs: scene.durationMs,
      };
    }),
    tracks: uniquifyDraftTrackIds(tracks),
  };
};

export const createEmptyAnimationPlan = (): EmptyAnimationPlan => ({
  schemaVersion: "1.0",
  durationMs: null,
  rationale: "",
  summary: "",
  style: null,
  scenes: [],
  finalized: false,
  compiledDraft: null,
});
