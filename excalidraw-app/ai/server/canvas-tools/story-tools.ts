import { Type } from "@earendil-works/pi-ai";

import {
  directorPlanSnapshot,
  normalizeDirectorPlan,
  validateDirectorPlan,
} from "./director-plan.ts";
import {
  directorContentSchema,
  directorNumberInputSchema,
  directorSceneSchema,
  sectionContentLayoutSchema,
  spaceLayoutSchema,
} from "./schemas.ts";
import { validateStorySpaces, withDefaultStorySpaces } from "./story-spaces.ts";
import { assertDirectorMutable, assertMutable } from "./state-guards.ts";
import { defineTool, resultText } from "./tool-types.ts";

import type { StoryAnimationPlanScene } from "../../../../src/ai/story/types.ts";
import type { CanvasDraftState } from "./state.ts";

type StoryToolOptions = { state: CanvasDraftState; random: () => number };

export const createStoryTools = ({ state, random }: StoryToolOptions) => [
  defineTool({
    name: "define_story",
    label: "规划画布故事",
    description:
      "在创建画布元素之前，定义完整故事以及有序的故事节拍。所有面向用户的标题、摘要和说明必须使用简体中文。",
    parameters: Type.Object({
      id: Type.String({ minLength: 1, maxLength: 64 }),
      title: Type.String({ minLength: 1, maxLength: 160 }),
      summary: Type.String({ minLength: 1, maxLength: 1000 }),
      beats: Type.Array(
        Type.Object({
          id: Type.String({ minLength: 1, maxLength: 64 }),
          title: Type.String({ minLength: 1, maxLength: 160 }),
          description: Type.Optional(Type.String({ maxLength: 500 })),
          elementIds: Type.Array(Type.String({ maxLength: 64 }), {
            maxItems: 80,
          }),
        }),
        { minItems: 1, maxItems: 30 },
      ),
    }),
    executionMode: "sequential",
    async execute(_id, params) {
      assertMutable(state);
      assertDirectorMutable(state);
      if (state.editing && state.story && params.id !== state.story.id) {
        throw new Error(
          `二次编辑必须保留现有故事 id ${state.story.id}，不能新建 ${params.id}`,
        );
      }
      const previousBeats = state.story?.beats || [];
      state.story = {
        ...structuredClone(params),
        beats: withDefaultStorySpaces(params.beats, previousBeats),
      };
      state.directorDraft = { content: [], scenes: [] };
      state.directorPlan = null;
      state.storySpacesDefined = false;
      return resultText(
        `故事“${params.title}”已规划为 ${params.beats.length} 个节拍；当前使用安全的独立页面默认值，请继续调用 define_story_spaces 判断章节空间关系。`,
      );
    },
  }),
  defineTool({
    name: "define_story_spaces",
    label: "规划章节空间关系",
    description:
      "调用 define_story 之后、创建画布元素之前，判断每一章是延续上一个空间（same-space），还是开启独立演示页面（new-page）。判断必须基于故事语义并能用中文解释，不能随机选择视觉效果。",
    parameters: Type.Object({
      chapters: Type.Array(
        Type.Object({
          beatId: Type.String({ minLength: 1, maxLength: 64 }),
          spaceId: Type.String({ minLength: 1, maxLength: 64 }),
          relationFromPrevious: Type.Union([
            Type.Literal("same-space"),
            Type.Literal("new-page"),
          ]),
          reason: Type.String({ minLength: 2, maxLength: 300 }),
        }),
        { minItems: 1, maxItems: 30 },
      ),
    }),
    executionMode: "sequential",
    async execute(_id, params) {
      assertMutable(state);
      assertDirectorMutable(state);
      if (!state.story) {
        throw new Error("必须先调用 define_story");
      }
      const relationByBeatId = new Map(
        params.chapters.map((chapter) => [chapter.beatId, chapter]),
      );
      if (
        relationByBeatId.size !== state.story.beats.length ||
        state.story.beats.some((beat) => !relationByBeatId.has(beat.id))
      ) {
        throw new Error("define_story_spaces 必须覆盖全部故事节拍且不能重复");
      }
      const beats = state.story.beats.map((beat) => {
        const chapter = relationByBeatId.get(beat.id);
        if (!chapter) {
          throw new Error(`故事节拍 ${beat.id} 缺少章节空间定义`);
        }
        return {
          ...beat,
          spaceId: chapter.spaceId,
          relationFromPrevious: chapter.relationFromPrevious,
          relationReason: chapter.reason,
        };
      });
      validateStorySpaces(beats);
      state.story.beats = beats;
      state.storySpacesDefined = true;
      return resultText(
        `已规划 ${beats.length} 个章节空间：${
          new Set(beats.map((beat) => beat.spaceId)).size
        } 个独立坐标空间，${
          beats.filter((beat) => beat.relationFromPrevious === "same-space")
            .length
        } 个连续空间关系。`,
        {
          kind: "story-space-plan",
          chapters: beats.map((beat) => ({
            beatId: beat.id,
            spaceId: beat.spaceId,
            relationFromPrevious: beat.relationFromPrevious,
            reason: beat.relationReason,
          })),
        },
      );
    },
  }),
  defineTool({
    name: "define_canvas_sections",
    label: "规划页面与 Section 布局",
    description:
      "在章节空间确定后、创建元素前，为每个 spaceId 定义页面中的 Section 排列，以及每个 Section 内部的有限布局意图。row、column、grid 默认不允许兄弟内容重叠；只有明确选择 overlay 或 free 时才允许重叠。",
    parameters: Type.Object({
      spaces: Type.Array(
        Type.Object({
          spaceId: Type.String({ minLength: 1, maxLength: 64 }),
          layout: spaceLayoutSchema,
          sections: Type.Array(
            Type.Object({
              id: Type.String({ minLength: 1, maxLength: 64 }),
              role: Type.Optional(Type.String({ maxLength: 80 })),
              order: Type.Optional(Type.Number({ minimum: 0, maximum: 50 })),
              weight: Type.Optional(Type.Number({ minimum: 0.1, maximum: 10 })),
              layout: sectionContentLayoutSchema,
            }),
            { minItems: 1, maxItems: 16 },
          ),
        }),
        { minItems: 1, maxItems: 30 },
      ),
    }),
    executionMode: "sequential",
    async execute(_id, params) {
      assertMutable(state);
      assertDirectorMutable(state);
      if (!state.story) {
        throw new Error("必须先调用 define_story 和 define_story_spaces");
      }
      if (!state.storySpacesDefined) {
        throw new Error(
          "必须先调用 define_story_spaces 确认章节空间，再定义 Section",
        );
      }
      const expectedSpaceIds = new Set(
        state.story.beats.map((beat) => beat.spaceId),
      );
      const receivedSpaceIds = new Set(
        params.spaces.map((space) => space.spaceId),
      );
      if (
        receivedSpaceIds.size !== params.spaces.length ||
        receivedSpaceIds.size !== expectedSpaceIds.size ||
        [...expectedSpaceIds].some((spaceId) => !receivedSpaceIds.has(spaceId))
      ) {
        throw new Error(
          "define_canvas_sections 必须覆盖全部故事 spaceId 且不能重复",
        );
      }
      const sectionIds = new Set();
      const sections = [];
      for (const space of params.spaces) {
        if (!expectedSpaceIds.has(space.spaceId)) {
          throw new Error(`Section 布局引用了未知 spaceId：${space.spaceId}`);
        }
        for (const section of space.sections) {
          if (sectionIds.has(section.id)) {
            throw new Error(`Section id 重复：${section.id}`);
          }
          sectionIds.add(section.id);
          sections.push({
            ...structuredClone(section),
            spaceId: space.spaceId,
          });
        }
      }
      state.spaceLayouts = params.spaces.map(({ spaceId, layout }) => ({
        spaceId,
        layout: structuredClone(layout),
      }));
      state.sections = sections;
      state.layoutNeedsMaterialization = true;
      return resultText(
        `已为 ${params.spaces.length} 个页面空间定义 ${sections.length} 个 Section；托管布局将在画布冻结前确定性生成绝对坐标。`,
        {
          kind: "canvas-section-layout",
          spaceLayouts: structuredClone(state.spaceLayouts),
          sections: structuredClone(state.sections),
        },
      );
    },
  }),
  defineTool({
    name: "define_story_direction",
    label: "定义故事时长与导演风格",
    description:
      "设置完整故事 DSL 的总时长、导演依据、摘要和运动风格。该工具只提交少量全局字段，避免把整份 DSL 塞进一次工具调用。",
    parameters: Type.Object({
      durationMs: directorNumberInputSchema,
      rationale: Type.String({ minLength: 1, maxLength: 1000 }),
      summary: Type.String({ minLength: 1, maxLength: 500 }),
      style: Type.Object({
        tone: Type.Union([
          Type.Literal("restrained"),
          Type.Literal("natural"),
          Type.Literal("energetic"),
          Type.Literal("playful"),
        ]),
        pace: Type.Union([
          Type.Literal("slow"),
          Type.Literal("normal"),
          Type.Literal("fast"),
        ]),
        reducedMotionFallback: Type.Optional(Type.Boolean()),
      }),
    }),
    executionMode: "sequential",
    async execute(_id, params) {
      assertMutable(state);
      assertDirectorMutable(state);
      if (!state.story) {
        throw new Error("必须先调用 define_story");
      }
      state.directorDraft ||= { content: [], scenes: [] };
      Object.assign(state.directorDraft, {
        durationMs: params.durationMs,
        rationale: params.rationale,
        summary: params.summary,
        style: {
          ...structuredClone(params.style),
          reducedMotionFallback: params.style.reducedMotionFallback ?? true,
        },
      });
      return resultText(
        "故事总时长与导演风格已记录，请继续分批声明内容和逐场景时间轴。",
        { kind: "story-direction" },
      );
    },
  }),
  defineTool({
    name: "define_story_content",
    label: "分批声明故事内容",
    description:
      "分批提交 Director content，每次最多 40 项；同 id 会被新规格覆盖。可连续调用，直到 define_story 的全部 elementIds 和所需连接都已声明。",
    parameters: Type.Object({
      content: Type.Array(directorContentSchema, {
        minItems: 1,
        maxItems: 40,
      }),
    }),
    executionMode: "sequential",
    async execute(_id, params) {
      assertMutable(state);
      assertDirectorMutable(state);
      if (!state.story) {
        throw new Error("必须先调用 define_story");
      }
      state.directorDraft ||= { content: [], scenes: [] };
      const byId = new Map(
        state.directorDraft.content.map((content) => [content.id, content]),
      );
      params.content.forEach((content) =>
        byId.set(content.id, structuredClone(content)),
      );
      state.directorDraft.content = [...byId.values()];
      const expectedIds = new Set(
        state.story.beats.flatMap((beat) => beat.elementIds),
      );
      const remaining = [...expectedIds].filter((id) => !byId.has(id));
      return resultText(
        `本批已记录 ${params.content.length} 项内容，当前累计 ${
          byId.size
        } 项；${
          remaining.length > 0
            ? `还有 ${remaining.length} 个节拍内容 id 未声明。`
            : "全部节拍内容 id 已覆盖。"
        }`,
        {
          kind: "story-director-content",
          contentCount: byId.size,
          remainingBeatContentCount: remaining.length,
          remainingBeatContentIds: remaining.slice(0, 20),
        },
      );
    },
  }),
  defineTool({
    name: "define_story_scene",
    label: "逐场景编写镜头与动作",
    description:
      "一次只提交一个完整场景及其 Camera、章节转场和 Cue；同 id 场景会被覆盖。时间字段允许数字或带 ms/s 的短字符串，并在最终冻结时确定性解析。",
    parameters: directorSceneSchema,
    executionMode: "sequential",
    async execute(_id, params) {
      assertMutable(state);
      assertDirectorMutable(state);
      if (!state.story) {
        throw new Error("必须先调用 define_story");
      }
      state.directorDraft ||= { content: [], scenes: [] };
      const byId = new Map(
        state.directorDraft.scenes.map((scene) => [scene.id, scene]),
      );
      // The schema deliberately accepts compact time strings. The director
      // normalizer converts them before this draft can become a frozen plan.
      byId.set(
        params.id,
        structuredClone(params) as unknown as StoryAnimationPlanScene,
      );
      state.directorDraft.scenes = [...byId.values()];
      return resultText(
        `场景 ${params.id} 已记录，当前累计 ${byId.size} 个场景。`,
        { kind: "story-director-scene", sceneCount: byId.size },
      );
    },
  }),
  defineTool({
    name: "finalize_story_plan",
    label: "冻结完整动态故事 DSL",
    description:
      "无参数冻结此前由 define_story_direction、define_story_content 和 define_story_scene 分段写入的完整 DSL。该调用不会再次传输大型嵌套参数。",
    parameters: Type.Object({}, { additionalProperties: false }),
    executionMode: "sequential",
    async execute() {
      assertMutable(state);
      assertDirectorMutable(state);
      if (!state.story || !state.storySpacesDefined) {
        throw new Error("必须先完成故事与章节空间规划，再冻结完整动态故事 DSL");
      }
      if (state.spaceLayouts.length === 0 || state.sections.length === 0) {
        throw new Error(
          "必须先完成页面与 Section 布局，再冻结完整动态故事 DSL",
        );
      }
      const draft = state.directorDraft;
      if (
        !draft ||
        draft.durationMs === undefined ||
        !draft.rationale ||
        !draft.summary ||
        !draft.style
      ) {
        throw new Error("必须先调用 define_story_direction 定义导演全局参数");
      }
      if (draft.content.length === 0) {
        throw new Error("必须先调用 define_story_content 声明故事内容");
      }
      if (draft.scenes.length === 0) {
        throw new Error("必须逐个调用 define_story_scene 编写故事场景");
      }
      const requestedPlan = {
        durationMs: draft.durationMs,
        rationale: draft.rationale,
        summary: draft.summary,
        style: structuredClone(draft.style),
        content: structuredClone(draft.content),
        scenes: structuredClone(draft.scenes),
      };
      const { plan: motionPlan, repairs } = normalizeDirectorPlan(
        state,
        requestedPlan,
        random,
      );
      validateDirectorPlan(state, motionPlan);
      state.directorPlan = directorPlanSnapshot(state, motionPlan);
      state.directorFrozen = true;
      return resultText(
        `完整动态故事 DSL 已冻结：${motionPlan.scenes.length} 个场景，总时长 ${
          motionPlan.durationMs
        }ms。${
          repairs.length > 0
            ? ` 已确定性归一化 ${repairs.length} 项可修复的导演参数。`
            : ""
        }后续仅执行画布、镜头和动画编译。`,
        {
          kind: "story-director-plan",
          durationMs: state.directorPlan.durationMs,
          contentCount: state.directorPlan.content.length,
          sceneCount: state.directorPlan.scenes.length,
          repairs,
        },
      );
    },
  }),
];
