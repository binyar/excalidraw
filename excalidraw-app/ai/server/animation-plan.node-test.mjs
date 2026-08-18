import assert from "node:assert/strict";
import test from "node:test";

import {
  compileStoryAnimationPlan,
  createEmptyAnimationPlan,
  sanitizeAnimationId,
  validateStoryAnimationPlan,
} from "./animation-plan.mjs";
import {
  createAnimationPlannerTools,
  STYLE_PROPERTIES_BY_TARGET_TYPE,
} from "./animation-planner-tools.mjs";
import { ANIMATION_AGENT_SYSTEM_PROMPT } from "./prompt.mjs";

const tool = (tools, name) => {
  const found = tools.find((candidate) => candidate.name === name);
  assert.ok(found, `missing tool ${name}`);
  return found;
};

test("animation Agent contract teaches semantic real visibility", () => {
  assert.match(
    ANIMATION_AGENT_SYSTEM_PROMPT,
    /所有自然语言内容必须使用简体中文/,
  );
  assert.match(ANIMATION_AGENT_SYSTEM_PROMPT, /禁止.*Emoji 表情符号/);
  assert.match(ANIMATION_AGENT_SYSTEM_PROMPT, /element\.visibility/);
  assert.match(
    ANIMATION_AGENT_SYSTEM_PROMPT,
    /hidden 时元素不渲染、不可点击、不可框选/,
  );
  assert.match(ANIMATION_AGENT_SYSTEM_PROMPT, /绝不能用单独的 fade\/opacity/);
  assert.match(ANIMATION_AGENT_SYSTEM_PROMPT, /roughness.*离散状态/);
  assert.match(ANIMATION_AGENT_SYSTEM_PROMPT, /roundness.*0\.\.1/);
});

test("animation planner exposes Chinese tool descriptions", () => {
  const tools = createAnimationPlannerTools(
    canvasDraft,
    createEmptyAnimationPlan(),
  );
  for (const candidate of tools) {
    assert.match(candidate.description, /[\u3400-\u9fff]/, candidate.name);
  }
});

test("animation Agent capability map covers every supported canvas target", () => {
  const shape = [
    "visual.opacity",
    "visual.strokeColor",
    "visual.backgroundColor",
    "visual.fillStyle",
    "visual.strokeWidth",
    "visual.strokeStyle",
    "visual.roughness",
  ];
  const expected = {
    rectangle: [...shape, "visual.roundness"],
    ellipse: shape,
    diamond: [...shape, "visual.roundness"],
    line: [...shape, "visual.roundness"],
    arrow: [
      "visual.opacity",
      "visual.strokeColor",
      "visual.strokeWidth",
      "visual.strokeStyle",
      "visual.roughness",
    ],
    freedraw: [
      "visual.opacity",
      "visual.strokeColor",
      "visual.backgroundColor",
      "visual.fillStyle",
      "visual.strokeWidth",
    ],
    text: [
      "visual.opacity",
      "text.fontSize",
      "text.fontFamily",
      "text.textAlign",
    ],
    connector: [
      "visual.opacity",
      "visual.strokeColor",
      "visual.strokeWidth",
      "visual.strokeStyle",
      "visual.roughness",
    ],
    image: ["visual.opacity", "visual.roundness"],
    iframe: [
      "visual.opacity",
      "visual.backgroundColor",
      "visual.fillStyle",
      "visual.strokeWidth",
      "visual.strokeStyle",
      "visual.roughness",
      "visual.roundness",
    ],
    embeddable: [...shape, "visual.roundness"],
    frame: ["visual.opacity"],
    magicframe: ["visual.opacity"],
    asset: ["visual.opacity"],
  };

  assert.deepEqual(
    Object.fromEntries(
      Object.entries(STYLE_PROPERTIES_BY_TARGET_TYPE).map(([type, values]) => [
        type,
        [...values],
      ]),
    ),
    expected,
  );
});

const canvasDraft = {
  id: "planner-story",
  beats: [
    { id: "opening", elementIds: ["hero"] },
    { id: "detail", elementIds: ["detail", "hero-detail"] },
  ],
  elements: [
    { id: "hero", type: "rectangle", x: 0, y: 0, width: 400, height: 240 },
    {
      id: "detail",
      type: "rectangle",
      x: 1200,
      y: 300,
      width: 240,
      height: 160,
    },
  ],
  libraryAssets: [],
  connectors: [{ id: "hero-detail", from: "hero", to: "detail" }],
};

const plan = () => ({
  schemaVersion: "1.0",
  durationMs: 8000,
  rationale: "two scenes with a readable camera transition",
  summary: "opening then detail",
  style: { tone: "restrained", pace: "normal" },
  scenes: [
    {
      id: "opening-scene",
      beatId: "opening",
      startMs: 0,
      durationMs: 2800,
      focusTargets: ["hero"],
      camera: { framing: "fit", transition: "hold" },
      cues: [],
    },
    {
      id: "detail-scene",
      beatId: "detail",
      startMs: 4200,
      durationMs: 2600,
      focusTargets: ["detail"],
      camera: {
        framing: "close",
        transition: "reframe",
        transitionDurationMs: 1200,
        motion: "gentle",
      },
      cues: [
        {
          id: "detail-enter",
          type: "enter",
          targets: ["detail"],
          atMs: 200,
          durationMs: 600,
          effect: "slide",
          direction: "right",
          motion: "snappy",
        },
        {
          id: "connector-draw",
          type: "draw",
          targets: ["hero-detail"],
          atMs: 900,
          durationMs: 700,
          effect: "fade",
          motion: "precise",
        },
      ],
    },
  ],
});

test("planner DSL compiles semantic scenes and cues into Motion tracks", () => {
  const draft = compileStoryAnimationPlan(plan(), canvasDraft);

  assert.equal(draft.durationMs, 8000);
  assert.equal(draft.plan.schemaVersion, "1.0");
  assert.equal(draft.plan.style.tone, "restrained");
  assert.equal(draft.plan.scenes[1].cues[0].motion, "snappy");
  assert.deepEqual(
    draft.scenes.map(({ id, startMs, durationMs }) => ({
      id,
      startMs,
      durationMs,
    })),
    [
      { id: "opening-scene", startMs: 0, durationMs: 2800 },
      { id: "detail-scene", startMs: 4200, durationMs: 2600 },
    ],
  );
  assert.ok(draft.tracks.length >= 6);
  const camera = draft.tracks[0];
  assert.equal(camera.targetType, "camera");
  assert.deepEqual(
    camera.properties.map((property) => property.property),
    ["camera.centerX", "camera.centerY", "camera.zoom"],
  );
  assert.deepEqual(
    camera.properties[0].keyframes.map((keyframe) => keyframe.atMs),
    [0, 3000, 3300, 3900, 4200],
  );
  const entrance = draft.tracks.find((track) =>
    track.id.includes("detail-enter"),
  );
  assert.equal(entrance.sceneId, "detail-scene");
  assert.equal(entrance.startMs, 200);
  assert.deepEqual(entrance.presets[0].easing, {
    type: "spring",
    stiffness: 180,
    damping: 24,
    mass: 1,
  });
  assert.deepEqual(
    entrance.properties.find(
      (property) => property.property === "element.visibility",
    ).keyframes,
    [
      { atMs: 0, value: "hidden", hold: true },
      { atMs: 1, value: "visible", hold: true },
    ],
  );
  const connector = draft.tracks.find((track) =>
    track.id.includes("connector-draw"),
  );
  assert.equal(connector.properties[0].property, "advanced.drawProgress");
  assert.deepEqual(connector.properties[0].keyframes[0].easing, {
    type: "cubic-bezier",
    x1: 0.22,
    y1: 1,
    x2: 0.36,
    y2: 1,
  });
});

test("planner compiles style cues from the frozen canvas value", () => {
  const styledCanvas = structuredClone(canvasDraft);
  styledCanvas.elements[1].style = { backgroundColor: "#A5D8FFFF" };
  const styledPlan = plan();
  styledPlan.scenes[1].cues.push({
    id: "detail-color",
    type: "style",
    targets: ["detail"],
    atMs: 1700,
    durationMs: 400,
    effect: "style",
    styleProperty: "visual.backgroundColor",
    styleValue: "#FF8787FF",
  });
  styledPlan.scenes[1].cues.push({
    id: "detail-roundness",
    type: "style",
    targets: ["detail"],
    atMs: 2100,
    durationMs: 400,
    effect: "style",
    styleProperty: "visual.roundness",
    styleValue: "round",
  });
  styledPlan.scenes[1].cues.push({
    id: "detail-roughness",
    type: "style",
    targets: ["detail"],
    atMs: 2200,
    durationMs: 200,
    effect: "style",
    styleProperty: "visual.roughness",
    styleValue: 2,
  });

  const draft = compileStoryAnimationPlan(styledPlan, styledCanvas);
  const styleTrack = draft.tracks.find((track) =>
    track.id.includes("detail-color"),
  );

  assert.deepEqual(styleTrack.properties, [
    {
      property: "visual.backgroundColor",
      fill: "both",
      keyframes: [
        {
          atMs: 0,
          value: "#A5D8FFFF",
          easing: {
            type: "cubic-bezier",
            x1: 0.22,
            y1: 1,
            x2: 0.36,
            y2: 1,
          },
        },
        { atMs: 400, value: "#FF8787FF" },
      ],
    },
  ]);
  const roundnessTrack = draft.tracks.find((track) =>
    track.id.includes("detail-roundness"),
  );
  assert.equal(roundnessTrack.properties[0].property, "visual.roundness");
  assert.equal(roundnessTrack.properties[0].keyframes[0].value, 0);
  assert.equal(roundnessTrack.properties[0].keyframes[1].value, 1);
  assert.equal(
    Object.hasOwn(roundnessTrack.properties[0].keyframes[0], "hold"),
    false,
  );
  assert.ok(roundnessTrack.properties[0].keyframes[0].easing);
  const roughnessTrack = draft.tracks.find((track) =>
    track.id.includes("detail-roughness"),
  );
  assert.deepEqual(roughnessTrack.properties[0], {
    property: "visual.roughness",
    fill: "both",
    keyframes: [{ atMs: 0, value: 2, hold: true }],
  });
});

test("planner materializes a color chapter transition into editable tracks", () => {
  const withTransition = plan();
  delete withTransition.scenes[1].camera;
  withTransition.scenes[1].transition = {
    effect: "color-wipe",
    durationMs: 1200,
    direction: "left",
    color: "#EF4444FF",
    backgroundColor: "#FFFFFFFF",
  };

  const draft = compileStoryAnimationPlan(withTransition, canvasDraft);
  const transitions = draft.tracks.filter(
    (track) => track.targetType === "transition",
  );

  assert.equal(transitions.length, 2);
  assert.deepEqual(
    transitions.map((track) => track.name),
    ["颜色扫过 · 主色", "颜色扫过 · 背景色"],
  );
  assert.equal(transitions[0].startMs, 3000);
  assert.equal(transitions[0].fromSceneId, "opening-scene");
  assert.equal(transitions[0].toSceneId, "detail-scene");
  assert.ok(
    transitions.every((track) =>
      track.properties.some(
        (property) => property.property === "transition.progress",
      ),
    ),
  );
});

test("planner cannot compile a transition-only story without editable Object tracks", () => {
  const transitionOnly = plan();
  transitionOnly.scenes.forEach((scene) => {
    scene.cues = [];
  });
  transitionOnly.scenes[1].camera = undefined;
  transitionOnly.scenes[1].transition = {
    effect: "directional-wipe",
    durationMs: 1200,
    direction: "left",
  };

  const draft = compileStoryAnimationPlan(transitionOnly, canvasDraft);
  const objectTracks = draft.tracks.filter(
    (track) =>
      track.targetType !== "transition" && track.targetType !== "camera",
  );
  const plannedCues = draft.plan.scenes.flatMap((scene) => scene.cues);

  assert.ok(objectTracks.length >= 4);
  assert.deepEqual(
    new Set(objectTracks.map((track) => track.sceneId)),
    new Set(["opening-scene", "detail-scene"]),
  );
  assert.ok(plannedCues.some((cue) => cue.type === "enter"));
  assert.ok(plannedCues.some((cue) => cue.type === "draw"));
  assert.ok(plannedCues.some((cue) => cue.type === "emphasize"));
  assert.ok(plannedCues.some((cue) => cue.type === "exit"));
  const sceneById = new Map(draft.scenes.map((scene) => [scene.id, scene]));
  assert.ok(
    objectTracks.every((track) => {
      const scene = sceneById.get(track.sceneId);
      return (
        scene &&
        track.startMs >= 0 &&
        track.startMs + track.durationMs <= scene.durationMs &&
        scene.startMs + track.startMs + track.durationMs <= draft.durationMs
      );
    }),
  );
});

test("dense multi-chapter Object tracks stay scene-local across a 26s project", () => {
  const chapterStarts = [0, 6500, 12_500, 19_600];
  const chapterDurations = [5500, 5000, 6000, 6400];
  const denseCanvas = {
    id: "dense-story",
    beats: chapterStarts.map((_, chapterIndex) => ({
      id: `beat-${chapterIndex + 1}`,
      elementIds: Array.from(
        { length: 10 },
        (_item, elementIndex) =>
          `chapter-${chapterIndex + 1}-object-${elementIndex + 1}`,
      ),
    })),
    elements: chapterStarts.flatMap((_, chapterIndex) =>
      Array.from({ length: 10 }, (_item, elementIndex) => ({
        id: `chapter-${chapterIndex + 1}-object-${elementIndex + 1}`,
        type: "rectangle",
        x: chapterIndex * 1400 + elementIndex * 110,
        y: elementIndex * 60,
        width: 96,
        height: 48,
      })),
    ),
    libraryAssets: [],
    connectors: [],
  };
  const densePlan = {
    schemaVersion: "1.0",
    durationMs: 26_000,
    rationale: "验证多章节相对时间",
    summary: "四章节密集对象动画",
    style: { tone: "restrained", pace: "normal" },
    scenes: chapterStarts.map((startMs, chapterIndex) => ({
      id: `scene-${chapterIndex + 1}`,
      beatId: `beat-${chapterIndex + 1}`,
      startMs,
      durationMs: chapterDurations[chapterIndex],
      focusTargets: [`chapter-${chapterIndex + 1}-object-1`],
      ...(chapterIndex > 0
        ? {
            transition: {
              effect: "directional-wipe",
              durationMs: 800,
              direction: chapterIndex % 2 === 0 ? "right" : "left",
            },
          }
        : {}),
      cues: [],
    })),
  };

  const draft = compileStoryAnimationPlan(densePlan, denseCanvas);
  const sceneById = new Map(draft.scenes.map((scene) => [scene.id, scene]));
  const objectTracks = draft.tracks.filter(
    (track) =>
      track.targetType !== "transition" && track.targetType !== "camera",
  );

  assert.ok(objectTracks.length >= 70);
  objectTracks.forEach((track) => {
    const scene = sceneById.get(track.sceneId);
    assert.ok(scene);
    assert.ok(track.startMs + track.durationMs <= scene.durationMs);
    assert.ok(
      scene.startMs + track.startMs + track.durationMs <= draft.durationMs,
    );
  });
});

test("planner keeps Chinese scene, cue, and transition ids collision-free", () => {
  assert.notEqual(
    sanitizeAnimationId("场景-问题"),
    sanitizeAnimationId("场景-方案"),
  );
  const chinesePlan = {
    schemaVersion: "1.0",
    durationMs: 12_000,
    rationale: "三个中文章节使用不同的稳定轨道标识",
    summary: "中文章节转场",
    style: { tone: "restrained", pace: "normal" },
    scenes: [
      {
        id: "场景-引言",
        beatId: "opening",
        startMs: 0,
        durationMs: 2500,
        focusTargets: ["hero"],
        cues: [
          {
            id: "强调-引言",
            type: "emphasize",
            targets: ["hero"],
            atMs: 200,
            durationMs: 400,
            effect: "pulse",
          },
        ],
      },
      {
        id: "场景-问题",
        beatId: "opening",
        startMs: 4000,
        durationMs: 2500,
        focusTargets: ["hero"],
        transition: {
          effect: "directional-wipe",
          durationMs: 1000,
          direction: "left",
        },
        cues: [
          {
            id: "强调-问题",
            type: "emphasize",
            targets: ["hero"],
            atMs: 200,
            durationMs: 400,
            effect: "pulse",
          },
        ],
      },
      {
        id: "场景-方案",
        beatId: "detail",
        startMs: 8000,
        durationMs: 2500,
        focusTargets: ["detail"],
        transition: {
          effect: "directional-wipe",
          durationMs: 1000,
          direction: "right",
        },
        cues: [
          {
            id: "强调-方案",
            type: "emphasize",
            targets: ["detail"],
            atMs: 200,
            durationMs: 400,
            effect: "pulse",
          },
        ],
      },
    ],
  };

  const draft = compileStoryAnimationPlan(chinesePlan, canvasDraft);
  const ids = draft.tracks.map((track) => track.id);
  const transitionIds = draft.tracks
    .filter((track) => track.targetType === "transition")
    .map((track) => track.transitionId);

  assert.equal(new Set(ids).size, ids.length);
  assert.equal(new Set(transitionIds).size, transitionIds.length);
});

test("planner compiler only forwards fields supported by each Motion preset", () => {
  const compatible = plan();
  compatible.scenes[1].cues = [
    {
      id: "fade-with-stale-distance",
      type: "enter",
      targets: ["detail"],
      atMs: 200,
      durationMs: 600,
      effect: "fade",
      distance: 80,
      count: 3,
    },
  ];

  const draft = compileStoryAnimationPlan(compatible, canvasDraft);
  const preset = draft.tracks.find((track) =>
    track.id.includes("fade-with-stale-distance"),
  ).presets[0];

  assert.equal(preset.name, "fade-in");
  assert.equal("distance" in preset, false);
  assert.equal("count" in preset, false);
});

test("planner compiler moves Object cues before camera motion windows", () => {
  const overlapping = plan();
  overlapping.scenes[0].durationMs = 3500;
  overlapping.scenes[0].cues.push({
    id: "late-opening",
    type: "emphasize",
    targets: ["hero"],
    atMs: 2500,
    durationMs: 800,
    effect: "pulse",
  });

  const draft = compileStoryAnimationPlan(overlapping, canvasDraft);
  const repaired = draft.plan.scenes[0].cues.find(
    (cue) => cue.id === "late-opening",
  );
  assert.ok(repaired.atMs + repaired.durationMs <= 3000);
});

test("planner validation rejects missing references and scene overflow", () => {
  const missing = plan();
  missing.scenes[1].cues[0].targets = ["missing"];
  assert.throws(
    () => validateStoryAnimationPlan(missing, canvasDraft),
    /不存在的元素 missing/,
  );

  const overflow = plan();
  overflow.scenes[1].durationMs = 5000;
  assert.throws(
    () => validateStoryAnimationPlan(overflow, canvasDraft),
    /超出故事总时长/,
  );
});

test("planner tools author a plan and compile only when finalized", async () => {
  const state = createEmptyAnimationPlan();
  const tools = createAnimationPlannerTools(canvasDraft, state);
  await tool(tools, "define_animation_style").execute("style", {
    durationMs: 8000,
    rationale: "two scenes",
    tone: "restrained",
    pace: "normal",
  });
  await tool(tools, "define_animation_scenes").execute("scenes", {
    scenes: plan().scenes.map(({ cues, ...scene }) => {
      assert.ok(Array.isArray(cues));
      return scene;
    }),
  });
  await tool(tools, "define_scene_cues").execute("opening", {
    sceneId: "opening-scene",
    cues: [
      {
        id: "opening-emphasis",
        type: "emphasize",
        targets: ["hero"],
        atMs: 800,
        durationMs: 400,
        effect: "highlight",
      },
    ],
  });
  await tool(tools, "define_scene_cues").execute("detail", {
    sceneId: "detail-scene",
    cues: plan().scenes[1].cues,
  });
  await tool(tools, "finalize_animation_plan").execute("finalize", {
    summary: "compiled plan",
  });

  assert.equal(state.finalized, true);
  assert.ok(state.compiledDraft.tracks.length >= 6);
  assert.ok(
    state.compiledDraft.tracks.some(
      (track) =>
        track.targetType !== "transition" && track.targetType !== "camera",
    ),
  );
  assert.equal(state.compiledDraft.summary, "compiled plan");
});

test("finalize repairs transition-window cue conflicts without a retry", async () => {
  const state = createEmptyAnimationPlan();
  const tools = createAnimationPlannerTools(canvasDraft, state);
  await tool(tools, "define_animation_style").execute("style", {
    durationMs: 8000,
    rationale: "验证一次编译完成",
    tone: "restrained",
    pace: "normal",
  });
  await tool(tools, "define_animation_scenes").execute("scenes", {
    scenes: [
      {
        id: "opening-scene",
        beatId: "opening",
        startMs: 0,
        durationMs: 3000,
        focusTargets: ["hero-detail"],
        camera: { framing: "fit", transition: "hold" },
      },
      {
        id: "detail-scene",
        beatId: "detail",
        startMs: 4000,
        durationMs: 2600,
        focusTargets: ["detail"],
        camera: {
          framing: "close",
          transition: "push-in",
          transitionDurationMs: 1200,
        },
        transition: { effect: "camera", durationMs: 1200 },
      },
    ],
  });
  await tool(tools, "define_scene_cues").execute("opening", {
    sceneId: "opening-scene",
    cues: [
      {
        id: "late-emphasis",
        type: "emphasize",
        targets: ["hero"],
        atMs: 2600,
        durationMs: 400,
        effect: "highlight",
      },
    ],
  });
  await tool(tools, "define_scene_cues").execute("detail", {
    sceneId: "detail-scene",
    cues: [
      {
        id: "detail-enter",
        type: "enter",
        targets: ["detail"],
        atMs: 100,
        durationMs: 500,
        effect: "fade",
      },
    ],
  });

  const result = await tool(tools, "finalize_animation_plan").execute(
    "finalize",
    { summary: "一次完成" },
  );

  assert.equal(state.finalized, true);
  assert.ok(result.details.repairs.length >= 3);
  assert.deepEqual(state.scenes[0].focusTargets, ["hero"]);
  assert.equal(state.scenes[1].camera.transition, "reframe");
  const repairedCue = state.scenes[0].cues.find(
    (cue) => cue.id === "late-emphasis",
  );
  assert.ok(repairedCue.atMs + repairedCue.durationMs <= 2800);
  assert.ok(state.compiledDraft.tracks.length > 0);
});

test("planner deterministically maps story space relations to Camera or page transitions", async () => {
  const spatialCanvas = {
    id: "space-contract-story",
    beats: [
      {
        id: "overview",
        title: "系统全景",
        spaceId: "architecture",
        relationFromPrevious: "new-page",
        relationReason: "首章建立系统全景",
        elementIds: ["hero"],
      },
      {
        id: "detail",
        title: "模块深入",
        spaceId: "architecture",
        relationFromPrevious: "same-space",
        relationReason: "继续深入同一系统架构",
        elementIds: ["detail"],
      },
      {
        id: "result",
        title: "成果总结",
        spaceId: "results-page",
        relationFromPrevious: "new-page",
        relationReason: "成果不依赖架构空间位置",
        elementIds: ["result"],
      },
    ],
    elements: [
      {
        id: "hero",
        type: "rectangle",
        x: 100,
        y: 100,
        width: 300,
        height: 180,
      },
      {
        id: "detail",
        type: "rectangle",
        x: 700,
        y: 260,
        width: 240,
        height: 160,
      },
      {
        id: "result",
        type: "rectangle",
        x: 440,
        y: 260,
        width: 400,
        height: 200,
      },
    ],
    libraryAssets: [],
    connectors: [],
  };
  const state = createEmptyAnimationPlan();
  const tools = createAnimationPlannerTools(spatialCanvas, state);
  await tool(tools, "define_animation_style").execute("style", {
    durationMs: 11_000,
    rationale: "先空间深入，再切换独立成果页",
    tone: "restrained",
    pace: "normal",
  });
  await tool(tools, "define_animation_scenes").execute("scenes", {
    scenes: [
      {
        id: "scene-overview",
        beatId: "overview",
        startMs: 0,
        durationMs: 2500,
        focusTargets: ["hero"],
      },
      {
        id: "scene-detail",
        beatId: "detail",
        startMs: 4000,
        durationMs: 2500,
        focusTargets: ["detail"],
        transition: { effect: "iris", durationMs: 900 },
      },
      {
        id: "scene-result",
        beatId: "result",
        startMs: 8000,
        durationMs: 2500,
        focusTargets: ["result"],
        camera: { framing: "close", transition: "reframe" },
        transition: { effect: "camera", durationMs: 1200 },
      },
    ],
  });

  assert.equal(state.scenes[0].camera, undefined);
  assert.equal(state.scenes[1].camera.transition, "reframe");
  assert.equal(state.scenes[1].transition.effect, "camera");
  assert.equal(state.scenes[2].camera, undefined);
  assert.equal(state.scenes[2].transition.effect, "directional-wipe");
  const draft = compileStoryAnimationPlan(state, spatialCanvas);
  assert.match(draft.scenes[1].description, /镜头漫游/);
  assert.match(draft.scenes[2].description, /独立页面/);
  const camera = draft.tracks.find((track) => track.targetType === "camera");
  assert.ok(camera);
  const centerX = camera.properties.find(
    (property) => property.property === "camera.centerX",
  );
  const centerY = camera.properties.find(
    (property) => property.property === "camera.centerY",
  );
  const zoom = camera.properties.find(
    (property) => property.property === "camera.zoom",
  );
  assert.deepEqual(centerX.keyframes.at(-1), {
    atMs: 8000,
    value: 640,
    label: "scene-result",
  });
  assert.deepEqual(centerY.keyframes.at(-1), {
    atMs: 8000,
    value: 360,
    label: "scene-result",
  });
  assert.deepEqual(zoom.keyframes.at(-1), {
    atMs: 8000,
    value: 1,
    label: "scene-result",
  });
  assert.equal(centerX.keyframes.at(-2).atMs, 6800);
  assert.equal(zoom.keyframes.at(-2).atMs, 6800);
  assert.ok(centerX.keyframes.at(-2).easing);
  assert.ok(zoom.keyframes.at(-2).easing);
});

test("planner tools atomically repair invalid cue targets, timing, and highlight color", async () => {
  const state = createEmptyAnimationPlan();
  const tools = createAnimationPlannerTools(canvasDraft, state);
  await tool(tools, "define_animation_style").execute("style", {
    durationMs: 8000,
    rationale: "two scenes",
    tone: "restrained",
    pace: "normal",
  });
  await tool(tools, "define_animation_scenes").execute("scenes", {
    scenes: plan().scenes.map(({ cues, ...scene }) => {
      assert.ok(Array.isArray(cues));
      return scene;
    }),
  });
  await tool(tools, "define_scene_cues").execute("detail", {
    sceneId: "detail-scene",
    cues: [
      {
        id: "safe-highlight",
        type: "emphasize",
        targets: ["detail", "missing", "detail"],
        atMs: 2300,
        durationMs: 900,
        effect: "highlight",
      },
      {
        id: "too-late",
        type: "emphasize",
        targets: ["detail"],
        atMs: 2550,
        durationMs: 500,
        effect: "pulse",
      },
    ],
  });

  assert.equal(state.scenes[1].cues.length, 1);
  assert.deepEqual(state.scenes[1].cues[0].targets, ["detail"]);
  assert.equal(state.scenes[1].cues[0].durationMs, 300);
  assert.equal(state.scenes[1].cues[0].color, "#FFD43B88");
  const draft = compileStoryAnimationPlan(state, canvasDraft);
  const highlightTrack = draft.tracks.find((track) =>
    track.id.includes("safe-highlight"),
  );
  assert.equal(highlightTrack.presets[0].color, "#FFD43B88");
});

test("scene cue tool repairs incompatible effects and duplicate ids", async () => {
  const state = createEmptyAnimationPlan();
  const tools = createAnimationPlannerTools(canvasDraft, state);
  await tool(tools, "define_animation_style").execute("style", {
    durationMs: 8000,
    rationale: "two scenes",
    tone: "restrained",
    pace: "normal",
  });
  await tool(tools, "define_animation_scenes").execute("scenes", {
    scenes: plan().scenes.map(({ cues, ...scene }) => {
      assert.ok(Array.isArray(cues));
      return scene;
    }),
  });
  const result = await tool(tools, "define_scene_cues").execute("repair", {
    sceneId: "detail-scene",
    cues: [
      {
        id: "effect",
        type: "enter",
        targets: ["detail"],
        atMs: 0,
        durationMs: 400,
        effect: "shake",
      },
      {
        id: "effect",
        type: "emphasize",
        targets: ["detail"],
        atMs: 500,
        durationMs: 400,
        effect: "fade",
      },
    ],
  });
  assert.equal(state.scenes[1].cues[0].effect, "fade");
  assert.equal(state.scenes[1].cues[1].effect, "pulse");
  assert.equal(state.scenes[1].cues[1].id, "effect-2");
  assert.equal(result.details.kind, "animation-cue-repairs");
  assert.equal(result.details.repairs.length, 3);
});

test("scene cue tool filters style properties by element capability", async () => {
  const state = createEmptyAnimationPlan();
  const textCanvas = structuredClone(canvasDraft);
  textCanvas.elements.push({
    id: "copy",
    type: "text",
    x: 100,
    y: 100,
    width: 200,
    height: 80,
  });
  const tools = createAnimationPlannerTools(textCanvas, state);
  await tool(tools, "define_animation_style").execute("style", {
    durationMs: 8000,
    rationale: "two scenes",
    tone: "restrained",
    pace: "normal",
  });
  await tool(tools, "define_animation_scenes").execute("scenes", {
    scenes: plan().scenes.map(({ cues, ...scene }) => {
      assert.ok(Array.isArray(cues));
      return scene;
    }),
  });

  const result = await tool(tools, "define_scene_cues").execute("styles", {
    sceneId: "detail-scene",
    cues: [
      {
        id: "invalid-text-stroke",
        type: "style",
        targets: ["copy"],
        atMs: 200,
        durationMs: 300,
        effect: "style",
        styleProperty: "visual.strokeColor",
        styleValue: "#FF0000FF",
      },
      {
        id: "valid-text-align",
        type: "style",
        targets: ["copy"],
        atMs: 600,
        durationMs: 300,
        effect: "style",
        styleProperty: "text.textAlign",
        styleValue: "right",
      },
      {
        id: "invalid-connector-background",
        type: "style",
        targets: ["hero-detail"],
        atMs: 900,
        durationMs: 300,
        effect: "style",
        styleProperty: "visual.backgroundColor",
        styleValue: "#FF0000FF",
      },
      {
        id: "valid-connector-stroke",
        type: "style",
        targets: ["hero-detail"],
        atMs: 1200,
        durationMs: 300,
        effect: "style",
        styleProperty: "visual.strokeStyle",
        styleValue: "dashed",
      },
      {
        id: "valid-zero-stroke-width",
        type: "style",
        targets: ["detail"],
        atMs: 1500,
        durationMs: 300,
        effect: "style",
        styleProperty: "visual.strokeWidth",
        styleValue: 0,
      },
    ],
  });

  assert.deepEqual(
    state.scenes[1].cues.map((cue) => cue.id),
    ["valid-text-align", "valid-connector-stroke", "valid-zero-stroke-width"],
  );
  assert.ok(
    result.details.repairs.some((repair) =>
      repair.includes("不支持 visual.strokeColor"),
    ),
  );
  assert.ok(
    result.details.repairs.some((repair) =>
      repair.includes("不支持 visual.backgroundColor"),
    ),
  );
});
