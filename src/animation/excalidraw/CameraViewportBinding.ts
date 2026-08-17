import { CaptureUpdateAction } from "@excalidraw/element";
import { getNormalizedZoom } from "@excalidraw/excalidraw/scene";

import type { ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types";
import type { AnimationRuntimeSnapshot } from "../runtime/AnimationRuntime";

export const MAIN_CAMERA_RUNTIME_ID = "camera:main";

export type CameraViewport = {
  centerX: number;
  centerY: number;
  zoom: number;
};

export const readCameraViewport = (
  api: Pick<ExcalidrawImperativeAPI, "getAppState">,
): CameraViewport => {
  const state = api.getAppState();
  const centerViewportX = state.width / 2;
  const centerViewportY = state.height / 2;
  return {
    centerX:
      (centerViewportX - state.offsetLeft) / state.zoom.value - state.scrollX,
    centerY:
      (centerViewportY - state.offsetTop) / state.zoom.value - state.scrollY,
    zoom: state.zoom.value,
  };
};

/** Projects the scene-level camera value without touching persistent elements. */
export const applyCameraSnapshot = (
  api: Pick<ExcalidrawImperativeAPI, "getAppState" | "updateScene">,
  snapshot: AnimationRuntimeSnapshot,
) => {
  const value = snapshot.values[MAIN_CAMERA_RUNTIME_ID];
  if (!value) {
    return;
  }
  const state = api.getAppState();
  const zoom = getNormalizedZoom(value.camera.zoom);
  api.updateScene({
    appState: {
      zoom: { value: zoom },
      scrollX:
        (state.width / 2 - state.offsetLeft) / zoom - value.camera.centerX,
      scrollY:
        (state.height / 2 - state.offsetTop) / zoom - value.camera.centerY,
      scrollConstraints: null,
    },
    captureUpdate: CaptureUpdateAction.NEVER,
  });
};

export const restoreCameraViewport = (
  api: Pick<ExcalidrawImperativeAPI, "getAppState" | "updateScene">,
  viewport: CameraViewport,
) => {
  const state = api.getAppState();
  const zoom = getNormalizedZoom(viewport.zoom);
  api.updateScene({
    appState: {
      zoom: { value: zoom },
      scrollX: (state.width / 2 - state.offsetLeft) / zoom - viewport.centerX,
      scrollY: (state.height / 2 - state.offsetTop) / zoom - viewport.centerY,
      scrollConstraints: null,
    },
    captureUpdate: CaptureUpdateAction.NEVER,
  });
};
