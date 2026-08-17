import { newElement } from "@excalidraw/element";

import { ANIMATION_SCHEMA_VERSION } from "../types";

import { AnimationRuntime } from "../runtime/AnimationRuntime";

import { ElementBindingManager } from "./ElementBindingManager";
import { ExcalidrawRendererAdapter } from "./RendererAdapter";
import { RuntimeStateStore } from "./RuntimeStateStore";

import type { AnimationProject } from "../types";
import type { AnimationRuntimeOptions } from "../runtime/AnimationRuntime";

export type RectangleAnimationDemo = {
  rectangle: ReturnType<typeof newElement>;
  runtime: AnimationRuntime;
  store: RuntimeStateStore;
  bindings: ElementBindingManager;
  renderer: ExcalidrawRendererAdapter;
  play(): Promise<boolean>;
  dispose(): void;
};

/**
 * Creates a rectangle and binds a 500px x-offset animation to it.
 *
 * Add `rectangle` to an Excalidraw scene as normal, then call `play()`. The
 * stored rectangle remains unchanged while the live canvas projection moves.
 */
export const createRectangleXAnimationDemo = async (
  runtimeOptions: AnimationRuntimeOptions = {},
): Promise<RectangleAnimationDemo> => {
  const rectangle = newElement({
    type: "rectangle",
    x: 120,
    y: 120,
    width: 180,
    height: 100,
  });
  const animation: AnimationProject = {
    schemaVersion: ANIMATION_SCHEMA_VERSION,
    id: `rectangle-demo-${rectangle.id}`,
    durationMs: 1200,
    frameRate: 60,
    tracks: [
      {
        id: "rectangle-move-x",
        target: { type: "element", elementId: rectangle.id },
        properties: [
          {
            property: "transform.x",
            keyframes: [
              {
                atMs: 0,
                value: 0,
                easing: { type: "preset", name: "ease-in-out" },
              },
              { atMs: 1200, value: 500 },
            ],
          },
        ],
      },
    ],
  };

  const store = new RuntimeStateStore();
  const bindings = new ElementBindingManager(store);
  const renderer = new ExcalidrawRendererAdapter(store);
  const runtime = await AnimationRuntime.create(animation, runtimeOptions);
  const disconnectRenderer = renderer.connect();
  bindings.bind(rectangle.id, runtime);

  return {
    rectangle,
    runtime,
    store,
    bindings,
    renderer,
    play: () => runtime.play(),
    dispose: () => {
      bindings.dispose();
      runtime.dispose();
      disconnectRenderer();
    },
  };
};
