import { animationProjectSchema } from "../schema";
import { ANIMATION_SCHEMA_VERSION } from "../types";

import type {
  AnimationEasing,
  AnimationEasingPresetName,
  AnimationPreset,
  AnimationProject,
  AnimationTarget,
  LoopAnimation,
} from "../types";
import type { PresetEasing, PresetGenerationBase, PresetTarget } from "./types";

export type GeneratedTrackContent =
  | { preset: AnimationPreset; loop?: never; totalDuration?: number }
  | { loop: LoopAnimation; preset?: never; totalDuration: number };

export const generatePresetProject = (
  name: string,
  input: PresetGenerationBase,
  content: GeneratedTrackContent,
): AnimationProject => {
  const duration = positiveFinite(input.duration, "duration");
  const atMs = nonNegativeFinite(input.atMs ?? 0, "atMs");
  const frameRate = integerInRange(input.frameRate ?? 60, 1, 240, "frameRate");
  const target = normalizeTarget(input.target);
  const targetId =
    target.type === "element"
      ? target.elementId
      : target.type === "group"
      ? target.groupId
      : target.type === "camera"
      ? target.cameraId
      : `${target.transitionId}-${target.layerId}`;
  const totalDuration = content.totalDuration ?? duration;
  const project: AnimationProject = {
    schemaVersion: ANIMATION_SCHEMA_VERSION,
    id: input.projectId ?? `${name}-${targetId}`,
    durationMs: atMs + totalDuration,
    frameRate,
    tracks: [
      {
        id: input.trackId ?? `${name}-track-${targetId}`,
        target,
        startMs: atMs,
        ...(content.preset ? { presets: [content.preset] } : {}),
        ...(content.loop ? { loops: [content.loop] } : {}),
      },
    ],
  };
  return animationProjectSchema.parse(project);
};

export const normalizeEasing = (
  easing: PresetEasing | undefined,
  fallback: AnimationEasingPresetName,
): AnimationEasing =>
  typeof easing === "string"
    ? { type: "preset", name: easing }
    : easing ?? {
        type: "preset",
        name: fallback,
      };

export const normalizeTarget = (target: PresetTarget): AnimationTarget => {
  if (typeof target === "string") {
    if (!target.trim()) {
      throw new TypeError("Preset target element id must not be empty.");
    }
    return { type: "element", elementId: target };
  }
  return target;
};

export const effectDuration = (duration: number, iterations = 1, delay = 0) => {
  positiveFinite(duration, "duration");
  positiveInteger(iterations, "iterations");
  nonNegativeFinite(delay, "delay");
  return duration * iterations + delay * Math.max(0, iterations - 1);
};

export const positiveFinite = (value: number, name: string) => {
  if (!Number.isFinite(value) || value <= 0) {
    throw new RangeError(`${name} must be a finite number greater than 0.`);
  }
  return value;
};

export const nonNegativeFinite = (value: number, name: string) => {
  if (!Number.isFinite(value) || value < 0) {
    throw new RangeError(
      `${name} must be a finite number greater than or equal to 0.`,
    );
  }
  return value;
};

export const positiveInteger = (value: number, name: string) => {
  if (!Number.isInteger(value) || value < 1) {
    throw new RangeError(
      `${name} must be an integer greater than or equal to 1.`,
    );
  }
  return value;
};

export const numberInRange = (
  value: number,
  min: number,
  max: number,
  name: string,
) => {
  if (!Number.isFinite(value) || value < min || value > max) {
    throw new RangeError(`${name} must be in the range ${min}..${max}.`);
  }
  return value;
};

const integerInRange = (
  value: number,
  min: number,
  max: number,
  name: string,
) => {
  if (!Number.isInteger(value) || value < min || value > max) {
    throw new RangeError(
      `${name} must be an integer in the range ${min}..${max}.`,
    );
  }
  return value;
};
