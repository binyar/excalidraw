import { Agent } from "@earendil-works/pi-agent-core";

import {
  createEmptyAnimationPlan,
  deriveSceneLifecycles,
} from "./animation-plan.ts";

import { createAnimationPlannerTools } from "./animation-planner-tools.ts";

import { ANIMATION_AGENT_SYSTEM_PROMPT } from "./prompt.ts";

import type {
  AgentEvent,
  AgentOptions,
  AgentState,
  ThinkingLevel,
} from "@earendil-works/pi-agent-core";
import type { ToolResultMessage } from "@earendil-works/pi-ai";

import type {
  CanvasDraft,
  StoryAnimationDraft,
  StoryDirectorPlan,
} from "../../../src/ai/story/types";

type RunAnimationAgentOptions = {
  canvasDraft: CanvasDraft;
  brief?: unknown;
  directorPlan?: StoryDirectorPlan | null;
  models: { streamSimple: AgentOptions["streamFn"] };
  model: AgentState["model"];
  sessionId: string;
  thinkingLevel?: ThinkingLevel;
  signal?: AbortSignal;
  onEvent?: (event: AgentEvent) => void;
};

export const runAnimationAgent = async ({
  canvasDraft,
  brief,
  directorPlan,
  models,
  model,
  sessionId,
  thinkingLevel = "off",
  signal,
  onEvent,
}: RunAnimationAgentOptions): Promise<StoryAnimationDraft> => {
  const draftTargetIds = new Set([
    ...canvasDraft.elements.map((element) => element.id),
    ...(canvasDraft.libraryAssets || []).map((asset) => asset.id),
    ...canvasDraft.connectors.map((connector) => connector.id),
  ]);
  const sanitizedCanvasDraft = {
    ...canvasDraft,
    beats: (canvasDraft.beats || []).map((beat) => ({
      ...beat,
      elementIds: beat.elementIds.filter((elementId) =>
        draftTargetIds.has(elementId),
      ),
    })),
  };
  const state = directorPlan
    ? {
        ...createEmptyAnimationPlan(),
        durationMs: directorPlan.durationMs,
        rationale: directorPlan.rationale,
        summary: directorPlan.directionSummary,
        style: structuredClone(directorPlan.style),
        scenes: directorPlan.scenes.map(
          ({ cues: _directorCues, ...scene }) => ({
            ...structuredClone(scene),
            cues: [],
          }),
        ),
      }
    : createEmptyAnimationPlan();
  const lifecycleContract = directorPlan
    ? deriveSceneLifecycles(state.scenes, sanitizedCanvasDraft)
    : null;
  const animationContext = {
    id: sanitizedCanvasDraft.id,
    title: sanitizedCanvasDraft.title,
    summary: sanitizedCanvasDraft.summary,
    beats: sanitizedCanvasDraft.beats,
    elements: [
      ...sanitizedCanvasDraft.elements,
      ...(sanitizedCanvasDraft.libraryAssets || []).map((asset) => ({
        ...asset,
        type: "library",
        label: asset.itemName,
      })),
    ].map(({ id, type, role, label, x, y, width, height }) => ({
      id,
      type,
      role,
      label,
      x,
      y,
      width,
      height,
    })),
    connectors: sanitizedCanvasDraft.connectors.map(
      ({ id, from, to, role, label }) => ({
        id,
        from,
        to,
        role,
        label,
      }),
    ),
    ...(directorPlan
      ? {
          lockedStoryPlan: {
            durationMs: directorPlan.durationMs,
            rationale: directorPlan.rationale,
            directionSummary: directorPlan.directionSummary,
            style: directorPlan.style,
            scenes: directorPlan.scenes,
            lifecycles: lifecycleContract,
          },
        }
      : {}),
  };
  const lockedStoryPlanPrompt = directorPlan
    ? `\n\n当前 Story Director Plan 已冻结。你不能调用风格或场景规划工具，也不能改变总时长、scene startMs/durationMs、beatId、focusTargets、Camera、章节转场或元素归属。你只负责逐场景规划具体 Object Cue。lockedStoryPlan.lifecycles 是强制生命周期合同：enterTargetIds 必须有 enter/draw 动画，exitTargetIds 必须有带真实运动过程的 exit 动画，persistentTargetIds 不得退场。exit 必须先完成 fade/slide/scale/pop 等退场过程，最后才由 Compiler 写入 visibility:hidden。每个场景调用一次 define_scene_cues，最后调用 finalize_animation_plan。`
    : "";
  const agent = new Agent({
    initialState: {
      systemPrompt: `${ANIMATION_AGENT_SYSTEM_PROMPT}${lockedStoryPlanPrompt}`,
      model,
      thinkingLevel,
      tools: createAnimationPlannerTools(sanitizedCanvasDraft, state, {
        lockStoryPlan: Boolean(directorPlan),
      }) as AgentState["tools"],
      messages: [],
    },
    streamFn: models.streamSimple.bind(models),
    sessionId: `${sessionId}:animation`,
    toolExecution: "sequential",
  });
  if (onEvent) {
    agent.subscribe(onEvent);
  }
  const abort = () => agent.abort();
  signal?.addEventListener("abort", abort, { once: true });
  try {
    await agent.prompt(
      `请为下面已经冻结的画布草稿规划 StoryAnimationPlan。不要直接编写 AnimationProject 或关键帧。全程只使用简体中文进行自然语言说明，不要输出英文过程旁白。\n\n动画要求：${JSON.stringify(
        directorPlan || brief,
      )}\n\n动画规划上下文：${JSON.stringify(animationContext)}`,
    );
  } finally {
    signal?.removeEventListener("abort", abort);
  }
  if (!state.finalized || !state.compiledDraft) {
    const lastToolError = [...agent.state.messages]
      .reverse()
      .find(
        (message): message is ToolResultMessage =>
          message.role === "toolResult" && message.isError,
      );
    const errorDetail = lastToolError?.content
      ?.map((item) => (item.type === "text" ? item.text : ""))
      .join(" ")
      .trim();
    throw new Error(
      errorDetail
        ? `动画子智能体未完成动画计划：${errorDetail}`
        : "动画子智能体未完成动画计划：未调用 finalize_animation_plan",
    );
  }
  return state.compiledDraft;
};
