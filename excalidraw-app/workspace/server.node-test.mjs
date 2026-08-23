import assert from "node:assert/strict";
import {
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
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
const catalogRoot = path.join(workspaceRoot, "library-catalog");
await mkdir(path.join(catalogRoot, "libraries", "test"), { recursive: true });
const catalogLibraries = [
  {
    id: "test-pack-one",
    name: "测试素材包一",
    description: "用于后台素材管理契约测试",
    authors: [{ name: "测试作者" }],
    source: "test/pack-one.excalidrawlib",
    updated: "2026-08-23",
    itemNames: ["测试素材 1-1", "测试素材 1-2", "测试素材 1-3"],
  },
  {
    id: "test-pack-two",
    name: "测试素材包二",
    description: "用于保留目录中的第二个素材包",
    authors: [{ name: "测试作者" }],
    source: "test/pack-two.excalidrawlib",
    updated: "2026-08-23",
    itemNames: ["测试素材 2-1"],
  },
];
const catalogIndex = catalogLibraries.flatMap((library) =>
  library.itemNames.map((itemName, itemIndex) => ({
    ref: `${library.source.replace(/\.excalidrawlib$/, "")}#${itemIndex}`,
    libraryId: library.id,
    libraryName: library.name,
    description: library.description,
    itemName,
    itemIndex,
    elementCount: 1,
    width: 100,
    height: 80,
  })),
);
await Promise.all([
  writeFile(
    path.join(catalogRoot, "libraries.json"),
    JSON.stringify(catalogLibraries),
  ),
  writeFile(path.join(catalogRoot, "index.json"), JSON.stringify(catalogIndex)),
  writeFile(path.join(catalogRoot, "translations.zh-CN.json"), "{}"),
  ...catalogLibraries.map((library, libraryIndex) =>
    writeFile(
      path.join(
        catalogRoot,
        "libraries",
        `${library.source.replace(/\.excalidrawlib$/, "")}.json`,
      ),
      JSON.stringify({
        libraryItems: library.itemNames.map((itemName, itemIndex) => ({
          name: itemName,
          elements: [
            {
              id: `shape-${libraryIndex}-${itemIndex}`,
              type: "rectangle",
              x: 0,
              y: 0,
              width: 100,
              height: 80,
            },
          ],
        })),
      }),
    ),
  ),
]);
process.env.EXCALIDRAW_LIBRARY_CATALOG_DIR = catalogRoot;
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
  const unauthorizedAdmin = await fetch(`${origin}/api/admin/asset-packs`);
  assert.equal(unauthorizedAdmin.status, 401);

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
    isAdmin: true,
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
  const concurrentDrawings = Array.from({ length: 12 }, (_, index) => ({
    ...drawing,
    elements: [
      {
        ...drawing.elements[0],
        id: `shape-${index}`,
      },
    ],
  }));
  await Promise.all(
    concurrentDrawings.map((candidate) =>
      request(`/files/${file.id}/content`, {
        method: "PUT",
        headers: { "content-type": "application/vnd.excalidraw+json" },
        body: JSON.stringify(candidate),
      }),
    ),
  );
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
  assert.ok(
    concurrentDrawings.some(
      (candidate) => candidate.elements[0].id === storedDrawing.elements[0].id,
    ),
  );
  assert.deepEqual(
    (await readdir(path.join(workspaceRoot, "files"))).filter((name) =>
      name.endsWith(".tmp"),
    ),
    [],
  );

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

test("asset packs are uninstalled by default and persist per-user installation config", async () => {
  const initial = await request("/asset-packs");
  assert.ok(initial.packs.length > 0);
  assert.equal(initial.installedCount, 0);
  assert.equal(
    initial.packs.every((pack) => !pack.installed),
    true,
  );

  const candidate = initial.packs[0];
  const detail = await request(`/asset-packs/${candidate.id}`);
  assert.equal(detail.installed, false);
  assert.equal(detail.items.length, candidate.itemCount);
  const preview = await request(`/asset-packs/${candidate.id}/items/0`);
  assert.equal(preview.ref, detail.items[0].ref);
  assert.ok(preview.elements.length > 0);

  const installed = await request(`/asset-packs/${candidate.id}/install`, {
    method: "POST",
  });
  assert.equal(installed.installed, true);
  assert.equal(installed.source, candidate.source);

  const configured = await request("/asset-packs");
  assert.equal(configured.installedCount, 1);
  assert.equal(
    configured.packs.find((pack) => pack.id === candidate.id).installed,
    true,
  );

  await request(`/asset-packs/${candidate.id}/install`, { method: "DELETE" });
  const cleared = await request("/asset-packs");
  assert.equal(cleared.installedCount, 0);
});

test("admin can make a pack official and users cannot disable it", async () => {
  const adminList = await fetch(`${origin}/api/admin/asset-packs`, {
    headers: { cookie: sessionCookie },
  });
  assert.equal(adminList.status, 200);
  const initial = await adminList.json();
  assert.equal(initial.totalCount, 2);
  assert.equal(initial.builtinCount, 0);
  assert.ok(initial.totalBytes > 0);

  const candidate = initial.packs[0];
  const configured = await fetch(
    `${origin}/api/admin/asset-packs/${candidate.id}`,
    {
      method: "PATCH",
      headers: {
        cookie: sessionCookie,
        "content-type": "application/json",
      },
      body: JSON.stringify({ builtin: true }),
    },
  );
  assert.equal(configured.status, 200);
  assert.equal((await configured.json()).builtin, true);

  const userList = await request("/asset-packs");
  const official = userList.packs.find((pack) => pack.id === candidate.id);
  assert.equal(official.builtin, true);
  assert.equal(official.installed, true);
  assert.equal(userList.installedCount, 1);

  const uninstall = await fetch(
    `${apiRoot}/asset-packs/${candidate.id}/install`,
    { method: "DELETE", headers: { cookie: sessionCookie } },
  );
  assert.equal(uninstall.status, 400);
  assert.equal(
    (await uninstall.json()).error,
    "官方内置素材不能从用户素材库移除",
  );
});

test("admin item deletion physically removes one item and reindexes the pack", async () => {
  const before = await request("/asset-packs");
  const candidate = before.packs.find((pack) => pack.builtin);
  const detailResponse = await fetch(
    `${origin}/api/admin/asset-packs/${candidate.id}`,
    { headers: { cookie: sessionCookie } },
  );
  assert.equal(detailResponse.status, 200);
  const detail = await detailResponse.json();
  assert.equal(detail.items.length, 3);
  assert.equal(detail.builtin, true);

  const preview = await fetch(
    `${origin}/api/admin/asset-packs/${candidate.id}/items/1`,
    { headers: { cookie: sessionCookie } },
  );
  assert.equal(preview.status, 200);
  assert.match((await preview.json()).ref, /^素材-\d+-1$/);

  const deleted = await fetch(
    `${origin}/api/admin/asset-packs/${candidate.id}/items/1`,
    { method: "DELETE", headers: { cookie: sessionCookie } },
  );
  assert.equal(deleted.status, 200);
  const result = await deleted.json();
  assert.equal(result.packDeleted, false);
  assert.equal(result.itemCount, 2);
  assert.ok(result.items.every((item) => /^素材-\d+-\d+$/.test(item.ref)));
  assert.deepEqual(
    result.items.map((item) => [item.itemIndex, item.itemName]),
    [
      [0, "测试素材 1-1"],
      [1, "测试素材 1-3"],
    ],
  );

  const library = JSON.parse(
    await readFile(
      path.join(catalogRoot, "libraries", `${candidate.source}.json`),
      "utf8",
    ),
  );
  assert.deepEqual(
    library.libraryItems.map((item) => item.elements[0].id),
    ["shape-0-0", "shape-0-2"],
  );
  const metadata = JSON.parse(
    await readFile(path.join(catalogRoot, "libraries.json"), "utf8"),
  ).find((libraryEntry) => libraryEntry.id === candidate.id);
  assert.deepEqual(metadata.itemNames, ["测试素材 1-1", "测试素材 1-3"]);
});

test("admin deletion physically removes the asset file and catalog records", async () => {
  const before = await request("/asset-packs");
  const candidate = before.packs.find((pack) => pack.builtin);
  const filePath = path.join(
    catalogRoot,
    "libraries",
    `${candidate.source}.json`,
  );
  assert.ok((await stat(filePath)).isFile());

  const response = await fetch(
    `${origin}/api/admin/asset-packs/${candidate.id}`,
    { method: "DELETE", headers: { cookie: sessionCookie } },
  );
  assert.equal(response.status, 200);
  assert.equal((await response.json()).deleted, true);
  await assert.rejects(stat(filePath), { code: "ENOENT" });

  const after = await request("/asset-packs");
  assert.equal(
    after.packs.some((pack) => pack.id === candidate.id),
    false,
  );
  assert.equal(after.installedCount, 0);
  const libraries = JSON.parse(
    await readFile(path.join(catalogRoot, "libraries.json"), "utf8"),
  );
  const index = JSON.parse(
    await readFile(path.join(catalogRoot, "index.json"), "utf8"),
  );
  assert.equal(
    libraries.some((library) => library.id === candidate.id),
    false,
  );
  assert.equal(
    index.some((entry) => entry.ref.startsWith(`${candidate.source}#`)),
    false,
  );
});

test("deleting a pack's last item physically removes the whole pack file", async () => {
  const before = await request("/asset-packs");
  assert.equal(before.packs.length, 1);
  const candidate = before.packs[0];
  const filePath = path.join(
    catalogRoot,
    "libraries",
    `${candidate.source}.json`,
  );
  const response = await fetch(
    `${origin}/api/admin/asset-packs/${candidate.id}/items/0`,
    { method: "DELETE", headers: { cookie: sessionCookie } },
  );
  assert.equal(response.status, 200);
  assert.equal((await response.json()).packDeleted, true);
  await assert.rejects(stat(filePath), { code: "ENOENT" });
  assert.equal((await request("/asset-packs")).packs.length, 0);
});

test("skills expose a locked animation skill and persist optional skill state", async () => {
  const initial = await request("/skills");
  const animation = initial.skills.find(
    (skill) => skill.id === "core-animation",
  );
  const assets = initial.skills.find(
    (skill) => skill.id === "asset-enhancement",
  );
  assert.equal(animation.enabled, true);
  assert.equal(animation.locked, true);
  assert.equal(assets.enabled, true);
  assert.equal(initial.enabledCount, 2);

  const disabled = await request("/skills/asset-enhancement/install", {
    method: "DELETE",
  });
  assert.equal(disabled.enabled, false);
  const afterDisable = await request("/skills");
  assert.equal(afterDisable.enabledCount, 1);

  const enabled = await request("/skills/asset-enhancement/install", {
    method: "POST",
  });
  assert.equal(enabled.enabled, true);

  const lockedResponse = await fetch(
    `${apiRoot}/skills/core-animation/install`,
    { method: "DELETE", headers: { cookie: sessionCookie } },
  );
  assert.equal(lockedResponse.status, 400);
  const final = await request("/skills");
  assert.equal(
    final.skills.find((skill) => skill.id === "core-animation").enabled,
    true,
  );
});

test("workspace no longer exposes the file import endpoint", async () => {
  const response = await fetch(`${apiRoot}/import`, {
    method: "POST",
    headers: {
      cookie: sessionCookie,
      "content-type": "application/vnd.excalidraw+json",
    },
    body: JSON.stringify({ type: "excalidraw", elements: [] }),
  });
  assert.equal(response.status, 404);
});

test.after(async () => {
  await new Promise((resolve) => server.close(resolve));
  await rm(workspaceRoot, { recursive: true, force: true });
});
