import type {
  CanvasDraft,
  StoryAnimationDraft,
  StoryArtifact,
  StoryDirectorPlan,
} from "./types";

export const MAX_CANVAS_DRAFT_ITEMS = 250;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const isString = (value: unknown): value is string =>
  typeof value === "string" && value.trim().length > 0;

const finiteNumber = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value);

const TRANSITION_EFFECTS = new Set([
  "camera",
  "color-wipe",
  "directional-wipe",
  "fade-through-color",
  "push",
  "iris",
]);
const TRANSITION_DIRECTIONS = new Set(["left", "right", "up", "down"]);
const TRANSITION_ORIGINS = new Set([
  "center",
  "top-left",
  "top-right",
  "bottom-left",
  "bottom-right",
]);
const TRANSITION_ROLES = new Set(["exit", "bridge", "enter"]);
const STORY_SPACE_RELATIONS = new Set(["same-space", "new-page"]);
const SPACE_LAYOUT_MODES = new Set(["row", "column", "grid"]);
const SECTION_LAYOUT_MODES = new Set([
  "row",
  "column",
  "grid",
  "overlay",
  "free",
]);

const validLayoutIntent = (
  value: unknown,
  modes: ReadonlySet<string>,
): value is Record<string, unknown> =>
  isRecord(value) &&
  modes.has(String(value.mode)) &&
  (value.columns === undefined || finiteNumber(value.columns)) &&
  (value.gap === undefined || finiteNumber(value.gap)) &&
  (value.padding === undefined || finiteNumber(value.padding));

const validateAnimationPlan = (value: unknown, durationMs: number) => {
  if (value === undefined) {
    return;
  }
  if (
    !isRecord(value) ||
    value.schemaVersion !== "1.0" ||
    value.durationMs !== durationMs ||
    !isString(value.rationale) ||
    !isString(value.summary) ||
    !isRecord(value.style) ||
    !["restrained", "natural", "energetic", "playful"].includes(
      String(value.style.tone),
    ) ||
    !["slow", "normal", "fast"].includes(String(value.style.pace)) ||
    !Array.isArray(value.scenes)
  ) {
    throw new Error("Animation Draft 包含无效 Animation Plan");
  }
};

const deriveStoryLifecycles = (
  scenes: StoryDirectorPlan["scenes"],
  canvas: CanvasDraft,
) => {
  const targetsByBeatId = new Map(
    canvas.beats.map((beat) => [beat.id, [...new Set(beat.elementIds)]]),
  );
  const targetsByScene = scenes.map(
    (scene) => targetsByBeatId.get(scene.beatId) ?? [],
  );
  return scenes.map((scene, sceneIndex) => {
    const currentTargets = targetsByScene[sceneIndex];
    const previousTargets = new Set(targetsByScene[sceneIndex - 1] ?? []);
    const nextTargets = new Set(targetsByScene[sceneIndex + 1] ?? []);
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

const parseDirectorPlan = (
  value: unknown,
  canvas: CanvasDraft,
): StoryDirectorPlan => {
  if (
    !isRecord(value) ||
    value.schemaVersion !== "2.0" ||
    value.id !== canvas.id ||
    value.title !== canvas.title ||
    value.summary !== canvas.summary ||
    !finiteNumber(value.durationMs) ||
    value.durationMs < 1000 ||
    value.durationMs > 120_000 ||
    !isString(value.rationale) ||
    !isString(value.directionSummary) ||
    !isRecord(value.style) ||
    !Array.isArray(value.beats) ||
    !Array.isArray(value.spaceLayouts) ||
    !Array.isArray(value.sections) ||
    !Array.isArray(value.content) ||
    !Array.isArray(value.scenes) ||
    !Array.isArray(value.lifecycles)
  ) {
    throw new Error("AI 返回的 Story Director Plan 无效");
  }
  const canvasElementsById = new Map(
    canvas.elements.map((element) => [element.id, element]),
  );
  const canvasAssetsById = new Map(
    canvas.libraryAssets.map((asset) => [asset.id, asset]),
  );
  const canvasConnectorsById = new Map(
    canvas.connectors.map((connector) => [connector.id, connector]),
  );
  const contentIds = new Set<string>();
  for (const content of value.content) {
    if (
      !isRecord(content) ||
      !isString(content.id) ||
      !["text", "shape", "visual", "connector"].includes(
        String(content.kind),
      ) ||
      !isString(content.role) ||
      contentIds.has(content.id)
    ) {
      throw new Error("Story Director Plan 包含无效内容规格");
    }
    contentIds.add(content.id);
    const element = canvasElementsById.get(content.id);
    const asset = canvasAssetsById.get(content.id);
    const connector = canvasConnectorsById.get(content.id);
    const matchesKind =
      (content.kind === "text" && element?.type === "text") ||
      (content.kind === "shape" && element && element.type !== "text") ||
      (content.kind === "visual" && Boolean(element || asset)) ||
      (content.kind === "connector" && Boolean(connector));
    const executed = element || asset || connector;
    const executedContract = executed as
      | { role?: string; label?: string; sectionId?: string }
      | undefined;
    if (
      !matchesKind ||
      !executedContract ||
      executedContract.role !== content.role ||
      (content.label !== undefined &&
        executedContract.label !== content.label) ||
      (content.sectionId !== undefined &&
        executedContract.sectionId !== content.sectionId) ||
      (content.kind === "connector" &&
        (connector?.from !== content.from || connector?.to !== content.to))
    ) {
      throw new Error("Story Director Plan 与派生画布内容不一致");
    }
  }
  const canvasItemIds = new Set([
    ...canvasElementsById.keys(),
    ...canvasAssetsById.keys(),
    ...canvasConnectorsById.keys(),
  ]);
  if (
    canvasItemIds.size !== contentIds.size ||
    [...canvasItemIds].some((id) => !contentIds.has(id))
  ) {
    throw new Error("Story Director Plan 未完整声明派生画布内容");
  }
  if (
    JSON.stringify(value.beats) !== JSON.stringify(canvas.beats) ||
    JSON.stringify(value.spaceLayouts) !==
      JSON.stringify(canvas.spaceLayouts) ||
    JSON.stringify(value.sections) !== JSON.stringify(canvas.sections)
  ) {
    throw new Error("Canvas Draft 与 Story Director Plan 不一致");
  }
  validateAnimationPlan(
    {
      ...value,
      schemaVersion: "1.0",
      summary: value.directionSummary,
    },
    value.durationMs,
  );
  const expectedLifecycles = deriveStoryLifecycles(
    value.scenes as StoryDirectorPlan["scenes"],
    canvas,
  );
  if (JSON.stringify(value.lifecycles) !== JSON.stringify(expectedLifecycles)) {
    throw new Error("Story Director Plan 的元素生命周期合同无效");
  }
  return value as StoryDirectorPlan;
};

const parseCanvasDraft = (value: unknown): CanvasDraft => {
  if (
    !isRecord(value) ||
    value.schemaVersion !== "1.0" ||
    !isString(value.id) ||
    !isString(value.title) ||
    !isString(value.summary) ||
    !Array.isArray(value.beats) ||
    !Array.isArray(value.elements) ||
    (value.libraryAssets !== undefined &&
      !Array.isArray(value.libraryAssets)) ||
    !Array.isArray(value.connectors)
  ) {
    throw new Error("AI 返回的 Canvas Draft 无效");
  }
  const libraryAssets = Array.isArray(value.libraryAssets)
    ? value.libraryAssets
    : [];
  const spaceLayouts = Array.isArray(value.spaceLayouts)
    ? value.spaceLayouts
    : [];
  const sections = Array.isArray(value.sections) ? value.sections : [];
  if (
    value.elements.length + libraryAssets.length === 0 ||
    value.elements.length + libraryAssets.length > MAX_CANVAS_DRAFT_ITEMS
  ) {
    throw new Error(
      `Canvas Draft 元素和资源数量必须在 1 到 ${MAX_CANVAS_DRAFT_ITEMS} 之间`,
    );
  }
  if (value.connectors.length > 160) {
    throw new Error("Canvas Draft 连接线不能超过 160 条");
  }
  const ids = new Set<string>();
  for (const element of value.elements) {
    if (
      !isRecord(element) ||
      !isString(element.id) ||
      !["rectangle", "ellipse", "diamond", "text"].includes(
        String(element.type),
      ) ||
      !finiteNumber(element.x) ||
      !finiteNumber(element.y) ||
      !finiteNumber(element.width) ||
      !finiteNumber(element.height)
    ) {
      throw new Error("Canvas Draft 包含无效元素");
    }
    if (ids.has(element.id)) {
      throw new Error(`Canvas Draft id 重复：${element.id}`);
    }
    ids.add(element.id);
  }
  for (const asset of libraryAssets) {
    if (
      !isRecord(asset) ||
      !isString(asset.id) ||
      !isString(asset.ref) ||
      !isString(asset.libraryName) ||
      !isString(asset.itemName) ||
      !finiteNumber(asset.x) ||
      !finiteNumber(asset.y) ||
      !finiteNumber(asset.width) ||
      !finiteNumber(asset.height) ||
      !finiteNumber(asset.sourceWidth) ||
      !finiteNumber(asset.sourceHeight) ||
      !Array.isArray(asset.elements) ||
      asset.elements.length === 0 ||
      ids.has(asset.id)
    ) {
      throw new Error("Canvas Draft 包含无效资源条目");
    }
    ids.add(asset.id);
  }
  const elementsById = new Map(
    value.elements.map((element) => [
      (element as Record<string, unknown>).id,
      element as Record<string, unknown>,
    ]),
  );
  for (const child of [...value.elements, ...libraryAssets]) {
    if (!isRecord(child)) {
      continue;
    }
    const hasParent = child.parentId !== undefined;
    const hasLayout = child.layout !== undefined;
    if (hasParent !== hasLayout) {
      throw new Error("Canvas Draft 卡片子元素必须同时包含 parentId 和 layout");
    }
    if (!hasParent) {
      continue;
    }
    const parent = elementsById.get(child.parentId);
    if (
      !isString(child.parentId) ||
      !isRecord(child.layout) ||
      !["header", "media", "body", "footer", "badge", "center"].includes(
        String(child.layout.slot),
      ) ||
      !parent ||
      parent.type === "text" ||
      parent.parentId !== undefined
    ) {
      throw new Error("Canvas Draft 包含无效卡片父子关系");
    }
  }
  for (const connector of value.connectors) {
    if (
      !isRecord(connector) ||
      !isString(connector.id) ||
      !isString(connector.from) ||
      !isString(connector.to) ||
      ids.has(connector.id) ||
      !ids.has(connector.from) ||
      !ids.has(connector.to)
    ) {
      throw new Error("Canvas Draft 包含无效连接线");
    }
    ids.add(connector.id);
  }
  const beatIds = new Set<string>();
  const rawBeats = value.beats as unknown[];
  const beats = rawBeats.map((beat, index) => {
    if (
      !isRecord(beat) ||
      !isString(beat.id) ||
      !isString(beat.title) ||
      !Array.isArray(beat.elementIds) ||
      beat.elementIds.some((elementId) => !isString(elementId)) ||
      beatIds.has(beat.id)
    ) {
      throw new Error("Canvas Draft 包含无效故事节拍");
    }
    beatIds.add(beat.id);
    const previous = index > 0 ? rawBeats[index - 1] : null;
    const previousSpaceId =
      isRecord(previous) && isString(previous.spaceId)
        ? previous.spaceId
        : previous && isRecord(previous) && isString(previous.id)
        ? `page-${previous.id}`
        : undefined;
    const relationFromPrevious =
      index === 0
        ? "new-page"
        : STORY_SPACE_RELATIONS.has(String(beat.relationFromPrevious))
        ? String(beat.relationFromPrevious)
        : "new-page";
    const spaceId = isString(beat.spaceId) ? beat.spaceId : `page-${beat.id}`;
    if (
      index > 0 &&
      ((relationFromPrevious === "same-space" && spaceId !== previousSpaceId) ||
        (relationFromPrevious === "new-page" && spaceId === previousSpaceId))
    ) {
      throw new Error("Canvas Draft 包含无效章节空间关系");
    }
    return {
      ...beat,
      spaceId,
      relationFromPrevious,
      relationReason: isString(beat.relationReason)
        ? beat.relationReason
        : index === 0
        ? "故事首章建立初始页面"
        : "旧故事按独立页面迁移",
    };
  });
  const storySpaceIds = new Set(beats.map((beat) => beat.spaceId));
  const layoutSpaceIds = new Set<string>();
  for (const spaceLayout of spaceLayouts) {
    if (
      !isRecord(spaceLayout) ||
      !isString(spaceLayout.spaceId) ||
      !storySpaceIds.has(spaceLayout.spaceId) ||
      layoutSpaceIds.has(spaceLayout.spaceId) ||
      !validLayoutIntent(spaceLayout.layout, SPACE_LAYOUT_MODES)
    ) {
      throw new Error("Canvas Draft 包含无效页面布局");
    }
    layoutSpaceIds.add(spaceLayout.spaceId);
  }
  const sectionIds = new Set<string>();
  for (const section of sections) {
    if (
      !isRecord(section) ||
      !isString(section.id) ||
      !isString(section.spaceId) ||
      !storySpaceIds.has(section.spaceId) ||
      sectionIds.has(section.id) ||
      !validLayoutIntent(section.layout, SECTION_LAYOUT_MODES)
    ) {
      throw new Error("Canvas Draft 包含无效 Section 布局");
    }
    sectionIds.add(section.id);
  }
  for (const item of [...value.elements, ...libraryAssets]) {
    if (
      isRecord(item) &&
      item.sectionId !== undefined &&
      (!isString(item.sectionId) || !sectionIds.has(item.sectionId))
    ) {
      throw new Error("Canvas Draft 包含无效 Section 引用");
    }
    const layoutFrame = isRecord(item) ? item.layoutFrame : undefined;
    if (
      layoutFrame !== undefined &&
      (!isRecord(layoutFrame) ||
        typeof layoutFrame.x !== "number" ||
        !Number.isFinite(layoutFrame.x) ||
        typeof layoutFrame.y !== "number" ||
        !Number.isFinite(layoutFrame.y) ||
        typeof layoutFrame.width !== "number" ||
        !Number.isFinite(layoutFrame.width) ||
        layoutFrame.width <= 0 ||
        typeof layoutFrame.height !== "number" ||
        !Number.isFinite(layoutFrame.height) ||
        layoutFrame.height <= 0 ||
        (layoutFrame.fontSize !== undefined &&
          (typeof layoutFrame.fontSize !== "number" ||
            !Number.isFinite(layoutFrame.fontSize) ||
            layoutFrame.fontSize <= 0)))
    ) {
      throw new Error("Canvas Draft 包含无效 Section 局部几何");
    }
  }
  return {
    ...value,
    beats,
    libraryAssets,
    spaceLayouts,
    sections,
  } as CanvasDraft;
};

const parseAnimationDraft = (
  value: unknown,
  targetIds: ReadonlySet<string>,
): StoryAnimationDraft => {
  const durationMs = isRecord(value) ? value.durationMs : undefined;
  if (
    !isRecord(value) ||
    value.schemaVersion !== "1.0" ||
    !isString(value.id) ||
    typeof durationMs !== "number" ||
    !Number.isFinite(durationMs) ||
    durationMs < 1000 ||
    durationMs > 120_000 ||
    !Array.isArray(value.tracks)
  ) {
    throw new Error("AI 返回的 Animation Draft 无效");
  }
  for (const track of value.tracks) {
    const startMs = isRecord(track) ? track.startMs : undefined;
    const trackDurationMs = isRecord(track) ? track.durationMs : undefined;
    const targetType = isRecord(track) ? track.targetType : undefined;
    const hasValidTarget =
      isRecord(track) && isString(track.targetId)
        ? targetType === "camera"
          ? track.targetId === "main"
          : targetType === "transition"
          ? isString(track.name) &&
            isString(track.transitionId) &&
            isString(track.layerId) &&
            isString(track.fromSceneId) &&
            isString(track.toSceneId) &&
            TRANSITION_EFFECTS.has(String(track.effect)) &&
            (track.direction === undefined ||
              TRANSITION_DIRECTIONS.has(String(track.direction))) &&
            (track.origin === undefined ||
              TRANSITION_ORIGINS.has(String(track.origin))) &&
            (track.role === undefined ||
              TRANSITION_ROLES.has(String(track.role)))
          : targetType === undefined || targetType === "element"
          ? targetIds.has(track.targetId)
          : false
        : false;
    if (
      !isRecord(track) ||
      !isString(track.id) ||
      (track.sceneId !== undefined && !isString(track.sceneId)) ||
      !hasValidTarget ||
      typeof startMs !== "number" ||
      !Number.isFinite(startMs) ||
      typeof trackDurationMs !== "number" ||
      !Number.isFinite(trackDurationMs) ||
      startMs < 0 ||
      trackDurationMs < 1 ||
      startMs + trackDurationMs > durationMs
    ) {
      throw new Error("Animation Draft 包含无效轨道或时间范围");
    }
    if (
      track.targetType !== undefined &&
      track.targetType !== "element" &&
      track.targetType !== "camera" &&
      track.targetType !== "transition"
    ) {
      throw new Error("Animation Draft 包含无效目标类型");
    }
  }
  validateAnimationPlan(value.plan, durationMs);
  if (value.scenes !== undefined) {
    if (!Array.isArray(value.scenes)) {
      throw new Error("Animation Draft 包含无效场景");
    }
    for (const scene of value.scenes) {
      const sceneStartMs = isRecord(scene) ? scene.startMs : undefined;
      const sceneDurationMs = isRecord(scene) ? scene.durationMs : undefined;
      if (
        !isRecord(scene) ||
        !isString(scene.id) ||
        !finiteNumber(sceneStartMs) ||
        !finiteNumber(sceneDurationMs) ||
        sceneStartMs < 0 ||
        sceneDurationMs < 1 ||
        sceneStartMs + sceneDurationMs > durationMs
      ) {
        throw new Error("Animation Draft 包含无效场景范围");
      }
    }
    const sceneIds = new Set(
      value.scenes
        .filter(isRecord)
        .map((scene) => scene.id)
        .filter(isString),
    );
    const scenesById = new Map(
      value.scenes
        .filter(isRecord)
        .filter((scene) => isString(scene.id))
        .map((scene) => [scene.id as string, scene]),
    );
    const normalizedTracks = value.tracks.map((track) => {
      if (!isRecord(track) || !isString(track.sceneId)) {
        return track;
      }
      const scene = scenesById.get(track.sceneId);
      const startMs = finiteNumber(track.startMs) ? track.startMs : 0;
      const trackDurationMs = finiteNumber(track.durationMs)
        ? track.durationMs
        : 0;
      const sceneStartMs =
        scene && finiteNumber(scene.startMs) ? scene.startMs : 0;
      const sceneDurationMs =
        scene && finiteNumber(scene.durationMs) ? scene.durationMs : null;
      const migratedStartMs = startMs - sceneStartMs;
      // Compatibility for artifacts produced while scene-local tracks were
      // accidentally serialized with project-absolute startMs.
      if (
        sceneDurationMs !== null &&
        startMs + trackDurationMs > sceneDurationMs &&
        migratedStartMs >= 0 &&
        migratedStartMs + trackDurationMs <= sceneDurationMs
      ) {
        return { ...track, startMs: migratedStartMs };
      }
      return track;
    });
    for (const track of normalizedTracks) {
      if (
        isRecord(track) &&
        track.sceneId !== undefined &&
        !sceneIds.has(String(track.sceneId))
      ) {
        throw new Error("Animation Draft 包含无效轨道场景引用");
      }
      if (isRecord(track) && isString(track.sceneId)) {
        const scene = scenesById.get(track.sceneId);
        const localStartMs = finiteNumber(track.startMs) ? track.startMs : 0;
        const localDurationMs = finiteNumber(track.durationMs)
          ? track.durationMs
          : 0;
        if (
          scene &&
          finiteNumber(scene.durationMs) &&
          localStartMs + localDurationMs > scene.durationMs
        ) {
          throw new Error("Animation Draft 包含超出场景范围的轨道");
        }
      }
      if (
        isRecord(track) &&
        track.targetType === "transition" &&
        (!sceneIds.has(String(track.fromSceneId)) ||
          !sceneIds.has(String(track.toSceneId)) ||
          track.fromSceneId === track.toSceneId)
      ) {
        throw new Error("Animation Draft 包含无效转场场景引用");
      }
    }
    value = { ...value, tracks: normalizedTracks };
  }
  return value as StoryAnimationDraft;
};

export const parseStoryArtifact = (value: unknown): StoryArtifact => {
  if (
    !isRecord(value) ||
    value.kind !== "story-artifact" ||
    !isString(value.artifactId) ||
    !isString(value.summary)
  ) {
    throw new Error("AI 返回的故事结果无效");
  }
  const canvas = parseCanvasDraft(value.canvas);
  const targetIds = new Set([
    ...canvas.elements.map((element) => element.id),
    ...canvas.libraryAssets.map((asset) => asset.id),
    ...canvas.connectors.map((connector) => connector.id),
  ]);
  const directorPlan = parseDirectorPlan(value.directorPlan, canvas);
  const animation = parseAnimationDraft(value.animation, targetIds);
  if (
    animation.durationMs !== directorPlan.durationMs ||
    animation.rationale !== directorPlan.rationale ||
    animation.summary !== directorPlan.directionSummary
  ) {
    throw new Error("Animation Draft 与 Story Director Plan 元数据不一致");
  }
  if (!animation.plan) {
    throw new Error("Animation Draft 缺少动画 Agent 规划结果");
  }
  const expectedAnimationPlan = {
    schemaVersion: "1.0",
    durationMs: directorPlan.durationMs,
    rationale: directorPlan.rationale,
    summary: directorPlan.directionSummary,
    style: directorPlan.style,
    scenes: directorPlan.scenes.map(
      ({ cues: _directorCues, ...scene }) => scene,
    ),
  };
  const actualAnimationPlan = {
    ...animation.plan,
    scenes: animation.plan.scenes.map(
      ({ cues: _animationCues, ...scene }) => scene,
    ),
  };
  if (
    JSON.stringify(actualAnimationPlan) !==
    JSON.stringify(expectedAnimationPlan)
  ) {
    throw new Error("Animation Draft 改变了 Story Director Plan 的冻结结构");
  }
  for (const [sceneIndex, scene] of animation.plan.scenes.entries()) {
    const lifecycle = directorPlan.lifecycles[sceneIndex];
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
    if (
      lifecycle.enterTargetIds.some(
        (targetId) => !enteredTargetIds.has(targetId),
      ) ||
      lifecycle.exitTargetIds.some(
        (targetId) => !exitedTargetIds.has(targetId),
      ) ||
      lifecycle.persistentTargetIds.some((targetId) =>
        exitedTargetIds.has(targetId),
      )
    ) {
      throw new Error("Animation Draft 未完整执行元素生命周期合同");
    }
  }
  return {
    kind: "story-artifact",
    artifactId: value.artifactId,
    summary: value.summary,
    directorPlan,
    canvas,
    animation,
  };
};
