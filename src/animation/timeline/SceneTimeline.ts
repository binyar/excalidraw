import { animationProjectSchema } from "../schema";

import type {
  AnimationProject,
  AnimationScene,
  AnimationTrack,
} from "../types";

export type ScheduledAnimationTrack = {
  track: AnimationTrack;
  absoluteStartMs: number;
  absoluteEndMs: number;
  scene?: AnimationScene;
};

/** Pure helpers for composing dashboard pages and presentation chapters. */
export class SceneTimeline {
  constructor(readonly project: AnimationProject) {
    animationProjectSchema.parse(project);
  }

  schedule(): ScheduledAnimationTrack[] {
    return this.project.tracks
      .map((track) => {
        const scene = track.sceneId
          ? this.project.scenes?.find(
              (candidate) => candidate.id === track.sceneId,
            )
          : undefined;
        const absoluteStartMs = (scene?.startMs ?? 0) + (track.startMs ?? 0);
        const durationMs = track.durationMs ?? getTrackContentEndMs(track);
        return {
          track,
          absoluteStartMs,
          absoluteEndMs: absoluteStartMs + durationMs,
          ...(scene ? { scene } : {}),
        };
      })
      .sort(
        (left, right) =>
          left.absoluteStartMs - right.absoluteStartMs ||
          left.track.id.localeCompare(right.track.id),
      );
  }

  moveScene(sceneId: string, startMs: number): AnimationProject {
    return animationProjectSchema.parse({
      ...this.project,
      scenes: this.project.scenes?.map((scene) =>
        scene.id === sceneId
          ? { ...scene, startMs: Math.max(0, startMs) }
          : scene,
      ),
    });
  }

  placeTrack(
    trackId: string,
    placement: { sceneId?: string; startMs: number },
  ): AnimationProject {
    return animationProjectSchema.parse({
      ...this.project,
      tracks: this.project.tracks.map((track) =>
        track.id === trackId ? placeTrack(track, placement) : track,
      ),
    });
  }
}

const placeTrack = (
  track: AnimationTrack,
  placement: { sceneId?: string; startMs: number },
): AnimationTrack => {
  const { sceneId: _previousSceneId, ...withoutScene } = track;
  return {
    ...withoutScene,
    startMs: Math.max(0, placement.startMs),
    ...(placement.sceneId ? { sceneId: placement.sceneId } : {}),
  };
};

const getTrackContentEndMs = (track: AnimationTrack) =>
  Math.max(
    0,
    ...(track.properties ?? []).flatMap((property) =>
      property.keyframes.map((keyframe) => keyframe.atMs),
    ),
    ...(track.presets ?? []).map((preset) => preset.atMs + preset.durationMs),
    ...(track.loops ?? []).map((loop) =>
      loop.iterations === "infinite"
        ? track.durationMs ?? loop.atMs ?? 0
        : (loop.atMs ?? 0) +
          (loop.durationMs + (loop.delayMs ?? 0)) * loop.iterations,
    ),
  );
