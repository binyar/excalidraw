import { Agent } from "@earendil-works/pi-agent-core";

import { createEmptyAnimationPlan } from "./animation-plan.mjs";
import { createAnimationPlannerTools } from "./animation-planner-tools.mjs";
import { ANIMATION_AGENT_SYSTEM_PROMPT } from "./prompt.mjs";

export const runAnimationAgent = async ({
  canvasDraft,
  brief,
  models,
  model,
  sessionId,
  thinkingLevel = "off",
  signal,
  onEvent,
}) => {
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
  const state = createEmptyAnimationPlan();
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
  };
  const agent = new Agent({
    initialState: {
      systemPrompt: ANIMATION_AGENT_SYSTEM_PROMPT,
      model,
      thinkingLevel,
      tools: createAnimationPlannerTools(sanitizedCanvasDraft, state),
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
        brief,
      )}\n\n动画规划上下文：${JSON.stringify(animationContext)}`,
    );
  } finally {
    signal?.removeEventListener("abort", abort);
  }
  if (!state.finalized || !state.compiledDraft) {
    const lastToolError = [...agent.state.messages]
      .reverse()
      .find((message) => message.role === "toolResult" && message.isError);
    const errorDetail = lastToolError?.content
      ?.map((item) => item.text || "")
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
