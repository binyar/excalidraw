import { projectRuntimeElementForRender } from "@excalidraw/excalidraw/renderer/runtimeElementRenderHook";

import type { NonDeletedExcalidrawElement } from "@excalidraw/element/types";

import { RuntimeStateStore } from "../excalidraw/RuntimeStateStore";
import { AnimationRuntime } from "../runtime/AnimationRuntime";
import { fadeInPreset } from "../presets";

import { AnimationWorkspace } from "./AnimationWorkspace";
import { generateInspectorAnimation } from "./inspectorPresets";

import type {
  AnimationRuntimeSnapshot,
  AnimationRuntimeSubscriber,
} from "../runtime/AnimationRuntime";
import type { AnimationProject } from "../types";

describe("AnimationWorkspace", () => {
  it("maps a canvas element to the track covering the current time", () => {
    const workspace = new AnimationWorkspace({
      runtimeFactory: vi.fn(async () => new FakeRuntime()),
    });
    workspace.loadProject({
      schemaVersion: "1.0",
      id: "selection-mapping",
      durationMs: 1000,
      frameRate: 60,
      tracks: [
        {
          id: "element-enter",
          target: { type: "element", elementId: "shared-element" },
          startMs: 0,
          durationMs: 200,
          properties: [],
        },
        {
          id: "element-emphasis",
          target: { type: "element", elementId: "shared-element" },
          startMs: 500,
          durationMs: 200,
          properties: [],
        },
      ],
    });

    workspace.seek(550);
    workspace.setActiveElement("shared-element");
    expect(workspace.getSnapshot()).toMatchObject({
      activeElementId: "shared-element",
      activeTrackId: "element-emphasis",
    });

    workspace.setActiveTrack("element-enter");
    workspace.setActiveElement("shared-element");
    expect(workspace.getSnapshot().activeTrackId).toBe("element-enter");
    workspace.dispose();
  });

  it("keeps an explicitly selected Object track when canvas selection clears", () => {
    const workspace = new AnimationWorkspace({
      runtimeFactory: vi.fn(async () => new FakeRuntime()),
    });
    const track = workspace.ensureElementTrack({
      id: "selected-object",
      type: "rectangle",
      strokeColor: "#1e1e1e",
      backgroundColor: "transparent",
    });

    workspace.setActiveTrack(track.id);
    workspace.setActiveElement(null);

    expect(workspace.getSnapshot().activeTrackId).toBe(track.id);
    expect(workspace.getSnapshot().activeElementId).toBeUndefined();
    workspace.dispose();
  });

  it("creates one short neutral editor track for a selected element", () => {
    const workspace = new AnimationWorkspace({
      runtimeFactory: vi.fn(async () => new FakeRuntime()),
    });
    const element = {
      id: "selected-diamond",
      type: "diamond",
      strokeColor: "#1e1e1e",
      backgroundColor: "transparent",
    };

    const track = workspace.ensureElementTrack(element);
    workspace.ensureElementTrack(element);

    expect(workspace.getSnapshot().project.durationMs).toBe(1000);
    expect(workspace.getSnapshot().project.tracks).toHaveLength(1);
    expect(track).toMatchObject({
      target: { type: "element", elementId: "selected-diamond" },
      durationMs: 1000,
      properties: [],
    });
    workspace.dispose();
  });

  it("removes the DSL object when its canvas element is removed", async () => {
    const store = new RuntimeStateStore();
    const workspace = new AnimationWorkspace({
      store,
      runtimeFactory: vi.fn(async () => new FakeRuntime()),
    });
    const element = {
      id: "deleted-element",
      type: "rectangle",
      strokeColor: "#1e1e1e",
      backgroundColor: "transparent",
    };
    workspace.ensureElementTrack(element);
    workspace.setElementPropertyKeyframe(element.id, "visual.opacity", 0.5, 0);
    await vi.waitFor(() =>
      expect(workspace.getSnapshot().status).not.toBe("loading"),
    );

    workspace.removeElementAnimations(new Set([element.id]));

    expect(workspace.getElementTrack(element.id)).toBeUndefined();
    expect(workspace.getSnapshot().project.tracks).toHaveLength(0);
    expect(store.get(element.id)).toBeUndefined();
    workspace.dispose();
  });

  it("removes the selected Object and every direct animation for its targets", () => {
    const workspace = new AnimationWorkspace({
      runtimeFactory: vi.fn(async () => new FakeRuntime()),
    });
    workspace.loadProject({
      schemaVersion: "1.0",
      id: "delete-object",
      durationMs: 2000,
      frameRate: 60,
      tracks: [
        {
          id: "card-enter",
          target: { type: "element", elementId: "card" },
          properties: [],
        },
        {
          id: "card-exit",
          target: { type: "element", elementId: "card" },
          startMs: 1000,
          properties: [],
        },
        {
          id: "other-enter",
          target: { type: "element", elementId: "other" },
          properties: [],
        },
      ],
    });

    expect(workspace.removeObjectAndAnimations("card-enter")).toEqual(["card"]);
    expect(
      workspace.getSnapshot().project.tracks.map((track) => track.id),
    ).toEqual(["other-enter"]);
    workspace.dispose();
  });

  it("writes background color keyframes into the persisted DSL", () => {
    const workspace = new AnimationWorkspace({
      runtimeFactory: vi.fn(async () => new FakeRuntime()),
    });
    const element = {
      id: "background-color-element",
      type: "rectangle",
      strokeColor: "#1e1e1e",
      backgroundColor: "transparent",
    };
    workspace.ensureElementTrack(element);

    workspace.setElementColorKeyframe(
      element.id,
      "visual.backgroundColor",
      "#A5D8FFFF",
      1000,
    );

    expect(
      workspace
        .getElementTrack(element.id)
        ?.properties?.find(
          (property) => property.property === "visual.backgroundColor",
        )?.keyframes,
    ).toEqual([{ atMs: 1000, value: "#A5D8FFFF" }]);
    workspace.dispose();
  });

  it("stages a canvas background edit and commits it when its keyframe is added", async () => {
    const workspace = new AnimationWorkspace();
    const element = {
      id: "canvas-color-element",
      type: "rectangle",
      strokeColor: "#1e1e1e",
      backgroundColor: "transparent",
    };
    const track = workspace.ensureElementTrack(element);
    workspace.setElementColorKeyframe(
      element.id,
      "visual.backgroundColor",
      "#00000000",
      0,
    );
    await vi.waitFor(() =>
      expect(workspace.getSnapshot().status).not.toBe("loading"),
    );
    workspace.seek(1000);

    expect(workspace.stageElementBackgroundColor(element.id, "#FFEC99")).toBe(
      true,
    );
    workspace.addTrackPropertyKeyframe(
      track.id,
      "visual.backgroundColor",
      1000,
    );

    expect(
      workspace
        .getElementTrack(element.id)
        ?.properties?.find(
          (property) => property.property === "visual.backgroundColor",
        )?.keyframes,
    ).toEqual([
      { atMs: 0, value: "#00000000" },
      { atMs: 1000, value: "#FFEC99" },
    ]);
    workspace.dispose();
  });

  it("executes fill style as a discrete background animation property", async () => {
    const workspace = new AnimationWorkspace();
    const element = {
      id: "fill-style-element",
      type: "rectangle",
      strokeColor: "#1e1e1e",
      backgroundColor: "#ffec99",
      fillStyle: "hachure" as const,
    };
    const track = workspace.ensureElementTrack(element);
    workspace.setElementFillStyleKeyframe(element.id, "hachure", 0);
    await vi.waitFor(() =>
      expect(workspace.getSnapshot().status).not.toBe("loading"),
    );
    workspace.seek(1000);
    expect(workspace.stageElementFillStyle(element.id, "solid")).toBe(true);
    workspace.addTrackPropertyKeyframe(track.id, "visual.fillStyle", 1000);
    await vi.waitFor(() =>
      expect(workspace.getSnapshot().status).not.toBe("loading"),
    );

    workspace.seek(999);
    expect(workspace.getSnapshot().values?.[element.id]?.visual.fillStyle).toBe(
      "hachure",
    );
    workspace.seek(1000);
    expect(workspace.getSnapshot().values?.[element.id]?.visual.fillStyle).toBe(
      "solid",
    );
    workspace.dispose();
  });

  it("closes the DSL to runtime to canvas projection loop", async () => {
    const store = new RuntimeStateStore();
    const runtime = new FakeRuntime();
    const workspace = new AnimationWorkspace({
      store,
      runtimeFactory: vi.fn(async () => runtime as unknown as AnimationRuntime),
    });

    workspace.setElementAnimation(
      {
        id: "rectangle-1",
        type: "rectangle",
        strokeColor: "#1e1e1e",
        backgroundColor: "transparent",
      },
      {
        category: "motion",
        presetId: "move-path",
        duration: 1000,
        delay: 0,
        easing: "linear",
      },
    );

    await vi.waitFor(() => expect(store.get("rectangle-1")).toBeDefined());
    const original = {
      id: "rectangle-1",
      x: 20,
      y: 30,
      width: 100,
      height: 60,
      angle: 0,
      opacity: 100,
      strokeColor: "#1e1e1e",
      backgroundColor: "transparent",
    } as NonDeletedExcalidrawElement;
    const rendered = projectRuntimeElementForRender(original);

    expect(
      workspace.getSnapshot().project.tracks[0].properties?.[0],
    ).toMatchObject({
      property: "advanced.path",
      motionPath: { type: "polyline" },
    });
    expect(rendered.x).toBe(180);
    expect(original.x).toBe(20);
    workspace.dispose();
  });

  it("writes property values at the playhead and renders Motion interpolation", async () => {
    const store = new RuntimeStateStore();
    const workspace = new AnimationWorkspace({ store });
    const element = {
      id: "keyframed-rectangle",
      type: "rectangle",
      strokeColor: "#1e1e1e",
      backgroundColor: "transparent",
    };
    workspace.ensureElementTrack(element);
    workspace.setElementPropertyKeyframe(element.id, "transform.x", 0, 0);
    workspace.setElementPropertyKeyframe(element.id, "transform.x", 100, 1000);

    await vi.waitFor(() =>
      expect(workspace.getSnapshot().status).not.toBe("loading"),
    );
    workspace.seek(500);

    const original = {
      id: element.id,
      x: 20,
      y: 30,
      width: 100,
      height: 60,
      angle: 0,
      opacity: 100,
      strokeColor: "#1e1e1e",
      backgroundColor: "transparent",
    } as NonDeletedExcalidrawElement;
    const rendered = projectRuntimeElementForRender(original);
    expect(
      workspace.getElementTrack(element.id)?.properties?.[0].keyframes,
    ).toEqual([
      { atMs: 0, value: 0 },
      { atMs: 1000, value: 100 },
    ]);
    expect(rendered.x).toBeCloseTo(100.24, 1);
    expect(original.x).toBe(20);
    workspace.dispose();
  });

  it("projects text appearance keyframes onto the live canvas element", async () => {
    const workspace = new AnimationWorkspace();
    const textElement = {
      id: "animated-text-style",
      type: "text",
      x: 20,
      y: 30,
      width: 180,
      height: 40,
      angle: 0,
      opacity: 100,
      strokeColor: "#1e1e1e",
      backgroundColor: "transparent",
      fontSize: 20,
      fontFamily: 1,
      textAlign: "left",
      verticalAlign: "top",
      containerId: "container",
    } as NonDeletedExcalidrawElement;
    workspace.loadProject({
      schemaVersion: "1.0",
      id: "text-style-projection",
      durationMs: 1000,
      frameRate: 60,
      tracks: [
        {
          id: "text-style",
          target: { type: "element", elementId: textElement.id },
          durationMs: 1000,
          properties: [
            {
              property: "text.fontSize",
              keyframes: [
                {
                  atMs: 0,
                  value: 20,
                  easing: { type: "preset", name: "linear" },
                },
                { atMs: 1000, value: 40 },
              ],
            },
            {
              property: "text.fontFamily",
              keyframes: [
                { atMs: 0, value: 1, hold: true },
                { atMs: 1000, value: 5, hold: true },
              ],
            },
            {
              property: "text.textAlign",
              keyframes: [
                { atMs: 0, value: "left", hold: true },
                { atMs: 1000, value: "right", hold: true },
              ],
            },
            {
              property: "text.verticalAlign",
              keyframes: [
                { atMs: 0, value: "top", hold: true },
                { atMs: 1000, value: "bottom", hold: true },
              ],
            },
          ],
        },
      ],
    });
    await vi.waitFor(() =>
      expect(workspace.getSnapshot().status).not.toBe("loading"),
    );

    workspace.seek(500);
    expect(projectRuntimeElementForRender(textElement)).toMatchObject({
      fontSize: 30,
      fontFamily: 1,
      textAlign: "left",
      verticalAlign: "top",
    });

    workspace.seek(1000);
    expect(projectRuntimeElementForRender(textElement)).toMatchObject({
      fontSize: 40,
      fontFamily: 5,
      textAlign: "right",
      verticalAlign: "bottom",
    });
    workspace.dispose();
  });

  it("stages canvas transforms and commits them only from the property diamond", async () => {
    const store = new RuntimeStateStore();
    const workspace = new AnimationWorkspace({ store });
    const element = {
      id: "canvas-drag-rectangle",
      type: "rectangle",
      strokeColor: "#1e1e1e",
      backgroundColor: "transparent",
    };
    workspace.ensureElementTrack(element);
    await vi.waitFor(() =>
      expect(workspace.getSnapshot().status).not.toBe("loading"),
    );
    workspace.seek(1000);

    expect(
      workspace.stageElementTransform(element.id, {
        xDelta: 120,
        yDelta: 40,
      }),
    ).toBe(true);
    expect(workspace.getElementTrack(element.id)?.properties).toEqual([]);
    expect(store.get(element.id)).toMatchObject({
      xOffset: 120,
      yOffset: 40,
    });

    const track = workspace.getElementTrack(element.id)!;
    workspace.addTrackPositionKeyframe(
      track.id,
      workspace.getSnapshot().timeMs,
    );
    expect(workspace.getElementTrack(element.id)?.properties).toEqual([
      {
        property: "transform.x",
        keyframes: [
          { atMs: 0, value: 0 },
          { atMs: 1000, value: 120 },
        ],
      },
      {
        property: "transform.y",
        keyframes: [
          { atMs: 0, value: 0 },
          { atMs: 1000, value: 40 },
        ],
      },
    ]);

    await vi.waitFor(() =>
      expect(workspace.getSnapshot().status).not.toBe("loading"),
    );
    workspace.seek(0);
    const original = {
      id: element.id,
      x: 20,
      y: 30,
      width: 100,
      height: 60,
      angle: 0,
      opacity: 100,
      strokeColor: "#1e1e1e",
      backgroundColor: "transparent",
    } as NonDeletedExcalidrawElement;
    expect(projectRuntimeElementForRender(original).x).toBeCloseTo(20);
    expect(projectRuntimeElementForRender(original).y).toBeCloseTo(30);

    workspace.seek(1000);
    const rendered = projectRuntimeElementForRender(original);
    expect(rendered.x).toBeCloseTo(140);
    expect(rendered.y).toBeCloseTo(70);
    workspace.dispose();
  });

  it("moves the rendered element when Workspace playback completes", async () => {
    const workspace = new AnimationWorkspace();
    workspace.loadProject({
      schemaVersion: "1.0",
      id: "workspace-playback",
      durationMs: 100,
      frameRate: 60,
      tracks: [
        {
          id: "playback-track",
          target: { type: "element", elementId: "playback-rectangle" },
          durationMs: 100,
          properties: [
            {
              property: "transform.x",
              keyframes: [
                {
                  atMs: 0,
                  value: 0,
                  easing: { type: "preset", name: "linear" },
                },
                { atMs: 100, value: 120 },
              ],
            },
          ],
        },
      ],
    });
    await vi.waitFor(() =>
      expect(workspace.getSnapshot().status).not.toBe("loading"),
    );

    await workspace.play();

    const original = {
      id: "playback-rectangle",
      x: 20,
      y: 30,
      width: 100,
      height: 60,
      angle: 0,
      opacity: 100,
      strokeColor: "#1e1e1e",
      backgroundColor: "transparent",
    } as NonDeletedExcalidrawElement;
    expect(workspace.getSnapshot()).toMatchObject({
      timeMs: 100,
      status: "paused",
    });
    expect(projectRuntimeElementForRender(original).x).toBeCloseTo(140);
    workspace.dispose();
  });

  it("executes generated DSL with the installed Motion runtime", async () => {
    const project: AnimationProject = fadeInPreset.generateAnimation({
      target: "runtime-element",
      duration: 200,
    });
    const runtime = await AnimationRuntime.create(project);
    runtime.seek(0);
    expect(runtime.getSnapshot().values["runtime-element"].visual.opacity).toBe(
      0,
    );
    runtime.seek(200);

    expect(
      runtime.getSnapshot().values["runtime-element"].visual.opacity,
    ).toBeCloseTo(1);
    runtime.dispose();
  });

  it("interpolates Inspector color DSL through Motion", async () => {
    const project = generateInspectorAnimation(
      {
        id: "color-element",
        type: "rectangle",
        strokeColor: "#1E1E1E",
        backgroundColor: "transparent",
      },
      {
        category: "color",
        presetId: "stroke-color",
        duration: 200,
        delay: 0,
        easing: "linear",
      },
    );
    const runtime = await AnimationRuntime.create(project);
    runtime.seek(200);

    expect(
      runtime.getSnapshot().values["color-element"].visual.strokeColor,
    ).toBe("#E03131FF");
    runtime.dispose();
  });
});

class FakeRuntime {
  private subscribers = new Set<AnimationRuntimeSubscriber>();

  subscribe(callback: AnimationRuntimeSubscriber) {
    this.subscribers.add(callback);
    callback(fakeSnapshot("stopped"));
    return () => this.subscribers.delete(callback);
  }

  async play() {
    this.emit("playing");
    return true;
  }

  pause() {
    this.emit("paused");
  }

  stop() {
    this.emit("stopped");
  }

  seek() {}

  dispose() {
    this.subscribers.clear();
  }

  private emit(status: AnimationRuntimeSnapshot["status"]) {
    this.subscribers.forEach((callback) => callback(fakeSnapshot(status)));
  }
}

const fakeSnapshot = (
  status: AnimationRuntimeSnapshot["status"],
): AnimationRuntimeSnapshot => ({
  timeMs: status === "playing" ? 1000 : 0,
  durationMs: 1000,
  status,
  values: {
    "rectangle-1": {
      transform: { x: 0, y: 0, scale: 1, rotate: 0 },
      visual: {
        opacity: 1,
        strokeColor: "#1E1E1EFF",
        backgroundColor: "#00000000",
      },
      advanced: {
        path: {
          progress: 1,
          motionPath: {
            type: "polyline",
            points: [
              { x: 0, y: 0 },
              { x: 160, y: 0 },
            ],
          },
        },
        drawProgress: 1,
        blur: 0,
        shadow: {
          offsetX: 0,
          offsetY: 0,
          blur: 0,
          spread: 0,
          color: "#00000000",
        },
      },
      data: { number: 0, progress: 0 },
    },
  },
});
