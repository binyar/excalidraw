import { randomUUID } from "node:crypto";

import { Type } from "@earendil-works/pi-ai";

import { assertAnimationPreservesDirectorPlan } from "./director-plan.ts";
import { snapshot, validateAndRepairDraft } from "./draft-validation.ts";
import { assertDirectorFrozen, assertMutable } from "./state-guards.ts";
import { defineTool, resultText } from "./tool-types.ts";

import type {
  CanvasDraft,
  StoryAnimationDraft,
  StoryDirectorPlan,
} from "../../../../src/ai/story/types.ts";
import type { CanvasDraftState } from "./state.ts";

type FinalizeToolOptions = {
  state: CanvasDraftState;
  animate?: (
    draft: CanvasDraft,
    directorPlan: StoryDirectorPlan,
    signal?: AbortSignal,
  ) => Promise<StoryAnimationDraft>;
};

export const createFinalizeTools = ({
  state,
  animate,
}: FinalizeToolOptions) => [
  defineTool({
    name: "finalize_canvas_draft",
    label: "冻结画布草稿",
    description:
      "校验画布是否完整执行已冻结的 Story Director Plan，并冻结派生画布结果。",
    parameters: Type.Object({}),
    executionMode: "sequential",
    async execute() {
      assertMutable(state);
      assertDirectorFrozen(state);
      const repairs = validateAndRepairDraft(state);
      state.frozen = true;
      return resultText(
        `画布草稿已冻结：${state.elements.length} 个基础元素、${state.libraryAssets.length} 个资源条目、${state.connectors.length} 条连接线。`,
        { kind: "canvas-draft", draft: snapshot(state), repairs },
      );
    },
  }),
  defineTool({
    name: "compile_story_artifact",
    label: "编译完整故事成品",
    description:
      "把已冻结的 Story Director Plan 和画布交给受限动画子智能体；子智能体只能规划元素动作，不能改变故事时间、镜头、转场或元素归属，随后确定性编译最终成品。",
    parameters: Type.Object({}),
    executionMode: "sequential",
    async execute(_id, _params, signal) {
      if (!state.frozen || !state.directorPlan) {
        throw new Error("必须先调用 finalize_canvas_draft 冻结画布");
      }
      if (typeof animate !== "function") {
        throw new Error("动画子智能体执行器未配置");
      }
      const draft = snapshot(state);
      const animation = await animate(draft, state.directorPlan, signal);
      assertAnimationPreservesDirectorPlan(animation, state.directorPlan);
      const artifact = {
        kind: "story-artifact",
        artifactId: randomUUID(),
        summary: `${draft.title}画布与动画已完成`,
        directorPlan: structuredClone(state.directorPlan),
        canvas: draft,
        animation,
      };
      return resultText(
        `故事“${draft.title}”已完成：${draft.elements.length} 个基础元素、${draft.libraryAssets.length} 个资源条目，动画总时长 ${animation.durationMs}ms。`,
        artifact,
      );
    },
  }),
];
