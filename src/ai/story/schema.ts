import type { CanvasDraft, StoryAnimationDraft, StoryArtifact } from "./types";

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
const TRANSITION_ROLES = new Set(["exit", "bridge", "enter"]);
const STORY_SPACE_RELATIONS = new Set(["same-space", "new-page"]);

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
  return { ...value, beats, libraryAssets } as CanvasDraft;
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
  return {
    kind: "story-artifact",
    artifactId: value.artifactId,
    summary: value.summary,
    canvas,
    animation: parseAnimationDraft(value.animation, targetIds),
  };
};
