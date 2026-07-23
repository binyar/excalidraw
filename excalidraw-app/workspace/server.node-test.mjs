import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

const workspaceRoot = await mkdtemp(
  path.join(tmpdir(), "excalidraw-workspace-"),
);
process.env.EXCALIDRAW_WORKSPACE_DIR = workspaceRoot;
process.env.EXCALIDRAW_USERNAME = "fanmd";
process.env.EXCALIDRAW_PASSWORD = "123123";
const { handleWorkspaceRequest } = await import("./server.mjs");

const server = createServer(async (req, res) => {
  if (!(await handleWorkspaceRequest(req, res))) {
    res.writeHead(404).end();
  }
});
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const address = server.address();
const origin = `http://127.0.0.1:${address.port}`;
const apiRoot = `${origin}/api/workspace`;
let sessionCookie = "";

const request = async (pathName, options = {}) => {
  const response = await fetch(`${apiRoot}${pathName}`, {
    ...options,
    headers: {
      ...options.headers,
      cookie: sessionCookie,
    },
  });
  const payload = await response.json();
  assert.equal(response.ok, true, JSON.stringify(payload));
  return payload;
};

test("auth API rejects invalid credentials and protects workspace routes", async () => {
  const unauthorized = await fetch(`${apiRoot}/items?scope=all`);
  assert.equal(unauthorized.status, 401);

  const invalid = await fetch(`${origin}/api/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ username: "fanmd", password: "wrong" }),
  });
  assert.equal(invalid.status, 401);

  const login = await fetch(`${origin}/api/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ username: "fanmd", password: "123123" }),
  });
  assert.equal(login.status, 200);
  sessionCookie = login.headers.get("set-cookie")?.split(";")[0] || "";
  assert.match(sessionCookie, /^excalidraw_workspace_session=/);

  const session = await fetch(`${origin}/api/auth/session`, {
    headers: { cookie: sessionCookie },
  });
  assert.deepEqual(await session.json(), {
    authenticated: true,
    username: "fanmd",
  });
});

test("workspace API persists a drawing and supports the complete CRUD lifecycle", async () => {
  const headers = { "content-type": "application/json" };
  const folder = await request("/folders", {
    method: "POST",
    headers,
    body: JSON.stringify({ name: "产品设计" }),
  });
  const file = await request("/files", {
    method: "POST",
    headers,
    body: JSON.stringify({ name: "系统架构图", folderId: folder.id }),
  });
  const drawing = {
    type: "excalidraw",
    version: 2,
    source: "test",
    elements: [
      { id: "shape", type: "rectangle", x: 0, y: 0, width: 100, height: 80 },
    ],
    appState: { viewBackgroundColor: "#ffffff" },
    files: {},
  };
  await request(`/files/${file.id}/content`, {
    method: "PUT",
    headers: { "content-type": "application/vnd.excalidraw+json" },
    body: JSON.stringify(drawing),
  });
  const updated = await request(`/files/${file.id}`, {
    method: "PATCH",
    headers,
    body: JSON.stringify({ isFavorite: true, name: "系统架构图-最终版" }),
  });
  assert.equal(updated.name, "系统架构图-最终版.excalidraw");
  assert.equal(updated.isFavorite, true);

  const storedDrawing = JSON.parse(
    await readFile(
      path.join(workspaceRoot, "files", `${file.id}.excalidraw`),
      "utf8",
    ),
  );
  assert.equal(storedDrawing.elements.length, 1);

  await request(`/files/${file.id}`, { method: "DELETE" });
  const trash = await request("/items?scope=trash");
  assert.equal(
    trash.files.some((item) => item.id === file.id),
    true,
  );
  await request(`/files/${file.id}/restore`, { method: "POST" });
  await request(`/folders/${folder.id}?permanent=true`, { method: "DELETE" });
  const finalState = await request("/items?scope=all");
  assert.deepEqual(
    {
      files: finalState.stats.fileCount,
      folders: finalState.stats.folderCount,
    },
    { files: 0, folders: 0 },
  );
});

test.after(async () => {
  await new Promise((resolve) => server.close(resolve));
  await rm(workspaceRoot, { recursive: true, force: true });
});
