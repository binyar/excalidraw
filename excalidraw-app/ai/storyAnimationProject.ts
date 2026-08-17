import { parseAnimationProject } from "../../src/animation/schema";

import type { AnimationProject } from "../../src/animation/types";
import type { CompiledStory } from "../../src/ai/story/types";

type MergeStoryAnimationProjectInput = {
  currentProject: AnimationProject;
  compiledAnimation: CompiledStory["animation"];
  replacedElementIds: ReadonlySet<string>;
  generatedElementIds: ReadonlySet<string>;
};

/**
 * Replaces the active AI story animation while retaining unrelated user
 * tracks. Chapter scenes must travel with transition tracks because the
 * Animation DSL validates every fromSceneId/toSceneId reference.
 */
export const mergeStoryAnimationProject = ({
  currentProject,
  compiledAnimation,
  replacedElementIds,
  generatedElementIds,
}: MergeStoryAnimationProjectInput): AnimationProject => {
  const replacesMainCamera = compiledAnimation.tracks.some(
    (track) => track.target.type === "camera",
  );
  const retainedTracks = currentProject.tracks.filter((track) => {
    if (track.target.type === "camera") {
      return !replacesMainCamera;
    }
    // The editor owns one active AI story. Existing transition tracks refer
    // to the previous story's scene graph and must be replaced as a unit.
    if (track.target.type === "transition") {
      return false;
    }
    if (track.target.type !== "element") {
      return true;
    }
    return (
      !replacedElementIds.has(track.target.elementId) &&
      !generatedElementIds.has(track.target.elementId)
    );
  });
  const tracks = [...retainedTracks, ...compiledAnimation.tracks];
  const retainedSceneIds = new Set(
    retainedTracks.flatMap((track) => (track.sceneId ? [track.sceneId] : [])),
  );
  const compiledSceneIds = new Set(
    (compiledAnimation.scenes ?? []).map((scene) => scene.id),
  );
  const scenes = [
    ...(currentProject.scenes ?? []).filter(
      (scene) =>
        retainedSceneIds.has(scene.id) && !compiledSceneIds.has(scene.id),
    ),
    ...(compiledAnimation.scenes ?? []),
  ];
  const generatedTrackIds = new Set(
    compiledAnimation.tracks.map((track) => track.id),
  );
  const remainingDurationMs = Math.max(
    1,
    ...tracks
      .filter((track) => !generatedTrackIds.has(track.id))
      .map((track) => (track.startMs ?? 0) + (track.durationMs ?? 0)),
  );

  return parseAnimationProject({
    ...currentProject,
    durationMs: Math.max(remainingDurationMs, compiledAnimation.durationMs),
    ...(compiledAnimation.playback
      ? { playback: compiledAnimation.playback }
      : {}),
    ...(scenes.length > 0 ? { scenes } : { scenes: undefined }),
    tracks,
    metadata: {
      ...currentProject.metadata,
      source: "ai",
      ...(compiledAnimation.metadata?.title
        ? { title: compiledAnimation.metadata.title }
        : {}),
      ...(compiledAnimation.metadata?.description
        ? { description: compiledAnimation.metadata.description }
        : {}),
    },
  });
};
