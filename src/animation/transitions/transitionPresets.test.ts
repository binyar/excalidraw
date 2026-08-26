import { animationProjectSchema } from "../schema";

import { materializeChapterTransition } from "./transitionPresets";

describe("chapter transition presets", () => {
  it.each([
    "camera",
    "color-wipe",
    "directional-wipe",
    "fade-through-color",
    "push",
    "iris",
  ] as const)("materializes %s as editable transition tracks", (preset) => {
    const tracks = materializeChapterTransition({
      id: "chapter-a-b",
      fromSceneId: "chapter-a",
      toSceneId: "chapter-b",
      startMs: 1000,
      durationMs: 800,
      preset,
      direction: "left",
      origin: preset === "iris" ? "top-left" : undefined,
    });
    const project = animationProjectSchema.parse({
      schemaVersion: "1.0",
      id: `transition-${preset}`,
      durationMs: 3000,
      frameRate: 60,
      scenes: [
        { id: "chapter-a", startMs: 0, durationMs: 900 },
        { id: "chapter-b", startMs: 1800, durationMs: 1200 },
      ],
      tracks,
    });

    expect(project.tracks.length).toBe(preset === "color-wipe" ? 2 : 1);
    expect(
      project.tracks.every((track) => track.target.type === "transition"),
    ).toBe(true);
    expect(
      project.tracks.every((track) =>
        track.properties?.some(
          (property) => property.property === "transition.progress",
        ),
      ),
    ).toBe(true);
    expect(
      project.tracks
        .flatMap((track) => track.properties ?? [])
        .flatMap((property) => property.keyframes)
        .every(
          (keyframe) =>
            keyframe.easing?.type !== "preset" ||
            keyframe.easing.name !== "linear",
        ),
    ).toBe(true);
    if (preset === "iris") {
      expect(project.tracks[0].target).toMatchObject({
        type: "transition",
        origin: "top-left",
      });
      expect(project.tracks[0].properties).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ property: "transition.scale" }),
        ]),
      );
    }
  });

  it.each(["left", "right", "up", "down"] as const)(
    "preserves the %s direction variant",
    (direction) => {
      const [track] = materializeChapterTransition({
        id: `wipe-${direction}`,
        fromSceneId: "a",
        toSceneId: "b",
        startMs: 0,
        durationMs: 800,
        preset: "directional-wipe",
        direction,
      });

      expect(track.target).toMatchObject({
        type: "transition",
        direction,
      });
    },
  );
});
