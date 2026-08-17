import { randomUUID } from "node:crypto";

import { Agent } from "@earendil-works/pi-agent-core";
import { createModels } from "@earendil-works/pi-ai";
import { deepseekProvider } from "@earendil-works/pi-ai/providers/deepseek";
import { createUIMessageStream, pipeUIMessageStreamToResponse } from "ai";

import { runAnimationAgent } from "./animation-agent.mjs";
import { createCanvasDraftState, createCanvasTools } from "./canvas-tools.mjs";
import { STORY_AGENT_SYSTEM_PROMPT } from "./prompt.mjs";

const jsonHeaders = { "content-type": "application/json; charset=utf-8" };
const sendJson = (res, status, value) => {
  res.writeHead(status, jsonHeaders);
  res.end(JSON.stringify(value));
};

const readJson = async (req) => {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > 2 * 1024 * 1024) {
      throw Object.assign(new Error("消息内容过大"), { status: 413 });
    }
    chunks.push(chunk);
  }
  return chunks.length
    ? JSON.parse(Buffer.concat(chunks).toString("utf8"))
    : {};
};

const textFromUiMessage = (message) =>
  Array.isArray(message?.parts)
    ? message.parts
        .filter((part) => part?.type === "text")
        .map((part) => part.text)
        .join("\n")
        .trim()
    : String(message?.content || "").trim();

const getLastUserText = (messages) => {
  for (let index = messages.length - 1; index >= 0; index--) {
    if (messages[index]?.role === "user") {
      return textFromUiMessage(messages[index]);
    }
  }
  return "";
};

const contentText = (message) => {
  if (typeof message?.content === "string") {
    return message.content;
  }
  if (!Array.isArray(message?.content)) {
    return "";
  }
  return message.content
    .filter((item) => item?.type === "text")
    .map((item) => item.text)
    .join("")
    .trim();
};

const transcriptToUiMessages = (transcript) =>
  transcript.flatMap((message, index) => {
    if (message?.role !== "user" && message?.role !== "assistant") {
      return [];
    }
    const text = contentText(message);
    if (!text) {
      return [];
    }
    return [
      {
        id: message.id || `history-${index}`,
        role: message.role,
        parts: [{ type: "text", text }],
      },
    ];
  });

const safeTranscript = (value) => {
  try {
    const parsed = JSON.parse(value || "[]");
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

const activeAgents = new Map();

const readableToolError = (toolName, rawError) => {
  const errorText = String(rawError || "").trim();
  if (errorText.startsWith("Validation failed for tool")) {
    if (
      toolName === "finalize_canvas_draft" &&
      errorText.includes("animationBrief")
    ) {
      return "动画简报参数格式不正确，PiAgent 正在调整后重试";
    }
    const field = errorText.match(/^\s*-\s*([^:]+):/m)?.[1];
    return field
      ? `工具参数“${field}”格式不正确，PiAgent 正在调整后重试`
      : "工具参数格式不正确，PiAgent 正在调整后重试";
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

const latestStoryArtifact = (transcript) => {
  for (let index = transcript.length - 1; index >= 0; index -= 1) {
    const details = transcript[index]?.details;
    if (details?.kind === "story-artifact" && details?.canvas) {
      return details;
    }
  }
  return null;
};

const compactEditContext = (artifact) => {
  if (!artifact?.canvas) {
    return "";
  }
  const canvas = artifact.canvas;
  return JSON.stringify({
    id: canvas.id,
    title: canvas.title,
    summary: canvas.summary,
    beats: canvas.beats,
    elements: canvas.elements,
    libraryAssets: (canvas.libraryAssets || []).map((asset) => {
      const compactAsset = { ...asset };
      delete compactAsset.elements;
      return compactAsset;
    }),
    connectors: canvas.connectors,
    animation: artifact.animation
      ? {
          durationMs: artifact.animation.durationMs,
          summary: artifact.animation.summary,
          plan: artifact.animation.plan,
        }
      : undefined,
  });
};

const applyCurrentCanvasState = (artifact, currentCanvasState) => {
  if (
    !artifact?.canvas ||
    !currentCanvasState ||
    currentCanvasState.storyId !== artifact.canvas.id ||
    !Array.isArray(currentCanvasState.elements)
  ) {
    return artifact;
  }
  const overrides = new Map(
    currentCanvasState.elements
      .slice(0, 500)
      .flatMap((item) =>
        item && typeof item.elementId === "string"
          ? [[item.elementId, item]]
          : [],
      ),
  );
  const canvas = structuredClone(artifact.canvas);
  canvas.elements = canvas.elements.map((element) => {
    const override = overrides.get(element.id);
    if (!override) {
      return element;
    }
    const finite = (value, fallback) =>
      typeof value === "number" && Number.isFinite(value) ? value : fallback;
    return {
      ...element,
      ...(typeof override.label === "string" ? { label: override.label } : {}),
      x: finite(override.x, element.x),
      y: finite(override.y, element.y),
      width: Math.max(1, finite(override.width, element.width)),
      height: Math.max(1, finite(override.height, element.height)),
      ...(override.style && typeof override.style === "object"
        ? { style: { ...element.style, ...override.style } }
        : {}),
    };
  });
  return { ...artifact, canvas };
};

const buildAgent = ({
  transcript,
  threadId,
  currentCanvasState,
  onEvent,
  onAnimationEvent,
}) => {
  const { models, model } = getAgentModel();
  const existingArtifact = applyCurrentCanvasState(
    latestStoryArtifact(transcript),
    currentCanvasState,
  );
  const draftState = createCanvasDraftState(existingArtifact?.canvas);
  const editContext = compactEditContext(existingArtifact);
  const agent = new Agent({
    initialState: {
      systemPrompt: editContext
        ? `${STORY_AGENT_SYSTEM_PROMPT}\n\n当前是二次编辑，不是重新创建。以下是当前画布与动画的语义快照：\n${editContext}\n\n必须保留故事 id 和未被用户要求修改的内容、布局、资源与业务关系。修改已有基础元素必须调用 update_canvas_elements 并复用稳定语义 id；删除使用 remove_canvas_items；add_canvas_elements 仅用于用户明确要求的新内容。禁止另起一套平行故事。完成修改后重新冻结 Draft 并委派动画。`
        : STORY_AGENT_SYSTEM_PROMPT,
      model,
      thinkingLevel: "high",
      tools: createCanvasTools({
        state: draftState,
        animate: (canvasDraft, brief, signal) =>
          runAnimationAgent({
            canvasDraft,
            brief,
            models,
            model,
            sessionId: threadId,
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

export const handleAiRequest = async (
  req,
  res,
  { session, db, getFileRow, now },
) => {
  const url = new URL(req.url, "http://localhost");
  if (!url.pathname.startsWith("/api/ai")) {
    return false;
  }
  if (!session) {
    sendJson(res, 401, { error: "请先登录" });
    return true;
  }

  if (url.pathname === "/api/ai/stop" && req.method === "POST") {
    const body = await readJson(req);
    const agent = activeAgents.get(String(body.threadId || ""));
    agent?.abort();
    sendJson(res, 200, { stopped: Boolean(agent) });
    return true;
  }

  if (url.pathname === "/api/ai/history" && req.method === "GET") {
    const workspaceFileId = String(
      url.searchParams.get("workspaceFileId") || "",
    );
    const threadId = String(url.searchParams.get("threadId") || "");
    if (!workspaceFileId || !threadId || !getFileRow(workspaceFileId)) {
      sendJson(res, 400, { error: "AI 会话参数无效" });
      return true;
    }
    const row = db
      .prepare(
        "SELECT transcript_json FROM ai_threads WHERE id = ? AND workspace_file_id = ? AND username = ?",
      )
      .get(threadId, workspaceFileId, session.username);
    sendJson(res, 200, {
      messages: transcriptToUiMessages(safeTranscript(row?.transcript_json)),
    });
    return true;
  }

  if (url.pathname !== "/api/ai/chat" || req.method !== "POST") {
    sendJson(res, 404, { error: "接口不存在" });
    return true;
  }
  if (!process.env.DEEPSEEK_API_KEY && !process.env.DEEP_SEEK_API_KEY) {
    sendJson(res, 503, {
      error: "服务端尚未配置 DEEPSEEK_API_KEY 或 DEEP_SEEK_API_KEY",
    });
    return true;
  }

  try {
    const body = await readJson(req);
    const workspaceFileId = String(body.workspaceFileId || "");
    const threadId = String(body.threadId || "");
    if (!workspaceFileId || !getFileRow(workspaceFileId)) {
      throw Object.assign(new Error("当前画板未关联有效的 Workspace 文件"), {
        status: 400,
      });
    }
    if (!threadId || threadId.length > 120) {
      throw Object.assign(new Error("AI 会话 id 无效"), { status: 400 });
    }
    const prompt = getLastUserText(
      Array.isArray(body.messages) ? body.messages : [],
    );
    if (!prompt) {
      throw Object.assign(new Error("请输入故事画布需求"), { status: 400 });
    }

    const existing = db
      .prepare(
        "SELECT * FROM ai_threads WHERE id = ? AND workspace_file_id = ? AND username = ?",
      )
      .get(threadId, workspaceFileId, session.username);
    const transcript = safeTranscript(existing?.transcript_json);
    const timestamp = now();
    if (!existing) {
      db.prepare(
        "INSERT INTO ai_threads(id, workspace_file_id, username, transcript_json, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)",
      ).run(
        threadId,
        workspaceFileId,
        session.username,
        "[]",
        timestamp,
        timestamp,
      );
    }

    const stream = createUIMessageStream({
      execute: async ({ writer }) => {
        const runStartedAtMs = Date.now();
        const runStartedAt = new Date(runStartedAtMs).toISOString();
        let textId = null;
        const emittedStatuses = new Set();
        let statusSequence = 0;
        const emitStatus = (
          phase,
          label,
          { repeat = false, completed = false } = {},
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
        const animationToolLabel = (event, completed = false) => {
          const args = event.args || {};
          const suffix = completed ? "已完成" : "正在执行";
          if (event.toolName === "define_animation_style") {
            return completed
              ? `动画风格已定义为 ${args.tone || "natural"}/${
                  args.pace || "normal"
                }，总时长 ${Number(args.durationMs || 0) / 1000}s`
              : "动画 Planner 正在定义全局节奏与风格";
          }
          if (event.toolName === "define_animation_scenes") {
            return `${suffix}：规划 ${args.scenes?.length || 0} 个故事场景`;
          }
          if (event.toolName === "define_scene_cues") {
            return `${suffix}：场景 ${args.sceneId || ""} 规划 ${
              args.cues?.length || 0
            } 个元素动作`;
          }
          if (event.toolName === "finalize_animation_plan") {
            return completed
              ? "Animation Plan 已编译并冻结"
              : "正在校验 Animation Plan 并编译 Motion 轨道";
          }
          return `${
            completed ? "动画工具执行完成" : "动画子 Agent 正在执行工具"
          }：${event.toolName}`;
        };
        const animationToolArgs = new Map();
        const onAnimationEvent = (event) => {
          if (event.type === "agent_start") {
            emitStatus(
              "animation-agent-started",
              "动画子 Agent 已接收冻结的画布 Draft",
            );
          } else if (event.type === "turn_start") {
            emitStatus(
              "animation-planning",
              "动画子 Agent 正在规划节拍时长、停顿和轨道重叠",
            );
          } else if (event.type === "tool_execution_start") {
            animationToolArgs.set(event.toolCallId, event.args);
            emitStatus(
              `animation-tool-${event.toolCallId}-running`,
              animationToolLabel(event),
              { repeat: true },
            );
          } else if (event.type === "tool_execution_end") {
            const completedEvent = {
              ...event,
              args: animationToolArgs.get(event.toolCallId) || {},
            };
            animationToolArgs.delete(event.toolCallId);
            emitStatus(
              `animation-tool-${event.toolCallId}-${
                event.isError ? "repairing" : "done"
              }`,
              event.isError
                ? `动画计划需要调整，正在自动修正：${event.toolName}`
                : animationToolLabel(completedEvent, true),
              { repeat: true },
            );
          }
        };
        const finishText = () => {
          if (textId) {
            writer.write({ type: "text-end", id: textId });
            textId = null;
          }
        };
        const agent = buildAgent({
          transcript,
          threadId,
          currentCanvasState: body.currentCanvasState,
          onAnimationEvent,
          onEvent: (event) => {
            if (event.type === "agent_start") {
              emitStatus("started", "已接收需求，PiAgent 开始执行");
            } else if (event.type === "turn_start") {
              emitStatus("planning", "正在规划故事结构和画布内容");
            } else if (
              event.type === "message_update" &&
              event.assistantMessageEvent.type === "text_delta"
            ) {
              if (!textId) {
                textId = randomUUID();
                writer.write({ type: "text-start", id: textId });
              }
              writer.write({
                type: "text-delta",
                id: textId,
                delta: event.assistantMessageEvent.delta,
              });
            } else if (
              event.type === "message_update" &&
              event.assistantMessageEvent.type === "thinking_start"
            ) {
              emitStatus("reasoning", "正在拆解故事节拍、元素和视觉层级");
            } else if (
              event.type === "message_update" &&
              event.assistantMessageEvent.type === "toolcall_start"
            ) {
              emitStatus("toolcall", "正在调用画布工具或动画子 Agent");
            } else if (
              event.type === "message_end" &&
              event.message.role === "assistant"
            ) {
              finishText();
            } else if (event.type === "tool_execution_start") {
              const isLibrarySearch =
                event.toolName === "search_library_assets";
              const isLibraryAdd = event.toolName === "add_library_assets";
              writer.write({
                type: "tool-input-available",
                toolCallId: event.toolCallId,
                toolName: event.toolName,
                input: event.args,
                title:
                  event.toolName === "delegate_animation"
                    ? "动画子 Agent 正在规划时间轴"
                    : isLibrarySearch
                    ? "正在检索 Excalidraw 资源库"
                    : isLibraryAdd
                    ? "正在把资源库条目加入画布 Draft"
                    : "正在构建故事画布 Draft",
              });
            } else if (event.type === "tool_execution_end") {
              const toolErrorText = event.result?.content
                ?.map((item) => item.text || "")
                .join(" ")
                .trim();
              const displayErrorText = readableToolError(
                event.toolName,
                toolErrorText,
              );
              writer.write({
                type: event.isError
                  ? "tool-output-error"
                  : "tool-output-available",
                toolCallId: event.toolCallId,
                ...(event.isError
                  ? { errorText: displayErrorText }
                  : { output: event.result?.details ?? event.result }),
              });
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
        });
        activeAgents.set(threadId, agent);
        try {
          emitStatus("queued", "请求已提交到 PiAgent");
          await agent.prompt(prompt);
          finishText();
          emitStatus("completed", "PiAgent 执行完成", { completed: true });
          db.prepare(
            "UPDATE ai_threads SET transcript_json = ?, updated_at = ? WHERE id = ?",
          ).run(JSON.stringify(agent.state.messages), now(), threadId);
        } catch (error) {
          finishText();
          emitStatus("failed", "PiAgent 执行失败", { completed: true });
          throw error;
        } finally {
          finishText();
          activeAgents.delete(threadId);
        }
      },
      onError: (error) =>
        error instanceof Error ? error.message : "AI 生成失败，请稍后重试",
    });
    const abortOnClose = () => activeAgents.get(threadId)?.abort();
    res.once("close", abortOnClose);
    try {
      await pipeUIMessageStreamToResponse({ response: res, stream });
    } finally {
      res.off("close", abortOnClose);
    }
    return true;
  } catch (error) {
    console.error("[ai]", error);
    if (!res.headersSent && !res.destroyed) {
      sendJson(res, error.status || 500, {
        error: error.message || "AI 服务错误",
      });
    }
    return true;
  }
};
