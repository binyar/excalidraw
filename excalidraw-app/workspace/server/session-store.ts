import { randomUUID } from "node:crypto";

import type { IncomingMessage } from "node:http";
import type { DatabaseSync } from "node:sqlite";

export type WorkspaceSession = {
  token: string;
  username: string;
  expires_at: string;
  created_at: string;
};

const SESSION_COOKIE = "excalidraw_workspace_session";
const SESSION_MAX_AGE_SECONDS = 7 * 24 * 60 * 60;

const readCookies = (request: IncomingMessage) =>
  Object.fromEntries(
    String(request.headers.cookie || "")
      .split(";")
      .map((item) => item.trim().split("="))
      .filter(([key, value]) => key && value)
      .map(([key, value]) => [key, decodeURIComponent(value)]),
  );

export const createSessionStore = (
  database: DatabaseSync,
  now: () => string,
) => {
  const get = (request: IncomingMessage): WorkspaceSession | null => {
    const token = readCookies(request)[SESSION_COOKIE];
    if (!token) {
      return null;
    }
    const session = database
      .prepare("SELECT * FROM sessions WHERE token = ? AND expires_at > ?")
      .get(token, now()) as WorkspaceSession | undefined;
    if (!session) {
      database.prepare("DELETE FROM sessions WHERE token = ?").run(token);
    }
    return session ?? null;
  };

  const create = (username: string) => {
    const token = `${randomUUID()}${randomUUID()}`.replaceAll("-", "");
    const createdAt = now();
    const expiresAt = new Date(
      Date.now() + SESSION_MAX_AGE_SECONDS * 1000,
    ).toISOString();
    database
      .prepare(
        "INSERT INTO sessions(token, username, expires_at, created_at) VALUES (?, ?, ?, ?)",
      )
      .run(token, username, expiresAt, createdAt);
    return token;
  };

  const remove = (request: IncomingMessage) => {
    const token = readCookies(request)[SESSION_COOKIE];
    if (token) {
      database.prepare("DELETE FROM sessions WHERE token = ?").run(token);
    }
  };

  const cookie = (token: string, maxAge = SESSION_MAX_AGE_SECONDS) =>
    `${SESSION_COOKIE}=${encodeURIComponent(
      token,
    )}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}`;

  return { cookie, create, get, remove };
};

export type SessionStore = ReturnType<typeof createSessionStore>;
