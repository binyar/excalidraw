// @ts-nocheck
import assert from "node:assert/strict";
import test from "node:test";

import {
  createCanvasDraftState,
  createCanvasTools,
  resolveReadableTextColor,
  selectRandomPageTransition,
} from "./canvas-tools.ts";
import {
  assertManagedCanvasLayoutIntegrity,
  materializeCanvasLayout,
} from "./canvas-layout.ts";
import { listLibraryCatalogPacks } from "./library-catalog.ts";
import {
  buildStoryAgentSystemPrompt,
  STORY_AGENT_SYSTEM_PROMPT,
} from "./prompt.ts";

const installedAssetSources = (await listLibraryCatalogPacks()).map(
  (pack) => pack.source,
);

const tool = (tools, name) => {
  const found = tools.find((candidate) => candidate.name === name);
  assert.ok(found, `missing tool ${name}`);
  return found;
};

test("page transitions randomize effects and effect-specific variants once", () => {
  const values = [0.99, 0.2, 0.4, 0.99];
  const random = () => values.shift() ?? 0;
  const first = selectRandomPageTransition(random);
  const second = selectRandomPageTransition(random, first.effect);

  assert.deepEqual(first, { effect: "iris", origin: "top-left" });
  assert.deepEqual(second, {
    effect: "directional-wipe",
    direction: "down",
  });
  assert.notEqual(first.effect, second.effect);
});

const animateFromFrozenDirector = async (_canvasDraft, directorPlan) => ({
  durationMs: directorPlan.durationMs,
  plan: {
    schemaVersion: "1.0",
    durationMs: directorPlan.durationMs,
    rationale: directorPlan.rationale,
    summary: directorPlan.directionSummary,
    style: structuredClone(directorPlan.style),
    scenes: structuredClone(directorPlan.scenes),
  },
});

test("canvas execution resolves readable text independently from the border", () => {
  assert.equal(resolveReadableTextColor("#1F2937", "#212529"), "#F8FAFC");
  assert.equal(resolveReadableTextColor("#F8FAFC", "#212529"), "#212529");
});

const writeDirectorPlan = async (tools, plan) => {
  await tool(tools, "define_story_direction").execute("direction", {
    durationMs: plan.durationMs,
    rationale: plan.rationale,
    summary: plan.summary,
    style: plan.style,
  });
  for (let index = 0; index < plan.content.length; index += 40) {
    await tool(tools, "define_story_content").execute(`content-${index}`, {
      content: plan.content.slice(index, index + 40),
    });
  }
  for (const scene of plan.scenes) {
    await tool(tools, "define_story_scene").execute(scene.id, scene);
  }
  return tool(tools, "finalize_story_plan").execute("finalize", {});
};

test("main Agent requires Chinese output and exposes Chinese tool descriptions", () => {
  assert.match(
    STORY_AGENT_SYSTEM_PROMPT,
    /所有面向用户的自然语言必须使用简体中文/,
  );
  assert.match(
    STORY_AGENT_SYSTEM_PROMPT,
    /不得输出英文句子或中英混杂的过程旁白/,
  );
  assert.match(STORY_AGENT_SYSTEM_PROMPT, /禁止.*Emoji 表情符号/);
  const tools = createCanvasTools({
    state: createCanvasDraftState(),
    animate: async () => ({}),
  });
  for (const candidate of tools) {
    assert.match(candidate.description, /[\u3400-\u9fff]/, candidate.name);
  }
});

test("asset enhancement can be removed from both prompt and tools", () => {
  const systemPrompt = buildStoryAgentSystemPrompt({ enabledSkillIds: [] });
  assert.doesNotMatch(systemPrompt, /素材增强技能/);
  assert.doesNotMatch(systemPrompt, /search_library_assets/);

  const tools = createCanvasTools({
    state: createCanvasDraftState(),
    animate: async () => ({}),
    enabledSkillIds: [],
  });
  assert.equal(
    tools.some((candidate) => candidate.name === "search_library_assets"),
    false,
  );
  assert.equal(
    tools.some((candidate) => candidate.name === "add_library_assets"),
    false,
  );
  assert.equal(
    tools.some((candidate) => candidate.name === "compile_story_artifact"),
    true,
  );
});

test("canvas draft accepts up to 250 elements and rejects item 251", async () => {
  const state = createCanvasDraftState();
  const tools = createCanvasTools({ state, animate: async () => ({}) });
  const addBatch = async (start, count) =>
    tool(tools, "add_canvas_elements").execute(`batch-${start}`, {
      elements: Array.from({ length: count }, (_, offset) => ({
        id: `item-${start + offset}`,
        type: "rectangle",
        x: (start + offset) * 10,
        y: 0,
        width: 8,
        height: 8,
      })),
    });

  await addBatch(0, 80);
  await addBatch(80, 80);
  await addBatch(160, 80);
  await addBatch(240, 10);
  assert.equal(state.elements.length, 250);
  await assert.rejects(() => addBatch(250, 1), /不能超过 250/);
  assert.equal(state.elements.length, 250);
});

test("production canvas writes reject an unfrozen Director DSL", async () => {
  const state = createCanvasDraftState(null, { requireDirectorPlan: true });
  const tools = createCanvasTools({ state });
  await assert.rejects(
    () =>
      tool(tools, "add_canvas_elements").execute("premature", {
        elements: [
          {
            id: "premature",
            type: "text",
            x: 0,
            y: 0,
            width: 200,
            height: 40,
          },
        ],
      }),
    /finalize_story_plan/,
  );
});

test("Director finalization reports missing prerequisites without crashing", async () => {
  const state = createCanvasDraftState(null, { requireDirectorPlan: true });
  const finalizeStoryPlan = tool(
    createCanvasTools({ state }),
    "finalize_story_plan",
  );
  await assert.rejects(
    () => finalizeStoryPlan.execute("premature-director", {}),
    /必须先完成故事与章节空间规划/,
  );
});

test("Director DSL normalizes common model mistakes before freezing", async () => {
  const state = createCanvasDraftState(null, { requireDirectorPlan: true });
  const tools = createCanvasTools({
    state,
    animate: animateFromFrozenDirector,
  });
  const defineStoryContent = tool(tools, "define_story_content");
  const defineStoryScene = tool(tools, "define_story_scene");
  const finalizeStoryPlan = tool(tools, "finalize_story_plan");
  assert.equal(
    defineStoryContent.parameters.properties.content.items.properties.label
      .minLength,
    undefined,
  );
  assert.equal(defineStoryContent.parameters.properties.content.maxItems, 40);
  assert.deepEqual(Object.keys(finalizeStoryPlan.parameters.properties), []);
  assert.ok(
    defineStoryScene.parameters.properties.cues.items.properties.atMs.anyOf,
  );
  await tool(tools, "define_story").execute("story", {
    id: "normalization-story",
    title: "冲突处理",
    summary: "验证导演 DSL 的安全归一化",
    beats: [
      { id: "overview", title: "背景", elementIds: ["background"] },
      { id: "conflict", title: "冲突", elementIds: ["conflict-card"] },
    ],
  });
  await tool(tools, "define_story_spaces").execute("spaces", {
    chapters: [
      {
        beatId: "overview",
        spaceId: "conflict-space",
        relationFromPrevious: "new-page",
        reason: "故事首章建立初始空间",
      },
      {
        beatId: "conflict",
        spaceId: "conflict-space",
        relationFromPrevious: "same-space",
        reason: "在同一冲突空间中推进到核心问题",
      },
    ],
  });
  await tool(tools, "define_canvas_sections").execute("sections", {
    spaces: [
      {
        spaceId: "conflict-space",
        layout: { mode: "column" },
        sections: [{ id: "conflict-main", layout: { mode: "column" } }],
      },
    ],
  });

  const finalized = await writeDirectorPlan(tools, {
    durationMs: 6000,
    rationale: "先交代背景，再推进到冲突核心",
    summary: "镜头在同一空间内推进",
    style: { tone: "natural", pace: "normal" },
    content: [
      {
        id: "background",
        kind: "visual",
        role: "background",
        label: "",
        sectionId: "conflict-main",
      },
      {
        id: "conflict-card",
        kind: "shape",
        role: "conflict",
        label: "核心冲突",
        sectionId: "conflict-main",
      },
    ],
    scenes: [
      {
        id: "scene-overview",
        beatId: "overview",
        startMs: 0,
        durationMs: 3000,
        focusTargets: ["background"],
        transition: { effect: "fade-through-color", durationMs: 600 },
        cues: [
          {
            id: "c1-bg",
            type: "enter",
            targets: ["background"],
            atMs: 2500,
            durationMs: 500,
            effect: "fade",
          },
        ],
      },
      {
        id: "scene-conflict",
        beatId: "conflict",
        startMs: "3s",
        durationMs: "3000ms",
        focusTargets: ["conflict-card"],
        transition: { effect: "fade-through-color", durationMs: 700 },
        cues: [
          {
            id: "c2-bg",
            type: "emphasize",
            targets: ["conflict-card"],
            atMs: "2.9s",
            durationMs: "500ms",
            effect: "pulse",
          },
        ],
      },
    ],
  });

  assert.ok(finalized.details.repairs.length >= 4);
  assert.equal(state.directorPlan.content[0].label, undefined);
  assert.equal(state.directorPlan.scenes[0].transition, undefined);
  assert.equal(state.directorPlan.scenes[1].transition.effect, "camera");
  assert.equal(state.directorPlan.scenes[1].transition.durationMs, 1600);
  assert.equal(state.directorPlan.scenes[1].camera.transition, "reframe");
  assert.equal(state.directorPlan.scenes[1].camera.transitionDurationMs, 1600);
  assert.equal(
    state.directorPlan.scenes[0].cues[0].atMs +
      state.directorPlan.scenes[0].cues[0].durationMs,
    1400,
  );
  assert.equal(state.directorPlan.scenes[1].cues[0].atMs, 2500);
  assert.equal(state.directorPlan.scenes[1].cues[0].durationMs, 500);

  await tool(tools, "add_canvas_elements").execute("elements", {
    elements: [
      {
        id: "background",
        type: "rectangle",
        role: "background",
        sectionId: "conflict-main",
        width: 800,
        height: 500,
      },
      {
        id: "conflict-card",
        type: "rectangle",
        role: "conflict",
        label: "核心冲突",
        sectionId: "conflict-main",
        width: 360,
        height: 160,
      },
    ],
  });
  await tool(tools, "finalize_canvas_draft").execute("canvas", {});
  const result = await tool(tools, "compile_story_artifact").execute(
    "compile",
    {},
  );
  assert.deepEqual(
    result.details.animation.plan.scenes,
    result.details.directorPlan.scenes,
  );
});

test("long Director plans are staged without a large final tool payload", async () => {
  const state = createCanvasDraftState(null, { requireDirectorPlan: true });
  const tools = createCanvasTools({ state });
  const content = Array.from({ length: 41 }, (_, index) => ({
    id: `item-${index}`,
    kind: "shape",
    role: "story-item",
    label: `内容 ${index + 1}`,
    sectionId: "main",
  }));
  await tool(tools, "define_story").execute("story", {
    id: "long-story",
    title: "长故事",
    summary: "验证分段 Director DSL",
    beats: [
      {
        id: "long-scene",
        title: "完整内容",
        elementIds: content.map((item) => item.id),
      },
    ],
  });
  await tool(tools, "define_story_spaces").execute("spaces", {
    chapters: [
      {
        beatId: "long-scene",
        spaceId: "long-page",
        relationFromPrevious: "new-page",
        reason: "故事首章建立初始页面",
      },
    ],
  });
  await tool(tools, "define_canvas_sections").execute("sections", {
    spaces: [
      {
        spaceId: "long-page",
        layout: { mode: "grid" },
        sections: [{ id: "main", layout: { mode: "grid" } }],
      },
    ],
  });
  await writeDirectorPlan(tools, {
    durationMs: "8s",
    rationale: "长内容需要分批声明",
    summary: "分段写入后统一冻结",
    style: { tone: "restrained", pace: "normal" },
    content,
    scenes: [
      {
        id: "long-scene",
        beatId: "long-scene",
        startMs: 0,
        durationMs: "8s",
        focusTargets: ["item-0"],
        cues: [
          {
            id: "items-in",
            type: "enter",
            targets: content.map((item) => item.id),
            atMs: "",
            durationMs: "500ms",
            staggerMs: "100ms",
            effect: "fade",
          },
        ],
      },
    ],
  });
  assert.equal(state.directorDraft.content.length, 41);
  assert.equal(state.directorPlan.durationMs, 8000);
  assert.equal(state.directorPlan.scenes[0].cues[0].atMs, 0);
  assert.deepEqual(
    Object.keys(tool(tools, "finalize_story_plan").parameters.properties),
    [],
  );
});

test("main agent freezes the dynamic story DSL before deterministic execution", async () => {
  const state = createCanvasDraftState(null, { requireDirectorPlan: true });
  const tools = createCanvasTools({
    state,
    animate: animateFromFrozenDirector,
  });

  await tool(tools, "define_story").execute("story", {
    id: "launch-story",
    title: "产品发布",
    summary: "从问题到成果",
    beats: [{ id: "opening", title: "问题", elementIds: ["story-title"] }],
  });
  await tool(tools, "define_story_spaces").execute("spaces", {
    chapters: [
      {
        beatId: "opening",
        spaceId: "page-opening",
        relationFromPrevious: "new-page",
        reason: "故事首章建立初始页面",
      },
    ],
  });
  await tool(tools, "define_canvas_sections").execute("sections", {
    spaces: [
      {
        spaceId: "page-opening",
        layout: { mode: "column" },
        sections: [{ id: "opening-main", layout: { mode: "column" } }],
      },
    ],
  });
  await writeDirectorPlan(tools, {
    durationMs: 4000,
    rationale: "主 Agent 已确定完整开场节奏和镜头",
    summary: "标题淡入并保持可读",
    style: { tone: "restrained", pace: "normal" },
    content: [
      {
        id: "story-title",
        kind: "shape",
        role: "title",
        label: "产品发布",
        sectionId: "opening-main",
      },
    ],
    scenes: [
      {
        id: "opening-scene",
        beatId: "opening",
        startMs: 0,
        durationMs: 4000,
        focusTargets: ["story-title"],
        camera: { framing: "fit", transition: "hold" },
        cues: [
          {
            id: "title-entrance",
            type: "enter",
            targets: ["story-title"],
            atMs: 0,
            durationMs: 600,
            effect: "fade",
          },
        ],
      },
    ],
  });
  await tool(tools, "add_canvas_elements").execute("elements", {
    elements: [
      {
        id: "story-title",
        type: "rectangle",
        role: "title",
        label: "产品发布",
        sectionId: "opening-main",
        width: 500,
        height: 80,
        style: {
          backgroundColor: "#1F2937",
          strokeColor: "#212529",
        },
      },
    ],
  });
  await tool(tools, "finalize_canvas_draft").execute("freeze", {});
  assert.equal(state.elements[0].style.strokeColor, "#212529");
  assert.equal(state.elements[0].style.textColor, "#F8FAFC");
  const result = await tool(tools, "compile_story_artifact").execute(
    "compile",
    {},
  );

  assert.equal(result.details.kind, "story-artifact");
  assert.equal(result.details.animation.durationMs, 4000);
  assert.equal(result.details.directorPlan.scenes.length, 1);
  assert.deepEqual(
    result.details.animation.plan.scenes,
    result.details.directorPlan.scenes,
  );
  await assert.rejects(
    () =>
      tool(tools, "add_canvas_elements").execute("late", {
        elements: [
          {
            id: "late",
            type: "text",
            label: "late",
            x: 0,
            y: 0,
            width: 100,
            height: 40,
          },
        ],
      }),
    /已冻结/,
  );
});

test("story spaces preserve spatial continuity and center independent pages", async () => {
  const state = createCanvasDraftState();
  const tools = createCanvasTools({ state, animate: async () => ({}) });
  await tool(tools, "define_story").execute("story", {
    id: "mixed-space-story",
    title: "混合空间故事",
    summary: "先深入同一架构，再切换成果页",
    beats: [
      { id: "overview", title: "系统全景", elementIds: ["overview-card"] },
      { id: "detail", title: "模块深入", elementIds: ["detail-card"] },
      { id: "result", title: "成果总结", elementIds: ["result-card"] },
    ],
  });
  await tool(tools, "define_story_spaces").execute("spaces", {
    chapters: [
      {
        beatId: "overview",
        spaceId: "architecture",
        relationFromPrevious: "new-page",
        reason: "首章建立系统全景",
      },
      {
        beatId: "detail",
        spaceId: "architecture",
        relationFromPrevious: "same-space",
        reason: "继续深入同一个系统架构",
      },
      {
        beatId: "result",
        spaceId: "results-page",
        relationFromPrevious: "new-page",
        reason: "成果总结不依赖架构节点位置",
      },
    ],
  });
  await tool(tools, "add_canvas_elements").execute("elements", {
    elements: [
      {
        id: "overview-card",
        type: "rectangle",
        x: 100,
        y: 200,
        width: 100,
        height: 100,
      },
      {
        id: "detail-card",
        type: "rectangle",
        x: 900,
        y: 200,
        width: 100,
        height: 100,
      },
      {
        id: "result-card",
        type: "rectangle",
        x: 3000,
        y: 1000,
        width: 200,
        height: 120,
      },
    ],
  });
  const frozen = await tool(tools, "finalize_canvas_draft").execute(
    "freeze",
    {},
  );

  const overview = state.elements.find(
    (element) => element.id === "overview-card",
  );
  const detail = state.elements.find((element) => element.id === "detail-card");
  const result = state.elements.find((element) => element.id === "result-card");
  assert.equal(detail.x - overview.x, 800);
  assert.equal((overview.x + detail.x + detail.width) / 2, 640);
  assert.equal(result.x + result.width / 2, 640);
  assert.equal(result.y + result.height / 2, 360);
  assert.deepEqual(
    frozen.details.draft.beats.map(({ id, spaceId, relationFromPrevious }) => ({
      id,
      spaceId,
      relationFromPrevious,
    })),
    [
      {
        id: "overview",
        spaceId: "architecture",
        relationFromPrevious: "new-page",
      },
      {
        id: "detail",
        spaceId: "architecture",
        relationFromPrevious: "same-space",
      },
      {
        id: "result",
        spaceId: "results-page",
        relationFromPrevious: "new-page",
      },
    ],
  );
  assert.equal(frozen.details.repairs.storySpaces.translations.length, 2);
});

test("story spaces keep shared masters fixed and attach nearby decoration to its page", async () => {
  const state = createCanvasDraftState();
  const tools = createCanvasTools({ state, animate: async () => ({}) });
  await tool(tools, "define_story").execute("story", {
    id: "master-and-decoration",
    title: "共享标题与页面装饰",
    summary: "标题跨页保留，装饰跟随所属页面",
    beats: [
      {
        id: "first",
        title: "第一页",
        elementIds: ["shared-title", "first-card"],
      },
      {
        id: "second",
        title: "第二页",
        elementIds: ["shared-title", "second-card"],
      },
    ],
  });
  await tool(tools, "define_story_spaces").execute("spaces", {
    chapters: [
      {
        beatId: "first",
        spaceId: "page-first",
        relationFromPrevious: "new-page",
        reason: "首章",
      },
      {
        beatId: "second",
        spaceId: "page-second",
        relationFromPrevious: "new-page",
        reason: "内容主题变化",
      },
    ],
  });
  await tool(tools, "add_canvas_elements").execute("elements", {
    elements: [
      {
        id: "shared-title",
        type: "text",
        x: 540,
        y: 40,
        width: 200,
        height: 40,
        label: "统一标题",
      },
      {
        id: "first-card",
        type: "rectangle",
        x: 300,
        y: 260,
        width: 200,
        height: 120,
      },
      {
        id: "second-card",
        type: "rectangle",
        x: 3000,
        y: 1000,
        width: 200,
        height: 120,
      },
      {
        id: "second-accent",
        type: "ellipse",
        x: 3080,
        y: 1140,
        width: 40,
        height: 40,
      },
    ],
  });
  await tool(tools, "finalize_canvas_draft").execute("freeze", {});

  const shared = state.elements.find(
    (element) => element.id === "shared-title",
  );
  const second = state.elements.find((element) => element.id === "second-card");
  const accent = state.elements.find(
    (element) => element.id === "second-accent",
  );
  assert.equal(shared.x, 540);
  assert.equal(shared.y, 40);
  assert.equal(shared.storyScope, "master");
  assert.equal(shared.spaceId, undefined);
  assert.equal(second.storyScope, "scene");
  assert.equal(second.spaceId, "page-second");
  assert.equal(accent.storyScope, "scene");
  assert.equal(accent.spaceId, "page-second");
  assert.equal(accent.x - second.x, 80);
  assert.equal(accent.y - second.y, 140);
});

test("story spaces reject a same-space chapter with a different space id", async () => {
  const state = createCanvasDraftState();
  const tools = createCanvasTools({ state, animate: async () => ({}) });
  await tool(tools, "define_story").execute("story", {
    id: "invalid-space-story",
    title: "非法空间关系",
    summary: "验证契约拒绝矛盾配置",
    beats: [
      { id: "first", title: "第一章", elementIds: [] },
      { id: "second", title: "第二章", elementIds: [] },
    ],
  });
  await assert.rejects(
    () =>
      tool(tools, "define_story_spaces").execute("spaces", {
        chapters: [
          {
            beatId: "first",
            spaceId: "space-a",
            relationFromPrevious: "new-page",
            reason: "首章",
          },
          {
            beatId: "second",
            spaceId: "space-b",
            relationFromPrevious: "same-space",
            reason: "错误地声明同空间",
          },
        ],
      }),
    /必须复用上一章 spaceId space-a/,
  );
});

test("managed canvas sections materialize separate page regions and non-overlapping rows", async () => {
  const state = createCanvasDraftState();
  const tools = createCanvasTools({ state, animate: async () => ({}) });
  await tool(tools, "define_story").execute("story", {
    id: "section-story",
    title: "分区故事",
    summary: "标题、主体和结尾使用独立空间",
    beats: [
      {
        id: "page",
        title: "完整页面",
        elementIds: ["title", "card-a", "card-b", "card-c", "footer"],
      },
    ],
  });
  await tool(tools, "define_story_spaces").execute("spaces", {
    chapters: [
      {
        beatId: "page",
        spaceId: "space-page",
        relationFromPrevious: "new-page",
        reason: "首章建立独立页面",
      },
    ],
  });
  await tool(tools, "define_canvas_sections").execute("sections", {
    spaces: [
      {
        spaceId: "space-page",
        layout: { mode: "column", padding: 60, gap: 24 },
        sections: [
          {
            id: "section-title",
            order: 0,
            weight: 1,
            layout: { mode: "overlay", padding: 12 },
          },
          {
            id: "section-cards",
            order: 1,
            weight: 4,
            layout: { mode: "row", padding: 20, gap: 24 },
          },
          {
            id: "section-footer",
            order: 2,
            weight: 2,
            layout: { mode: "overlay", padding: 12 },
          },
        ],
      },
    ],
  });
  await tool(tools, "add_canvas_elements").execute("elements", {
    elements: [
      {
        id: "title-bg",
        type: "rectangle",
        role: "section-background",
        sectionId: "section-title",
      },
      {
        id: "title",
        type: "text",
        label: "山谷里的成长故事",
        sectionId: "section-title",
        style: { fontSize: 40 },
      },
      {
        id: "cards-bg",
        type: "rectangle",
        role: "section-background",
        sectionId: "section-cards",
      },
      ...["card-a", "card-b", "card-c"].map((id) => ({
        id,
        type: "rectangle",
        label: id,
        sectionId: "section-cards",
        width: 300,
        height: 220,
      })),
      {
        id: "footer-bg",
        type: "rectangle",
        role: "section-background",
        sectionId: "section-footer",
      },
      {
        id: "footer",
        type: "rectangle",
        label: "故事结尾",
        sectionId: "section-footer",
        width: 640,
        height: 100,
      },
    ],
  });

  const result = await tool(tools, "finalize_canvas_draft").execute(
    "freeze",
    {},
  );
  const byId = new Map(state.elements.map((element) => [element.id, element]));
  const titleBackground = byId.get("title-bg");
  const cardsBackground = byId.get("cards-bg");
  const footerBackground = byId.get("footer-bg");
  const cards = ["card-a", "card-b", "card-c"].map((id) => byId.get(id));

  assert.equal(result.details.repairs.canvasLayout.materialized, true);
  assert.ok(titleBackground.y + titleBackground.height < cardsBackground.y);
  assert.ok(cardsBackground.y + cardsBackground.height < footerBackground.y);
  assert.ok(cards[0].x + cards[0].width < cards[1].x);
  assert.ok(cards[1].x + cards[1].width < cards[2].x);
  for (const background of [
    titleBackground,
    cardsBackground,
    footerBackground,
  ]) {
    assert.ok(background.x >= 0 && background.y >= 0);
    assert.ok(background.x + background.width <= 1280);
    assert.ok(background.y + background.height <= 720);
  }
  assert.equal(result.details.draft.sections.length, 3);
  assert.equal(result.details.draft.spaceLayouts.length, 1);
});

test("managed overlay is the explicit overlap escape hatch", async () => {
  const state = createCanvasDraftState();
  const tools = createCanvasTools({ state, animate: async () => ({}) });
  await tool(tools, "define_story").execute("story", {
    id: "overlay-story",
    title: "叠加故事",
    summary: "明确允许两个视觉对象叠加",
    beats: [
      {
        id: "page",
        title: "叠加页",
        elementIds: ["halo", "portrait"],
      },
    ],
  });
  await tool(tools, "define_story_spaces").execute("spaces", {
    chapters: [
      {
        beatId: "page",
        spaceId: "space-overlay",
        relationFromPrevious: "new-page",
        reason: "首章建立独立页面",
      },
    ],
  });
  await tool(tools, "define_canvas_sections").execute("sections", {
    spaces: [
      {
        spaceId: "space-overlay",
        layout: { mode: "grid", padding: 60, gap: 24 },
        sections: [
          {
            id: "hero",
            layout: { mode: "overlay", padding: 24 },
          },
        ],
      },
    ],
  });
  await tool(tools, "add_canvas_elements").execute("elements", {
    elements: [
      {
        id: "halo",
        type: "ellipse",
        sectionId: "hero",
        width: 500,
        height: 500,
      },
      {
        id: "portrait",
        type: "rectangle",
        sectionId: "hero",
        width: 280,
        height: 360,
      },
    ],
  });
  await tool(tools, "finalize_canvas_draft").execute("freeze", {});
  const halo = state.elements.find((element) => element.id === "halo");
  const portrait = state.elements.find((element) => element.id === "portrait");

  assert.equal(halo.x + halo.width / 2, portrait.x + portrait.width / 2);
  assert.equal(halo.y + halo.height / 2, portrait.y + portrait.height / 2);
});

test("managed free sections preserve local relative coordinates", async () => {
  const state = createCanvasDraftState();
  const tools = createCanvasTools({ state, animate: async () => ({}) });
  await tool(tools, "define_story").execute("story", {
    id: "free-story",
    title: "自由构图",
    summary: "地图节点保留局部相对坐标",
    beats: [
      {
        id: "page",
        title: "地图页",
        elementIds: ["point-a", "point-b"],
      },
    ],
  });
  await tool(tools, "define_story_spaces").execute("spaces", {
    chapters: [
      {
        beatId: "page",
        spaceId: "space-free",
        relationFromPrevious: "new-page",
        reason: "首章建立独立页面",
      },
    ],
  });
  await tool(tools, "define_canvas_sections").execute("sections", {
    spaces: [
      {
        spaceId: "space-free",
        layout: { mode: "grid", padding: 60 },
        sections: [
          {
            id: "map",
            layout: { mode: "free", padding: 20 },
          },
        ],
      },
    ],
  });
  await tool(tools, "add_canvas_elements").execute("elements", {
    elements: [
      {
        id: "point-a",
        type: "ellipse",
        sectionId: "map",
        x: 30,
        y: 40,
        width: 40,
        height: 40,
      },
      {
        id: "point-b",
        type: "ellipse",
        sectionId: "map",
        x: 230,
        y: 140,
        width: 40,
        height: 40,
      },
    ],
  });
  await tool(tools, "finalize_canvas_draft").execute("freeze", {});
  const first = state.elements.find((element) => element.id === "point-a");
  const second = state.elements.find((element) => element.id === "point-b");

  assert.equal(second.x - first.x, 200);
  assert.equal(second.y - first.y, 100);
  assert.deepEqual(first.layoutFrame, {
    x: 30,
    y: 40,
    width: 40,
    height: 40,
  });
  assert.deepEqual(second.layoutFrame, {
    x: 230,
    y: 140,
    width: 40,
    height: 40,
  });
});

test("managed layout materialization is stable across repeated edits", () => {
  const state = {
    elements: [
      {
        id: "headline",
        type: "text",
        label: "重复编辑后仍保持稳定",
        sectionId: "hero",
        x: 0,
        y: 0,
        width: 500,
        height: 120,
        style: { fontSize: 100 },
        layoutFrame: { x: 0, y: 0, width: 500, height: 120, fontSize: 100 },
      },
    ],
    libraryAssets: [],
    sections: [
      {
        id: "hero",
        spaceId: "space-page",
        layout: { mode: "overlay", padding: 50 },
      },
    ],
    spaceLayouts: [
      {
        spaceId: "space-page",
        layout: { mode: "grid", padding: 300 },
      },
    ],
    layoutNeedsMaterialization: true,
  };

  materializeCanvasLayout(state);
  const first = structuredClone(state.elements[0]);
  state.layoutNeedsMaterialization = true;
  materializeCanvasLayout(state);

  assert.deepEqual(state.elements[0], first);
  assert.ok(state.elements[0].style.fontSize < 100);
  assert.equal(state.elements[0].layoutFrame.fontSize, 100);
});

test("managed column layout sizes labeled cards by their complete visual content", () => {
  const state = {
    elements: Array.from({ length: 4 }, (_, index) => ({
      id: `action-${index + 1}`,
      type: "rectangle",
      label: `行动 ${
        index + 1
      }\n这是需要保持完整可读且不能侵入相邻卡片的行动说明`,
      sectionId: "actions",
      x: 0,
      y: 0,
      width: 200,
      height: 120,
      style: { fontSize: 20 },
      layoutFrame: { x: 0, y: 0, width: 200, height: 120, fontSize: 20 },
    })),
    libraryAssets: [],
    sections: [
      {
        id: "actions",
        spaceId: "space-actions",
        layout: { mode: "column", padding: 20, gap: 18 },
      },
    ],
    spaceLayouts: [
      {
        spaceId: "space-actions",
        layout: { mode: "grid", padding: 60 },
      },
    ],
    layoutNeedsMaterialization: true,
  };

  materializeCanvasLayout(state);
  assertManagedCanvasLayoutIntegrity(state);

  state.elements.forEach((element, index) => {
    assert.ok(element.width > 1000);
    assert.ok(element.style.fontSize >= 10);
    if (index > 0) {
      const previous = state.elements[index - 1];
      assert.ok(previous.y + previous.height < element.y);
    }
  });
});

test("managed layout deterministically reflows an unreadable linear plan", () => {
  const state = {
    elements: Array.from({ length: 8 }, (_, index) => ({
      id: `dense-${index + 1}`,
      type: "rectangle",
      label: "长".repeat(400),
      sectionId: "dense-content",
      x: 0,
      y: 0,
      width: 200,
      height: 120,
      style: { fontSize: 20 },
      layoutFrame: { x: 0, y: 0, width: 200, height: 120, fontSize: 20 },
    })),
    libraryAssets: [],
    sections: [
      {
        id: "dense-content",
        spaceId: "space-dense",
        layout: { mode: "row", padding: 20, gap: 18 },
      },
    ],
    spaceLayouts: [
      {
        spaceId: "space-dense",
        layout: { mode: "grid", padding: 60 },
      },
    ],
    layoutNeedsMaterialization: true,
  };

  const result = materializeCanvasLayout(state);
  const placement = result.spaces[0].sections[0];

  assert.equal(placement.reflowed, true);
  assert.equal(placement.requestedMode, "row");
  assert.equal(placement.effectiveMode, "grid");
  assertManagedCanvasLayoutIntegrity(state);
});

test("managed layout rejects content that no readable reflow can contain", () => {
  const state = {
    elements: [
      {
        id: "impossible-copy",
        type: "rectangle",
        label: "超".repeat(10000),
        sectionId: "content",
        x: 0,
        y: 0,
        width: 200,
        height: 120,
        style: { fontSize: 20 },
      },
    ],
    libraryAssets: [],
    sections: [
      {
        id: "content",
        spaceId: "space-page",
        layout: { mode: "column", padding: 20 },
      },
    ],
    spaceLayouts: [
      {
        spaceId: "space-page",
        layout: { mode: "grid", padding: 60 },
      },
    ],
    layoutNeedsMaterialization: true,
  };

  assert.throws(
    () => materializeCanvasLayout(state),
    /在可读字号下无法排入舞台.*impossible-copy/,
  );
});

test("managed integrity checks complete child visual bounds for collisions", () => {
  const state = {
    elements: [
      {
        id: "card-a",
        type: "rectangle",
        sectionId: "content",
        x: 0,
        y: 0,
        width: 100,
        height: 100,
      },
      {
        id: "card-b",
        type: "rectangle",
        sectionId: "content",
        x: 120,
        y: 0,
        width: 100,
        height: 100,
      },
    ],
    libraryAssets: [
      {
        id: "card-a-badge",
        parentId: "card-a",
        x: 90,
        y: 20,
        width: 40,
        height: 40,
      },
    ],
    sections: [
      {
        id: "content",
        spaceId: "space-page",
        layout: { mode: "row" },
      },
    ],
  };

  assert.throws(
    () => assertManagedCanvasLayoutIntegrity(state),
    /元素重叠 card-a\/card-b/,
  );
});

test("production story creation cannot bypass managed Section layout", async () => {
  const state = createCanvasDraftState(null, { requireManagedLayout: true });
  const tools = createCanvasTools({ state, animate: async () => ({}) });
  await tool(tools, "define_story").execute("story", {
    id: "required-layout",
    title: "必须布局",
    summary: "生产创建不能退回猜测绝对坐标",
    beats: [{ id: "page", title: "页面", elementIds: ["content", "legacy"] }],
  });
  await tool(tools, "add_canvas_elements").execute("legacy", {
    elements: [
      {
        id: "legacy",
        type: "rectangle",
        x: 100,
        y: 100,
        width: 200,
        height: 100,
      },
    ],
  });
  await assert.rejects(
    () =>
      tool(tools, "finalize_canvas_draft").execute("freeze-without-layout", {}),
    /必须先调用 define_canvas_sections/,
  );

  await tool(tools, "define_story_spaces").execute("spaces", {
    chapters: [
      {
        beatId: "page",
        spaceId: "space-page",
        relationFromPrevious: "new-page",
        reason: "首章建立独立页面",
      },
    ],
  });
  await tool(tools, "define_canvas_sections").execute("sections", {
    spaces: [
      {
        spaceId: "space-page",
        layout: { mode: "grid" },
        sections: [{ id: "content", layout: { mode: "column" } }],
      },
    ],
  });
  await tool(tools, "add_canvas_elements").execute("managed", {
    elements: [
      {
        id: "content",
        type: "rectangle",
        sectionId: "content",
      },
    ],
  });
  await assert.rejects(
    () => tool(tools, "finalize_canvas_draft").execute("freeze-unmanaged", {}),
    /页面内容必须托管到 Section：legacy/,
  );
});

test("canvas connectors keep a short arrow and return a layout warning", async () => {
  const state = createCanvasDraftState();
  const tools = createCanvasTools({ state, animate: async () => ({}) });
  await tool(tools, "define_story").execute("story", {
    id: "flow",
    title: "Flow",
    summary: "Readable flow",
    beats: [{ id: "one", title: "One", elementIds: ["a", "b"] }],
  });
  await tool(tools, "add_canvas_elements").execute("elements", {
    elements: [
      { id: "a", type: "rectangle", x: 0, y: 0, width: 200, height: 80 },
      { id: "b", type: "rectangle", x: 260, y: 0, width: 200, height: 80 },
    ],
  });
  const result = await tool(tools, "connect_canvas_elements").execute(
    "connect",
    {
      connectors: [
        {
          id: "a-b",
          from: "a",
          to: "b",
          label: "通过",
          relationship: "process-flow",
          meaning: "审批通过后进入下一业务节点",
        },
      ],
    },
  );
  assert.equal(state.connectors.length, 1);
  assert.equal(result.details.kind, "connector-spacing-warnings");
  assert.match(result.details.warnings[0], /建议至少 96px/);
  await tool(tools, "finalize_canvas_draft").execute("freeze", {});
  assert.equal(state.frozen, true);
});

test("canvas connector tool rejects presentation-order arrows", async () => {
  const state = createCanvasDraftState();
  const tools = createCanvasTools({ state, animate: async () => ({}) });
  await tool(tools, "add_canvas_elements").execute("elements", {
    elements: [
      { id: "a", type: "rectangle", x: 0, y: 0, width: 200, height: 80 },
      { id: "b", type: "rectangle", x: 400, y: 0, width: 200, height: 80 },
    ],
  });
  await assert.rejects(
    () =>
      tool(tools, "connect_canvas_elements").execute("connect", {
        connectors: [
          {
            id: "a-b",
            from: "a",
            to: "b",
            relationship: "process-flow",
            meaning: "表示 PPT 下一页的展示顺序",
          },
        ],
      }),
    /没有表达有效业务关系/,
  );
  assert.deepEqual(state.connectors, []);
});

test("edit draft updates existing semantic elements without duplicating them", async () => {
  const state = createCanvasDraftState({
    id: "existing-story",
    title: "Existing story",
    summary: "Original",
    beats: [{ id: "opening", title: "Opening", elementIds: ["title"] }],
    elements: [
      {
        id: "title",
        type: "text",
        label: "Original title",
        x: 100,
        y: 80,
        width: 300,
        height: 60,
      },
    ],
    libraryAssets: [],
    connectors: [],
  });
  const tools = createCanvasTools({ state, animate: async () => ({}) });

  await tool(tools, "update_canvas_elements").execute("edit", {
    updates: [{ elementId: "title", label: "Updated title" }],
  });

  assert.equal(state.elements.length, 1);
  assert.equal(state.elements[0].label, "Updated title");
  assert.equal(state.elements[0].x, 100);
  assert.equal(state.elements[0].width, 300);
  await assert.rejects(
    () =>
      tool(tools, "define_story").execute("replace-story", {
        id: "different-story",
        title: "Different",
        summary: "Should fail",
        beats: [],
      }),
    /必须保留现有故事 id existing-story/,
  );
});

test("canvas draft rejects unresolved Director DSL content", async () => {
  const state = createCanvasDraftState();
  const tools = createCanvasTools({ state, animate: async () => ({}) });
  await tool(tools, "define_story").execute("story", {
    id: "annual-report",
    title: "Annual report",
    summary: "Value story",
    beats: [
      {
        id: "growth",
        title: "Growth",
        elementIds: ["growth-card", "trophy-asset", "growth-arrow"],
      },
    ],
  });
  await tool(tools, "add_canvas_elements").execute("elements", {
    elements: [
      {
        id: "growth-card",
        type: "rectangle",
        x: 0,
        y: 0,
        width: 240,
        height: 100,
      },
    ],
  });
  await assert.rejects(
    () => tool(tools, "finalize_canvas_draft").execute("freeze", {}),
    /growth\/trophy-asset.*growth\/growth-arrow/,
  );
  assert.deepEqual(state.story.beats[0].elementIds, [
    "growth-card",
    "trophy-asset",
    "growth-arrow",
  ]);
});

test("canvas batch element creation is atomic", async () => {
  const state = createCanvasDraftState();
  const tools = createCanvasTools({ state, animate: async () => ({}) });
  await assert.rejects(
    () =>
      tool(tools, "add_canvas_elements").execute("elements", {
        elements: [
          { id: "duplicate", type: "text", x: 0, y: 0, width: 20, height: 20 },
          { id: "duplicate", type: "text", x: 30, y: 0, width: 20, height: 20 },
        ],
      }),
    /画布语义 id 重复/,
  );
  assert.deepEqual(state.elements, []);
});

test("canvas element schema accepts small presentation text and decorations", () => {
  const state = createCanvasDraftState();
  const tools = createCanvasTools({ state, animate: async () => ({}) });
  const addElements = tool(tools, "add_canvas_elements");
  const elementProperties =
    addElements.parameters.properties.elements.items.properties;

  assert.equal(elementProperties.width.minimum, 1);
  assert.equal(elementProperties.height.minimum, 1);
});

test("canvas frame deterministically fits arranged content with padding", async () => {
  const state = createCanvasDraftState();
  const tools = createCanvasTools({ state, animate: async () => ({}) });
  await tool(tools, "add_canvas_elements").execute("elements", {
    elements: [
      {
        id: "pain-frame",
        type: "rectangle",
        role: "background",
        x: 0,
        y: 0,
        width: 100,
        height: 100,
      },
      ...["pain-card1", "pain-card2", "pain-card3"].map((id) => ({
        id,
        type: "rectangle",
        x: 0,
        y: 0,
        width: 300,
        height: 240,
      })),
    ],
  });
  await tool(tools, "layout_canvas_elements").execute("layout", {
    elementIds: ["pain-card1", "pain-card2", "pain-card3"],
    direction: "horizontal",
    originX: 150,
    originY: 280,
    gapX: 40,
    gapY: 0,
  });

  const result = await tool(tools, "fit_canvas_element_to_content").execute(
    "fit",
    {
      elementId: "pain-frame",
      targetIds: ["pain-card1", "pain-card2", "pain-card3"],
      padding: 24,
    },
  );

  const frame = state.elements.find((element) => element.id === "pain-frame");
  assert.deepEqual(
    { x: frame.x, y: frame.y, width: frame.width, height: frame.height },
    { x: 126, y: 256, width: 1028, height: 288 },
  );
  assert.deepEqual(result.details.bounds, {
    x: 126,
    y: 256,
    width: 1028,
    height: 288,
  });
  assert.deepEqual(
    state.elements
      .filter((element) => element.id.startsWith("pain-card"))
      .map(({ x, y, width, height }) => ({ x, y, width, height })),
    [
      { x: 150, y: 280, width: 300, height: 240 },
      { x: 490, y: 280, width: 300, height: 240 },
      { x: 830, y: 280, width: 300, height: 240 },
    ],
  );
});

test("canvas frame fit rejects self and missing targets before mutation", async () => {
  const state = createCanvasDraftState();
  const tools = createCanvasTools({ state, animate: async () => ({}) });
  await tool(tools, "add_canvas_elements").execute("elements", {
    elements: [
      {
        id: "frame",
        type: "rectangle",
        x: 10,
        y: 20,
        width: 30,
        height: 40,
      },
    ],
  });
  const original = structuredClone(state.elements[0]);

  await assert.rejects(
    () =>
      tool(tools, "fit_canvas_element_to_content").execute("self", {
        elementId: "frame",
        targetIds: ["frame"],
        padding: 10,
      }),
    /不能包含自身/,
  );
  await assert.rejects(
    () =>
      tool(tools, "fit_canvas_element_to_content").execute("missing", {
        elementId: "frame",
        targetIds: ["missing"],
        padding: 10,
      }),
    /找不到要包围的目标元素：missing/,
  );
  assert.deepEqual(state.elements[0], original);
});

test("canvas cards use native labels and reject separate child text", async () => {
  const state = createCanvasDraftState();
  const tools = createCanvasTools({ state, animate: async () => ({}) });
  await tool(tools, "define_story").execute("story", {
    id: "card-story",
    title: "Card story",
    summary: "Structured card content",
    beats: [{ id: "card", title: "Card", elementIds: ["card"] }],
  });
  await tool(tools, "add_canvas_elements").execute("card", {
    elements: [
      {
        id: "card",
        type: "rectangle",
        label: "组织成长\n团队规模 120 人",
        x: 100,
        y: 200,
        width: 600,
        height: 400,
        style: { textAlign: "left", verticalAlign: "bottom" },
      },
    ],
  });
  await assert.rejects(
    () =>
      tool(tools, "add_canvas_elements").execute("child-text", {
        elements: [
          {
            id: "card-footer",
            type: "text",
            label: "不再独立创建",
            parentId: "card",
            layout: { slot: "footer", align: "center" },
          },
        ],
      }),
    /必须直接写入父图形 card 的 label/,
  );
  await tool(tools, "finalize_canvas_draft").execute("freeze", {});

  const card = state.elements.find((element) => element.id === "card");
  assert.equal(state.elements.length, 1);
  assert.equal(card.label, "组织成长\n团队规模 120 人");
  assert.equal(card.style.textAlign, "left");
  assert.equal(card.style.verticalAlign, "bottom");
});

test("legacy card child text is migrated into the native parent label", async () => {
  const state = createCanvasDraftState({
    schemaVersion: "1.0",
    id: "legacy-card-story",
    title: "Legacy card",
    summary: "Migrates child text",
    beats: [
      {
        id: "card",
        title: "Card",
        elementIds: ["card", "card-title", "card-body"],
      },
    ],
    elements: [
      {
        id: "card",
        type: "rectangle",
        x: 100,
        y: 200,
        width: 600,
        height: 400,
      },
      {
        id: "card-title",
        type: "text",
        label: "组织成长",
        parentId: "card",
        layout: { slot: "header", align: "left" },
        x: 120,
        y: 220,
        width: 300,
        height: 40,
      },
      {
        id: "card-body",
        type: "text",
        label: "团队规模 120 人",
        parentId: "card",
        layout: { slot: "body", align: "left" },
        x: 120,
        y: 420,
        width: 300,
        height: 60,
      },
    ],
    libraryAssets: [],
    connectors: [],
  });
  const tools = createCanvasTools({ state, animate: async () => ({}) });

  const result = await tool(tools, "finalize_canvas_draft").execute(
    "freeze",
    {},
  );

  assert.equal(state.elements.length, 1);
  assert.equal(state.elements[0].label, "组织成长\n团队规模 120 人");
  assert.deepEqual(state.story.beats[0].elementIds, ["card"]);
  assert.equal(result.details.repairs.mergedCardText.length, 2);
});

test("canvas tools search and freeze selected library assets", async () => {
  const state = createCanvasDraftState();
  const tools = createCanvasTools({
    state,
    animate: async () => ({}),
    assetSources: installedAssetSources,
  });
  await tool(tools, "define_story").execute("story", {
    id: "cloud-story",
    title: "Cloud story",
    summary: "Uses a bundled cloud asset",
    beats: [{ id: "one", title: "One", elementIds: ["cloud-icon"] }],
  });
  const search = await tool(tools, "search_library_assets").execute("search", {
    query: "云",
    limit: 3,
  });
  const ref = search.details.results[0].ref;
  await tool(tools, "add_library_assets").execute("assets", {
    assets: [
      { id: "cloud-icon", ref, x: 100, y: 120, width: 220, height: 180 },
    ],
  });
  await tool(tools, "finalize_canvas_draft").execute("freeze", {});

  assert.equal(state.libraryAssets.length, 1);
  assert.equal(state.libraryAssets[0].id, "cloud-icon");
  assert.ok(state.libraryAssets[0].elements.length > 0);
  assert.equal(state.frozen, true);
});

test("canvas library tool resolves an accidental search query used as ref", async () => {
  const state = createCanvasDraftState();
  const tools = createCanvasTools({
    state,
    animate: async () => ({}),
    assetSources: installedAssetSources,
  });
  await tool(tools, "search_library_assets").execute("search", {
    query: "图表",
    limit: 5,
  });
  const result = await tool(tools, "add_library_assets").execute("assets", {
    assets: [{ id: "chart", ref: "图表", x: 0, y: 0 }],
  });
  assert.equal(state.libraryAssets.length, 1);
  assert.match(state.libraryAssets[0].ref, /^素材-\d+-\d+$/);
  assert.match(result.content[0].text, /已自动选择/);
});

test("canvas library tool skips an unmatched optional asset without failing", async () => {
  const state = createCanvasDraftState();
  const tools = createCanvasTools({ state, animate: async () => ({}) });
  const result = await tool(tools, "add_library_assets").execute("assets", {
    assets: [
      {
        id: "justice-icon",
        ref: "balance scale justice",
        x: 0,
        y: 0,
      },
    ],
  });

  assert.equal(state.libraryAssets.length, 0);
  assert.match(result.content[0].text, /未命中并已跳过/);
  assert.deepEqual(result.details, {
    kind: "library-add-result",
    addedAssetIds: [],
    skippedAssets: [
      {
        id: "justice-icon",
        query: "balance scale justice",
        reason: "no-match",
      },
    ],
  });
});

test("canvas keeps asset tools available but exposes no catalog content before installation", async () => {
  const state = createCanvasDraftState();
  const tools = createCanvasTools({ state, animate: async () => ({}) });
  const search = await tool(tools, "search_library_assets").execute("search", {
    query: "云",
    limit: 5,
  });
  assert.deepEqual(search.details.results, []);
  assert.match(search.content[0].text, /没有安装任何素材包/);

  const add = await tool(tools, "add_library_assets").execute("assets", {
    assets: [{ id: "cloud", ref: "aws-architecture-icons#0", x: 0, y: 0 }],
  });
  assert.equal(state.libraryAssets.length, 0);
  assert.deepEqual(add.details.addedAssetIds, []);
});
