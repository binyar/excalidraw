import { transitionRuntimeId } from "../runtime/MotionAdapter";

import { getStageTransitionLayers } from "./StageTransitionOverlay";

import type { AnimationProject } from "../types";

describe("getStageTransitionLayers", () => {
  it("returns the same transition model for DOM preview and video compositing", () => {
    const project = {
      durationMs: 1000,
      tracks: [
        {
          id: "wipe-track",
          target: {
            type: "transition",
            transitionId: "wipe",
            layerId: "color",
            fromSceneId: "one",
            toSceneId: "two",
            effect: "directional-wipe",
            direction: "right",
          },
        },
      ],
    } as AnimationProject;
    const runtimeId = transitionRuntimeId("wipe", "color");

    expect(
      getStageTransitionLayers(project, {
        [runtimeId]: {
          transition: {
            progress: 0.4,
            opacity: 0.8,
            color: "#ff0000",
            blur: 0,
            scale: 1,
          },
        } as never,
      }),
    ).toEqual([
      {
        id: "wipe-track",
        effect: "directional-wipe",
        direction: "right",
        progress: 0.4,
        opacity: 0.8,
        color: "#ff0000",
        blur: 0,
        scale: 1,
        transitionId: "wipe",
        layerId: "color",
      },
    ]);
  });
});
