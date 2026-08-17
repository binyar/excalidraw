import { newElement } from "@excalidraw/element";
import { hitElementItself } from "@excalidraw/element/collision";
import { pointFrom } from "@excalidraw/math";

import {
  projectRuntimeElementForHitTest,
  projectRuntimeElementForRender,
  subscribeToRuntimeElementRenderChanges,
  unprojectRuntimePointForElement,
} from "@excalidraw/excalidraw/renderer/runtimeElementRenderHook";

import type { GlobalPoint } from "@excalidraw/math";

import { AnimationRuntime } from "../runtime/AnimationRuntime";

import { ElementBindingManager } from "./ElementBindingManager";
import { ExcalidrawRendererAdapter } from "./RendererAdapter";
import {
  DEFAULT_ELEMENT_RUNTIME_STATE,
  RuntimeStateStore,
} from "./RuntimeStateStore";
import { createRectangleXAnimationDemo } from "./demo";

import type { ElementAnimation } from "./ElementBindingManager";
import type {
  AnimationRuntimeSnapshot,
  AnimationRuntimeSubscriber,
} from "../runtime/AnimationRuntime";
import type { AnimationRuntimeObjectValue } from "../runtime/MotionAdapter";

describe("RuntimeStateStore", () => {
  it("stores immutable render state and suppresses unchanged updates", () => {
    const store = new RuntimeStateStore();
    const listener = vi.fn();
    store.subscribe(listener);

    store.set("rectangle", DEFAULT_ELEMENT_RUNTIME_STATE);
    store.set("rectangle", { ...DEFAULT_ELEMENT_RUNTIME_STATE });

    expect(store.get("rectangle")).toEqual(DEFAULT_ELEMENT_RUNTIME_STATE);
    expect(Object.isFrozen(store.get("rectangle"))).toBe(true);
    expect(listener).toHaveBeenCalledTimes(1);
    expect(() => store.patch("rectangle", { opacity: 2 })).toThrow(
      "range 0..1",
    );
  });

  it("coalesces renderer invalidation for a batch of element updates", () => {
    const store = new RuntimeStateStore();
    const elementListener = vi.fn();
    const invalidationListener = vi.fn();
    store.subscribe(elementListener);
    store.subscribeInvalidation(invalidationListener);

    store.batch(() => {
      store.patch("first", { xOffset: 10 });
      store.patch("second", { xOffset: 20 });
    });

    expect(elementListener).toHaveBeenCalledTimes(2);
    expect(invalidationListener).toHaveBeenCalledTimes(1);
  });
});

describe("ElementBindingManager + renderer projection", () => {
  it("centrally synchronizes many bindings with one renderer invalidation", () => {
    const store = new RuntimeStateStore();
    const bindings = new ElementBindingManager(store);
    const animation = new TestElementAnimation("first");
    const invalidationListener = vi.fn();
    store.subscribeInvalidation(invalidationListener);
    bindings.bind("first", animation, { externallySynchronized: true });
    bindings.bind("second", animation, { externallySynchronized: true });

    bindings.sync({
      ...snapshot("first", runtimeValue({ x: 500 })),
      values: {
        first: runtimeValue({ x: 500 }),
        second: runtimeValue({ x: 500 }),
      },
    });

    expect(store.get("first")?.xOffset).toBe(500);
    expect(store.get("second")?.xOffset).toBe(500);
    expect(invalidationListener).toHaveBeenCalledTimes(1);
  });
  it("preserves the last runtime state while replacing a binding", () => {
    const store = new RuntimeStateStore();
    const bindings = new ElementBindingManager(store);
    const animation = new TestElementAnimation("rectangle");
    bindings.bind("rectangle", animation);
    store.patch("rectangle", { xOffset: 140 });

    bindings.dispose({ preserveState: true });

    expect(store.get("rectangle")?.xOffset).toBe(140);
    bindings.bind("rectangle", animation);
    expect(store.get("rectangle")).toBeDefined();
    bindings.dispose();
    expect(store.get("rectangle")).toBeUndefined();
  });

  it("moves a rectangle at render time without mutating its scene data", async () => {
    const rectangle = newElement({
      type: "rectangle",
      x: 100,
      y: 80,
      width: 200,
      height: 100,
      opacity: 80,
    });
    const serializedBeforePlayback = JSON.stringify(rectangle);
    const versionBeforePlayback = rectangle.version;
    const store = new RuntimeStateStore();
    const bindings = new ElementBindingManager(store);
    const renderer = new ExcalidrawRendererAdapter(store);
    const animation = new TestElementAnimation(rectangle.id);
    const renderListener = vi.fn();
    const unsubscribeRender =
      subscribeToRuntimeElementRenderChanges(renderListener);
    const disconnectRenderer = renderer.connect();

    bindings.bind(rectangle.id, animation);
    expect(projectRuntimeElementForRender(rectangle)).toBe(rectangle);

    await animation.play();

    const rendered = projectRuntimeElementForRender(rectangle);
    expect(rendered).not.toBe(rectangle);
    expect(rendered).toMatchObject({
      id: rectangle.id,
      x: 600,
      y: 80,
      width: 200,
      height: 100,
      opacity: 40,
      version: versionBeforePlayback,
      groupIds: rectangle.groupIds,
    });
    expect(JSON.stringify(rectangle)).toBe(serializedBeforePlayback);
    expect(rectangle.x).toBe(100);
    expect(rectangle.opacity).toBe(80);
    expect(renderListener).toHaveBeenCalled();

    bindings.unbind(rectangle.id);
    expect(projectRuntimeElementForRender(rectangle)).toBe(rectangle);

    disconnectRenderer();
    unsubscribeRender();
  });

  it("applies scale around the element center and rotation in degrees", () => {
    const rectangle = newElement({
      type: "rectangle",
      x: 100,
      y: 100,
      width: 200,
      height: 100,
    });
    const store = new RuntimeStateStore();
    const renderer = new ExcalidrawRendererAdapter(store);
    store.set(rectangle.id, {
      xOffset: 10,
      yOffset: 20,
      scale: 2,
      opacity: 1,
      rotation: 90,
    });

    const rendered = renderer.projectElement(rectangle);
    expect(rendered).toMatchObject({
      x: 10,
      y: 70,
      width: 400,
      height: 200,
    });
    expect(rendered.angle).toBeCloseTo(Math.PI / 2);
  });

  it("projects opacity without mutating the element", () => {
    const rectangle = newElement({
      type: "rectangle",
      x: 10,
      y: 20,
      width: 100,
      height: 60,
      opacity: 80,
    });
    const store = new RuntimeStateStore();
    const renderer = new ExcalidrawRendererAdapter(store);
    store.patch(rectangle.id, { opacity: 0.25 });

    expect(renderer.projectElement(rectangle).opacity).toBe(20);
    expect(rectangle.opacity).toBe(80);
  });

  it("projects animated appearance properties without mutating persistent styles", () => {
    const rectangle = newElement({
      type: "rectangle",
      strokeWidth: 1,
      strokeStyle: "solid",
      roughness: 1,
      fillStyle: "hachure",
    });
    const store = new RuntimeStateStore();
    const renderer = new ExcalidrawRendererAdapter(store);
    store.patch(rectangle.id, {
      strokeWidth: 4,
      strokeStyle: "dotted",
      roughness: 2,
      fillStyle: "solid",
      roundness: 1,
    });

    expect(renderer.projectElement(rectangle)).toMatchObject({
      strokeWidth: 4,
      strokeStyle: "dotted",
      roughness: 2,
      fillStyle: "solid",
      roundness: { type: 3 },
    });
    expect(rectangle).toMatchObject({
      strokeWidth: 1,
      strokeStyle: "solid",
      roughness: 1,
      fillStyle: "hachure",
      roundness: null,
    });

    const diamond = newElement({ type: "diamond", roundness: null });
    store.patch(diamond.id, { roundness: 0.5 });
    expect(renderer.projectElement(diamond).roundness).toEqual({
      type: 2,
      value: 0.5,
    });
  });

  it("inherits runtime visibility from a bound text container", () => {
    const container = newElement({
      id: "animated-container",
      type: "rectangle",
      x: 10,
      y: 20,
      width: 180,
      height: 80,
    });
    const label = {
      ...newElement({
        id: "animated-container-label",
        type: "text",
        x: 30,
        y: 40,
        width: 140,
        height: 30,
        text: "审批节点",
        originalText: "审批节点",
      }),
      containerId: container.id,
    };
    const store = new RuntimeStateStore();
    const renderer = new ExcalidrawRendererAdapter(store);

    store.patch(container.id, { opacity: 0 });
    expect(renderer.projectElement(label).opacity).toBe(0);

    store.patch(container.id, { opacity: 1, drawProgress: 0 });
    expect(renderer.projectElement(label).opacity).toBe(0);

    store.patch(container.id, { drawProgress: 0.5 });
    expect(renderer.projectElement(label).opacity).toBe(50);
    expect(label.opacity).toBe(100);
  });

  it("maps transform-handle pointers back into base element coordinates", () => {
    const rectangle = newElement({
      type: "rectangle",
      x: 100,
      y: 100,
      width: 200,
      height: 100,
    });
    const store = new RuntimeStateStore();
    const renderer = new ExcalidrawRendererAdapter(store);
    const disconnect = renderer.connect();
    store.set(rectangle.id, {
      xOffset: 50,
      yOffset: 20,
      scale: 2,
      opacity: 1,
      rotation: 90,
    });

    // Base point (300, 150), transformed by scale 2 + rotate 90 + offset.
    const basePoint = unprojectRuntimePointForElement(rectangle, {
      x: 250,
      y: 370,
    });
    expect(basePoint.x).toBeCloseTo(300);
    expect(basePoint.y).toBeCloseTo(150);
    disconnect();
  });

  it("invalidates hit-test snapshots when the runtime pose changes", () => {
    const rectangle = newElement({
      type: "rectangle",
      x: 100,
      y: 100,
      width: 100,
      height: 100,
      backgroundColor: "#ffffff",
    });
    const elementsMap = new Map([[rectangle.id, rectangle]]);
    const store = new RuntimeStateStore();
    const renderer = new ExcalidrawRendererAdapter(store);
    const disconnect = renderer.connect();
    store.patch(rectangle.id, { xOffset: 50 });

    const firstPose = projectRuntimeElementForHitTest(rectangle);
    const point = pointFrom<GlobalPoint>(200, 150);
    expect(
      hitElementItself({
        point,
        element: firstPose,
        threshold: 1,
        elementsMap,
      }),
    ).toBe(true);
    expect(projectRuntimeElementForHitTest(rectangle)).toBe(firstPose);

    store.patch(rectangle.id, { xOffset: 300 });
    const secondPose = projectRuntimeElementForHitTest(rectangle);
    expect(secondPose).not.toBe(firstPose);
    expect(
      hitElementItself({
        point,
        element: secondPose,
        threshold: 1,
        elementsMap,
      }),
    ).toBe(false);
    disconnect();
  });
});

describe("rectangle x animation demo", () => {
  it("moves the rendered rectangle by 500 without changing its base x", async () => {
    const createRuntime = vi
      .spyOn(AnimationRuntime, "create")
      .mockImplementation(async (project) => {
        const target = project.tracks[0].target;
        if (target.type !== "element") {
          throw new Error("Expected the demo to target an element.");
        }
        return new TestElementAnimation(
          target.elementId,
        ) as unknown as AnimationRuntime;
      });
    const demo = await createRectangleXAnimationDemo();
    const originalX = demo.rectangle.x;

    await demo.play();

    expect(demo.rectangle.x).toBe(originalX);
    expect(demo.renderer.projectElement(demo.rectangle).x).toBe(
      originalX + 500,
    );
    demo.dispose();
    createRuntime.mockRestore();
  });
});

class TestElementAnimation implements ElementAnimation {
  private readonly subscribers = new Set<AnimationRuntimeSubscriber>();

  constructor(private readonly elementId: string) {}

  subscribe(callback: AnimationRuntimeSubscriber) {
    this.subscribers.add(callback);
    callback(snapshot(this.elementId, runtimeValue()));
    return () => {
      this.subscribers.delete(callback);
    };
  }

  async play() {
    const next = snapshot(
      this.elementId,
      runtimeValue({ x: 500, opacity: 0.5 }),
    );
    this.subscribers.forEach((subscriber) => subscriber(next));
    return true;
  }

  dispose() {}
}

const snapshot = (
  elementId: string,
  value: AnimationRuntimeObjectValue,
): AnimationRuntimeSnapshot => ({
  timeMs: 0,
  durationMs: 1000,
  status: "paused",
  values: { [elementId]: value },
});

const runtimeValue = (
  overrides: { x?: number; opacity?: number } = {},
): AnimationRuntimeObjectValue => ({
  transform: {
    x: overrides.x ?? 0,
    y: 0,
    scale: 1,
    rotate: 0,
  },
  visual: {
    opacity: overrides.opacity ?? 1,
    strokeColor: "#000000FF",
    backgroundColor: "#00000000",
  },
  advanced: {
    path: { progress: 0 },
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
  data: {
    number: 0,
    progress: 0,
  },
});
