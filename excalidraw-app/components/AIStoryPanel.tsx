import {
  CaptureUpdateAction,
  convertToExcalidrawElements,
} from "@excalidraw/element";
import { useExcalidrawAPI } from "@excalidraw/excalidraw/components/App";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport, isToolUIPart, type UIMessage } from "ai";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowUp, ChevronDown, MessageCircle, Square, X } from "lucide-react";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";

import { animationWorkspace } from "../../src/animation/inspector";
import {
  compileStoryArtifact,
  parseStoryArtifact,
  type StoryArtifact,
} from "../../src/ai/story";
import {
  consumePendingAiCreatePrompt,
  getPendingAiThinkingEnabled,
} from "../ai/pendingPrompt";
import { mergeStoryAnimationProject } from "../ai/storyAnimationProject";
import { getWorkspaceFileIdFromPath } from "../workspace/editorRoute";

import { Button } from "./ui/button";
import { Textarea } from "./ui/textarea";
import { BearIcon } from "./BearIcon";

import "./AIStoryPanel.scss";

type StoryChatMessage = UIMessage<
  unknown,
  {
    story: StoryArtifact;
    "agent-status": {
      phase: string;
      label: string;
      startedAt?: string;
      elapsedMs?: number;
    };
    "task-plan": TaskPlanData;
  }
>;
type StoryMessagePart = StoryChatMessage["parts"][number];

type TaskPlanItem = {
  id: string;
  label: string;
  status: "pending" | "running" | "completed";
};

type TaskPlanData = {
  title: string;
  items: TaskPlanItem[];
};

const getThreadId = (workspaceFileId: string) => {
  const key = `excalidraw-ai-thread:${workspaceFileId}`;
  const existing = window.localStorage.getItem(key);
  if (existing) {
    return existing;
  }
  const id = window.crypto.randomUUID();
  window.localStorage.setItem(key, id);
  return id;
};

const messageText = (message: StoryChatMessage) =>
  message.parts
    .filter((part) => part.type === "text")
    .map((part) => part.text)
    .join("");

const messageReasoning = (message: StoryChatMessage) =>
  message.parts
    .filter((part) => part.type === "reasoning")
    .map((part) => part.text)
    .join("\n\n")
    .trim();

const messageHasStreamingReasoning = (message: StoryChatMessage) =>
  message.parts.some(
    (part) => part.type === "reasoning" && part.state === "streaming",
  );

const messageStepSegments = (message: StoryChatMessage): StoryChatMessage[] => {
  if (message.role !== "assistant") {
    return [message];
  }

  const segmentParts: StoryMessagePart[][] = [[]];
  message.parts.forEach((part) => {
    if (part.type === "step-start") {
      if (segmentParts[segmentParts.length - 1].length > 0) {
        segmentParts.push([]);
      }
      return;
    }
    segmentParts[segmentParts.length - 1].push(part);
  });

  return segmentParts
    .filter((parts) => parts.length > 0)
    .map((parts, index) => ({
      ...message,
      id: `${message.id}:step:${index}`,
      parts,
    }));
};

const taskPlanFromPart = (part: StoryMessagePart): TaskPlanData | null => {
  if (part.type !== "data-task-plan") {
    return null;
  }
  return part.data;
};

const AssistantMarkdown = ({ children }: { children: string }) => (
  <div className="ai-assistant-prose">
    <Markdown remarkPlugins={[remarkGfm]}>{children}</Markdown>
  </div>
);

const asRecord = (value: unknown): Record<string, any> =>
  value && typeof value === "object" ? (value as Record<string, any>) : {};

const readableProgressError = (rawError: string) => {
  if (rawError.startsWith("Validation failed for tool")) {
    return rawError.includes("animationBrief")
      ? "动画简报参数格式不正确，PiAgent 将调整后重试"
      : "工具参数格式不正确，PiAgent 将调整后重试";
  }
  const receivedArgumentsIndex = rawError.indexOf("Received arguments:");
  const conciseError =
    receivedArgumentsIndex >= 0
      ? rawError.slice(0, receivedArgumentsIndex).trim()
      : rawError;
  return conciseError.length > 300
    ? `${conciseError.slice(0, 300)}…`
    : conciseError;
};

const archivedProgressLabel = (label: string) =>
  label
    .replace(/^PiAgent 正在/, "已完成：")
    .replace(/^动画子 Agent 正在/, "已完成：")
    .replace(/^正在/, "已完成：");

const currentAiCanvasState = (
  excalidrawAPI: ReturnType<typeof useExcalidrawAPI>,
) => {
  if (!excalidrawAPI) {
    return null;
  }
  const elements = new Map<string, Record<string, unknown>>();
  let storyId: string | undefined;
  excalidrawAPI.getSceneElements().forEach((element) => {
    const aiStory = element.customData?.aiStory as
      | {
          storyId?: string;
          semanticId?: string;
          kind?: string;
        }
      | undefined;
    if (
      !aiStory?.semanticId ||
      (aiStory.kind !== "shape" && aiStory.kind !== "text")
    ) {
      return;
    }
    storyId = aiStory.storyId || storyId;
    elements.set(aiStory.semanticId, {
      elementId: aiStory.semanticId,
      x: element.x,
      y: element.y,
      width: element.width,
      height: element.height,
      ...(element.type === "text" ? { label: element.text } : {}),
      style: {
        strokeColor: element.strokeColor,
        backgroundColor: element.backgroundColor,
        fillStyle: element.fillStyle,
        strokeWidth: element.strokeWidth,
        roughness: element.roughness,
        opacity: element.opacity,
        ...(element.type === "text"
          ? {
              fontSize: element.fontSize,
              textAlign: element.textAlign,
            }
          : {}),
      },
    });
  });
  return storyId && elements.size
    ? { storyId, elements: Array.from(elements.values()).slice(0, 500) }
    : null;
};

const formatElapsedTime = (elapsedMs: number) => {
  const totalSeconds = Math.max(0, Math.floor(elapsedMs / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return minutes > 0
    ? `${minutes}m ${String(seconds).padStart(2, "0")}s`
    : `${seconds}s`;
};

const useElapsedTime = ({
  startedAt,
  elapsedMs,
  running,
}: {
  startedAt?: string;
  elapsedMs?: number;
  running: boolean;
}) => {
  const startedAtMs = startedAt ? Date.parse(startedAt) : Number.NaN;
  const [currentElapsedMs, setCurrentElapsedMs] = useState(
    elapsedMs ?? (Number.isFinite(startedAtMs) ? Date.now() - startedAtMs : 0),
  );

  useEffect(() => {
    if (!running) {
      if (elapsedMs !== undefined) {
        setCurrentElapsedMs(elapsedMs);
      }
      return;
    }
    const update = () => {
      setCurrentElapsedMs(
        Number.isFinite(startedAtMs) ? Date.now() - startedAtMs : 0,
      );
    };
    update();
    const timer = window.setInterval(update, 1000);
    return () => window.clearInterval(timer);
  }, [elapsedMs, running, startedAtMs]);

  return formatElapsedTime(currentElapsedMs);
};

const describeCanvasTool = (
  toolName: string,
  rawInput: unknown,
  completed: boolean,
) => {
  const input = asRecord(rawInput);
  const prefix = completed ? "已完成" : "正在执行";
  if (toolName === "define_story") {
    return `${prefix}：规划故事《${input.title || "未命名"}》的 ${
      input.beats?.length || 0
    } 个节拍`;
  }
  if (toolName === "add_canvas_elements") {
    const elements = Array.isArray(input.elements) ? input.elements : [];
    const labels = elements
      .map((element) => element.label || element.role || element.id)
      .filter(Boolean)
      .slice(0, 3)
      .join("、");
    return `${prefix}：添加 ${elements.length} 个画布元素${
      labels ? `（${labels}${elements.length > 3 ? "…" : ""}）` : ""
    }`;
  }
  if (toolName === "update_element_styles") {
    return `${prefix}：设置 ${
      input.updates?.length || 0
    } 个元素的颜色、描边和排版样式`;
  }
  if (toolName === "layout_canvas_elements") {
    const direction =
      { horizontal: "横向", vertical: "纵向", grid: "网格" }[
        input.direction as string
      ] || input.direction;
    return `${prefix}：按${direction || "指定"}布局排列 ${
      input.elementIds?.length || 0
    } 个元素`;
  }
  if (toolName === "connect_canvas_elements") {
    return `${prefix}：建立 ${input.connectors?.length || 0} 条元素连接关系`;
  }
  if (toolName === "finalize_canvas_draft") {
    const duration = input.animationBrief?.preferredDurationMs;
    return completed
      ? "画布 Draft 已校验并冻结"
      : `正在校验画布 Draft，并生成动画简报${
          duration ? `（建议 ${duration / 1000}s）` : ""
        }`;
  }
  if (toolName === "delegate_animation") {
    return completed
      ? "动画子 Agent 已返回完整时间轴"
      : "正在把冻结的画布 Draft 委派给动画子 Agent";
  }
  return `${prefix}：${toolName}`;
};

type ProgressItem = {
  tone: "done" | "error" | "running" | "warning";
  label: string;
  startedAt?: string;
  elapsedMs?: number;
};

const agentProgress = (part: StoryMessagePart): ProgressItem | null => {
  if (part.type === "data-agent-status") {
    const phase = part.data.phase;
    return {
      tone:
        phase === "completed" || phase.endsWith("-done")
          ? "done"
          : phase === "failed" || phase.endsWith("-error")
          ? "error"
          : "running",
      label: part.data.label,
      startedAt: part.data.startedAt,
      elapsedMs: part.data.elapsedMs,
    };
  }
  if (!isToolUIPart(part)) {
    return null;
  }
  if (part.state === "output-error") {
    const errorText = readableProgressError(part.errorText || "AI 创建失败");
    const isRecoverableLayoutValidation =
      errorText.includes("节点净距") && errorText.includes("重新布局");
    return {
      tone: isRecoverableLayoutValidation ? "warning" : "error",
      label: isRecoverableLayoutValidation
        ? `连接线布局需调整：${errorText}`
        : errorText,
    };
  }
  const toolPart = part as typeof part & {
    toolName?: string;
    input?: unknown;
  };
  const toolName =
    toolPart.toolName ||
    (part.type.startsWith("tool-") ? part.type.slice("tool-".length) : "tool");
  if (part.state === "output-available") {
    return {
      tone: "done",
      label: describeCanvasTool(toolName, toolPart.input, true),
    };
  }
  return {
    tone: "running",
    label: describeCanvasTool(toolName, toolPart.input, false),
  };
};

const PanelIcon = ({
  name,
  size = 16,
}: {
  name: "panel" | "chat" | "close" | "arrow" | "down" | "stop";
  size?: number;
}) => {
  if (name === "panel") {
    return <BearIcon aria-hidden="true" size={size} />;
  }

  const icons = {
    chat: MessageCircle,
    close: X,
    arrow: ArrowUp,
    down: ChevronDown,
    stop: Square,
  } as const;
  const GenericIcon = icons[name];

  return <GenericIcon aria-hidden="true" size={size} strokeWidth={1.8} />;
};

const AgentMark = ({ thinking = false }: { thinking?: boolean }) => {
  return (
    <BearIcon
      aria-hidden="true"
      className={`ai-agent-mark ${thinking ? "is-thinking" : "is-normal"}`}
      variant={thinking ? "thinking" : "normal"}
    />
  );
};

const TaskPlanPanel = ({ plan }: { plan: TaskPlanData }) => {
  const [open, setOpen] = useState(false);
  const isComplete = plan.items.every((item) => item.status === "completed");
  const totalTaskCount = plan.items.length;
  const completedTaskCount = plan.items.filter(
    (item) => item.status === "completed",
  ).length;

  return (
    <section
      className={`ai-plan-panel${open ? " is-open" : ""}${
        isComplete ? " is-complete" : ""
      }`}
      aria-label="任务计划"
    >
      <button
        type="button"
        className="ai-plan-panel__header"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      >
        <span className="ai-plan-panel__mark">
          {isComplete ? "✓" : <span className="ai-task-spinner" />}
        </span>
        <span className="ai-plan-panel__title">
          <strong>
            {totalTaskCount} of {completedTaskCount} 任务计划
          </strong>
        </span>
        <PanelIcon name="down" size={14} />
      </button>
      <div className="ai-plan-panel__collapse" aria-hidden={!open}>
        <ol className="ai-plan-list">
          {plan.items.map((item) => (
            <li className={`is-${item.status}`} key={item.id}>
              <span className="ai-plan-list__state" aria-hidden="true">
                {item.status === "completed" ? (
                  "✓"
                ) : item.status === "running" ? (
                  <span className="ai-task-spinner" />
                ) : (
                  ""
                )}
              </span>
              <span>{item.label}</span>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
};

const ThinkingDisclosure = ({
  text,
  streaming,
}: {
  text: string;
  streaming: boolean;
}) => {
  const [open, setOpen] = useState(streaming);
  const contentRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (streaming) {
      setOpen(true);
    }
  }, [streaming]);

  useEffect(() => {
    if (!open || !streaming || !contentRef.current) {
      return;
    }
    contentRef.current.scrollTop = contentRef.current.scrollHeight;
  }, [open, streaming, text]);

  if (!text) {
    return null;
  }

  return (
    <section
      className={`ai-thinking${open ? " is-open" : ""}${
        streaming ? " is-streaming" : ""
      }`}
    >
      <button
        type="button"
        className="ai-thinking__header"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      >
        <AgentMark thinking={streaming} />
        <span>{streaming ? "正在思考" : "查看思考过程"}</span>
        <PanelIcon name="down" size={13} />
      </button>
      <div className="ai-thinking__collapse" aria-hidden={!open}>
        <div ref={contentRef} className="ai-thinking__content">
          <Markdown remarkPlugins={[remarkGfm]}>{text}</Markdown>
        </div>
      </div>
    </section>
  );
};

const RunningElapsedTime = ({ startedAt }: { startedAt: number | null }) => {
  const elapsedTime = useElapsedTime({
    startedAt: startedAt ? new Date(startedAt).toISOString() : undefined,
    running: true,
  });
  return <span className="ai-running__elapsed">{elapsedTime}</span>;
};

const TaskActivity = ({
  items,
  active,
  fallbackStartedAt,
}: {
  items: ProgressItem[];
  active: boolean;
  fallbackStartedAt: number | null;
}) => {
  const latest = items.at(-1)!;
  const startedAt =
    [...items].reverse().find((item) => item.startedAt)?.startedAt ??
    (fallbackStartedAt ? new Date(fallbackStartedAt).toISOString() : undefined);
  const elapsedMs = [...items]
    .reverse()
    .find((item) => item.elapsedMs !== undefined)?.elapsedMs;
  const running = active;
  const elapsedTime = useElapsedTime({
    startedAt,
    elapsedMs,
    running,
  });
  const [open, setOpen] = useState(running);
  const activityBodyRef = useRef<HTMLDivElement>(null);
  const followLatestStepRef = useRef(true);

  useEffect(() => {
    if (running) {
      setOpen(true);
    }
  }, [running]);

  useEffect(() => {
    const activityBody = activityBodyRef.current;
    if (!open || !activityBody || !followLatestStepRef.current) {
      return;
    }
    activityBody.scrollTop = activityBody.scrollHeight;
  }, [items.length, open, running]);

  const updateActivityScrollState = () => {
    const activityBody = activityBodyRef.current;
    if (!activityBody) {
      return;
    }
    followLatestStepRef.current =
      activityBody.scrollHeight -
        activityBody.scrollTop -
        activityBody.clientHeight <
      24;
  };

  const stateLabel = running
    ? "运行中"
    : latest.tone === "error"
    ? "运行失败"
    : "完成";

  return (
    <div
      className={`ai-task-activity is-${running ? "running" : latest.tone}${
        open ? " is-open" : ""
      }`}
    >
      <button
        type="button"
        className="ai-task-activity__toggle"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      >
        <span className="ai-task-activity__state">
          {running ? <span className="ai-task-spinner" /> : <span>✦</span>}
        </span>
        <span className={running ? "ai-shimmer-text" : undefined}>
          {stateLabel}
        </span>
        <span className="ai-task-activity__elapsed">
          {running ? elapsedTime : `耗时 ${elapsedTime}`}
        </span>
        <PanelIcon name="down" size={13} />
      </button>
      <div className="ai-task-activity__collapse" aria-hidden={!open}>
        <div
          ref={activityBodyRef}
          className="ai-task-activity__body"
          onScroll={updateActivityScrollState}
        >
          <div className="ai-task-activity__caption">
            <span>执行过程</span>
            <span>{items.length} 条</span>
          </div>
          {items.map((item, index) => {
            const isCurrentStep =
              running && item.tone === "running" && index === items.length - 1;
            const displayTone =
              item.tone === "running" && !isCurrentStep ? "done" : item.tone;
            return (
              <div
                className={`ai-task-step is-${displayTone}`}
                key={`${item.label}-${index}`}
              >
                <span
                  className={
                    isCurrentStep ? "ai-task-step__spinner" : undefined
                  }
                />
                <p>
                  {item.tone === "running" && !isCurrentStep
                    ? archivedProgressLabel(item.label)
                    : item.label}
                </p>
              </div>
            );
          })}
          {running && latest.tone !== "running" && (
            <div className="ai-task-step is-agent-thinking" role="status">
              <AgentMark thinking />
              <p className="ai-shimmer-text">PiAgent 正在规划下一步…</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export const AIStoryPanel = ({ onClose }: { onClose?: () => void }) => {
  const excalidrawAPI = useExcalidrawAPI();
  const workspaceFileId = getWorkspaceFileIdFromPath();
  const threadId = useMemo(
    () => getThreadId(workspaceFileId || "local"),
    [workspaceFileId],
  );
  const [input, setInput] = useState("");
  const [historyLoaded, setHistoryLoaded] = useState(!workspaceFileId);
  const [scrolledFromBottom, setScrolledFromBottom] = useState(false);
  const [localRunStartedAt, setLocalRunStartedAt] = useState<number | null>(
    null,
  );
  const appliedArtifacts = useRef(new Set<string>());
  const messagesRef = useRef<HTMLDivElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const scrolledFromBottomRef = useRef(false);

  const applyArtifact = useCallback(
    (rawArtifact: unknown) => {
      if (!excalidrawAPI) {
        return;
      }
      const artifact = parseStoryArtifact(rawArtifact);
      if (appliedArtifacts.current.has(artifact.artifactId)) {
        return;
      }
      const compiled = compileStoryArtifact(artifact);
      const currentElements = excalidrawAPI.getSceneElementsIncludingDeleted();
      const replacedElementIds = new Set(
        currentElements
          // The editor owns one active AI story. A previous buggy edit could
          // generate a new storyId; replace all AI-owned scene elements so a
          // second story can never be appended over the first one.
          .filter((element) => Boolean(element.customData?.aiStory))
          .map((element) => element.id),
      );
      const nextElements = [
        ...currentElements.filter(
          (element) => !replacedElementIds.has(element.id),
        ),
        ...convertToExcalidrawElements(compiled.elements, {
          regenerateIds: false,
          snapBindingsToOutline: true,
        }),
      ];

      const currentProject = animationWorkspace.getSnapshot().project;
      const generatedElementIds = new Set(compiled.elementIds);
      const nextAnimationProject = mergeStoryAnimationProject({
        currentProject,
        compiledAnimation: compiled.animation,
        replacedElementIds,
        generatedElementIds,
      });
      const initialRuntimeStates: Record<
        string,
        {
          opacity?: number;
          drawProgress?: number;
          visibility?: "visible" | "hidden";
        }
      > = {};
      const sceneStartById = new Map(
        (compiled.animation.scenes ?? []).map((scene) => [
          scene.id,
          scene.startMs,
        ]),
      );
      compiled.animation.tracks.forEach((track) => {
        if (track.target.type !== "element") {
          return;
        }
        const state = (initialRuntimeStates[track.target.elementId] ??= {});
        const absoluteStartMs =
          (track.sceneId ? sceneStartById.get(track.sceneId) ?? 0 : 0) +
          (track.startMs ?? 0);
        const hasDelayedEntrance = track.presets?.some(
          (preset) =>
            preset.category === "entrance" && absoluteStartMs + preset.atMs > 0,
        );
        if (hasDelayedEntrance) {
          state.opacity = 0;
          state.visibility = "hidden";
        }
        const visibilityProperty = track.properties?.find(
          (property) => property.property === "element.visibility",
        );
        if (visibilityProperty?.keyframes[0]?.value === "hidden") {
          state.visibility = "hidden";
        }
        const drawProperty = track.properties?.find(
          (property) => property.property === "advanced.drawProgress",
        );
        if (drawProperty?.keyframes.length) {
          state.drawProgress = Number(drawProperty.keyframes[0].value);
        }
      });
      animationWorkspace.primeElementRuntimeStates(initialRuntimeStates);
      excalidrawAPI.updateScene({
        elements: nextElements,
        appState: { selectedElementIds: {} },
        captureUpdate: CaptureUpdateAction.IMMEDIATELY,
      });
      animationWorkspace.loadProject(nextAnimationProject, true, 0);
      // Only mark the artifact after the canvas and animation project have both
      // been accepted. A malformed legacy artifact can then be retried after a
      // hot fix instead of being silently skipped for the rest of the session.
      appliedArtifacts.current.add(artifact.artifactId);
      excalidrawAPI.setToast({
        message: `${artifact.summary}，已直接写入画布并开始播放`,
        duration: 4000,
      });
    },
    [excalidrawAPI],
  );

  const transport = useMemo(
    () =>
      new DefaultChatTransport<StoryChatMessage>({
        api: "/api/ai/chat",
        body: () => ({
          workspaceFileId,
          threadId,
          thinkingEnabled: getPendingAiThinkingEnabled(workspaceFileId),
          currentCanvasState: currentAiCanvasState(excalidrawAPI),
        }),
      }),
    [excalidrawAPI, threadId, workspaceFileId],
  );

  const { messages, sendMessage, setMessages, stop, status, error } =
    useChat<StoryChatMessage>({
      id: threadId,
      transport,
      experimental_throttle: 40,
      onData: (dataPart) => {
        if (dataPart.type === "data-story") {
          applyArtifact(dataPart.data);
        }
      },
    });

  useEffect(() => {
    if (!workspaceFileId) {
      setHistoryLoaded(true);
      return;
    }
    setHistoryLoaded(false);
    let cancelled = false;
    const controller = new AbortController();
    fetch(
      `/api/ai/history?workspaceFileId=${encodeURIComponent(
        workspaceFileId,
      )}&threadId=${encodeURIComponent(threadId)}`,
      { signal: controller.signal },
    )
      .then(async (response) => {
        if (!response.ok) {
          throw new Error("无法读取 AI 会话记录");
        }
        return response.json();
      })
      .then((data) => {
        if (!cancelled && Array.isArray(data.messages)) {
          setMessages(data.messages);
        }
      })
      .catch((loadError) => {
        if (
          loadError instanceof DOMException &&
          loadError.name === "AbortError"
        ) {
          return;
        }
        console.error(loadError);
      })
      .finally(() => {
        if (!cancelled) {
          setHistoryLoaded(true);
        }
      });
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [setMessages, threadId, workspaceFileId]);

  useEffect(() => {
    if (!historyLoaded || !workspaceFileId) {
      return;
    }
    const pendingPrompt = consumePendingAiCreatePrompt(workspaceFileId);
    if (!pendingPrompt) {
      return;
    }
    setInput("");
    void sendMessage({ text: pendingPrompt });
  }, [historyLoaded, sendMessage, workspaceFileId]);

  const isRunning = status === "submitted" || status === "streaming";
  const latestAssistantMessage = [...messages]
    .reverse()
    .find((message) => message.role === "assistant");
  const latestAssistantMessageId = latestAssistantMessage?.id;
  const latestTaskPlan = messages
    .flatMap((message) => message.parts.map(taskPlanFromPart))
    .filter((plan): plan is TaskPlanData => Boolean(plan))
    .at(-1);
  const hasActiveProgress = Boolean(
    latestAssistantMessage?.parts.some((part) => agentProgress(part)),
  );
  useEffect(() => {
    if (isRunning && localRunStartedAt === null) {
      setLocalRunStartedAt(Date.now());
    } else if (!isRunning && localRunStartedAt !== null) {
      setLocalRunStartedAt(null);
    }
  }, [isRunning, localRunStartedAt]);
  useEffect(() => {
    if (
      !scrolledFromBottomRef.current &&
      typeof messagesEndRef.current?.scrollIntoView === "function"
    ) {
      messagesEndRef.current.scrollIntoView({ block: "end" });
    }
  }, [messages, status, historyLoaded, error]);

  const updateScrollState = () => {
    const log = messagesRef.current;
    if (!log) {
      return;
    }
    const isAway = log.scrollHeight - log.scrollTop - log.clientHeight > 72;
    scrolledFromBottomRef.current = isAway;
    setScrolledFromBottom(isAway);
  };

  const scrollToLatest = () => {
    scrolledFromBottomRef.current = false;
    setScrolledFromBottom(false);
    messagesEndRef.current?.scrollIntoView({
      behavior: "smooth",
      block: "end",
    });
  };

  const stopRun = () => {
    stop();
    void fetch("/api/ai/stop", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ threadId }),
    });
  };

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    const prompt = input.trim();
    if (!prompt || isRunning || !workspaceFileId) {
      return;
    }
    setLocalRunStartedAt(Date.now());
    setInput("");
    void sendMessage({ text: prompt });
  };

  return (
    <section className="ai-story-panel flex h-full min-h-0 w-full flex-1 flex-col bg-background text-foreground">
      <header className="ai-panel-header flex min-h-14 shrink-0 items-center justify-between gap-3 border-b px-4">
        <div className="ai-panel-title">
          <PanelIcon name="panel" size={16} />
          <h2>故事画布</h2>
        </div>
        <div className="ai-panel-actions">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="ai-header-icon size-8"
            aria-label="会话信息"
            title="会话信息"
          >
            <PanelIcon name="chat" size={17} />
          </Button>
          {onClose && (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="ai-header-icon size-8"
              aria-label="关闭 AI 对话"
              title="关闭"
              onClick={onClose}
            >
              <PanelIcon name="close" size={16} />
            </Button>
          )}
        </div>
      </header>

      <div className="ai-chat-log-wrap">
        <div
          ref={messagesRef}
          className="ai-story-messages"
          aria-live="polite"
          onScroll={updateScrollState}
        >
          {!historyLoaded && (
            <div className="ai-panel-loading">正在载入 AI 会话…</div>
          )}
          {historyLoaded && messages.length === 0 && !isRunning && (
            <div className="ai-empty-state">
              <AgentMark />
              <strong>从一句话开始创建</strong>
              <span>
                描述完整故事，主 Agent 会先创建画布 Draft，再规划动画时间轴。
              </span>
            </div>
          )}
          {messages.flatMap((sourceMessage) =>
            messageStepSegments(sourceMessage).map((message) => {
              const text = messageText(message);
              const reasoning = messageReasoning(message);
              const progressParts = message.parts
                .map(agentProgress)
                .filter((part): part is ProgressItem => Boolean(part));
              if (!text && !reasoning && progressParts.length === 0) {
                return null;
              }
              if (message.role === "user") {
                return (
                  <article key={message.id} className="ai-msg ai-msg-user">
                    <div className="ai-message-context">✣&nbsp; 设计</div>
                    {text && <div className="ai-user-bubble">{text}</div>}
                  </article>
                );
              }
              return (
                <article key={message.id} className="ai-msg ai-msg-assistant">
                  <div className="ai-assistant-role">
                    <AgentMark />
                    <span>PiAgent</span>
                  </div>
                  <div className="ai-assistant-flow">
                    {reasoning && (
                      <ThinkingDisclosure
                        text={reasoning}
                        streaming={messageHasStreamingReasoning(message)}
                      />
                    )}
                    {progressParts.length > 0 && !reasoning && !text && (
                      <TaskActivity
                        items={progressParts}
                        active={
                          isRunning &&
                          sourceMessage.id === latestAssistantMessageId
                        }
                        fallbackStartedAt={localRunStartedAt}
                      />
                    )}
                    {text && <AssistantMarkdown>{text}</AssistantMarkdown>}
                  </div>
                </article>
              );
            }),
          )}
          {isRunning && !hasActiveProgress && (
            <div className="ai-running" role="status">
              <AgentMark thinking />
              <span className="ai-shimmer-text">PiAgent 正在执行</span>
              <RunningElapsedTime startedAt={localRunStartedAt} />
            </div>
          )}
          {error && <div className="ai-error">{error.message}</div>}
          <div ref={messagesEndRef} />
        </div>
        <button
          type="button"
          className={`ai-jump-latest${scrolledFromBottom ? " is-visible" : ""}`}
          tabIndex={scrolledFromBottom ? 0 : -1}
          aria-hidden={!scrolledFromBottom}
          onClick={scrollToLatest}
        >
          <PanelIcon name="down" size={14} />
          回到最新
        </button>
      </div>

      {latestTaskPlan && (
        <div className="ai-plan-panel-wrap">
          <TaskPlanPanel plan={latestTaskPlan} />
        </div>
      )}

      <form className="ai-composer" onSubmit={submit}>
        <div className="ai-composer-shell">
          <Textarea
            value={input}
            onChange={(event) => setInput(event.target.value)}
            placeholder={
              workspaceFileId
                ? "描述要创建的故事、画布内容和动画目标…"
                : "请先从 Workspace 打开一个画板"
            }
            disabled={!workspaceFileId || isRunning}
            rows={3}
            className="min-h-20 resize-none border-0 bg-transparent shadow-none focus-visible:ring-0"
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                event.currentTarget.form?.requestSubmit();
              }
            }}
          />
          <div className="ai-composer-toolbar">
            <span className="ai-composer-spacer" />
            <span className="ai-model-pill">
              <AgentMark />
              <i />
              <span>DeepSeek V4 Flash</span>
            </span>
            {isRunning ? (
              <button
                type="button"
                className="ai-send-button is-stop"
                onClick={stopRun}
                aria-label="停止"
              >
                <PanelIcon name="stop" size={16} />
              </button>
            ) : (
              <button
                type="submit"
                className="ai-send-button"
                disabled={!workspaceFileId || !input.trim()}
                aria-label="发送并创建"
              >
                <PanelIcon name="arrow" size={17} />
              </button>
            )}
          </div>
        </div>
      </form>
    </section>
  );
};
