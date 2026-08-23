import {
  duplicateElements,
  getCommonBounds,
  type ExcalidrawElementSkeleton,
} from "@excalidraw/element";

import type { ExcalidrawElement } from "@excalidraw/element/types";
import type { ExcalidrawSelectionElement } from "@excalidraw/element/types";

import { resolveCanvasCardLayout } from "./cardLayout";

import type { AnimationPreset, AnimationTrack } from "../../animation/types";

import type {
  CanvasDraft,
  CanvasDraftElement,
  CanvasElementStyle,
  CompiledStory,
  StoryArtifact,
} from "./types";

const stableIdHash = (value: string) => {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
};

/** Keeps readable ASCII ids and adds a stable hash whenever sanitizing is lossy. */
export const sanitizeStoryRuntimeId = (value: string) => {
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

const sanitizeId = sanitizeStoryRuntimeId;

const uniquifyTrackIds = (tracks: AnimationTrack[]): AnimationTrack[] => {
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

const conciseChineseName = (value: string | undefined) => {
  const normalized = value?.split("\n")[0]?.replace(/\s+/g, " ").trim();
  return normalized && /\p{Script=Han}/u.test(normalized)
    ? normalized.slice(0, 24)
    : undefined;
};

const createCanvasDisplayNames = (canvas: CanvasDraft) => {
  const names = new Map<string, string>();
  const elementTypeNames: Record<CanvasDraftElement["type"], string> = {
    rectangle: "矩形",
    ellipse: "椭圆",
    diamond: "菱形",
    text: "文本",
  };
  canvas.elements.forEach((element, index) => {
    names.set(
      element.id,
      conciseChineseName(element.label) ??
        conciseChineseName(element.role) ??
        `${elementTypeNames[element.type]} ${index + 1}`,
    );
  });
  canvas.libraryAssets.forEach((asset, index) => {
    names.set(
      asset.id,
      conciseChineseName(asset.role) ??
        conciseChineseName(asset.itemName) ??
        `素材 ${index + 1}`,
    );
  });
  canvas.connectors.forEach((connector, index) => {
    names.set(
      connector.id,
      conciseChineseName(connector.label) ??
        conciseChineseName(connector.role) ??
        conciseChineseName(connector.meaning) ??
        `连接线 ${index + 1}`,
    );
  });
  return names;
};

const runtimeId = (artifactId: string, kind: string, semanticId: string) =>
  `ai-${sanitizeId(artifactId)}-${kind}-${sanitizeId(semanticId)}`;

const shapeStyle = (style: CanvasElementStyle = {}) => ({
  strokeColor: style.strokeColor ?? "#343A40",
  backgroundColor: style.backgroundColor ?? "#E7F5FF",
  fillStyle: style.fillStyle ?? "solid",
  strokeWidth: style.strokeWidth ?? 2,
  roughness: style.roughness ?? 1,
  opacity: style.opacity ?? 100,
});

const normalizeAnimationPresets = (
  presets: AnimationPreset[] | undefined,
): AnimationPreset[] | undefined =>
  presets?.map((preset) => {
    // Old planner artifacts could leak optional cue fields onto preset kinds
    // which do not support them (for example distance on fade-in). Strip those
    // fields before validating the deterministic AnimationProject boundary.
    const normalized = { ...preset } as Record<string, unknown>;
    if (
      preset.name !== "slide-in" &&
      preset.name !== "slide-out" &&
      preset.name !== "shake" &&
      preset.name !== "bounce"
    ) {
      delete normalized.distance;
    }
    if (
      preset.name !== "pulse" &&
      preset.name !== "shake" &&
      preset.name !== "bounce" &&
      preset.name !== "highlight"
    ) {
      delete normalized.count;
    }
    if (preset.category === "emphasis" && preset.name === "highlight") {
      return {
        ...normalized,
        color: preset.color || "#FFD43B88",
      } as AnimationPreset;
    }
    if (preset.category === "entrance" && preset.name === "slide-in") {
      return {
        ...normalized,
        direction: preset.direction || "up",
      } as AnimationPreset;
    }
    if (preset.category === "exit" && preset.name === "slide-out") {
      return {
        ...normalized,
        direction: preset.direction || "down",
      } as AnimationPreset;
    }
    return normalized as AnimationPreset;
  });

const connectorPorts = (from: CanvasDraftElement, to: CanvasDraftElement) => {
  const fromCenter = {
    x: from.x + from.width / 2,
    y: from.y + from.height / 2,
  };
  const toCenter = {
    x: to.x + to.width / 2,
    y: to.y + to.height / 2,
  };
  const deltaX = toCenter.x - fromCenter.x;
  const deltaY = toCenter.y - fromCenter.y;

  if (Math.abs(deltaX) >= Math.abs(deltaY)) {
    return {
      start: {
        x: deltaX >= 0 ? from.x + from.width : from.x,
        y: fromCenter.y,
      },
      end: {
        x: deltaX >= 0 ? to.x : to.x + to.width,
        y: toCenter.y,
      },
    };
  }

  return {
    start: {
      x: fromCenter.x,
      y: deltaY >= 0 ? from.y + from.height : from.y,
    },
    end: {
      x: toCenter.x,
      y: deltaY >= 0 ? to.y : to.y + to.height,
    },
  };
};

const textSkeleton = ({
  id,
  text,
  element,
  customData,
}: {
  id: string;
  text: string;
  element: CanvasDraftElement;
  customData: Record<string, unknown>;
}): ExcalidrawElementSkeleton => ({
  id,
  type: "text",
  text,
  x: element.x,
  y: element.y,
  width: element.width,
  height: element.height,
  fontSize: element.style?.fontSize ?? 20,
  textAlign: element.style?.textAlign ?? "center",
  verticalAlign: "middle",
  strokeColor: element.style?.strokeColor ?? "#212529",
  opacity: element.style?.opacity ?? 100,
  customData,
});

const storyLayer = (element: ExcalidrawElementSkeleton) => {
  const aiStory = element.customData?.aiStory as
    | { kind?: string; role?: string }
    | undefined;
  if (
    aiStory?.role === "lane-band" ||
    aiStory?.role === "background" ||
    aiStory?.role === "canvas-background" ||
    aiStory?.role === "section-background" ||
    aiStory?.role === "section-frame" ||
    aiStory?.role === "group-outline" ||
    aiStory?.role === "swimlane-background"
  ) {
    return 0;
  }
  if (aiStory?.kind === "connector") {
    return 1;
  }
  if (aiStory?.kind === "text" || aiStory?.role === "lane-header") {
    return 3;
  }
  return 2;
};

const compileLibraryAsset = (
  artifact: StoryArtifact,
  asset: StoryArtifact["canvas"]["libraryAssets"][number],
  storySpace: Record<string, unknown>,
): Exclude<ExcalidrawElement, ExcalidrawSelectionElement>[] => {
  const duplicated = duplicateElements({
    type: "everything",
    elements: asset.elements,
    randomizeSeed: true,
    preserveFrameChildrenOrder: true,
  }).duplicatedElements;
  const [minX, minY, maxX, maxY] = getCommonBounds(duplicated);
  const sourceWidth = Math.max(1, maxX - minX);
  const sourceHeight = Math.max(1, maxY - minY);
  const scale = Math.min(
    asset.width / sourceWidth,
    asset.height / sourceHeight,
  );
  const offsetX = asset.x + (asset.width - sourceWidth * scale) / 2;
  const offsetY = asset.y + (asset.height - sourceHeight * scale) / 2;
  return duplicated.map((element) => {
    const common = {
      ...element,
      x: offsetX + (element.x - minX) * scale,
      y: offsetY + (element.y - minY) * scale,
      width: element.width * scale,
      height: element.height * scale,
      strokeWidth: Math.max(0.5, element.strokeWidth * scale),
      customData: {
        ...element.customData,
        aiStory: {
          artifactId: artifact.artifactId,
          storyId: artifact.canvas.id,
          semanticId: asset.id,
          role: asset.role,
          kind: "library-asset",
          libraryRef: asset.ref,
          libraryName: asset.libraryName,
          itemName: asset.itemName,
          ...storySpace,
        },
      },
    };
    if (element.type === "text") {
      return {
        ...common,
        fontSize: Math.max(1, element.fontSize * scale),
      } as ExcalidrawElement;
    }
    if (
      element.type === "line" ||
      element.type === "arrow" ||
      element.type === "freedraw"
    ) {
      return {
        ...common,
        points: element.points.map(
          (point) => [point[0] * scale, point[1] * scale] as typeof point,
        ),
      } as ExcalidrawElement;
    }
    return common as ExcalidrawElement;
  }) as Exclude<ExcalidrawElement, ExcalidrawSelectionElement>[];
};

export const compileStoryArtifact = (
  artifact: StoryArtifact,
): CompiledStory => {
  artifact = {
    ...artifact,
    canvas: resolveCanvasCardLayout(artifact.canvas),
  };
  const elements: ExcalidrawElementSkeleton[] = [];
  const elementIds: string[] = [];
  const generatedIdsBySemanticId = new Map<string, string[]>();
  const primaryIdBySemanticId = new Map<string, string>();
  const displayNamesBySemanticId = createCanvasDisplayNames(artifact.canvas);
  const storySpacesBySemanticId = new Map<
    string,
    { beatIds: Set<string>; spaceIds: Set<string> }
  >();
  artifact.canvas.beats.forEach((beat) => {
    beat.elementIds.forEach((semanticId) => {
      const membership = storySpacesBySemanticId.get(semanticId) ?? {
        beatIds: new Set<string>(),
        spaceIds: new Set<string>(),
      };
      membership.beatIds.add(beat.id);
      membership.spaceIds.add(beat.spaceId);
      storySpacesBySemanticId.set(semanticId, membership);
    });
  });
  const parentBySemanticId = new Map(
    [...artifact.canvas.elements, ...artifact.canvas.libraryAssets]
      .filter((item) => item.parentId)
      .map((item) => [item.id, item.parentId!]),
  );
  const storySpaceData = (semanticId: string) => {
    const draftItem = [
      ...artifact.canvas.elements,
      ...artifact.canvas.libraryAssets,
    ].find((item) => item.id === semanticId);
    const membership =
      storySpacesBySemanticId.get(semanticId) ??
      storySpacesBySemanticId.get(parentBySemanticId.get(semanticId) ?? "");
    const beatIds = [...(membership?.beatIds ?? [])];
    const spaceIds = [
      ...(membership?.spaceIds ?? []),
      ...(!membership && draftItem?.spaceId ? [draftItem.spaceId] : []),
    ];
    return {
      beatIds,
      spaceIds,
      storyScope:
        draftItem?.storyScope ?? (spaceIds.length > 1 ? "master" : "scene"),
      ...(spaceIds.length === 1 ? { spaceId: spaceIds[0] } : {}),
    };
  };

  artifact.canvas.elements.forEach((element) => {
    const id = runtimeId(artifact.artifactId, "element", element.id);
    const customData = {
      aiStory: {
        artifactId: artifact.artifactId,
        storyId: artifact.canvas.id,
        semanticId: element.id,
        role: element.role,
        kind: element.type === "text" ? "text" : "shape",
        ...storySpaceData(element.id),
      },
    };
    primaryIdBySemanticId.set(element.id, id);
    elementIds.push(id);
    generatedIdsBySemanticId.set(element.id, [id]);

    if (element.type === "text") {
      elements.push(
        textSkeleton({
          id,
          text: element.label ?? element.id,
          element,
          customData,
        }),
      );
      return;
    }

    const labelId = element.label
      ? runtimeId(artifact.artifactId, "label", element.id)
      : undefined;
    if (labelId) {
      elementIds.push(labelId);
      generatedIdsBySemanticId.get(element.id)?.push(labelId);
    }
    elements.push({
      id,
      type: element.type,
      x: element.x,
      y: element.y,
      width: element.width,
      height: element.height,
      ...shapeStyle(element.style),
      roundness: element.type === "rectangle" ? { type: 3 } : null,
      ...(labelId && element.label
        ? {
            label: {
              id: labelId,
              text: element.label,
              fontSize: element.style?.fontSize ?? 20,
              textAlign: element.style?.textAlign ?? "center",
              verticalAlign: element.style?.verticalAlign ?? "middle",
              strokeColor: element.style?.strokeColor ?? "#212529",
              opacity: element.style?.opacity ?? 100,
              customData: {
                aiStory: {
                  artifactId: artifact.artifactId,
                  storyId: artifact.canvas.id,
                  semanticId: element.id,
                  role: element.role,
                  kind: "label",
                  ...storySpaceData(element.id),
                },
              },
            },
          }
        : {}),
      customData,
    });
  });

  artifact.canvas.libraryAssets.forEach((asset) => {
    const assetElements = compileLibraryAsset(
      artifact,
      asset,
      storySpaceData(asset.id),
    );
    const assetElementIds = assetElements.map((element) => element.id);
    elements.push(...(assetElements as ExcalidrawElementSkeleton[]));
    elementIds.push(...assetElementIds);
    primaryIdBySemanticId.set(asset.id, assetElementIds[0]);
    generatedIdsBySemanticId.set(asset.id, assetElementIds);
  });

  artifact.canvas.connectors.forEach((connector) => {
    const from = artifact.canvas.elements.find(
      (element) => element.id === connector.from,
    )!;
    const to = artifact.canvas.elements.find(
      (element) => element.id === connector.to,
    )!;
    const id = runtimeId(artifact.artifactId, "connector", connector.id);
    const labelId = connector.label
      ? runtimeId(artifact.artifactId, "connector-label", connector.id)
      : undefined;
    const ports = connectorPorts(from, to);
    elementIds.push(id, ...(labelId ? [labelId] : []));
    primaryIdBySemanticId.set(connector.id, id);
    generatedIdsBySemanticId.set(connector.id, labelId ? [id, labelId] : [id]);
    elements.push({
      id,
      type: "arrow",
      // AI connectors only declare the semantic relationship. Let Excalidraw's
      // native elbow-arrow router resolve the actual 90-degree path from the
      // bound start/end elements instead of asking the Agent to calculate
      // brittle intermediate coordinates.
      elbowed: true,
      x: ports.start.x,
      y: ports.start.y,
      width: ports.end.x - ports.start.x,
      height: ports.end.y - ports.start.y,
      ...shapeStyle(connector.style),
      backgroundColor: "transparent",
      start: { id: primaryIdBySemanticId.get(connector.from)! },
      end: { id: primaryIdBySemanticId.get(connector.to)! },
      ...(labelId && connector.label
        ? {
            label: {
              id: labelId,
              text: connector.label,
              fontSize: connector.style?.fontSize ?? 16,
              textAlign: "center" as const,
              verticalAlign: "middle" as const,
              strokeColor: connector.style?.strokeColor ?? "#495057",
            },
          }
        : {}),
      customData: {
        aiStory: {
          artifactId: artifact.artifactId,
          storyId: artifact.canvas.id,
          semanticId: connector.id,
          role: connector.role,
          kind: "connector",
          ...storySpaceData(connector.id),
        },
      },
    });
  });

  // Excalidraw renders later elements above earlier ones. Keep structural
  // backgrounds at the bottom, arrows below their nodes, and independent text
  // at the top. Bound arrow labels are still created with their connector and
  // remain readable above the arrow path.
  elements.sort((left, right) => storyLayer(left) - storyLayer(right));

  const tracks: AnimationTrack[] =
    artifact.animation.tracks.flatMap<AnimationTrack>(
      (track): AnimationTrack[] => {
        if (track.targetType === "camera") {
          return [
            {
              id: sanitizeId(track.id),
              name: "主镜头",
              target: { type: "camera" as const, cameraId: "main" as const },
              startMs: track.startMs,
              durationMs: track.durationMs,
              properties: structuredClone(track.properties),
            },
          ];
        }
        if (track.targetType === "transition") {
          const transitionId = `chapter-${sanitizeId(
            track.fromSceneId,
          )}-${sanitizeId(track.toSceneId)}`;
          return [
            {
              id: `transition-${transitionId}-${sanitizeId(track.layerId)}`,
              name: track.name,
              target: {
                type: "transition" as const,
                transitionId,
                layerId: track.layerId,
                fromSceneId: track.fromSceneId,
                toSceneId: track.toSceneId,
                effect: track.effect,
                direction: track.direction,
                role: track.role,
              },
              startMs: track.startMs,
              durationMs: track.durationMs,
              properties: structuredClone(track.properties),
            },
          ];
        }
        const generatedTargetIds =
          generatedIdsBySemanticId.get(track.targetId) ?? [];
        const targets = track.properties?.some(
          (property) =>
            property.property === "advanced.drawProgress" ||
            property.property === "advanced.path",
        )
          ? generatedTargetIds.slice(0, 1)
          : generatedTargetIds;
        const compiledTracks = targets.map((targetElementId, index) => ({
          id: `${sanitizeId(track.id)}-${index + 1}`,
          ...(track.sceneId ? { sceneId: track.sceneId } : {}),
          name: `${displayNamesBySemanticId.get(track.targetId) ?? "动画对象"}${
            index ? " · 文本" : ""
          }`,
          target: { type: "element" as const, elementId: targetElementId },
          startMs: track.startMs,
          durationMs: track.durationMs,
          ...(track.properties
            ? { properties: structuredClone(track.properties) }
            : {}),
          ...(track.presets
            ? {
                presets: normalizeAnimationPresets(
                  structuredClone(track.presets),
                ),
              }
            : {}),
        }));
        const connectorLabelId = generatedTargetIds[1];
        const drawsConnector = track.properties?.some(
          (property) => property.property === "advanced.drawProgress",
        );
        if (!connectorLabelId || !drawsConnector) {
          return compiledTracks;
        }
        const labelStartMs = Math.min(
          artifact.animation.durationMs - 1,
          (track.startMs ?? 0) + Math.round((track.durationMs ?? 1) * 0.55),
        );
        const labelDurationMs = Math.max(
          1,
          Math.min(
            260,
            artifact.animation.durationMs - labelStartMs,
            Math.max(1, Math.round((track.durationMs ?? 1) * 0.45)),
          ),
        );
        return [
          ...compiledTracks,
          {
            id: `${sanitizeId(track.id)}-label-entrance`,
            ...(track.sceneId ? { sceneId: track.sceneId } : {}),
            name: `${
              displayNamesBySemanticId.get(track.targetId) ?? "动画对象"
            } · 文本`,
            target: { type: "element" as const, elementId: connectorLabelId },
            startMs: labelStartMs,
            durationMs: labelDurationMs,
            properties: [
              {
                property: "element.visibility" as const,
                fill: "forwards" as const,
                keyframes: [
                  { atMs: 0, value: "hidden" as const, hold: true },
                  {
                    atMs: Math.min(1, labelDurationMs),
                    value: "visible" as const,
                    hold: true,
                  },
                ],
              },
            ],
            presets: [
              {
                category: "entrance" as const,
                name: "fade-in" as const,
                atMs: 0,
                durationMs: labelDurationMs,
                easing: { type: "preset" as const, name: "ease-out" as const },
                fill: "both" as const,
              },
            ],
          },
        ];
      },
    );

  const firstMainElementId = artifact.canvas.beats[0]?.elementIds.find(
    (elementId) => {
      const element = artifact.canvas.elements.find(
        (candidate) => candidate.id === elementId,
      );
      return (
        (element && element.type !== "text") ||
        artifact.canvas.libraryAssets.some((asset) => asset.id === elementId)
      );
    },
  );
  const animationSceneStartById = new Map(
    (artifact.animation.scenes ?? []).map((scene) => [scene.id, scene.startMs]),
  );
  const absoluteTrackStartMs = (track: {
    sceneId?: string;
    startMs?: number;
  }) =>
    (track.sceneId ? animationSceneStartById.get(track.sceneId) ?? 0 : 0) +
    (track.startMs ?? 0);
  const semanticEntranceStartMs = new Map<string, number>();
  artifact.animation.tracks.forEach((track) => {
    const absoluteStartMs = absoluteTrackStartMs(track);
    if (
      track.presets?.some((preset) => preset.category === "entrance") &&
      absoluteStartMs > 0
    ) {
      semanticEntranceStartMs.set(track.targetId, absoluteStartMs);
    }
  });
  const delayedRuntimeIds = new Set(
    tracks.flatMap((track) =>
      track.target.type === "element" &&
      track.presets?.some(
        (preset) =>
          preset.category === "entrance" &&
          absoluteTrackStartMs(track) + preset.atMs > 0,
      )
        ? [track.target.elementId]
        : [],
    ),
  );
  const allSemanticElements = [
    ...artifact.canvas.elements,
    ...artifact.canvas.libraryAssets,
  ];
  const animatedCanvasElements = allSemanticElements.filter((element) =>
    semanticEntranceStartMs.has(element.id),
  );
  allSemanticElements.forEach((element) => {
    if (
      element.id === firstMainElementId ||
      element.parentId === firstMainElementId ||
      element.role === "title"
    ) {
      return;
    }
    const generatedIds = generatedIdsBySemanticId.get(element.id) ?? [];
    const missingGeneratedIds = generatedIds.filter(
      (generatedId) => !delayedRuntimeIds.has(generatedId),
    );
    if (missingGeneratedIds.length === 0) {
      return;
    }
    const centerX = element.x + element.width / 2;
    const centerY = element.y + element.height / 2;
    const nearestAnimatedElement = animatedCanvasElements
      .map((candidate) => ({
        candidate,
        distance:
          Math.abs(candidate.x + candidate.width / 2 - centerX) +
          Math.abs(candidate.y + candidate.height / 2 - centerY) * 0.25,
      }))
      .sort((left, right) => left.distance - right.distance)[0]?.candidate;
    const nearestStartMs = nearestAnimatedElement
      ? semanticEntranceStartMs.get(nearestAnimatedElement.id)
      : undefined;
    const startMs = Math.max(
      1,
      Math.min(
        artifact.animation.durationMs - 1,
        (nearestStartMs ?? Math.round(artifact.animation.durationMs * 0.75)) -
          (element.role === "lane-band" || element.role === "lane-header"
            ? 300
            : 0),
      ),
    );
    const durationMs = Math.max(
      1,
      Math.min(500, artifact.animation.durationMs - startMs),
    );
    missingGeneratedIds.forEach((generatedId, index) => {
      tracks.push({
        id: `fallback-entrance-${sanitizeId(element.id)}-${index + 1}`,
        name: `${displayNamesBySemanticId.get(element.id) ?? "动画对象"}${
          index ? " · 文本" : ""
        }`,
        target: { type: "element", elementId: generatedId },
        startMs,
        durationMs,
        properties: [
          {
            property: "element.visibility",
            fill: "forwards",
            keyframes: [
              { atMs: 0, value: "hidden", hold: true },
              {
                atMs: Math.min(1, durationMs),
                value: "visible",
                hold: true,
              },
            ],
          },
        ],
        presets: [
          {
            category: "entrance",
            name: "fade-in",
            atMs: 0,
            durationMs,
            easing: { type: "preset", name: "ease-out" },
            fill: "both",
          },
        ],
      });
      delayedRuntimeIds.add(generatedId);
    });
  });

  return {
    artifactId: artifact.artifactId,
    elementIds,
    elements,
    animation: {
      schemaVersion: "1.0",
      id: artifact.animation.id,
      durationMs: artifact.animation.durationMs,
      frameRate: artifact.animation.frameRate,
      playback: { autoplay: true, iterations: 1 },
      ...(artifact.animation.scenes
        ? { scenes: structuredClone(artifact.animation.scenes) }
        : {}),
      tracks: uniquifyTrackIds(tracks),
      metadata: {
        source: "ai",
        title: artifact.canvas.title,
        description: artifact.animation.rationale,
      },
    },
  };
};
