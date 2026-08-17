import type { NonDeletedExcalidrawElement } from "@excalidraw/element/types";

import { ExcalidrawRendererAdapter } from "./excalidraw/RendererAdapter";
import {
  DEFAULT_ELEMENT_RUNTIME_STATE,
  RuntimeStateStore,
} from "./excalidraw/RuntimeStateStore";
import { sampleMotionPath } from "./excalidraw/ElementBindingManager";
import { parseAnimationProjectJson, serializeAnimationProject } from "./export";
import { AnimationRuntime } from "./runtime/AnimationRuntime";
import { MotionAdapter } from "./runtime/MotionAdapter";
import { animationProjectSchema } from "./schema";
import { SceneTimeline } from "./timeline";
import { ANIMATION_SCHEMA_VERSION } from "./types";

import type { AnimationProject } from "./types";

const advancedProject: AnimationProject = {
  schemaVersion: ANIMATION_SCHEMA_VERSION,
  id: "dashboard-presentation",
  durationMs: 4000,
  frameRate: 60,
  metadata: { source: "ai" },
  scenes: [
    { id: "overview", name: "Overview", startMs: 1000, durationMs: 2000 },
  ],
  groups: [
    {
      id: "cards",
      members: [
        { type: "element", elementId: "card-a" },
        { type: "element", elementId: "card-b" },
      ],
    },
  ],
  tracks: [
    {
      id: "card-stagger",
      target: { type: "group", groupId: "cards" },
      sceneId: "overview",
      startMs: 100,
      durationMs: 800,
      group: { mode: "stagger", eachMs: 200 },
      properties: [
        {
          property: "visual.opacity",
          keyframes: [
            {
              atMs: 0,
              value: 0,
              easing: { type: "preset", name: "linear" },
            },
            { atMs: 600, value: 1 },
          ],
        },
      ],
    },
    {
      id: "draw-arrow",
      target: { type: "element", elementId: "arrow-1" },
      startMs: 0,
      durationMs: 1000,
      properties: [
        {
          property: "advanced.drawProgress",
          keyframes: [
            {
              atMs: 0,
              value: 0,
              easing: { type: "preset", name: "linear" },
            },
            { atMs: 1000, value: 1 },
          ],
        },
        {
          property: "visual.strokeColor",
          keyframes: [
            { atMs: 0, value: "#1971C2FF" },
            { atMs: 1000, value: "#E03131FF" },
          ],
        },
        {
          property: "visual.backgroundColor",
          keyframes: [
            { atMs: 0, value: "#1971C200" },
            { atMs: 1000, value: "#40C057FF" },
          ],
        },
      ],
    },
  ],
};

describe("advanced animation capabilities", () => {
  it("accepts one main camera and rejects camera properties on elements", () => {
    const cameraProject: AnimationProject = {
      schemaVersion: "1.0",
      id: "camera-project",
      durationMs: 1000,
      frameRate: 60,
      tracks: [
        {
          id: "camera-main",
          target: { type: "camera", cameraId: "main" },
          properties: [
            {
              property: "camera.zoom",
              keyframes: [
                { atMs: 0, value: 1 },
                { atMs: 1000, value: 2 },
              ],
            },
          ],
        },
      ],
    };
    expect(animationProjectSchema.parse(cameraProject)).toEqual(cameraProject);
    expect(() =>
      animationProjectSchema.parse({
        ...cameraProject,
        tracks: [
          {
            ...cameraProject.tracks[0],
            target: { type: "element", elementId: "box" },
          },
        ],
      }),
    ).toThrow("Camera properties require a camera target");
  });

  it("samples an explicit cubic Bezier motion path", () => {
    const sampled = sampleMotionPath({
      progress: 0.5,
      motionPath: {
        type: "bezier",
        start: { x: 0, y: 0 },
        segments: [
          {
            control1: { x: 0, y: 100 },
            control2: { x: 100, y: 100 },
            to: { x: 100, y: 0 },
          },
        ],
      },
      orientToPath: true,
    });

    expect(sampled.x).toBeCloseTo(50, 0);
    expect(sampled.y).toBeCloseTo(75, 0);
    expect(Math.abs(sampled.rotation)).toBeLessThan(6);
  });

  it("projects draw progress onto an arrow without mutating it", () => {
    const store = new RuntimeStateStore();
    const renderer = new ExcalidrawRendererAdapter(store);
    const arrow = {
      id: "arrow-1",
      type: "arrow",
      x: 10,
      y: 20,
      width: 100,
      height: 100,
      angle: 0,
      opacity: 100,
      strokeColor: "#1e1e1e",
      backgroundColor: "transparent",
      points: [
        [0, 0],
        [100, 0],
        [100, 100],
      ],
      endBinding: null,
    } as unknown as NonDeletedExcalidrawElement;
    store.set("arrow-1", {
      ...DEFAULT_ELEMENT_RUNTIME_STATE,
      drawProgress: 0.5,
    });

    const projected = renderer.projectElement(arrow) as typeof arrow & {
      points: readonly (readonly [number, number])[];
    };
    expect(projected.points).toEqual([
      [0, 0],
      [100, 0],
    ]);
    expect((arrow as unknown as { points: unknown[] }).points).toHaveLength(3);
  });

  it("compiles scene offsets and deterministic child stagger", () => {
    const output = new MotionAdapter(advancedProject).compile();
    const starts = Object.values(output.state.objectsByKey)
      .map((object) => object.channels[0].keyframes)
      .map((keyframes) =>
        Math.min(...keyframes.map((keyframe) => keyframe.atMs / 1000)),
      )
      .sort((left, right) => left - right);

    expect(starts).toEqual([0, 1.1, 1.3]);
    expect(new SceneTimeline(advancedProject).schedule()[1]).toMatchObject({
      absoluteStartMs: 1100,
      absoluteEndMs: 1900,
    });
  });

  it("round-trips AI-generated animation.json and executes draw progress", async () => {
    const json = serializeAnimationProject(advancedProject);
    const imported = parseAnimationProjectJson(json);
    expect(animationProjectSchema.parse(imported)).toEqual(advancedProject);

    const runtime = await AnimationRuntime.create(imported);
    runtime.seek(500);
    expect(
      runtime.getSnapshot().values["arrow-1"].advanced.drawProgress,
    ).toBeCloseTo(0.5);
    runtime.seek(1000);
    expect(runtime.getSnapshot().values["arrow-1"].visual).toMatchObject({
      strokeColor: "#E03131FF",
      backgroundColor: "#40C057FF",
    });
    runtime.dispose();
  });

  it("holds enum-like appearance properties until their next keyframe", async () => {
    const project: AnimationProject = {
      schemaVersion: ANIMATION_SCHEMA_VERSION,
      id: "discrete-styles",
      durationMs: 1000,
      frameRate: 60,
      tracks: [
        {
          id: "copy-style",
          target: { type: "element", elementId: "copy" },
          properties: [
            {
              property: "visual.strokeStyle",
              keyframes: [
                { atMs: 0, value: "solid" },
                { atMs: 1000, value: "dotted" },
              ],
            },
            {
              property: "text.fontFamily",
              keyframes: [
                { atMs: 0, value: 1 },
                { atMs: 1000, value: 5 },
              ],
            },
          ],
        },
      ],
    };
    const runtime = await AnimationRuntime.create(project);

    runtime.seek(500);
    expect(runtime.getSnapshot().values.copy.visual.strokeStyle).toBe("solid");
    expect(runtime.getSnapshot().values.copy.text.fontFamily).toBe(1);
    runtime.seek(1000);
    expect(runtime.getSnapshot().values.copy.visual.strokeStyle).toBe("dotted");
    expect(runtime.getSnapshot().values.copy.text.fontFamily).toBe(5);
    runtime.dispose();
  });

  it("holds enum ids while interpolating numeric roundness progress", async () => {
    const project: AnimationProject = {
      schemaVersion: ANIMATION_SCHEMA_VERSION,
      id: "option-backed-numeric-styles",
      durationMs: 1000,
      frameRate: 60,
      tracks: [
        {
          id: "shape-style",
          target: { type: "element", elementId: "shape" },
          properties: [
            {
              property: "visual.roughness",
              keyframes: [
                {
                  atMs: 0,
                  value: 0,
                  easing: { type: "preset", name: "linear" },
                },
                { atMs: 1000, value: 2 },
              ],
            },
            {
              property: "visual.roundness",
              keyframes: [
                {
                  atMs: 0,
                  value: "sharp",
                  // Compatibility: old projects incorrectly persisted hold.
                  hold: true,
                  easing: { type: "preset", name: "linear" },
                },
                { atMs: 1000, value: "round" },
              ],
            },
          ],
        },
      ],
    };
    const runtime = await AnimationRuntime.create(project);

    runtime.seek(500);
    expect(runtime.getSnapshot().values.shape.visual).toMatchObject({
      roughness: 0,
      roundness: 0.5,
    });
    runtime.seek(1000);
    expect(runtime.getSnapshot().values.shape.visual.roughness).toBe(2);
    runtime.dispose();
  });
});
