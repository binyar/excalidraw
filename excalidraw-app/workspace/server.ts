import { existsSync, mkdirSync } from "node:fs";
import { createServer } from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";

import dotenv from "dotenv";

import { handleAiRequest } from "../ai/server/handler.ts";

import {
  handleAdminAssetPackRequest,
  handleAssetPackRequest,
} from "./server/asset-pack-routes.ts";
import { createAssetPackService } from "./server/asset-pack-service.ts";
import { createWorkspaceDatabase } from "./server/database.ts";
import { handleAuthRequest } from "./server/auth-routes.ts";
import { createFileStorage } from "./server/file-storage.ts";
import { createFolderService } from "./server/folder-service.ts";
import { createWorkspaceFileService } from "./server/file-service.ts";
import { HttpError, sendJson } from "./server/http.ts";
import { createSessionStore } from "./server/session-store.ts";
import { handleSkillRequest } from "./server/skill-routes.ts";
import { createSkillService } from "./server/skill-service.ts";
import { serveStaticFile } from "./server/static-files.ts";
import { createWorkspaceQueryService } from "./server/workspace-query-service.ts";
import { handleWorkspaceDataRequest } from "./server/workspace-routes.ts";

import type { IncomingMessage, ServerResponse } from "node:http";
import type { Plugin } from "vite";
import type { WorkspaceSession } from "./server/session-store.ts";

const APP_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../..",
);
dotenv.config({ path: path.join(APP_ROOT, ".env.local") });
dotenv.config({ path: path.join(APP_ROOT, ".env") });
process.env.DEEPSEEK_API_KEY ??= process.env.DEEP_SEEK_API_KEY;
export const WORKSPACE_ROOT = process.env.EXCALIDRAW_WORKSPACE_DIR
  ? path.resolve(process.env.EXCALIDRAW_WORKSPACE_DIR)
  : path.join(APP_ROOT, ".workspace");
const FILES_ROOT = path.join(WORKSPACE_ROOT, "files");
const DB_PATH = path.join(WORKSPACE_ROOT, "workspace.sqlite");

mkdirSync(FILES_ROOT, { recursive: true });

const now = () => new Date().toISOString();
const db = createWorkspaceDatabase(DB_PATH);
const fileStorage = createFileStorage(FILES_ROOT);
const workspaceQueries = createWorkspaceQueryService(db);
const workspaceFiles = createWorkspaceFileService(db, fileStorage, now);
const workspaceFolders = createFolderService(
  db,
  fileStorage,
  workspaceQueries,
  now,
);
const skillService = createSkillService(db, now);
const assetPackService = createAssetPackService(db, now);

const AUTH_USERNAME = process.env.EXCALIDRAW_USERNAME || "fanmd";
const AUTH_PASSWORD = process.env.EXCALIDRAW_PASSWORD || "123123";
const ADMIN_USERNAME = process.env.EXCALIDRAW_ADMIN_USERNAME || AUTH_USERNAME;

const sessionStore = createSessionStore(db, now);

const isAdminSession = (session: WorkspaceSession) =>
  session.username === ADMIN_USERNAME;

export const handleWorkspaceRequest = async (
  req: IncomingMessage,
  res: ServerResponse,
) => {
  const url = new URL(req.url ?? "/", "http://localhost");
  const isAuthRequest = url.pathname.startsWith("/api/auth");
  const isWorkspaceRequest = url.pathname.startsWith("/api/workspace");
  const isAdminRequest = url.pathname.startsWith("/api/admin");
  const isAiRequest = url.pathname.startsWith("/api/ai");
  if (isAiRequest) {
    return handleAiRequest(req, res, {
      session: sessionStore.get(req),
      db,
      getFileRow: workspaceFiles.getRow,
      now,
      getInstalledAssetSources: assetPackService.getInstalledSources,
      getEnabledSkillIds: skillService.getEnabledIds,
    });
  }
  if (!isAuthRequest && !isWorkspaceRequest && !isAdminRequest) {
    return false;
  }
  try {
    if (
      await handleAuthRequest(req, res, url, {
        database: db,
        username: AUTH_USERNAME,
        password: AUTH_PASSWORD,
        adminUsername: ADMIN_USERNAME,
        now,
        sessions: sessionStore,
      })
    ) {
      return true;
    }
    const workspaceSession = sessionStore.get(req);
    if (!workspaceSession) {
      sendJson(res, 401, { error: "请先登录" });
      return true;
    }

    if (isAdminRequest && !isAdminSession(workspaceSession)) {
      sendJson(res, 403, { error: "当前账户没有后台管理权限" });
      return true;
    }

    const parts = url.pathname.split("/").filter(Boolean).slice(2);
    const [resource, id, action, itemIndex] = parts;

    if (isAdminRequest) {
      return handleAdminAssetPackRequest(
        req,
        res,
        { resource, id, action, itemIndex },
        workspaceSession.username,
        assetPackService,
      );
    }

    if (
      handleSkillRequest(
        req,
        res,
        { resource, id, action },
        workspaceSession.username,
        skillService,
      )
    ) {
      return true;
    }

    if (
      await handleAssetPackRequest(
        req,
        res,
        { resource, id, action, itemIndex },
        workspaceSession.username,
        assetPackService,
      )
    ) {
      return true;
    }

    if (
      await handleWorkspaceDataRequest(
        req,
        res,
        url,
        { resource, id, action, itemIndex },
        {
          files: workspaceFiles,
          folders: workspaceFolders,
          queries: workspaceQueries,
        },
      )
    ) {
      return true;
    }

    sendJson(res, 404, { error: "接口不存在" });
    return true;
  } catch (error) {
    console.error("[workspace]", error);
    const status =
      error instanceof HttpError
        ? error.status
        : typeof error === "object" &&
          error !== null &&
          "status" in error &&
          typeof error.status === "number"
        ? error.status
        : 500;
    sendJson(res, status, {
      error: error instanceof Error ? error.message : "服务器错误",
    });
    return true;
  }
};

export const workspaceApiPlugin = (): Plugin => ({
  name: "workspace-api",
  configureServer(server) {
    server.middlewares.use(async (req, res, next) => {
      if (!(await handleWorkspaceRequest(req, res))) {
        next();
      }
    });
  },
});

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const buildDir = path.resolve(APP_ROOT, "excalidraw-app/build");
  if (!existsSync(buildDir)) {
    console.error("未找到生产构建，请先运行 pnpm build");
    process.exit(1);
  }
  const port = Number(process.env.PORT || 5001);
  createServer(async (req, res) => {
    if (!(await handleWorkspaceRequest(req, res))) {
      serveStaticFile(req, res, buildDir);
    }
  }).listen(port, () => {
    // eslint-disable-next-line no-console
    console.log(`Excalidraw File Manager: http://localhost:${port}`);
  });
}
