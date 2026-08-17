import {
  applyCameraSnapshot,
  readCameraViewport,
} from "./CameraViewportBinding";

import type { ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types";
import type { AnimationRuntimeSnapshot } from "../runtime/AnimationRuntime";

const runtimeValue = {
  camera: { centerX: 400, centerY: 300, zoom: 2 },
  transform: { x: 0, y: 0, scale: 1, rotate: 0 },
  visual: {
    opacity: 1,
    strokeColor: "#000000FF",
    backgroundColor: "#00000000",
    fillStyle: "hachure" as const,
  },
  advanced: {
    path: { progress: 0 },
    drawProgress: 1,
    blur: 0,
    shadow: { offsetX: 0, offsetY: 0, blur: 0, spread: 0, color: "#00000000" },
  },
  data: { number: 0, progress: 0 },
};

describe("CameraViewportBinding", () => {
  it("reads the scene-coordinate viewport center", () => {
    const api = {
      getAppState: () => ({
        width: 1000,
        height: 600,
        offsetLeft: 0,
        offsetTop: 0,
        scrollX: -100,
        scrollY: -50,
        zoom: { value: 2 },
      }),
    } as unknown as Pick<ExcalidrawImperativeAPI, "getAppState">;

    expect(readCameraViewport(api)).toEqual({
      centerX: 350,
      centerY: 200,
      zoom: 2,
    });
  });

  it("projects camera state without capturing history", () => {
    const updateScene = vi.fn();
    const api = {
      getAppState: () => ({
        width: 1000,
        height: 600,
        offsetLeft: 0,
        offsetTop: 0,
      }),
      updateScene,
    } as unknown as Pick<
      ExcalidrawImperativeAPI,
      "getAppState" | "updateScene"
    >;
    const snapshot: AnimationRuntimeSnapshot = {
      timeMs: 500,
      durationMs: 1000,
      status: "playing",
      values: { "camera:main": runtimeValue },
    };

    applyCameraSnapshot(api, snapshot);

    expect(updateScene).toHaveBeenCalledWith(
      expect.objectContaining({
        appState: expect.objectContaining({
          scrollX: -150,
          scrollY: -150,
          zoom: { value: 2 },
        }),
        captureUpdate: "NEVER",
      }),
    );
  });
});
