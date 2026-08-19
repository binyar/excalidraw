import assert from "node:assert/strict";
import test from "node:test";

import { createCanvasDraftState, createCanvasTools } from "./canvas-tools.mjs";
import { listLibraryCatalogPacks } from "./library-catalog.mjs";
import { STORY_AGENT_SYSTEM_PROMPT } from "./prompt.mjs";

const installedAssetSources = (await listLibraryCatalogPacks()).map(
  (pack) => pack.source,
);

const tool = (tools, name) => {
  const found = tools.find((candidate) => candidate.name === name);
  assert.ok(found, `missing tool ${name}`);
  return found;
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

test("main agent tools freeze a general canvas before animation delegation", async () => {
  const state = createCanvasDraftState();
  let delegatedDraft;
  const tools = createCanvasTools({
    state,
    animate: async (draft) => {
      delegatedDraft = draft;
      return {
        schemaVersion: "1.0",
        id: `animation-${draft.id}`,
        durationMs: 8400,
        frameRate: 60,
        rationale: "three beats need reading time",
        summary: "timed story",
        tracks: [
          {
            id: "title-entrance",
            targetId: "story-title",
            startMs: 0,
            durationMs: 600,
            presets: [
              {
                category: "entrance",
                name: "fade-in",
                atMs: 0,
                durationMs: 600,
              },
            ],
          },
        ],
      };
    },
  });

  await tool(tools, "define_story").execute("story", {
    id: "launch-story",
    title: "产品发布",
    summary: "从问题到成果",
    beats: [{ id: "opening", title: "问题", elementIds: ["story-title"] }],
  });
  await tool(tools, "add_canvas_elements").execute("elements", {
    elements: [
      {
        id: "story-title",
        type: "text",
        role: "title",
        label: "产品发布",
        x: 100,
        y: 80,
        width: 500,
        height: 80,
      },
    ],
  });
  await tool(tools, "finalize_canvas_draft").execute("freeze", {
    animationBrief: { intent: "清晰讲述三个故事节拍" },
  });
  const result = await tool(tools, "delegate_animation").execute(
    "delegate",
    {},
    new AbortController().signal,
  );

  assert.equal(result.details.kind, "story-artifact");
  assert.equal(result.details.animation.durationMs, 8400);
  assert.equal(delegatedDraft.id, "launch-story");
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
  const frozen = await tool(tools, "finalize_canvas_draft").execute("freeze", {
    animationBrief: { intent: "按空间关系讲述" },
  });

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
  await tool(tools, "finalize_canvas_draft").execute("freeze", {
    animationBrief: { intent: "验证页面归属" },
  });

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
  await tool(tools, "finalize_canvas_draft").execute("freeze", {
    animationBrief: { intent: "draw the retained connector" },
  });
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

test("canvas draft accepts a detailed animation brief", async () => {
  const state = createCanvasDraftState();
  const tools = createCanvasTools({ state, animate: async () => ({}) });
  await tool(tools, "define_story").execute("story", {
    id: "complex-flow",
    title: "Complex flow",
    summary: "Detailed branching flow",
    beats: [{ id: "one", title: "One", elementIds: ["a"] }],
  });
  await tool(tools, "add_canvas_elements").execute("elements", {
    elements: [
      { id: "a", type: "rectangle", x: 0, y: 0, width: 200, height: 80 },
    ],
  });
  await tool(tools, "finalize_canvas_draft").execute("freeze", {
    animationBrief: { intent: "复杂分支动画要求。".repeat(80) },
  });
  assert.equal(state.frozen, true);
});

test("canvas draft accepts a JSON encoded animation brief from the model", async () => {
  const state = createCanvasDraftState();
  const tools = createCanvasTools({ state, animate: async () => ({}) });
  await tool(tools, "define_story").execute("story", {
    id: "report",
    title: "Report",
    summary: "Annual value",
    beats: [{ id: "opening", title: "Opening", elementIds: ["title"] }],
  });
  await tool(tools, "add_canvas_elements").execute("elements", {
    elements: [
      { id: "title", type: "text", x: 0, y: 0, width: 300, height: 60 },
    ],
  });
  await tool(tools, "finalize_canvas_draft").execute("freeze", {
    animationBrief: JSON.stringify({
      intent: "Reveal annual value",
      tone: "confident",
      preferredDurationMs: 18_000,
    }),
  });
  assert.deepEqual(state.animationBrief, {
    intent: "Reveal annual value",
    tone: "confident",
    preferredDurationMs: 18_000,
  });
  assert.equal(state.frozen, true);
});

test("canvas draft treats a plain string animation brief as intent", async () => {
  const state = createCanvasDraftState();
  const tools = createCanvasTools({ state, animate: async () => ({}) });
  await tool(tools, "define_story").execute("story", {
    id: "plain-brief",
    title: "Plain brief",
    summary: "String shorthand",
    beats: [{ id: "opening", title: "Opening", elementIds: ["title"] }],
  });
  await tool(tools, "add_canvas_elements").execute("elements", {
    elements: [
      { id: "title", type: "text", x: 0, y: 0, width: 300, height: 60 },
    ],
  });
  await tool(tools, "finalize_canvas_draft").execute("freeze", {
    animationBrief: "Reveal the launch story with a confident rhythm",
  });
  assert.deepEqual(state.animationBrief, {
    intent: "Reveal the launch story with a confident rhythm",
  });
  assert.equal(state.frozen, true);
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

test("canvas draft removes unresolved future beat references before freezing", async () => {
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
  const result = await tool(tools, "finalize_canvas_draft").execute("freeze", {
    animationBrief: { intent: "Present the valid growth content" },
  });
  assert.deepEqual(state.story.beats[0].elementIds, ["growth-card"]);
  assert.deepEqual(result.details.repairs.removedBeatReferences, [
    { beatId: "growth", elementId: "trophy-asset" },
    { beatId: "growth", elementId: "growth-arrow" },
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
  await tool(tools, "finalize_canvas_draft").execute("freeze", {
    animationBrief: { intent: "Reveal the card" },
  });

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

  const result = await tool(tools, "finalize_canvas_draft").execute("freeze", {
    animationBrief: { intent: "Reveal the migrated card" },
  });

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
    query: "cloud",
    limit: 3,
  });
  const ref = search.details.results[0].ref;
  await tool(tools, "add_library_assets").execute("assets", {
    assets: [
      { id: "cloud-icon", ref, x: 100, y: 120, width: 220, height: 180 },
    ],
  });
  await tool(tools, "finalize_canvas_draft").execute("freeze", {
    animationBrief: { intent: "Reveal the cloud icon" },
  });

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
    query: "chart",
    limit: 5,
  });
  const result = await tool(tools, "add_library_assets").execute("assets", {
    assets: [{ id: "chart", ref: "chart", x: 0, y: 0 }],
  });
  assert.equal(state.libraryAssets.length, 1);
  assert.match(state.libraryAssets[0].ref, /#\d+$/);
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
    query: "cloud",
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
