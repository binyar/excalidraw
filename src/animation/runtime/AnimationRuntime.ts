import { animate } from "motion";

import {
  MotionAdapter,
  MotionAdapterError,
  type AnimationRuntimeObjectValue,
  type MotionAdapterOutput,
} from "./MotionAdapter";

import type { AnimationProject } from "../types";

export type AnimationRuntimeStatus = "playing" | "paused" | "stopped";

export type AnimationRuntimeSnapshot = {
  timeMs: number;
  durationMs: number;
  status: AnimationRuntimeStatus;
  values: Readonly<Record<string, AnimationRuntimeObjectValue>>;
};

export type AnimationRuntimeSubscriber = (
  snapshot: AnimationRuntimeSnapshot,
) => void;

type MotionPlaybackControls = PromiseLike<unknown> & {
  speed: number;
  pause(): void;
  cancel(): void;
};

type MotionAnimate = (
  from: number,
  to: number,
  options: {
    duration: number;
    ease: "linear";
    repeat: number;
    repeatType: "loop" | "reverse";
    onUpdate: (value: number) => void;
  },
) => MotionPlaybackControls;

export type AnimationRuntimeOptions = {
  /** Allows deterministic playback injection without exposing Motion to UI code. */
  animate?: MotionAnimate;
};

/**
 * Headless AnimationProject player backed by Motion.
 *
 * Motion owns the playback clock. MotionAdapter deterministically samples the
 * engine-neutral project at that clock time so pause, seek, reverse playback,
 * canvas bindings, and camera bindings all share one source of truth.
 */
export class AnimationRuntime {
  readonly durationMs: number;

  private status: AnimationRuntimeStatus = "stopped";
  private timeMs = 0;
  private values: Readonly<Record<string, AnimationRuntimeObjectValue>>;
  private readonly subscribers = new Set<AnimationRuntimeSubscriber>();
  private controls: MotionPlaybackControls | undefined;
  private playbackGeneration = 0;
  private disposed = false;

  private constructor(
    private readonly animationProject: AnimationProject,
    private readonly adapter: MotionAdapter,
    private readonly compiled: MotionAdapterOutput,
    private readonly animateClock: MotionAnimate,
  ) {
    this.durationMs = animationProject.durationMs;
    this.values = adapter.sample(compiled, 0);
  }

  static async create(
    project: AnimationProject,
    options: AnimationRuntimeOptions = {},
  ): Promise<AnimationRuntime> {
    const adapter = new MotionAdapter(project);
    const compiled = adapter.compile();
    return new AnimationRuntime(
      adapter.project,
      adapter,
      compiled,
      options.animate ?? (animate as MotionAnimate),
    );
  }

  /** Starts or resumes playback from the current project time. */
  async play(): Promise<boolean> {
    this.assertActive();
    this.controls?.cancel();
    const generation = ++this.playbackGeneration;
    const playback = this.animationProject.playback;
    const direction = playback?.direction ?? "normal";
    const startsReversed =
      direction === "reverse" || direction === "alternate-reverse";
    const reachedPlaybackEnd = startsReversed
      ? this.timeMs === 0
      : this.timeMs === this.durationMs;
    const from = reachedPlaybackEnd
      ? startsReversed
        ? this.durationMs
        : 0
      : this.timeMs;
    const to = startsReversed ? 0 : this.durationMs;
    const remainingDuration = Math.abs(to - from);
    const iterations = playback?.iterations ?? 1;

    this.timeMs = from;
    this.refreshValues();
    this.status = "playing";
    this.emit();

    this.controls = this.animateClock(from, to, {
      duration: Math.max(0.001, remainingDuration / 1000),
      ease: "linear",
      repeat:
        iterations === "infinite" ? Infinity : Math.max(0, iterations - 1),
      repeatType:
        direction === "alternate" || direction === "alternate-reverse"
          ? "reverse"
          : "loop",
      onUpdate: (timeMs) => {
        if (this.disposed || generation !== this.playbackGeneration) {
          return;
        }
        this.timeMs = clamp(timeMs, 0, this.durationMs);
        this.refreshValues();
        this.emit();
      },
    });
    this.controls.speed = playback?.rate ?? 1;

    try {
      await this.controls;
    } catch (error) {
      if (!this.disposed && generation === this.playbackGeneration) {
        this.status = "paused";
        this.emit();
      }
      throw error;
    }
    if (!this.disposed && generation === this.playbackGeneration) {
      // Motion usually publishes the exact terminal value, but frame clocks
      // are allowed to resolve after their last update landed fractionally
      // before it. Discrete properties (fill/stroke style, fonts, alignment,
      // visibility) only change at the exact keyframe, so always
      // sample the deterministic terminal frame on natural completion.
      const alternates =
        direction === "alternate" || direction === "alternate-reverse";
      const endsAtStart =
        alternates &&
        iterations !== "infinite" &&
        Math.max(1, iterations) % 2 === 0;
      this.timeMs = clamp(endsAtStart ? from : to, 0, this.durationMs);
      this.status = "paused";
      this.refreshValues();
      this.emit();
    }
    return true;
  }

  pause(): void {
    this.assertActive();
    this.playbackGeneration++;
    this.controls?.pause();
    this.status = "paused";
    this.emit();
  }

  stop(): void {
    this.assertActive();
    this.playbackGeneration++;
    this.controls?.cancel();
    this.controls = undefined;
    this.status = "stopped";
    this.timeMs = 0;
    this.refreshValues();
    this.emit();
  }

  seek(time: number): void {
    this.assertActive();
    if (!Number.isFinite(time)) {
      throw new MotionAdapterError("seek(time) requires a finite time in ms.");
    }
    this.playbackGeneration++;
    this.controls?.cancel();
    this.controls = undefined;
    this.status = "paused";
    this.timeMs = clamp(time, 0, this.durationMs);
    this.refreshValues();
    this.emit();
  }

  subscribe(callback: AnimationRuntimeSubscriber): () => void {
    this.assertActive();
    this.subscribers.add(callback);
    callback(this.snapshot());
    return () => this.subscribers.delete(callback);
  }

  getSnapshot(): AnimationRuntimeSnapshot {
    this.assertActive();
    return this.snapshot();
  }

  dispose(): void {
    if (this.disposed) {
      return;
    }
    this.playbackGeneration++;
    this.controls?.cancel();
    this.controls = undefined;
    this.subscribers.clear();
    this.disposed = true;
  }

  private refreshValues() {
    this.values = this.adapter.sample(this.compiled, this.timeMs);
  }

  private snapshot(): AnimationRuntimeSnapshot {
    return {
      timeMs: this.timeMs,
      durationMs: this.durationMs,
      status: this.status,
      values: this.values,
    };
  }

  private emit(): void {
    if (this.disposed || this.subscribers.size === 0) {
      return;
    }
    const snapshot = this.snapshot();
    this.subscribers.forEach((callback) => callback(snapshot));
  }

  private assertActive(): void {
    if (this.disposed) {
      throw new MotionAdapterError("AnimationRuntime has been disposed.");
    }
  }
}

const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value));
