import { randomUUID } from "node:crypto";

import { createUIMessageStream } from "ai";

import { buildStoryAgent } from "./agent-factory.ts";
import {
  MAX_UI_REASONING_CHARS,
  REASONING_TRUNCATED_SUFFIX,
  TASK_PLAN_STEPS,
  stripEmoji,
  taskPlanSnapshot,
} from "./transcript-ui.ts";

import type { DatabaseSync } from "node:sqlite";
import type {
  Agent,
  AgentEvent,
  AgentMessage,
  ThinkingLevel,
} from "@earendil-works/pi-agent-core";
import type { TaskPlanStatus, TaskPlanStepId } from "./transcript-ui.ts";

type TaskPlanUpdate = {
  complete?: TaskPlanStepId[];
  run?: TaskPlanStepId;
  title?: string;
};
type ReasoningStream = {
  id: string;
  forwardedChars: number;
  truncated: boolean;
};
type StatusOptions = { repeat?: boolean; completed?: boolean };

type StoryUiStreamOptions = {
  threadId: string;
  transcript: AgentMessage[];
  prompt: string;
  thinkingLevel: ThinkingLevel;
  currentCanvasState: unknown;
  assetSources: string[];
  enabledSkillIds: string[];
  database: DatabaseSync;
  now: () => string;
};

const activeAgents = new Map<string, Agent>();

export const stopActiveStoryAgent = (threadId: string): boolean => {
  const agent = activeAgents.get(threadId);
  agent?.abort();
  return Boolean(agent);
};

export const abortActiveStoryAgent = (threadId: string): void => {
  activeAgents.get(threadId)?.abort();
};

const readableToolError = (toolName: string, rawError: unknown) => {
  const errorText = String(rawError || "").trim();
  if (
    errorText.includes("hit the output token limit") ||
    errorText.includes("arguments may be truncated")
  ) {
    return "本次工具参数被模型输出上限截断，智能体正在拆分为更小的调用后重试";
  }
  if (errorText.startsWith("Validation failed for tool")) {
    const field = errorText.match(/^\s*-\s*([^:]+):/m)?.[1];
    return field
      ? `工具参数“${field}”格式不正确，智能体正在调整后重试`
      : "工具参数格式不正确，智能体正在调整后重试";
  }
  const receivedArgumentsIndex = errorText.indexOf("Received arguments:");
  const conciseError =
    receivedArgumentsIndex >= 0
      ? errorText.slice(0, receivedArgumentsIndex).trim()
      : errorText;
  return conciseError.length > 500
    ? `${conciseError.slice(0, 500)}…`
    : conciseError || "AI 创建失败";
};

export const createStoryUiStream = ({
  threadId,
  transcript,
  prompt,
  thinkingLevel,
  currentCanvasState,
  assetSources,
  enabledSkillIds,
  database: db,
  now,
}: StoryUiStreamOptions) =>
  createUIMessageStream({
    execute: async ({ writer }) => {
      const runStartedAtMs = Date.now();
      const runStartedAt = new Date(runStartedAtMs).toISOString();
      let textId: string | null = null;
      let pendingAssistantText = "";
      let latestAssistantText = "";
      let finalAssistantText = "";
      let agentNoteSequence = 0;
      let uiStepOpen = false;
      const startUiStep = () => {
        if (uiStepOpen) {
          return;
        }
        writer.write({ type: "start-step" });
        uiStepOpen = true;
      };
      const finishUiStep = () => {
        if (!uiStepOpen) {
          return;
        }
        writer.write({ type: "finish-step" });
        uiStepOpen = false;
      };
      const emittedStatuses = new Set<string>();
      let statusSequence = 0;
      const taskStatuses = new Map<TaskPlanStepId, TaskPlanStatus>();
      let taskPlanTitle = "故事画布创作计划";
      let taskPlanSequence = 0;
      const emitTaskPlan = () => {
        writer.write({
          type: "data-task-plan",
          id: `${threadId}:task-plan:${taskPlanSequence++}`,
          data: taskPlanSnapshot(taskPlanTitle, taskStatuses),
        });
      };
      const updateTaskPlan = ({
        complete = [],
        run,
        title,
      }: TaskPlanUpdate = {}) => {
        let changed = false;
        if (title && title !== taskPlanTitle) {
          taskPlanTitle = title;
          changed = true;
        }
        complete.forEach((id) => {
          if (taskStatuses.get(id) !== "completed") {
            taskStatuses.set(id, "completed");
            changed = true;
          }
        });
        if (
          run &&
          taskStatuses.get(run) !== "completed" &&
          taskStatuses.get(run) !== "running"
        ) {
          taskStatuses.set(run, "running");
          changed = true;
        }
        if (changed) {
          emitTaskPlan();
        }
      };
      const canvasTaskForTool = (toolName: string): TaskPlanStepId => {
        if (
          toolName === "define_story" ||
          toolName === "define_story_spaces" ||
          toolName === "define_canvas_sections"
        ) {
          return "story";
        }
        if (
          toolName === "layout_canvas_elements" ||
          toolName === "connect_canvas_elements"
        ) {
          return "canvas-layout";
        }
        if (toolName === "finalize_canvas_draft") {
          return "canvas-freeze";
        }
        if (
          toolName === "define_story_direction" ||
          toolName === "define_story_content" ||
          toolName === "define_story_scene" ||
          toolName === "finalize_story_plan"
        ) {
          return "director-plan";
        }
        if (toolName === "compile_story_artifact") {
          return "animation-compile";
        }
        return "canvas-content";
      };
      const reasoningStreams = new Map<string, ReasoningStream>();
      let reasoningSequence = 0;
      const forwardReasoning = (source: string, event: AgentEvent) => {
        if (thinkingLevel === "off" || event.type !== "message_update") {
          return;
        }
        const reasoningEvent = event.assistantMessageEvent;
        if (
          reasoningEvent.type !== "thinking_start" &&
          reasoningEvent.type !== "thinking_delta" &&
          reasoningEvent.type !== "thinking_end"
        ) {
          return;
        }
        const key = `${source}:${reasoningEvent.contentIndex}`;
        if (reasoningEvent.type === "thinking_start") {
          const id = `${threadId}:reasoning:${reasoningSequence++}`;
          reasoningStreams.set(key, {
            id,
            forwardedChars: 0,
            truncated: false,
          });
          writer.write({ type: "reasoning-start", id });
        } else if (reasoningEvent.type === "thinking_delta") {
          const stream = reasoningStreams.get(key);
          if (stream && !stream.truncated) {
            const delta = stripEmoji(reasoningEvent.delta);
            const remaining = Math.max(
              0,
              MAX_UI_REASONING_CHARS - stream.forwardedChars,
            );
            const forwardedDelta = delta.slice(0, remaining);
            if (forwardedDelta) {
              writer.write({
                type: "reasoning-delta",
                id: stream.id,
                delta: forwardedDelta,
              });
              stream.forwardedChars += forwardedDelta.length;
            }
            if (delta.length > remaining) {
              writer.write({
                type: "reasoning-delta",
                id: stream.id,
                delta: REASONING_TRUNCATED_SUFFIX,
              });
              stream.truncated = true;
            }
          }
        } else if (reasoningEvent.type === "thinking_end") {
          const stream = reasoningStreams.get(key);
          if (stream) {
            writer.write({
              type: "reasoning-end",
              id: stream.id,
            });
            reasoningStreams.delete(key);
          }
        }
      };
      const finishReasoning = () => {
        reasoningStreams.forEach((stream) =>
          writer.write({ type: "reasoning-end", id: stream.id }),
        );
        reasoningStreams.clear();
      };
      const emitStatus = (
        phase: string,
        label: string,
        { repeat = false, completed = false }: StatusOptions = {},
      ) => {
        if (!repeat && emittedStatuses.has(phase)) {
          return;
        }
        emittedStatuses.add(phase);
        writer.write({
          type: "data-agent-status",
          id: `${threadId}:${phase}:${statusSequence++}`,
          data: {
            phase,
            label,
            startedAt: runStartedAt,
            ...(completed
              ? { elapsedMs: Math.max(0, Date.now() - runStartedAtMs) }
              : {}),
          },
        });
      };
      const finishText = () => {
        if (textId) {
          writer.write({ type: "text-end", id: textId });
          textId = null;
        }
      };
      const emitFinalText = () => {
        const assistantText = stripEmoji(
          finalAssistantText || latestAssistantText,
        ).trim();
        const chineseCharacterCount =
          assistantText.match(/[\u3400-\u9fff]/g)?.length || 0;
        const latinCharacterCount =
          assistantText.match(/[A-Za-z]/g)?.length || 0;
        const displayText =
          !assistantText ||
          chineseCharacterCount === 0 ||
          latinCharacterCount > Math.max(24, chineseCharacterCount / 2)
            ? "故事画布和动画已生成完成。"
            : assistantText;
        textId = randomUUID();
        writer.write({ type: "text-start", id: textId });
        writer.write({ type: "text-delta", id: textId, delta: displayText });
        finishText();
      };
      const agent = buildStoryAgent({
        transcript,
        threadId,
        thinkingLevel,
        currentCanvasState,
        assetSources,
        enabledSkillIds,
        onEvent: (event) => {
          forwardReasoning("main", event);
          if (event.type === "agent_start") {
            startUiStep();
            emitStatus("started", "已接收需求，智能体开始执行");
          } else if (event.type === "turn_start") {
            emitStatus("planning", "正在规划故事结构和画布内容");
          } else if (
            event.type === "message_update" &&
            event.assistantMessageEvent.type === "text_delta"
          ) {
            pendingAssistantText += event.assistantMessageEvent.delta;
          } else if (
            event.type === "message_update" &&
            event.assistantMessageEvent.type === "thinking_start"
          ) {
            emitStatus("reasoning", "正在拆解故事节拍、元素和视觉层级");
          } else if (
            event.type === "message_update" &&
            event.assistantMessageEvent.type === "toolcall_start"
          ) {
            emitStatus("toolcall", "正在执行故事 DSL 或画布编译工具");
          } else if (
            event.type === "message_end" &&
            event.message.role === "assistant"
          ) {
            const assistantText = stripEmoji(pendingAssistantText).trim();
            pendingAssistantText = "";
            if (assistantText) {
              latestAssistantText = assistantText;
              const hasToolCall = event.message.content?.some(
                (item) => item.type === "toolCall",
              );
              if (!hasToolCall) {
                finalAssistantText = assistantText;
              } else {
                writer.write({
                  type: "data-agent-note",
                  id: `${threadId}:agent-note:${agentNoteSequence++}`,
                  data: { text: assistantText },
                });
              }
            }
          } else if (event.type === "tool_execution_start") {
            const taskId = canvasTaskForTool(event.toolName);
            const completedBefore: TaskPlanStepId[] = [];
            if (taskId === "canvas-content") {
              completedBefore.push("story", "director-plan");
            } else if (taskId === "canvas-layout") {
              completedBefore.push("story", "director-plan", "canvas-content");
            } else if (taskId === "canvas-freeze") {
              completedBefore.push(
                "story",
                "director-plan",
                "canvas-content",
                "canvas-layout",
              );
            } else if (taskId === "director-plan") {
              completedBefore.push("story");
            } else if (taskId === "animation-compile") {
              completedBefore.push(
                "story",
                "director-plan",
                "canvas-content",
                "canvas-layout",
                "canvas-freeze",
              );
            }
            updateTaskPlan({
              complete: completedBefore,
              run: taskId,
              ...(event.toolName === "define_story" && event.args?.title
                ? { title: `《${event.args.title}》创作计划` }
                : {}),
            });
            const isLibrarySearch = event.toolName === "search_library_assets";
            const isLibraryAdd = event.toolName === "add_library_assets";
            writer.write({
              type: "tool-input-available",
              toolCallId: event.toolCallId,
              toolName: event.toolName,
              input: event.args,
              title:
                event.toolName === "compile_story_artifact"
                  ? "动画子智能体正在规划元素生命周期"
                  : isLibrarySearch
                  ? "正在检索 Excalidraw 资源库"
                  : isLibraryAdd
                  ? "正在把资源库条目加入画布草稿"
                  : "正在构建故事画布草稿",
            });
          } else if (event.type === "tool_execution_end") {
            const toolErrorText = event.result?.content
              ?.map((item: { text?: string }) => item.text || "")
              .join(" ")
              .trim();
            const displayErrorText = readableToolError(
              event.toolName,
              toolErrorText,
            );
            if (event.isError) {
              writer.write({
                type: "tool-output-error",
                toolCallId: event.toolCallId,
                errorText: displayErrorText,
              });
            } else {
              writer.write({
                type: "tool-output-available",
                toolCallId: event.toolCallId,
                output: event.result?.details ?? event.result,
              });
            }
            if (
              !event.isError &&
              event.result?.details?.kind === "story-artifact"
            ) {
              writer.write({
                type: "data-story",
                id: event.result.details.artifactId,
                data: event.result.details,
              });
            }
          }
        },
        onAnimationEvent: (event) => {
          forwardReasoning("animation", event);
          if (event.type === "agent_start") {
            emitStatus(
              "animation-agent-started",
              "动画子智能体开始规划元素动作",
            );
          } else if (event.type === "turn_start") {
            emitStatus(
              "animation-agent-planning",
              "正在按冻结脚本规划入场、场内动作和退场动画",
            );
          }
        },
      });
      activeAgents.set(threadId, agent);
      try {
        taskStatuses.set("story", "running");
        emitTaskPlan();
        emitStatus("queued", "请求已提交到智能体");
        await agent.prompt(prompt);
        finishReasoning();
        updateTaskPlan({
          complete: TASK_PLAN_STEPS.map((item) => item.id),
        });
        emitStatus("completed", "智能体执行完成", { completed: true });
        emitFinalText();
        finishUiStep();
        db.prepare(
          "UPDATE ai_threads SET transcript_json = ?, updated_at = ? WHERE id = ?",
        ).run(JSON.stringify(agent.state.messages), now(), threadId);
      } catch (error) {
        finishText();
        finishReasoning();
        emitStatus("failed", "智能体执行失败", { completed: true });
        finishUiStep();
        throw error;
      } finally {
        finishText();
        finishReasoning();
        activeAgents.delete(threadId);
      }
    },
    onError: (error) =>
      error instanceof Error ? error.message : "AI 生成失败，请稍后重试",
  });
