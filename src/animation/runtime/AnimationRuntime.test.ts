import { AnimationRuntime } from "./AnimationRuntime";
import { MotionAdapter } from "./MotionAdapter";

import type { AnimationProject } from "../types";
import type {
  AnimationRuntimeOptions,
  AnimationRuntimeSnapshot,
} from "./AnimationRuntime";

const project = (
  overrides: Partial<AnimationProject> = {},
): AnimationProject => ({
  schemaVersion: "1.0",
  id: "runtime-test",
  durationMs: 1000,
  frameRate: 60,
  tracks: [
    {
      id: "move-box",
      target: { type: "element", elementId: "box" },
      properties: [
        {
          property: "transform.x",
          keyframes: [
            { atMs: 0, value: 0, easing: { type: "preset", name: "linear" } },
            { atMs: 1000, value: 500 },
          ],
        },
      ],
    },
  ],
  ...overrides,
});

describe("MotionAdapter", () => {
  it("samples camera position and zoom as a scene-level runtime object", () => {
    const adapter = new MotionAdapter(
      project({
        tracks: [
          {
            id: "main-camera",
            target: { type: "camera", cameraId: "main" },
            properties: [
              {
                property: "camera.centerX",
                keyframes: [
                  {
                    atMs: 0,
                    value: 100,
                    easing: { type: "preset", name: "linear" },
                  },
                  { atMs: 1000, value: 500 },
                ],
              },
              {
                property: "camera.zoom",
                keyframes: [
                  {
                    atMs: 0,
                    value: 1,
                    easing: { type: "preset", name: "linear" },
                  },
                  { atMs: 1000, value: 2 },
                ],
              },
            ],
          },
        ],
      }),
    );
    const compiled = adapter.compile();

    expect(compiled.objects).toEqual([
      { elementId: "camera:main", objectKey: "element / camera%3Amain" },
    ]);
    expect(adapter.sample(compiled, 500)["camera:main"].camera).toEqual({
      centerX: 300,
      centerY: 0,
      zoom: 1.5,
    });
  });

  it("samples a transition object only inside its persisted track window", () => {
    const adapter = new MotionAdapter(
      project({
        durationMs: 3000,
        scenes: [
          { id: "chapter-1", startMs: 0, durationMs: 1000 },
          { id: "chapter-2", startMs: 2000, durationMs: 1000 },
        ],
        tracks: [
          {
            id: "chapter-wipe",
            target: {
              type: "transition",
              transitionId: "chapter-1-2",
              layerId: "main",
              fromSceneId: "chapter-1",
              toSceneId: "chapter-2",
              effect: "directional-wipe",
              direction: "left",
            },
            startMs: 1200,
            durationMs: 800,
            properties: [
              {
                property: "transition.progress",
                keyframes: [
                  {
                    atMs: 0,
                    value: 0,
                    easing: { type: "preset", name: "linear" },
                  },
                  { atMs: 800, value: 1 },
                ],
              },
              {
                property: "transition.opacity",
                keyframes: [
                  { atMs: 0, value: 1 },
                  { atMs: 800, value: 1 },
                ],
              },
              {
                property: "transition.color",
                keyframes: [{ atMs: 0, value: "#EF4444FF" }],
              },
            ],
          },
        ],
      }),
    );
    const compiled = adapter.compile();
    const id = "transition:chapter-1-2:main";

    expect(adapter.sample(compiled, 1199)[id].transition.opacity).toBe(0);
    expect(adapter.sample(compiled, 1600)[id].transition).toMatchObject({
      progress: 0.5,
      opacity: 1,
      color: "#EF4444FF",
    });
    expect(adapter.sample(compiled, 2001)[id].transition.opacity).toBe(0);
  });

  it("turns an AI-friendly tween into an executable Motion channel", () => {
    const property = MotionAdapter.tweenToProperty({
      property: "x",
      from: 0,
      to: 500,
      durationMs: 1000,
      easing: { type: "preset", name: "linear" },
    });
    const adapter = new MotionAdapter(
      project({
        tracks: [
          {
            id: "generated-move",
            target: { type: "element", elementId: "box" },
            properties: [property],
          },
        ],
      }),
    );
    const compiled = adapter.compile();

    expect(adapter.sample(compiled, 0).box.transform.x).toBe(0);
    expect(adapter.sample(compiled, 500).box.transform.x).toBe(250);
    expect(adapter.sample(compiled, 1000).box.transform.x).toBe(500);
  });

  it("expands group staggering before sampling object channels", () => {
    const adapter = new MotionAdapter(
      project({
        groups: [
          {
            id: "card",
            members: [
              { type: "element", elementId: "background", role: "background" },
              { type: "element", elementId: "title", role: "title" },
            ],
          },
        ],
        tracks: [
          {
            id: "card-entrance",
            target: { type: "group", groupId: "card" },
            group: { mode: "stagger", eachMs: 100 },
            presets: [
              {
                category: "entrance",
                name: "fade-in",
                atMs: 0,
                durationMs: 500,
                easing: { type: "preset", name: "linear" },
              },
            ],
          },
        ],
      }),
    );
    const compiled = adapter.compile();
    const at50 = adapter.sample(compiled, 50);

    expect(at50.background.visual.opacity).toBeCloseTo(0.1);
    expect(at50.title.visual.opacity).toBe(0);
    expect(adapter.sample(compiled, 600).title.visual.opacity).toBe(1);
  });

  it.each(["slide-in", "scale-in", "pop-in"] as const)(
    "keeps delayed %s entrances transparent before they start",
    (name) => {
      const adapter = new MotionAdapter(
        project({
          durationMs: 3000,
          tracks: [
            {
              id: "delayed-entrance",
              target: { type: "element", elementId: "box" },
              startMs: 1200,
              durationMs: 600,
              presets: [
                {
                  category: "entrance",
                  name,
                  atMs: 0,
                  durationMs: 600,
                  ...(name === "slide-in"
                    ? { direction: "left" as const, distance: 80 }
                    : {}),
                },
              ],
            },
          ],
        }),
      );
      const compiled = adapter.compile();

      expect(adapter.sample(compiled, 0).box.visual.opacity).toBe(0);
      expect(adapter.sample(compiled, 1199).box.visual.opacity).toBe(0);
      expect(adapter.sample(compiled, 1199).box.element.visibility).toBe(
        "hidden",
      );
      expect(adapter.sample(compiled, 1201).box.element.visibility).toBe(
        "visible",
      );
      expect(adapter.sample(compiled, 1800).box.visual.opacity).toBe(1);
    },
  );

  it("keeps exits interactive until completion and hidden afterward", () => {
    const adapter = new MotionAdapter(
      project({
        durationMs: 2000,
        tracks: [
          {
            id: "box-exit",
            target: { type: "element", elementId: "box" },
            startMs: 500,
            durationMs: 600,
            presets: [
              {
                category: "exit",
                name: "fade-out",
                atMs: 0,
                durationMs: 600,
                fill: "forwards",
              },
            ],
          },
        ],
      }),
    );
    const compiled = adapter.compile();

    expect(adapter.sample(compiled, 1099).box.element.visibility).toBe(
      "visible",
    );
    expect(adapter.sample(compiled, 1100).box.element.visibility).toBe(
      "hidden",
    );
    expect(adapter.sample(compiled, 1500).box.element.visibility).toBe(
      "hidden",
    );
  });

  it("uses Motion spring sampling for physical easing", () => {
    const adapter = new MotionAdapter(
      project({
        durationMs: 2000,
        tracks: [
          {
            id: "spring-box",
            target: { type: "element", elementId: "box" },
            properties: [
              {
                property: "transform.scale",
                keyframes: [
                  {
                    atMs: 0,
                    value: 0,
                    easing: {
                      type: "spring",
                      stiffness: 100,
                      damping: 10,
                      mass: 1,
                    },
                  },
                  { atMs: 2000, value: 1 },
                ],
              },
            ],
          },
        ],
      }),
    );
    const sampled = adapter.sample(adapter.compile(), 500).box.transform.scale;

    expect(sampled).toBeGreaterThan(1);
  });

  it("clamps spring overshoot for bounded opacity channels", () => {
    const adapter = new MotionAdapter(
      project({
        durationMs: 2000,
        tracks: [
          {
            id: "spring-opacity",
            target: { type: "element", elementId: "box" },
            properties: [
              {
                property: "visual.opacity",
                keyframes: [
                  {
                    atMs: 0,
                    value: 0,
                    easing: {
                      type: "spring",
                      stiffness: 100,
                      damping: 10,
                      mass: 1,
                    },
                  },
                  { atMs: 2000, value: 1 },
                ],
              },
            ],
          },
        ],
      }),
    );

    const sampled = adapter.sample(adapter.compile(), 500).box.visual.opacity;

    expect(sampled).toBe(1);
  });

  it("clamps spring overshoot for bounded draw-progress channels", () => {
    const adapter = new MotionAdapter(
      project({
        durationMs: 2000,
        tracks: [
          {
            id: "spring-draw-progress",
            target: { type: "element", elementId: "box" },
            properties: [
              {
                property: "advanced.drawProgress",
                keyframes: [
                  {
                    atMs: 0,
                    value: 0,
                    easing: {
                      type: "spring",
                      stiffness: 100,
                      damping: 10,
                      mass: 1,
                    },
                  },
                  { atMs: 2000, value: 1 },
                ],
              },
            ],
          },
        ],
      }),
    );

    const sampled = adapter.sample(adapter.compile(), 500).box.advanced
      .drawProgress;

    expect(sampled).toBe(1);
  });
});

describe("AnimationRuntime", () => {
  it("advances with the installed Motion runtime", async () => {
    const runtime = await AnimationRuntime.create(
      project({
        durationMs: 80,
        tracks: [
          {
            id: "move-box",
            target: { type: "element", elementId: "box" },
            properties: [
              {
                property: "transform.x",
                keyframes: [
                  {
                    atMs: 0,
                    value: 0,
                    easing: { type: "preset", name: "linear" },
                  },
                  { atMs: 80, value: 40 },
                ],
              },
            ],
          },
        ],
      }),
    );
    const snapshots: AnimationRuntimeSnapshot[] = [];
    runtime.subscribe((snapshot) => snapshots.push(snapshot));

    await runtime.play();

    expect(snapshots.some((snapshot) => snapshot.status === "playing")).toBe(
      true,
    );
    expect(runtime.getSnapshot()).toMatchObject({
      timeMs: 80,
      status: "paused",
    });
    expect(runtime.getSnapshot().values.box.transform.x).toBeCloseTo(40);
    runtime.dispose();
  });

  it("plays, pauses, seeks, stops, and publishes engine-neutral snapshots", async () => {
    const clock = createFakeMotionClock();
    const runtime = await AnimationRuntime.create(
      project({
        playback: {
          iterations: "infinite",
          direction: "alternate-reverse",
          rate: 2,
        },
      }),
      { animate: clock.animate },
    );
    const snapshots = [] as ReturnType<typeof runtime.getSnapshot>[];
    const unsubscribe = runtime.subscribe((snapshot) =>
      snapshots.push(snapshot),
    );

    runtime.seek(500);
    expect(snapshots.at(-1)).toMatchObject({
      timeMs: 500,
      status: "paused",
      values: { box: { transform: { x: 250 } } },
    });

    const playback = runtime.play();
    expect(clock.lastCall).toMatchObject({
      from: 500,
      to: 0,
      options: { repeat: Infinity, repeatType: "reverse" },
    });
    expect(clock.controls?.speed).toBe(2);
    clock.emit(250);
    expect(runtime.getSnapshot()).toMatchObject({
      timeMs: 250,
      status: "playing",
      values: { box: { transform: { x: 125 } } },
    });

    runtime.pause();
    await playback;
    expect(runtime.getSnapshot().status).toBe("paused");

    runtime.stop();
    expect(runtime.getSnapshot()).toMatchObject({
      timeMs: 0,
      status: "stopped",
      values: { box: { transform: { x: 0 } } },
    });

    const countBeforeUnsubscribe = snapshots.length;
    unsubscribe();
    runtime.seek(250);
    expect(snapshots).toHaveLength(countBeforeUnsubscribe);

    runtime.dispose();
    expect(() => runtime.seek(0)).toThrow("disposed");
  });

  it("commits the exact terminal frame when the playback clock resolves early", async () => {
    const clock = createFakeMotionClock();
    const runtime = await AnimationRuntime.create(
      project({
        tracks: [
          {
            id: "round-box",
            target: { type: "element", elementId: "box" },
            properties: [
              {
                property: "visual.roundness",
                keyframes: [
                  { atMs: 0, value: "sharp", hold: true },
                  { atMs: 1000, value: "round", hold: true },
                ],
              },
              {
                property: "visual.strokeWidth",
                keyframes: [
                  { atMs: 0, value: 1 },
                  { atMs: 1000, value: 5 },
                ],
              },
            ],
          },
        ],
      }),
      { animate: clock.animate },
    );

    const playback = runtime.play();
    clock.emit(999.5);
    expect(runtime.getSnapshot().values.box.visual.roundness).toBeCloseTo(
      0.9995,
    );
    clock.finish();
    await playback;

    expect(runtime.getSnapshot()).toMatchObject({
      timeMs: 1000,
      status: "paused",
      values: {
        box: { visual: { roundness: 1, strokeWidth: 5 } },
      },
    });
    runtime.dispose();
  });

  it("restarts forward playback from zero after reaching the end", async () => {
    const clock = createFakeMotionClock();
    const runtime = await AnimationRuntime.create(project(), {
      animate: clock.animate,
    });

    const firstPlayback = runtime.play();
    clock.finish();
    await firstPlayback;
    expect(runtime.getSnapshot()).toMatchObject({
      timeMs: 1000,
      status: "paused",
    });

    const replay = runtime.play();
    expect(clock.lastCall).toMatchObject({ from: 0, to: 1000 });
    expect(runtime.getSnapshot()).toMatchObject({
      timeMs: 0,
      status: "playing",
    });

    clock.finish();
    await replay;
    runtime.dispose();
  });

  it("clamps seek time to the project duration", async () => {
    const runtime = await AnimationRuntime.create(project());

    runtime.seek(-100);
    expect(runtime.getSnapshot().timeMs).toBe(0);
    runtime.seek(2000);
    expect(runtime.getSnapshot().timeMs).toBe(1000);
    expect(() => runtime.seek(Number.NaN)).toThrow("finite time");
    runtime.dispose();
  });
});

const createFakeMotionClock = () => {
  type AnimateClock = NonNullable<AnimationRuntimeOptions["animate"]>;
  type AnimateOptions = Parameters<AnimateClock>[2];
  let resolvePlayback: (() => void) | undefined;
  let update: ((value: number) => void) | undefined;
  let controls:
    | (Promise<void> & { speed: number; pause(): void; cancel(): void })
    | undefined;
  let lastCall:
    | { from: number; to: number; options: AnimateOptions }
    | undefined;

  const animate: AnimateClock = (from, to, options) => {
    lastCall = { from, to, options };
    update = options.onUpdate;
    const promise = new Promise<void>((resolve) => {
      resolvePlayback = resolve;
    });
    controls = Object.assign(promise, {
      speed: 1,
      pause: () => resolvePlayback?.(),
      cancel: () => resolvePlayback?.(),
    });
    return controls;
  };

  return {
    animate,
    get controls() {
      return controls;
    },
    get lastCall() {
      return lastCall;
    },
    emit(value: number) {
      update?.(value);
    },
    finish() {
      resolvePlayback?.();
    },
  };
};
