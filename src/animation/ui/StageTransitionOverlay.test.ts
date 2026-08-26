import { transitionRuntimeId } from "../runtime/MotionAdapter";

import {
  getStageTransitionLayers,
  getTransitionRevealClipPath,
} from "./StageTransitionOverlay";

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
        origin: "center",
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

  it.each([
    ["top-left", "0% 0%"],
    ["top-right", "100% 0%"],
    ["bottom-left", "0% 100%"],
    ["bottom-right", "100% 100%"],
  ] as const)("expands an iris from %s", (origin, position) => {
    expect(getTransitionRevealClipPath("iris", "left", 0.5, origin, 1.06)).toBe(
      `circle(${0.5 * 145 * 1.06}% at ${position})`,
    );
  });

  it.each([
    ["left", "inset(0 50% 0 0)"],
    ["right", "inset(0 0 0 50%)"],
    ["up", "inset(50% 0 0 0)"],
    ["down", "inset(0 0 50% 0)"],
  ] as const)("reveals a wipe toward %s", (direction, clipPath) => {
    expect(
      getTransitionRevealClipPath(
        "directional-wipe",
        direction,
        0.5,
        "center",
        1,
      ),
    ).toBe(clipPath);
  });
});
