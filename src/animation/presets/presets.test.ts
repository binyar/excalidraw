import { MotionAdapter } from "../runtime/MotionAdapter";

import {
  animationPresetCatalog,
  animationPresetsByName,
  blinkPreset,
  bounceInPreset,
  fadeInPreset,
  movePathPreset,
  numberCountPreset,
  progressGrowPreset,
  pulsePreset,
  rotatePreset,
  scaleUpPreset,
  shakePreset,
  slideLeftPreset,
  slideRightPreset,
} from "./index";

describe("animation preset catalog", () => {
  it("exposes the first 12 semantic presets with parameter metadata", () => {
    expect(animationPresetCatalog.map((preset) => preset.name)).toEqual([
      "fade-in",
      "slide-left",
      "slide-right",
      "scale-up",
      "bounce-in",
      "pulse",
      "blink",
      "shake",
      "move-path",
      "rotate",
      "number-count",
      "progress-grow",
    ]);
    animationPresetCatalog.forEach((preset) => {
      expect(preset.description.length).toBeGreaterThan(0);
      expect(preset.params.duration).toMatchObject({
        type: "number",
        unit: "ms",
      });
      expect(typeof preset.generateAnimation).toBe("function");
      expect(animationPresetsByName[preset.name]).toBe(preset);
    });
  });

  it("generates schema-valid, keyframe-free DSL that compiles for Motion", () => {
    const projects = [
      fadeInPreset.generateAnimation({ target: "element", duration: 500 }),
      slideLeftPreset.generateAnimation({
        target: "element",
        duration: 600,
        distance: 120,
        easing: "ease-out",
      }),
      slideRightPreset.generateAnimation({
        target: "element",
        duration: 600,
      }),
      scaleUpPreset.generateAnimation({ target: "element", duration: 500 }),
      bounceInPreset.generateAnimation({ target: "element", duration: 700 }),
      pulsePreset.generateAnimation({
        target: "element",
        duration: 800,
        count: 2,
      }),
      blinkPreset.generateAnimation({
        target: "element",
        duration: 200,
        iterations: 3,
      }),
      shakePreset.generateAnimation({ target: "element", duration: 500 }),
      movePathPreset.generateAnimation({
        target: "element",
        duration: 1000,
        path: {
          type: "polyline",
          points: [
            { x: 0, y: 0 },
            { x: 300, y: 120 },
          ],
        },
      }),
      rotatePreset.generateAnimation({ target: "element", duration: 1000 }),
      numberCountPreset.generateAnimation({
        target: "element",
        duration: 900,
        from: 0,
        to: 1200,
      }),
      progressGrowPreset.generateAnimation({
        target: "element",
        duration: 900,
        from: 20,
        to: 80,
        min: 0,
        max: 100,
      }),
    ];

    projects.forEach((project) => {
      expect(JSON.stringify(project)).not.toContain("keyframes");
      const compiled = new MotionAdapter(project).compile();
      expect(compiled.objects).toHaveLength(1);
      expect(Object.keys(compiled.state.objectsByKey)).toHaveLength(1);
    });
  });

  it("compiles data presets into executable Motion data channels", () => {
    const numberAdapter = new MotionAdapter(
      numberCountPreset.generateAnimation({
        target: "counter",
        duration: 1000,
        from: 10,
        to: 110,
      }),
    );
    const progressAdapter = new MotionAdapter(
      progressGrowPreset.generateAnimation({
        target: "progress",
        duration: 1000,
        from: 25,
        to: 75,
        min: 0,
        max: 100,
      }),
    );

    const numberCompiled = numberAdapter.compile();
    const progressCompiled = progressAdapter.compile();
    expect(numberAdapter.sample(numberCompiled, 0).counter.data.number).toBe(
      10,
    );
    expect(numberAdapter.sample(numberCompiled, 1000).counter.data.number).toBe(
      110,
    );
    expect(
      progressAdapter.sample(progressCompiled, 0).progress.data.progress,
    ).toBe(0.25);
    expect(
      progressAdapter.sample(progressCompiled, 1000).progress.data.progress,
    ).toBe(0.75);
  });

  it("maps slide-left to the canonical semantic DSL preset", () => {
    const project = slideLeftPreset.generateAnimation({
      target: "card",
      duration: 700,
      distance: 96,
      easing: "smooth",
    });

    expect(project.tracks[0]).not.toHaveProperty("properties");
    expect(project.tracks[0].presets?.[0]).toEqual({
      category: "entrance",
      name: "slide-in",
      direction: "left",
      distance: 96,
      atMs: 0,
      durationMs: 700,
      easing: { type: "preset", name: "smooth" },
    });
  });
});
