import { readBody, readJson, sendJson } from "./http.ts";

import type { IncomingMessage, ServerResponse } from "node:http";
import type { FolderService } from "./folder-service.ts";
import type { WorkspaceFileService } from "./file-service.ts";
import type { ResourceRoute } from "./asset-pack-routes.ts";
import type { WorkspaceQueryService } from "./workspace-query-service.ts";

type FolderBody = { name?: unknown; parentId?: unknown };
type FileBody = { name?: unknown; folderId?: unknown };

export const handleWorkspaceDataRequest = async (
  request: IncomingMessage,
  response: ServerResponse,
  url: URL,
  route: ResourceRoute,
  services: {
    files: WorkspaceFileService;
    folders: FolderService;
    queries: WorkspaceQueryService;
  },
) => {
  if (request.method === "GET" && route.resource === "items") {
    sendJson(response, 200, {
      ...services.queries.listItems(url),
      stats: services.queries.stats(),
    });
    return true;
  }

  if (route.resource === "folders") {
    if (request.method === "GET" && !route.id) {
      sendJson(response, 200, { folders: services.queries.listFolders() });
      return true;
    }
    if (request.method === "POST" && !route.id) {
      const body = await readJson<FolderBody>(request);
      sendJson(
        response,
        201,
        services.folders.create(body.name, body.parentId),
      );
      return true;
    }
    if (route.id && request.method === "PATCH") {
      const body = await readJson<FolderBody>(request);
      sendJson(response, 200, services.folders.rename(route.id, body.name));
      return true;
    }
    if (route.id && request.method === "DELETE") {
      await services.folders.remove(
        route.id,
        url.searchParams.get("permanent") === "true",
      );
      sendJson(response, 200, { ok: true });
      return true;
    }
    if (route.id && route.action === "restore" && request.method === "POST") {
      services.folders.restore(route.id);
      sendJson(response, 200, { ok: true });
      return true;
    }
    sendJson(response, 404, { error: "接口不存在" });
    return true;
  }

  if (route.resource === "files") {
    if (request.method === "POST" && !route.id) {
      const body = await readJson<FileBody>(request);
      sendJson(
        response,
        201,
        await services.files.create(body.name, body.folderId),
      );
      return true;
    }
    if (request.method === "GET" && route.id && !route.action) {
      sendJson(response, 200, services.files.get(route.id));
      return true;
    }
    if (route.id && route.action === "content" && request.method === "GET") {
      const result = await services.files.readContent(
        route.id,
        url.searchParams.get("preview") === "true",
      );
      response.writeHead(200, {
        "content-type": "application/vnd.excalidraw+json",
        "content-length": result.content.length,
        "x-workspace-file-name": encodeURIComponent(result.name),
      });
      response.end(result.content);
      return true;
    }
    if (route.id && route.action === "content" && request.method === "PUT") {
      sendJson(
        response,
        200,
        await services.files.writeContent(route.id, await readBody(request)),
      );
      return true;
    }
    if (route.id && request.method === "PATCH") {
      sendJson(
        response,
        200,
        services.files.update(route.id, await readJson(request)),
      );
      return true;
    }
    if (route.id && request.method === "DELETE") {
      await services.files.remove(
        route.id,
        url.searchParams.get("permanent") === "true",
      );
      sendJson(response, 200, { ok: true });
      return true;
    }
    if (route.id && route.action === "restore" && request.method === "POST") {
      sendJson(response, 200, services.files.restore(route.id));
      return true;
    }
    sendJson(response, 404, { error: "接口不存在" });
    return true;
  }

  return false;
};
