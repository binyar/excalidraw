import { Agent } from "@earendil-works/pi-agent-core";
import { createModels } from "@earendil-works/pi-ai";
import { deepseekProvider } from "@earendil-works/pi-ai/providers/deepseek";

import { runAnimationAgent } from "./animation-agent.ts";
import { createCanvasDraftState, createCanvasTools } from "./canvas-tools.ts";
import {
  applyCurrentCanvasState,
  compactEditContext,
  latestStoryArtifact,
  parseCurrentCanvasState,
} from "./edit-context.ts";
import { buildStoryAgentSystemPrompt } from "./prompt.ts";

import type {
  AgentEvent,
  AgentMessage,
  ThinkingLevel,
} from "@earendil-works/pi-agent-core";

type BuildAgentOptions = {
  transcript: AgentMessage[];
  threadId: string;
  thinkingLevel: ThinkingLevel;
  currentCanvasState: unknown;
  assetSources: string[];
  enabledSkillIds: string[];
  onEvent: (event: AgentEvent) => void;
  onAnimationEvent: (event: AgentEvent) => void;
};

const getAgentModel = () => {
  process.env.DEEPSEEK_API_KEY ??= process.env.DEEP_SEEK_API_KEY;
  const models = createModels();
  models.setProvider(deepseekProvider());
  const model = models.getModel("deepseek", "deepseek-v4-flash");
  if (!model) {
    throw new Error("DeepSeek V4 Flash 模型未在 Pi 中注册");
  }
  return { models, model };
};

export const buildStoryAgent = ({
  transcript,
  threadId,
  thinkingLevel,
  currentCanvasState,
  assetSources,
  enabledSkillIds,
  onEvent,
  onAnimationEvent,
}: BuildAgentOptions): Agent => {
  const { models, model } = getAgentModel();
  const existingArtifact = applyCurrentCanvasState(
    latestStoryArtifact(transcript),
    parseCurrentCanvasState(currentCanvasState),
  );
  const draftState = createCanvasDraftState(existingArtifact?.canvas, {
    existingDirectorPlan: existingArtifact?.directorPlan,
    requireDirectorPlan: true,
    requireManagedLayout: !existingArtifact,
  });
  const editContext = compactEditContext(existingArtifact);
  const storyAgentSystemPrompt = buildStoryAgentSystemPrompt({
    enabledSkillIds,
  });
  const agent = new Agent({
    initialState: {
      systemPrompt: editContext
        ? `${storyAgentSystemPrompt}\n\n当前是二次编辑，不是重新创建。以下是当前 Story Director Plan 与派生画布快照：\n${editContext}\n\n必须保留故事 id 和未被用户要求修改的内容、布局、资源与业务关系。先通过 define_story、define_story_spaces、define_canvas_sections、define_story_direction、分批 define_story_content、逐场景 define_story_scene 和无参数 finalize_story_plan 形成新的完整动态故事 DSL，再执行画布修改。修改已有基础元素必须调用 update_canvas_elements 并复用稳定语义 id；删除使用 remove_canvas_items；add_canvas_elements 仅用于用户明确要求的新内容。禁止另起一套平行故事。最后冻结派生画布并调用 compile_story_artifact。`
        : storyAgentSystemPrompt,
      model,
      thinkingLevel,
      tools: createCanvasTools({
        state: draftState,
        assetSources,
        enabledSkillIds,
        animate: (canvasDraft, directorPlan, signal) =>
          runAnimationAgent({
            canvasDraft,
            directorPlan,
            models,
            model,
            sessionId: threadId,
            thinkingLevel,
            signal,
            onEvent: onAnimationEvent,
          }),
      }),
      messages: transcript,
    },
    streamFn: models.streamSimple.bind(models),
    sessionId: threadId,
    toolExecution: "sequential",
  });
  agent.subscribe(onEvent);
  return agent;
};
