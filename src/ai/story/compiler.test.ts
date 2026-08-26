import { describe, expect, it } from "vitest";

import { convertToExcalidrawElements } from "@excalidraw/element";

import { parseAnimationProject } from "../../animation/schema";

import { compileStoryArtifact, sanitizeStoryRuntimeId } from "./compiler";
import { parseStoryArtifact } from "./schema";

import type { AnimationPreset } from "../../animation/types";

const libraryAssetElements = [
  {
    id: "asset-box",
    type: "rectangle",
    x: 10,
    y: 20,
    width: 100,
    height: 50,
    angle: 0,
    strokeColor: "#1e1e1e",
    backgroundColor: "transparent",
    fillStyle: "hachure",
    strokeWidth: 1,
    strokeStyle: "solid",
    roughness: 1,
    opacity: 100,
    groupIds: [],
    frameId: null,
    roundness: null,
    seed: 1,
    version: 1,
    versionNonce: 1,
    isDeleted: false,
    boundElements: null,
    updated: 1,
    link: null,
    locked: false,
  },
] as const;

const artifact = parseStoryArtifact({
  kind: "story-artifact",
  artifactId: "run-1",
  summary: "产品发布故事完成",
  directorPlan: {
    schemaVersion: "2.0",
    id: "launch-story",
    title: "产品发布",
    summary: "从问题到成果",
    durationMs: 8600,
    rationale: "两个完整场景需要清晰的阅读和镜头时间",
    directionSummary: "两个场景依次呈现问题与方案",
    style: {
      tone: "restrained",
      pace: "normal",
      reducedMotionFallback: true,
    },
    beats: [
      {
        id: "problem",
        title: "问题",
        elementIds: ["problem-card"],
        spaceId: "page-problem",
        relationFromPrevious: "new-page",
        relationReason: "故事首章建立初始页面",
      },
      {
        id: "solution",
        title: "方案",
        elementIds: ["solution-card"],
        spaceId: "page-solution",
        relationFromPrevious: "new-page",
        relationReason: "旧故事按独立页面迁移",
      },
    ],
    spaceLayouts: [],
    sections: [],
    content: [
      {
        id: "problem-card",
        kind: "shape",
        role: "problem",
        label: "用户问题",
      },
      {
        id: "solution-card",
        kind: "shape",
        role: "solution",
        label: "解决方案",
      },
      {
        id: "problem-to-solution",
        kind: "connector",
        role: "conversion",
        label: "转化",
        from: "problem-card",
        to: "solution-card",
      },
    ],
    scenes: [
      {
        id: "problem",
        beatId: "problem",
        startMs: 0,
        durationMs: 4000,
        focusTargets: ["problem-card"],
        camera: { framing: "fit", transition: "hold" },
        cues: [],
      },
      {
        id: "solution",
        beatId: "solution",
        startMs: 4600,
        durationMs: 4000,
        focusTargets: ["solution-card"],
        camera: { framing: "medium", transition: "reframe" },
        cues: [],
      },
    ],
    lifecycles: [
      {
        sceneId: "problem",
        enterTargetIds: [],
        persistentTargetIds: [],
        exitTargetIds: ["problem-card"],
      },
      {
        sceneId: "solution",
        enterTargetIds: ["solution-card"],
        persistentTargetIds: [],
        exitTargetIds: [],
      },
    ],
  },
  canvas: {
    schemaVersion: "1.0",
    id: "launch-story",
    title: "产品发布",
    summary: "从问题到成果",
    beats: [
      { id: "problem", title: "问题", elementIds: ["problem-card"] },
      { id: "solution", title: "方案", elementIds: ["solution-card"] },
    ],
    elements: [
      {
        id: "problem-card",
        type: "rectangle",
        role: "problem",
        label: "用户问题",
        x: 100,
        y: 160,
        width: 240,
        height: 100,
        style: {
          backgroundColor: "#1F2937",
          strokeColor: "#212529",
          textColor: "#F8FAFC",
        },
      },
      {
        id: "solution-card",
        type: "ellipse",
        role: "solution",
        label: "解决方案",
        x: 520,
        y: 160,
        width: 240,
        height: 100,
      },
    ],
    libraryAssets: [],
    connectors: [
      {
        id: "problem-to-solution",
        from: "problem-card",
        to: "solution-card",
        label: "转化",
        role: "conversion",
      },
    ],
  },
  animation: {
    schemaVersion: "1.0",
    id: "animation-launch-story",
    durationMs: 8600,
    frameRate: 60,
    rationale: "两个完整场景需要清晰的阅读和镜头时间",
    summary: "两个场景依次呈现问题与方案",
    plan: {
      schemaVersion: "1.0",
      durationMs: 8600,
      rationale: "两个完整场景需要清晰的阅读和镜头时间",
      summary: "两个场景依次呈现问题与方案",
      style: {
        tone: "restrained",
        pace: "normal",
        reducedMotionFallback: true,
      },
      scenes: [
        {
          id: "problem",
          beatId: "problem",
          startMs: 0,
          durationMs: 4000,
          focusTargets: ["problem-card"],
          camera: { framing: "fit", transition: "hold" },
          cues: [
            {
              id: "problem-exit",
              type: "exit",
              targets: ["problem-card"],
              atMs: 3200,
              durationMs: 500,
              effect: "fade",
            },
          ],
        },
        {
          id: "solution",
          beatId: "solution",
          startMs: 4600,
          durationMs: 4000,
          focusTargets: ["solution-card"],
          camera: { framing: "medium", transition: "reframe" },
          cues: [
            {
              id: "solution-enter",
              type: "enter",
              targets: ["solution-card"],
              atMs: 200,
              durationMs: 500,
              effect: "slide",
            },
          ],
        },
      ],
    },
    scenes: [
      { id: "problem", startMs: 0, durationMs: 4000 },
      { id: "solution", startMs: 4600, durationMs: 4000 },
    ],
    tracks: [
      {
        id: "camera-main",
        targetType: "camera",
        targetId: "main",
        startMs: 0,
        durationMs: 8600,
        properties: [
          {
            property: "camera.centerX",
            keyframes: [
              { atMs: 0, value: 220 },
              { atMs: 2600, value: 640 },
            ],
          },
          {
            property: "camera.centerY",
            keyframes: [
              { atMs: 0, value: 210 },
              { atMs: 2600, value: 210 },
            ],
          },
          {
            property: "camera.zoom",
            keyframes: [
              { atMs: 0, value: 1 },
              { atMs: 2600, value: 1.4 },
            ],
          },
        ],
      },
      {
        id: "problem-in",
        sceneId: "problem",
        targetId: "problem-card",
        startMs: 500,
        durationMs: 700,
        presets: [
          {
            category: "entrance",
            name: "fade-in",
            atMs: 0,
            durationMs: 700,
          },
        ],
      },
      {
        id: "connector-draw",
        sceneId: "problem",
        targetId: "problem-to-solution",
        startMs: 2600,
        durationMs: 900,
        properties: [
          {
            property: "advanced.drawProgress",
            fill: "both",
            keyframes: [
              { atMs: 0, value: 0 },
              { atMs: 900, value: 1 },
            ],
          },
        ],
      },
      {
        id: "solution-in",
        sceneId: "solution",
        targetId: "solution-card",
        startMs: 100,
        durationMs: 700,
        presets: [
          {
            category: "entrance",
            name: "slide-in",
            direction: "up",
            atMs: 0,
            durationMs: 700,
          },
        ],
      },
    ],
  },
});

describe("story compiler", () => {
  it("rejects animation plans that diverge from the frozen Director DSL", () => {
    expect(() =>
      parseStoryArtifact({
        ...artifact,
        animation: {
          ...artifact.animation,
          plan: {
            ...artifact.animation.plan,
            scenes: artifact.animation.plan.scenes.map((scene, index) =>
              index === 0 ? { ...scene, durationMs: 3900 } : scene,
            ),
          },
        },
      }),
    ).toThrow("改变了 Story Director Plan 的冻结结构");
  });

  it("keeps lossy Chinese runtime ids stable and distinct", () => {
    expect(sanitizeStoryRuntimeId("场景-问题")).not.toBe(
      sanitizeStoryRuntimeId("场景-方案"),
    );
    expect(sanitizeStoryRuntimeId("scene-problem")).toBe("scene-problem");
  });

  it("preserves managed Section layout metadata in story artifacts", () => {
    const managed = parseStoryArtifact({
      ...artifact,
      directorPlan: {
        ...artifact.directorPlan,
        spaceLayouts: [
          {
            spaceId: "page-problem",
            layout: { mode: "grid", padding: 60 },
          },
          {
            spaceId: "page-solution",
            layout: { mode: "grid", padding: 60 },
          },
        ],
        sections: [
          {
            id: "problem-section",
            spaceId: "page-problem",
            layout: { mode: "column" },
          },
          {
            id: "solution-section",
            spaceId: "page-solution",
            layout: { mode: "column" },
          },
        ],
      },
      canvas: {
        ...artifact.canvas,
        spaceLayouts: [
          {
            spaceId: "page-problem",
            layout: { mode: "grid", padding: 60 },
          },
          {
            spaceId: "page-solution",
            layout: { mode: "grid", padding: 60 },
          },
        ],
        sections: [
          {
            id: "problem-section",
            spaceId: "page-problem",
            layout: { mode: "column" },
          },
          {
            id: "solution-section",
            spaceId: "page-solution",
            layout: { mode: "column" },
          },
        ],
        elements: artifact.canvas.elements.map((element) => {
          const sectionId =
            element.id === "problem-card"
              ? "problem-section"
              : "solution-section";
          return {
            ...element,
            sectionId,
            layoutFrame: {
              x: 0,
              y: 0,
              width: element.width,
              height: element.height,
            },
          };
        }),
      },
    });

    expect(managed.canvas.spaceLayouts).toHaveLength(2);
    expect(managed.canvas.sections.map((section) => section.id)).toEqual([
      "problem-section",
      "solution-section",
    ]);
    expect(managed.canvas.elements[0]).toMatchObject({
      sectionId: "problem-section",
      layoutFrame: { x: 0, y: 0, width: 240, height: 100 },
    });
  });

  it("migrates legacy scene tracks from absolute to scene-local time", () => {
    const migrated = parseStoryArtifact({
      ...artifact,
      animation: {
        ...artifact.animation,
        tracks: [
          {
            id: "legacy-solution-in",
            sceneId: "solution",
            targetId: "solution-card",
            startMs: 4700,
            durationMs: 700,
            presets: [
              {
                category: "entrance",
                name: "fade-in",
                atMs: 0,
                durationMs: 700,
              },
            ],
          },
        ],
      },
    });

    expect(migrated.animation.tracks[0]).toMatchObject({
      sceneId: "solution",
      startMs: 100,
      durationMs: 700,
    });
    expect(() =>
      parseAnimationProject(compileStoryArtifact(migrated).animation),
    ).not.toThrow();
  });

  it("compiles a general canvas and preserves animation-authored duration", () => {
    const result = compileStoryArtifact(artifact);

    expect(result.animation.durationMs).toBe(8600);
    expect(artifact.canvas.beats).toMatchObject([
      {
        id: "problem",
        spaceId: "page-problem",
        relationFromPrevious: "new-page",
      },
      {
        id: "solution",
        spaceId: "page-solution",
        relationFromPrevious: "new-page",
      },
    ]);
    expect(artifact.animation.plan?.scenes).toHaveLength(2);
    expect(result.animation.scenes).toEqual(artifact.animation.scenes);
    expect(result.elements).toHaveLength(3);
    expect(result.animation.tracks).toHaveLength(7);
    expect(parseAnimationProject(result.animation)).toEqual(result.animation);
    expect(result.animation.tracks[0]).toMatchObject({
      id: "camera-main",
      target: { type: "camera", cameraId: "main" },
    });
    expect(
      result.elements.find(
        (element) => element.id === "ai-run-1-element-solution-card",
      )?.customData?.aiStory,
    ).toMatchObject({
      beatIds: ["solution"],
      spaceIds: ["page-solution"],
      spaceId: "page-solution",
      storyScope: "scene",
    });
    expect(
      result.elements.find(
        (element) => element.id === "ai-run-1-element-problem-card",
      ),
    ).toMatchObject({
      strokeColor: "#212529",
      backgroundColor: "#1F2937",
      label: { strokeColor: "#F8FAFC" },
    });
    expect(
      result.animation.tracks.filter(
        (track) =>
          track.target.type === "element" && track.sceneId === "problem",
      ),
    ).toHaveLength(4);
    expect(
      result.animation.tracks.filter(
        (track) =>
          track.target.type === "element" && track.sceneId === "solution",
      ),
    ).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ startMs: 100, durationMs: 700 }),
      ]),
    );
    expect(
      result.elements.find(
        (element) => element.id === "ai-run-1-connector-problem-to-solution",
      ),
    ).toMatchObject({
      type: "arrow",
      elbowed: true,
      start: { id: "ai-run-1-element-problem-card" },
      end: { id: "ai-run-1-element-solution-card" },
      label: {
        id: "ai-run-1-connector-label-problem-to-solution",
        text: "转化",
      },
    });
    const converted = convertToExcalidrawElements(result.elements, {
      regenerateIds: false,
      snapBindingsToOutline: true,
    });
    expect(converted.map((element) => element.id)).toEqual(
      expect.arrayContaining(result.elementIds),
    );
    const arrow = converted.find(
      (element) => element.id === "ai-run-1-connector-problem-to-solution",
    );
    const label = converted.find(
      (element) =>
        element.id === "ai-run-1-connector-label-problem-to-solution",
    );
    expect(arrow).toMatchObject({
      type: "arrow",
      elbowed: true,
      groupIds: [],
      startBinding: { elementId: "ai-run-1-element-problem-card" },
      endBinding: { elementId: "ai-run-1-element-solution-card" },
      boundElements: [
        { id: "ai-run-1-connector-label-problem-to-solution", type: "text" },
      ],
    });
    expect(label).toMatchObject({
      type: "text",
      containerId: "ai-run-1-connector-problem-to-solution",
      groupIds: [],
    });
    expect(result.animation.tracks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: "转化 · 文本",
          target: {
            type: "element",
            elementId: "ai-run-1-connector-label-problem-to-solution",
          },
          startMs: expect.any(Number),
          presets: [
            expect.objectContaining({ category: "entrance", name: "fade-in" }),
          ],
        }),
      ]),
    );
    const problemShape = converted.find(
      (element) => element.id === "ai-run-1-element-problem-card",
    );
    const problemLabel = converted.find(
      (element) => element.id === "ai-run-1-label-problem-card",
    );
    expect(problemShape).toMatchObject({
      type: "rectangle",
      groupIds: [],
      boundElements: expect.arrayContaining([
        { id: "ai-run-1-label-problem-card", type: "text" },
        { id: "ai-run-1-connector-problem-to-solution", type: "arrow" },
      ]),
    });
    expect(problemLabel).toMatchObject({
      type: "text",
      containerId: "ai-run-1-element-problem-card",
      groupIds: [],
    });
    expect(converted.every((element) => element.groupIds.length === 0)).toBe(
      true,
    );
    const arrowIndex = converted.findIndex(
      (element) => element.id === "ai-run-1-connector-problem-to-solution",
    );
    const problemIndex = converted.findIndex(
      (element) => element.id === "ai-run-1-element-problem-card",
    );
    const solutionIndex = converted.findIndex(
      (element) => element.id === "ai-run-1-element-solution-card",
    );
    expect(arrowIndex).toBeLessThan(problemIndex);
    expect(arrowIndex).toBeLessThan(solutionIndex);
    if (arrow?.type !== "arrow") {
      throw new Error("Expected an arrow");
    }
    const firstPoint = arrow.points[0];
    const lastPoint = arrow.points[arrow.points.length - 1];
    expect(arrow.x + firstPoint[0]).toBeGreaterThan(300);
    expect(arrow.x + lastPoint[0]).toBeLessThan(560);
  });

  it("routes AI connectors as native 90-degree elbow arrows", () => {
    const diagonalArtifact = parseStoryArtifact({
      ...artifact,
      canvas: {
        ...artifact.canvas,
        elements: artifact.canvas.elements.map((element) =>
          element.id === "solution-card" ? { ...element, y: 420 } : element,
        ),
      },
    });
    const result = compileStoryArtifact(diagonalArtifact);
    const converted = convertToExcalidrawElements(result.elements, {
      regenerateIds: false,
      snapBindingsToOutline: true,
    });
    const arrow = converted.find(
      (element) => element.id === "ai-run-1-connector-problem-to-solution",
    );

    expect(arrow).toMatchObject({ type: "arrow", elbowed: true });
    expect(arrow?.type === "arrow" ? arrow.points.length : 0).toBeGreaterThan(
      2,
    );
    if (arrow?.type !== "arrow") {
      throw new Error("Expected an arrow");
    }
    expect(
      arrow.points.slice(1).every((point, index) => {
        const previous = arrow.points[index];
        return point[0] === previous[0] || point[1] === previous[1];
      }),
    ).toBe(true);
  });

  it("converts a centered Canvas text box to Excalidraw center anchors", () => {
    const centeredTextArtifact: typeof artifact = {
      ...artifact,
      canvas: {
        ...artifact.canvas,
        elements: [
          ...artifact.canvas.elements,
          {
            id: "page-title",
            type: "text",
            role: "page-title",
            label: "下一步行动计划",
            x: 60,
            y: 380,
            width: 1160,
            height: 280,
            style: {
              fontSize: 42,
              textAlign: "center",
            },
          },
        ],
      },
    };
    const result = compileStoryArtifact(centeredTextArtifact);
    const skeleton = result.elements.find(
      (element) => element.id === "ai-run-1-element-page-title",
    );

    expect(skeleton).toMatchObject({ x: 640, y: 520 });

    const converted = convertToExcalidrawElements(result.elements, {
      regenerateIds: false,
      snapBindingsToOutline: true,
    });
    const title = converted.find(
      (element) => element.id === "ai-run-1-element-page-title",
    );
    expect(title).toBeDefined();
    if (!title) {
      throw new Error("Expected centered page title");
    }
    expect(title.x + title.width / 2).toBeCloseTo(640);
    expect(title.y + title.height / 2).toBeCloseTo(520);
  });

  it("reflows semantic card children instead of trusting stale coordinates", () => {
    const cardArtifact = parseStoryArtifact({
      ...artifact,
      directorPlan: {
        ...artifact.directorPlan,
        content: [
          ...artifact.directorPlan.content,
          {
            id: "problem-caption",
            kind: "text",
            role: "caption",
            label: "与问题卡片对应的说明",
          },
        ],
      },
      canvas: {
        ...artifact.canvas,
        elements: [
          ...artifact.canvas.elements,
          {
            id: "problem-caption",
            type: "text",
            role: "caption",
            label: "与问题卡片对应的说明",
            parentId: "problem-card",
            layout: { slot: "footer", align: "center", padding: 20 },
            x: 5000,
            y: 5000,
            width: 180,
            height: 36,
          },
        ],
      },
    });
    const result = compileStoryArtifact(cardArtifact);
    const caption = result.elements.find(
      (element) => element.id === "ai-run-1-element-problem-caption",
    );

    expect(caption).toBeUndefined();
    const parent = result.elements.find(
      (element) => element.id === "ai-run-1-element-problem-card",
    );
    expect(parent).toMatchObject({
      type: "rectangle",
      label: expect.objectContaining({
        text: expect.stringContaining("与问题卡片对应的说明"),
        verticalAlign: "bottom",
      }),
    });
  });

  it("repairs legacy highlight presets without a color", () => {
    const highlightArtifact = parseStoryArtifact({
      ...artifact,
      animation: {
        ...artifact.animation,
        tracks: [
          {
            id: "legacy-highlight",
            targetId: "problem-card",
            startMs: 1000,
            durationMs: 500,
            presets: [
              {
                category: "emphasis",
                name: "highlight",
                atMs: 0,
                durationMs: 500,
              },
            ],
          },
        ],
      },
    });
    const result = compileStoryArtifact(highlightArtifact);

    expect(result.animation.tracks[0].presets?.[0]).toMatchObject({
      category: "emphasis",
      name: "highlight",
      color: "#FFD43B88",
    });
    expect(parseAnimationProject(result.animation)).toEqual(result.animation);
  });

  it("removes legacy cue fields unsupported by the compiled preset", () => {
    const fadeArtifact = parseStoryArtifact({
      ...artifact,
      animation: {
        ...artifact.animation,
        tracks: [
          {
            id: "legacy-fade-distance",
            targetId: "problem-card",
            startMs: 1000,
            durationMs: 500,
            presets: [
              {
                category: "entrance",
                name: "fade-in",
                atMs: 0,
                durationMs: 500,
                distance: 24,
                count: 2,
              },
            ],
          },
        ],
      },
    });
    const result = compileStoryArtifact(fadeArtifact);
    const preset = result.animation.tracks[0].presets?.[0] as
      | (AnimationPreset & Record<string, unknown>)
      | undefined;

    expect(preset).not.toHaveProperty("distance");
    expect(preset).not.toHaveProperty("count");
    expect(parseAnimationProject(result.animation)).toEqual(result.animation);
  });

  it("compiles a selected library item as one semantic animation target", () => {
    const libraryArtifact = parseStoryArtifact({
      ...artifact,
      directorPlan: {
        ...artifact.directorPlan,
        beats: [
          ...artifact.directorPlan.beats,
          {
            id: "asset",
            title: "Asset",
            elementIds: ["cloud-icon"],
            spaceId: "page-asset",
            relationFromPrevious: "new-page",
            relationReason: "旧故事按独立页面迁移",
          },
        ],
        content: [
          ...artifact.directorPlan.content,
          {
            id: "cloud-icon",
            kind: "visual",
            role: "illustration",
          },
        ],
      },
      canvas: {
        ...artifact.canvas,
        beats: [
          ...artifact.canvas.beats,
          { id: "asset", title: "Asset", elementIds: ["cloud-icon"] },
        ],
        libraryAssets: [
          {
            id: "cloud-icon",
            ref: "icons/cloud.excalidrawlib#0",
            role: "illustration",
            x: 900,
            y: 200,
            width: 200,
            height: 100,
            sourceWidth: 100,
            sourceHeight: 50,
            libraryName: "Icons",
            itemName: "Cloud",
            elements: libraryAssetElements,
          },
        ],
      },
      animation: {
        ...artifact.animation,
        tracks: [
          ...artifact.animation.tracks,
          {
            id: "cloud-in",
            targetId: "cloud-icon",
            startMs: 4000,
            durationMs: 600,
            presets: [
              {
                category: "entrance",
                name: "fade-in",
                atMs: 0,
                durationMs: 600,
              },
            ],
          },
        ],
      },
    });
    const result = compileStoryArtifact(libraryArtifact);
    const assetElement = result.elements.find(
      (element) => element.customData?.aiStory?.semanticId === "cloud-icon",
    );

    expect(assetElement).toMatchObject({
      type: "rectangle",
      x: 900,
      y: 200,
      width: 200,
      height: 100,
      customData: {
        aiStory: {
          kind: "library-asset",
          libraryRef: "icons/cloud.excalidrawlib#0",
        },
      },
    });
    expect(result.animation.tracks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          target: { type: "element", elementId: assetElement?.id },
          startMs: 4000,
        }),
      ]),
    );
  });

  it("rejects animation tracks that exceed the planned story duration", () => {
    expect(() =>
      parseStoryArtifact({
        ...artifact,
        animation: {
          ...artifact.animation,
          durationMs: 2000,
          tracks: [
            {
              id: "late",
              targetId: "problem-card",
              startMs: 1800,
              durationMs: 600,
            },
          ],
        },
      }),
    ).toThrow("无效轨道");
  });

  it("accepts transition tracks whose target is not a canvas element", () => {
    const transitionArtifact = parseStoryArtifact({
      ...artifact,
      animation: {
        ...artifact.animation,
        tracks: [
          ...artifact.animation.tracks,
          {
            id: "transition-problem-solution-main",
            name: "方向擦除转场",
            targetType: "transition",
            targetId: "problem-solution:main",
            transitionId: "problem-solution",
            layerId: "main",
            fromSceneId: "problem",
            toSceneId: "solution",
            effect: "directional-wipe",
            direction: "left",
            role: "bridge",
            startMs: 4000,
            durationMs: 600,
            properties: [
              {
                property: "transition.progress",
                keyframes: [
                  { atMs: 0, value: 0 },
                  { atMs: 600, value: 1 },
                ],
              },
              {
                property: "transition.opacity",
                keyframes: [
                  { atMs: 0, value: 1 },
                  { atMs: 600, value: 1 },
                ],
              },
              {
                property: "transition.color",
                keyframes: [{ atMs: 0, value: "#EF4444FF" }],
              },
            ],
          },
        ],
      },
    });

    const result = compileStoryArtifact(transitionArtifact);
    expect(result.animation.tracks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: "方向擦除转场",
          target: expect.objectContaining({
            type: "transition",
            transitionId: "chapter-problem-solution",
            fromSceneId: "problem",
            toSceneId: "solution",
          }),
        }),
      ]),
    );
    expect(() => parseAnimationProject(result.animation)).not.toThrow();
  });

  it("rejects transition tracks that reference missing scenes", () => {
    expect(() =>
      parseStoryArtifact({
        ...artifact,
        animation: {
          ...artifact.animation,
          tracks: [
            {
              id: "broken-transition",
              name: "错误转场",
              targetType: "transition",
              targetId: "missing:main",
              transitionId: "missing",
              layerId: "main",
              fromSceneId: "problem",
              toSceneId: "missing-scene",
              effect: "iris",
              startMs: 4000,
              durationMs: 600,
              properties: [],
            },
          ],
        },
      }),
    ).toThrow("无效转场场景引用");
  });

  it("recovers duplicate lossy draft ids without merging their tracks", () => {
    const duplicateIdArtifact = parseStoryArtifact({
      ...artifact,
      animation: {
        ...artifact.animation,
        tracks: [
          {
            id: "scene-------1---card",
            targetId: "problem-card",
            startMs: 500,
            durationMs: 400,
            properties: [
              {
                property: "visual.opacity",
                keyframes: [
                  { atMs: 0, value: 0 },
                  { atMs: 400, value: 1 },
                ],
              },
            ],
          },
          {
            id: "scene-------1---card",
            targetId: "solution-card",
            startMs: 4600,
            durationMs: 400,
            properties: [
              {
                property: "visual.opacity",
                keyframes: [
                  { atMs: 0, value: 0 },
                  { atMs: 400, value: 1 },
                ],
              },
            ],
          },
        ],
      },
    });

    const result = compileStoryArtifact(duplicateIdArtifact);
    const ids = result.animation.tracks.map((track) => track.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(() => parseAnimationProject(result.animation)).not.toThrow();
  });

  it("accepts 250 canvas items and rejects item 251", () => {
    const elements = [
      ...artifact.canvas.elements,
      ...Array.from({ length: 248 }, (_, index) => ({
        id: `extra-${index}`,
        type: "rectangle" as const,
        role: "decoration",
        x: index * 10,
        y: 500,
        width: 8,
        height: 8,
      })),
    ];
    expect(() =>
      parseStoryArtifact({
        ...artifact,
        directorPlan: {
          ...artifact.directorPlan,
          content: [
            ...artifact.directorPlan.content,
            ...Array.from({ length: 248 }, (_, index) => ({
              id: `extra-${index}`,
              kind: "shape",
              role: "decoration",
            })),
          ],
        },
        canvas: { ...artifact.canvas, elements },
      }),
    ).not.toThrow();
    expect(() =>
      parseStoryArtifact({
        ...artifact,
        canvas: {
          ...artifact.canvas,
          elements: [
            ...elements,
            {
              id: "item-251",
              type: "rectangle",
              x: 0,
              y: 0,
              width: 8,
              height: 8,
            },
          ],
        },
      }),
    ).toThrow("1 到 250 之间");
  });
});
