import { readJson, sendJson } from "./http.ts";

import type { IncomingMessage, ServerResponse } from "node:http";
import type { AssetPackService } from "./asset-pack-service.ts";

export type ResourceRoute = {
  resource?: string;
  id?: string;
  action?: string;
  itemIndex?: string;
};

export const handleAdminAssetPackRequest = async (
  request: IncomingMessage,
  response: ServerResponse,
  route: ResourceRoute,
  username: string,
  assetPacks: AssetPackService,
) => {
  if (
    route.resource === "asset-packs" &&
    request.method === "GET" &&
    !route.id
  ) {
    sendJson(response, 200, await assetPacks.listForAdmin());
    return true;
  }
  if (
    route.resource === "asset-packs" &&
    route.id &&
    request.method === "GET" &&
    !route.action
  ) {
    sendJson(response, 200, await assetPacks.getForAdmin(route.id));
    return true;
  }
  if (
    route.resource === "asset-packs" &&
    route.id &&
    route.action === "items" &&
    route.itemIndex !== undefined &&
    request.method === "GET"
  ) {
    sendJson(
      response,
      200,
      await assetPacks.getItem(route.id, route.itemIndex),
    );
    return true;
  }
  if (
    route.resource === "asset-packs" &&
    route.id &&
    route.action === "items" &&
    route.itemIndex !== undefined &&
    request.method === "DELETE"
  ) {
    sendJson(
      response,
      200,
      await assetPacks.deleteItem(route.id, route.itemIndex),
    );
    return true;
  }
  if (
    route.resource === "asset-packs" &&
    route.id &&
    request.method === "PATCH"
  ) {
    const body = await readJson<{ builtin?: unknown }>(request);
    sendJson(
      response,
      200,
      await assetPacks.setBuiltin(route.id, body.builtin, username),
    );
    return true;
  }
  if (
    route.resource === "asset-packs" &&
    route.id &&
    !route.action &&
    request.method === "DELETE"
  ) {
    sendJson(response, 200, await assetPacks.deletePack(route.id));
    return true;
  }
  sendJson(response, 404, { error: "接口不存在" });
  return true;
};

export const handleAssetPackRequest = async (
  request: IncomingMessage,
  response: ServerResponse,
  route: ResourceRoute,
  username: string,
  assetPacks: AssetPackService,
) => {
  if (route.resource !== "asset-packs") {
    return false;
  }
  if (request.method === "GET" && !route.id) {
    sendJson(response, 200, await assetPacks.listForUser(username));
    return true;
  }
  if (route.id && request.method === "GET" && !route.action) {
    sendJson(response, 200, await assetPacks.getForUser(route.id, username));
    return true;
  }
  if (
    route.id &&
    route.action === "items" &&
    route.itemIndex !== undefined &&
    request.method === "GET"
  ) {
    sendJson(
      response,
      200,
      await assetPacks.getItem(route.id, route.itemIndex),
    );
    return true;
  }
  if (route.id && route.action === "install" && request.method === "POST") {
    sendJson(response, 200, await assetPacks.install(route.id, username));
    return true;
  }
  if (route.id && route.action === "install" && request.method === "DELETE") {
    sendJson(response, 200, assetPacks.uninstall(route.id, username));
    return true;
  }
  sendJson(response, 404, { error: "接口不存在" });
  return true;
};
