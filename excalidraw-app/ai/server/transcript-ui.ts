import type { AgentMessage } from "@earendil-works/pi-agent-core";
import type {
  AssistantMessage,
  ToolResultMessage,
} from "@earendil-works/pi-ai";
import type { StoryArtifact } from "../../../src/ai/story/types.ts";

export const TASK_PLAN_STEPS = Object.freeze([
  { id: "story", label: "规划故事结构与章节空间" },
  { id: "director-plan", label: "冻结完整故事、场景、镜头与动作 DSL" },
  { id: "canvas-content", label: "准备画布元素与视觉资源" },
  { id: "canvas-layout", label: "完成画布布局与业务关系" },
  { id: "canvas-freeze", label: "校验并冻结画布草稿" },
  { id: "animation-compile", label: "编译动画并生成可播放成品" },
] as const);

export type TaskPlanStepId = typeof TASK_PLAN_STEPS[number]["id"];
export type TaskPlanStatus = "pending" | "running" | "completed";

export const MAX_UI_REASONING_CHARS = 12_000;
export const REASONING_TRUNCATED_SUFFIX = "\n\n（思考过程过长，已截断显示）";
const EMOJI_SEQUENCE_PATTERN =
  /(?:\p{Regional_Indicator}{2}|[#*0-9]\uFE0F?\u20E3|\p{Extended_Pictographic}(?:\uFE0F|\uFE0E)?(?:\p{Emoji_Modifier})?(?:\u200D\p{Extended_Pictographic}(?:\uFE0F|\uFE0E)?(?:\p{Emoji_Modifier})?)*(?:[\u{E0020}-\u{E007E}]+\u{E007F})?)/gu;

export const stripEmoji = (value: unknown): string =>
  String(value || "")
    .replace(EMOJI_SEQUENCE_PATTERN, "")
    .replace(
      /(?:\p{Regional_Indicator}|\p{Emoji_Modifier}|[\u20E3\uFE0E\uFE0F\u200D]|[\u{E0020}-\u{E007F}])/gu,
      "",
    );

export const limitUiReasoning = (value: unknown): string => {
  const text = stripEmoji(value).trim();
  return text.length > MAX_UI_REASONING_CHARS
    ? `${text.slice(0, MAX_UI_REASONING_CHARS)}${REASONING_TRUNCATED_SUFFIX}`
    : text;
};

export const taskPlanSnapshot = (
  title?: string,
  statuses: ReadonlyMap<TaskPlanStepId, TaskPlanStatus> = new Map(),
) => ({
  title: title || "故事画布创作计划",
  items: TASK_PLAN_STEPS.map((item) => ({
    ...item,
    status: statuses.get(item.id) || "pending",
  })),
});

type TranscriptTextPart =
  | { type: "text"; text: string }
  | { type: "reasoning"; text: string; state: "done" };

type DynamicToolPart = {
  type: "dynamic-tool";
  toolCallId: string;
  toolName: string;
  input: unknown;
  state: "input-available" | "output-error" | "output-available";
  errorText?: string;
  output?: unknown;
};

type UiPart =
  | TranscriptTextPart
  | DynamicToolPart
  | { type: "data-agent-note"; id: string; data: { text: string } }
  | { type: "data-task-plan"; data: ReturnType<typeof taskPlanSnapshot> };

export type HistoryUiMessage = {
  id: string;
  role: "user" | "assistant";
  parts: UiPart[];
};

type ToolCall = Extract<
  AssistantMessage["content"][number],
  { type: "toolCall" }
>;

type TranscriptRun = {
  reasoning: string[];
  notes: string[];
  tools: DynamicToolPart[];
  latestText: string;
  finalText: string;
  artifact: StoryArtifact | null;
};

const isStoryArtifact = (value: unknown): value is StoryArtifact =>
  typeof value === "object" &&
  value !== null &&
  "kind" in value &&
  value.kind === "story-artifact" &&
  "canvas" in value;

const messageId = (message: AgentMessage, fallback: string): string =>
  "id" in message && typeof message.id === "string" ? message.id : fallback;

const transcriptTextParts = (message: AgentMessage): TranscriptTextPart[] => {
  if (!("content" in message)) {
    return [];
  }
  const content = message.content;
  if (typeof content === "string") {
    return content.trim() ? [{ type: "text", text: content.trim() }] : [];
  }
  if (!Array.isArray(content)) {
    return [];
  }
  return content.flatMap((item): TranscriptTextPart[] => {
    if (item.type === "text" && String(item.text || "").trim()) {
      return [{ type: "text", text: String(item.text).trim() }];
    }
    if (item.type === "thinking" && String(item.thinking || "").trim()) {
      return [
        {
          type: "reasoning",
          text: limitUiReasoning(item.thinking),
          state: "done",
        },
      ];
    }
    return [];
  });
};

const transcriptToolResults = (transcript: AgentMessage[]) =>
  new Map<string, ToolResultMessage>(
    transcript.flatMap((message) =>
      message.role === "toolResult" && message.toolCallId
        ? [[message.toolCallId, message]]
        : [],
    ),
  );

const transcriptToolPart = (
  toolCall: ToolCall,
  toolResults: ReadonlyMap<string, ToolResultMessage>,
): DynamicToolPart => {
  const result = toolResults.get(toolCall.id);
  const base = {
    type: "dynamic-tool" as const,
    toolCallId: toolCall.id,
    toolName: toolCall.name,
    input: toolCall.arguments || {},
  };
  if (!result) {
    return { ...base, state: "input-available" };
  }
  const resultText = result.content
    .map((item) => (item.type === "text" ? item.text : ""))
    .join(" ")
    .trim();
  return result.isError
    ? {
        ...base,
        state: "output-error",
        errorText: resultText || "工具执行失败",
      }
    : {
        ...base,
        state: "output-available",
        output: result.details ?? { content: result.content },
      };
};

export const transcriptToUiMessages = (
  transcript: AgentMessage[],
): HistoryUiMessage[] => {
  const messages: HistoryUiMessage[] = [];
  const toolResults = transcriptToolResults(transcript);
  let run: TranscriptRun | null = null;
  let runSequence = 0;

  const emptyRun = (): TranscriptRun => ({
    reasoning: [],
    notes: [],
    tools: [],
    latestText: "",
    finalText: "",
    artifact: null,
  });

  const flushRun = () => {
    if (!run) {
      return;
    }
    const currentRun = run;
    const reasoning = limitUiReasoning(currentRun.reasoning.join("\n\n"));
    const finalText =
      currentRun.finalText ||
      (currentRun.artifact?.canvas ? "故事画布和动画已生成完成。" : "");
    const parts: UiPart[] = [
      ...(reasoning
        ? [
            {
              type: "reasoning" as const,
              text: reasoning,
              state: "done" as const,
            },
          ]
        : []),
      ...currentRun.notes.map((text, index) => ({
        type: "data-agent-note" as const,
        id: `history-note-${runSequence}-${index}`,
        data: { text },
      })),
      ...currentRun.tools,
      ...(finalText ? [{ type: "text" as const, text: finalText }] : []),
    ];
    if (currentRun.artifact?.canvas) {
      const completed = new Map<TaskPlanStepId, TaskPlanStatus>(
        TASK_PLAN_STEPS.map((item) => [item.id, "completed"]),
      );
      parts.push({
        type: "data-task-plan",
        data: taskPlanSnapshot(
          currentRun.artifact.canvas.title
            ? `《${currentRun.artifact.canvas.title}》创作计划`
            : undefined,
          completed,
        ),
      });
    }
    if (parts.length > 0) {
      messages.push({
        id: `history-run-${runSequence++}`,
        role: "assistant",
        parts,
      });
    }
    run = null;
  };

  transcript.forEach((message, index) => {
    if (message.role === "user") {
      flushRun();
      const parts = transcriptTextParts(message).filter(
        (part): part is Extract<TranscriptTextPart, { type: "text" }> =>
          part.type === "text",
      );
      if (parts.length > 0) {
        messages.push({
          id: messageId(message, `history-user-${index}`),
          role: "user",
          parts,
        });
      }
      run = emptyRun();
      return;
    }
    if (
      message.role === "toolResult" &&
      isStoryArtifact(message.details) &&
      run
    ) {
      run.artifact = message.details;
    }
    if (message.role !== "assistant") {
      return;
    }
    run ||= emptyRun();
    const currentRun = run;
    const hasToolCall = message.content.some(
      (item) => item.type === "toolCall",
    );
    message.content.forEach((item) => {
      if (item.type === "thinking" && String(item.thinking || "").trim()) {
        currentRun.reasoning.push(stripEmoji(item.thinking).trim());
      } else if (item.type === "text" && String(item.text || "").trim()) {
        currentRun.latestText = stripEmoji(item.text).trim();
        if (!hasToolCall) {
          currentRun.finalText = currentRun.latestText;
        } else {
          currentRun.notes.push(currentRun.latestText);
        }
      } else if (item.type === "toolCall") {
        currentRun.tools.push(transcriptToolPart(item, toolResults));
      }
    });
  });
  flushRun();
  return messages;
};
