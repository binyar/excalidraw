import { describe, expect, it } from "vitest";

import { ANIMATION_SCHEMA_VERSION } from "../../src/animation/types";

import { mergeStoryAnimationProject } from "./storyAnimationProject";

import type { AnimationProject } from "../../src/animation/types";
import type { CompiledStory } from "../../src/ai/story/types";

const transitionTrack = (
  id: string,
  fromSceneId: string,
  toSceneId: string,
): AnimationProject["tracks"][number] => ({
  id,
  name: "章节转场",
  target: {
    type: "transition",
    transitionId: id,
    layerId: "main",
    fromSceneId,
    toSceneId,
    effect: "directional-wipe",
    direction: "left",
  },
  startMs: 800,
  durationMs: 200,
  properties: [
    {
      property: "transition.progress",
      keyframes: [
        { atMs: 0, value: 0 },
        { atMs: 200, value: 1 },
      ],
    },
    {
      property: "transition.opacity",
      keyframes: [
        { atMs: 0, value: 1 },
        { atMs: 200, value: 1 },
      ],
    },
  ],
});

describe("mergeStoryAnimationProject", () => {
  it("carries compiled chapter scenes with transition tracks", () => {
    const currentProject: AnimationProject = {
      schemaVersion: ANIMATION_SCHEMA_VERSION,
      id: "editor-project",
      durationMs: 3000,
      frameRate: 60,
      scenes: [
        { id: "user-scene", startMs: 0, durationMs: 3000 },
        { id: "old-intro", startMs: 0, durationMs: 1000 },
        { id: "old-outro", startMs: 1000, durationMs: 1000 },
      ],
      tracks: [
        {
          id: "user-track",
          sceneId: "user-scene",
          target: { type: "element", elementId: "user-element" },
          properties: [
            {
              property: "visual.opacity",
              keyframes: [{ atMs: 0, value: 1 }],
            },
          ],
        },
        transitionTrack("old-transition", "old-intro", "old-outro"),
      ],
    };
    const compiledAnimation: CompiledStory["animation"] = {
      schemaVersion: ANIMATION_SCHEMA_VERSION,
      id: "new-story",
      durationMs: 4000,
      frameRate: 60,
      scenes: [
        { id: "scene-intro", startMs: 0, durationMs: 1000 },
        { id: "scene-problem", startMs: 1800, durationMs: 2200 },
      ],
      tracks: [
        transitionTrack("new-transition", "scene-intro", "scene-problem"),
      ],
      metadata: { source: "ai", title: "新故事" },
    };

    const merged = mergeStoryAnimationProject({
      currentProject,
      compiledAnimation,
      replacedElementIds: new Set(),
      generatedElementIds: new Set(),
    });

    expect(merged.scenes?.map((scene) => scene.id)).toEqual([
      "user-scene",
      "scene-intro",
      "scene-problem",
    ]);
    expect(merged.tracks.map((track) => track.id)).toEqual([
      "user-track",
      "new-transition",
    ]);
  });
});
