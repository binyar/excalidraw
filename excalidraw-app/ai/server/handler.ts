import { pipeUIMessageStreamToResponse } from "ai";

import {
  AiHttpError,
  getLastUserText,
  readJson,
  safeTranscript,
  sendJson,
} from "./http-utils.ts";
import { ASSET_ENHANCEMENT_SKILL_ID } from "./skill-catalog.ts";
import { transcriptToUiMessages } from "./transcript-ui.ts";
import {
  abortActiveStoryAgent,
  createStoryUiStream,
  stopActiveStoryAgent,
} from "./stream-runner.ts";

import type { IncomingMessage, ServerResponse } from "node:http";
import type { DatabaseSync } from "node:sqlite";
import type { WorkspaceFileRow } from "../../workspace/server/workspace-records.ts";
import type { WorkspaceSession } from "../../workspace/server/session-store.ts";

export { stripEmoji, transcriptToUiMessages } from "./transcript-ui.ts";

type AiThreadRow = { transcript_json: string };

type AiRequestDependencies = {
  session: WorkspaceSession | null;
  db: DatabaseSync;
  getFileRow: (id: string) => WorkspaceFileRow | null | undefined;
  now: () => string;
  getInstalledAssetSources?: (username: string) => string[] | Promise<string[]>;
  getEnabledSkillIds?: (username: string) => string[] | Promise<string[]>;
};

export const handleAiRequest = async (
  req: IncomingMessage,
  res: ServerResponse,
  {
    session,
    db,
    getFileRow,
    now,
    getInstalledAssetSources = (_username: string): string[] => [],
    getEnabledSkillIds = (_username: string): string[] => [
      ASSET_ENHANCEMENT_SKILL_ID,
    ],
  }: AiRequestDependencies,
): Promise<boolean> => {
  const url = new URL(req.url ?? "/", "http://localhost");
  if (!url.pathname.startsWith("/api/ai")) {
    return false;
  }
  if (!session) {
    sendJson(res, 401, { error: "请先登录" });
    return true;
  }

  if (url.pathname === "/api/ai/stop" && req.method === "POST") {
    const body = await readJson(req);
    const stopped = stopActiveStoryAgent(String(body.threadId || ""));
    sendJson(res, 200, { stopped });
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
      .get(threadId, workspaceFileId, session.username) as
      | AiThreadRow
      | undefined;
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
      throw new AiHttpError("当前画板未关联有效的 Workspace 文件", 400);
    }
    if (!threadId || threadId.length > 120) {
      throw new AiHttpError("AI 会话 id 无效", 400);
    }
    const prompt = getLastUserText(
      Array.isArray(body.messages) ? body.messages : [],
    );
    if (!prompt) {
      throw new AiHttpError("请输入故事画布需求", 400);
    }
    const thinkingLevel = body.thinkingEnabled === true ? "high" : "off";
    const assetSources = await getInstalledAssetSources(session.username);
    const enabledSkillIds = await getEnabledSkillIds(session.username);

    const existing = db
      .prepare(
        "SELECT * FROM ai_threads WHERE id = ? AND workspace_file_id = ? AND username = ?",
      )
      .get(threadId, workspaceFileId, session.username) as
      | AiThreadRow
      | undefined;
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

    const stream = createStoryUiStream({
      threadId,
      transcript,
      prompt,
      thinkingLevel,
      currentCanvasState: body.currentCanvasState,
      assetSources,
      enabledSkillIds,
      database: db,
      now,
    });
    const abortOnClose = () => abortActiveStoryAgent(threadId);
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
      sendJson(res, error instanceof AiHttpError ? error.status : 500, {
        error: error instanceof Error ? error.message : "AI 服务错误",
      });
    }
    return true;
  }
};
