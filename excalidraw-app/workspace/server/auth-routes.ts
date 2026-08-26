import { readJson, sendJson } from "./http.ts";

import type { IncomingMessage, ServerResponse } from "node:http";
import type { DatabaseSync } from "node:sqlite";
import type { SessionStore } from "./session-store.ts";

type AuthRouteContext = {
  database: DatabaseSync;
  username: string;
  password: string;
  adminUsername: string;
  now: () => string;
  sessions: SessionStore;
};

type LoginBody = {
  username?: unknown;
  password?: unknown;
};

export const handleAuthRequest = async (
  request: IncomingMessage,
  response: ServerResponse,
  url: URL,
  context: AuthRouteContext,
) => {
  if (!url.pathname.startsWith("/api/auth")) {
    return false;
  }

  if (url.pathname === "/api/auth/login" && request.method === "POST") {
    const body = await readJson<LoginBody>(request);
    if (
      body.username !== context.username ||
      body.password !== context.password
    ) {
      sendJson(response, 401, { error: "用户名或密码错误" });
      return true;
    }
    context.database
      .prepare("DELETE FROM sessions WHERE expires_at <= ?")
      .run(context.now());
    const token = context.sessions.create(context.username);
    response.setHeader("set-cookie", context.sessions.cookie(token));
    sendJson(response, 200, {
      authenticated: true,
      username: context.username,
      isAdmin: context.username === context.adminUsername,
    });
    return true;
  }

  if (url.pathname === "/api/auth/logout" && request.method === "POST") {
    context.sessions.remove(request);
    response.setHeader("set-cookie", context.sessions.cookie("", 0));
    sendJson(response, 200, { authenticated: false });
    return true;
  }

  if (url.pathname === "/api/auth/session" && request.method === "GET") {
    const session = context.sessions.get(request);
    sendJson(
      response,
      200,
      session
        ? {
            authenticated: true,
            username: session.username,
            isAdmin: session.username === context.adminUsername,
          }
        : { authenticated: false },
    );
    return true;
  }

  sendJson(response, 404, { error: "接口不存在" });
  return true;
};
