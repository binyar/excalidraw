import { createReadStream, existsSync, mkdirSync, statSync } from "node:fs";
import { readFile, rename, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { DatabaseSync } from "node:sqlite";
import { randomUUID } from "node:crypto";

const APP_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
export const WORKSPACE_ROOT = process.env.EXCALIDRAW_WORKSPACE_DIR
  ? path.resolve(process.env.EXCALIDRAW_WORKSPACE_DIR)
  : path.join(APP_ROOT, ".workspace");
const FILES_ROOT = path.join(WORKSPACE_ROOT, "files");
const DB_PATH = path.join(WORKSPACE_ROOT, "workspace.sqlite");

mkdirSync(FILES_ROOT, { recursive: true });

const db = new DatabaseSync(DB_PATH);
db.exec(`
  PRAGMA foreign_keys = ON;
  PRAGMA journal_mode = WAL;
  CREATE TABLE IF NOT EXISTS folders (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    parent_id TEXT REFERENCES folders(id),
    is_deleted INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS files (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    folder_id TEXT REFERENCES folders(id),
    storage_name TEXT NOT NULL UNIQUE,
    size INTEGER NOT NULL DEFAULT 0,
    is_favorite INTEGER NOT NULL DEFAULT 0,
    is_deleted INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    last_opened_at TEXT
  );
  CREATE INDEX IF NOT EXISTS idx_files_folder ON files(folder_id);
  CREATE INDEX IF NOT EXISTS idx_files_updated ON files(updated_at DESC);
  CREATE TABLE IF NOT EXISTS sessions (
    token TEXT PRIMARY KEY,
    username TEXT NOT NULL,
    expires_at TEXT NOT NULL,
    created_at TEXT NOT NULL
  );
`);

const AUTH_USERNAME = process.env.EXCALIDRAW_USERNAME || "fanmd";
const AUTH_PASSWORD = process.env.EXCALIDRAW_PASSWORD || "123123";
const SESSION_COOKIE = "excalidraw_workspace_session";
const SESSION_MAX_AGE_SECONDS = 7 * 24 * 60 * 60;

const jsonHeaders = { "content-type": "application/json; charset=utf-8" };
const sendJson = (res, status, value) => {
  res.writeHead(status, jsonHeaders);
  res.end(JSON.stringify(value));
};

const readBody = async (req, limit = 25 * 1024 * 1024) => {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > limit) {
      const error = new Error("文件不能超过 25 MB");
      error.status = 413;
      throw error;
    }
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
};

const readJson = async (req) => {
  const body = await readBody(req, 1024 * 1024);
  return body.length ? JSON.parse(body.toString("utf8")) : {};
};

const now = () => new Date().toISOString();
const readCookies = (req) =>
  Object.fromEntries(
    String(req.headers.cookie || "")
      .split(";")
      .map((item) => item.trim().split("="))
      .filter(([key, value]) => key && value)
      .map(([key, value]) => [key, decodeURIComponent(value)]),
  );
const getSession = (req) => {
  const token = readCookies(req)[SESSION_COOKIE];
  if (!token) return null;
  const session = db
    .prepare("SELECT * FROM sessions WHERE token = ? AND expires_at > ?")
    .get(token, now());
  if (!session) {
    db.prepare("DELETE FROM sessions WHERE token = ?").run(token);
  }
  return session || null;
};
const createSession = (username) => {
  const token = `${randomUUID()}${randomUUID()}`.replaceAll("-", "");
  const createdAt = now();
  const expiresAt = new Date(
    Date.now() + SESSION_MAX_AGE_SECONDS * 1000,
  ).toISOString();
  db.prepare(
    "INSERT INTO sessions(token, username, expires_at, created_at) VALUES (?, ?, ?, ?)",
  ).run(token, username, expiresAt, createdAt);
  return token;
};
const sessionCookie = (token, maxAge = SESSION_MAX_AGE_SECONDS) =>
  `${SESSION_COOKIE}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}`;
const normalizeName = (value, fallback = "未命名画板.excalidraw") => {
  const name = String(value || fallback).trim().replace(/[\\/:*?"<>|\0]/g, "-");
  return name.slice(0, 180) || fallback;
};
const normalizeDrawingName = (value) => {
  const name = normalizeName(value);
  return name.toLowerCase().endsWith(".excalidraw") ? name : `${name}.excalidraw`;
};
const storagePath = (storageName) => path.join(FILES_ROOT, storageName);
const isDrawing = (data) =>
  data && data.type === "excalidraw" && Array.isArray(data.elements);
const emptyDrawing = () =>
  JSON.stringify(
    { type: "excalidraw", version: 2, source: "workspace", elements: [], appState: { gridSize: null, viewBackgroundColor: "#ffffff" }, files: {} },
    null,
    2,
  );

const mapFile = (row) => ({
  id: row.id,
  name: row.name,
  folderId: row.folder_id,
  size: row.size,
  isFavorite: Boolean(row.is_favorite),
  isDeleted: Boolean(row.is_deleted),
  createdAt: row.created_at,
  updatedAt: row.updated_at,
  lastOpenedAt: row.last_opened_at,
});
const mapFolder = (row) => ({
  id: row.id,
  name: row.name,
  parentId: row.parent_id,
  isDeleted: Boolean(row.is_deleted),
  createdAt: row.created_at,
  updatedAt: row.updated_at,
  itemCount:
    db
      .prepare(
        "SELECT (SELECT COUNT(*) FROM files WHERE folder_id = ? AND is_deleted = 0) + (SELECT COUNT(*) FROM folders WHERE parent_id = ? AND is_deleted = 0) count",
      )
      .get(row.id, row.id).count || 0,
});

const getFileRow = (id) => db.prepare("SELECT * FROM files WHERE id = ?").get(id);
const getFolderRow = (id) => db.prepare("SELECT * FROM folders WHERE id = ?").get(id);

const folderDescendants = (folderId) => {
  const rows = db.prepare(`
    WITH RECURSIVE descendants(id) AS (
      SELECT id FROM folders WHERE id = ?
      UNION ALL SELECT f.id FROM folders f JOIN descendants d ON f.parent_id = d.id
    ) SELECT id FROM descendants
  `).all(folderId);
  return rows.map((row) => row.id);
};

const parseBoolean = (value) => value === true || value === 1 || value === "true";

const listItems = (url) => {
  const scope = url.searchParams.get("scope") || "all";
  const folderId = url.searchParams.get("folderId") || null;
  const query = (url.searchParams.get("query") || "").trim();
  const sort = ["name", "created_at", "updated_at", "size"].includes(url.searchParams.get("sort"))
    ? url.searchParams.get("sort")
    : "updated_at";
  const order = url.searchParams.get("order") === "asc" ? "ASC" : "DESC";
  const params = [];
  const fileWhere = [];
  const folderWhere = [];

  if (scope === "trash") {
    fileWhere.push("is_deleted = 1");
    folderWhere.push("is_deleted = 1");
  } else {
    fileWhere.push("is_deleted = 0");
    folderWhere.push("is_deleted = 0");
  }
  if (scope === "favorites") fileWhere.push("is_favorite = 1");
  if (scope === "recent") fileWhere.push("last_opened_at IS NOT NULL");
  if (folderId && scope === "all" && !query) {
    fileWhere.push("folder_id = ?");
    folderWhere.push("parent_id = ?");
    params.push(folderId, folderId);
  } else if (scope === "all" && !query) {
    fileWhere.push("folder_id IS NULL");
    folderWhere.push("parent_id IS NULL");
  }
  const fileParams = [...params.slice(0, folderId && scope === "all" ? 1 : 0)];
  const folderParams = [...params.slice(folderId && scope === "all" ? 1 : 0)];
  if (query) {
    fileWhere.push("name LIKE ?");
    folderWhere.push("name LIKE ?");
    fileParams.push(`%${query}%`);
    folderParams.push(`%${query}%`);
  }
  const files = db.prepare(`SELECT * FROM files WHERE ${fileWhere.join(" AND ")} ORDER BY ${scope === "recent" ? "last_opened_at" : sort} ${order}`).all(...fileParams).map(mapFile);
  const folders = scope === "recent" || scope === "favorites"
    ? []
    : db.prepare(`SELECT * FROM folders WHERE ${folderWhere.join(" AND ")} ORDER BY ${sort === "size" ? "name" : sort} ${order}`).all(...folderParams).map(mapFolder);
  return { files, folders };
};

const workspaceStats = () => {
  const fileStats = db.prepare("SELECT COUNT(*) count, COALESCE(SUM(size), 0) size FROM files WHERE is_deleted = 0").get();
  const folderStats = db.prepare("SELECT COUNT(*) count FROM folders WHERE is_deleted = 0").get();
  return { fileCount: fileStats.count, folderCount: folderStats.count, usedBytes: fileStats.size, capacityBytes: 10 * 1024 ** 3 };
};

export const handleWorkspaceRequest = async (req, res) => {
  const url = new URL(req.url, "http://localhost");
  const isAuthRequest = url.pathname.startsWith("/api/auth");
  const isWorkspaceRequest = url.pathname.startsWith("/api/workspace");
  if (!isAuthRequest && !isWorkspaceRequest) return false;
  try {
    if (url.pathname === "/api/auth/login" && req.method === "POST") {
      const body = await readJson(req);
      if (body.username !== AUTH_USERNAME || body.password !== AUTH_PASSWORD) {
        sendJson(res, 401, { error: "用户名或密码错误" });
        return true;
      }
      db.prepare("DELETE FROM sessions WHERE expires_at <= ?").run(now());
      const token = createSession(AUTH_USERNAME);
      res.setHeader("set-cookie", sessionCookie(token));
      sendJson(res, 200, { authenticated: true, username: AUTH_USERNAME });
      return true;
    }
    if (url.pathname === "/api/auth/logout" && req.method === "POST") {
      const token = readCookies(req)[SESSION_COOKIE];
      if (token) db.prepare("DELETE FROM sessions WHERE token = ?").run(token);
      res.setHeader("set-cookie", sessionCookie("", 0));
      sendJson(res, 200, { authenticated: false });
      return true;
    }
    if (url.pathname === "/api/auth/session" && req.method === "GET") {
      const session = getSession(req);
      sendJson(
        res,
        200,
        session
          ? { authenticated: true, username: session.username }
          : { authenticated: false },
      );
      return true;
    }
    if (isAuthRequest) {
      sendJson(res, 404, { error: "接口不存在" });
      return true;
    }
    if (!getSession(req)) {
      sendJson(res, 401, { error: "请先登录" });
      return true;
    }

    const parts = url.pathname.split("/").filter(Boolean).slice(2);
    const [resource, id, action] = parts;

    if (req.method === "GET" && resource === "items") {
      sendJson(res, 200, { ...listItems(url), stats: workspaceStats() });
      return true;
    }
    if (req.method === "GET" && resource === "folders" && !id) {
      const folders = db.prepare("SELECT * FROM folders WHERE is_deleted = 0 ORDER BY name COLLATE NOCASE").all().map(mapFolder);
      sendJson(res, 200, { folders });
      return true;
    }
    if (req.method === "POST" && resource === "folders" && !id) {
      const body = await readJson(req);
      const folderId = randomUUID();
      const timestamp = now();
      const name = normalizeName(body.name, "新建文件夹");
      if (body.parentId && !getFolderRow(body.parentId)) throw Object.assign(new Error("父文件夹不存在"), { status: 404 });
      db.prepare("INSERT INTO folders(id, name, parent_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?)").run(folderId, name, body.parentId || null, timestamp, timestamp);
      sendJson(res, 201, mapFolder(getFolderRow(folderId)));
      return true;
    }
    if (resource === "folders" && id && req.method === "PATCH") {
      const row = getFolderRow(id);
      if (!row) throw Object.assign(new Error("文件夹不存在"), { status: 404 });
      const body = await readJson(req);
      db.prepare("UPDATE folders SET name = ?, updated_at = ? WHERE id = ?").run(normalizeName(body.name, row.name), now(), id);
      sendJson(res, 200, mapFolder(getFolderRow(id)));
      return true;
    }
    if (resource === "folders" && id && req.method === "DELETE") {
      const row = getFolderRow(id);
      if (!row) throw Object.assign(new Error("文件夹不存在"), { status: 404 });
      const ids = folderDescendants(id);
      const placeholders = ids.map(() => "?").join(",");
      if (url.searchParams.get("permanent") === "true") {
        const stored = db.prepare(`SELECT storage_name FROM files WHERE folder_id IN (${placeholders})`).all(...ids);
        db.exec("BEGIN");
        try {
          db.prepare(`DELETE FROM files WHERE folder_id IN (${placeholders})`).run(...ids);
          db.prepare(`DELETE FROM folders WHERE id IN (${placeholders})`).run(...ids);
          db.exec("COMMIT");
        } catch (error) { db.exec("ROLLBACK"); throw error; }
        await Promise.all(stored.map(({ storage_name }) => rm(storagePath(storage_name), { force: true })));
      } else {
        db.prepare(`UPDATE files SET is_deleted = 1, updated_at = ? WHERE folder_id IN (${placeholders})`).run(now(), ...ids);
        db.prepare(`UPDATE folders SET is_deleted = 1, updated_at = ? WHERE id IN (${placeholders})`).run(now(), ...ids);
      }
      sendJson(res, 200, { ok: true });
      return true;
    }
    if (resource === "folders" && id && action === "restore" && req.method === "POST") {
      const row = getFolderRow(id);
      if (!row) throw Object.assign(new Error("文件夹不存在"), { status: 404 });
      const ids = folderDescendants(id);
      const placeholders = ids.map(() => "?").join(",");
      db.prepare(`UPDATE folders SET is_deleted = 0, updated_at = ? WHERE id IN (${placeholders})`).run(now(), ...ids);
      db.prepare(`UPDATE files SET is_deleted = 0, updated_at = ? WHERE folder_id IN (${placeholders})`).run(now(), ...ids);
      sendJson(res, 200, { ok: true });
      return true;
    }

    if (req.method === "POST" && resource === "files" && !id) {
      const body = await readJson(req);
      const fileId = randomUUID();
      const storageName = `${fileId}.excalidraw`;
      const content = emptyDrawing();
      await writeFile(storagePath(storageName), content, "utf8");
      const timestamp = now();
      db.prepare("INSERT INTO files(id, name, folder_id, storage_name, size, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)").run(fileId, normalizeDrawingName(body.name), body.folderId || null, storageName, Buffer.byteLength(content), timestamp, timestamp);
      sendJson(res, 201, mapFile(getFileRow(fileId)));
      return true;
    }
    if (req.method === "GET" && resource === "files" && id && !action) {
      const row = getFileRow(id);
      if (!row) throw Object.assign(new Error("文件不存在"), { status: 404 });
      sendJson(res, 200, mapFile(row));
      return true;
    }
    if (req.method === "POST" && resource === "import") {
      const body = await readBody(req);
      let parsed;
      try { parsed = JSON.parse(body.toString("utf8")); } catch { throw Object.assign(new Error("文件不是有效的 JSON"), { status: 400 }); }
      if (!isDrawing(parsed)) throw Object.assign(new Error("请选择有效的 .excalidraw 文件"), { status: 400 });
      const fileId = randomUUID();
      const storageName = `${fileId}.excalidraw`;
      await writeFile(storagePath(storageName), body);
      const timestamp = now();
      const encodedName = req.headers["x-file-name"];
      const fileName = encodedName ? decodeURIComponent(String(encodedName)) : undefined;
      const folderId = req.headers["x-folder-id"] || null;
      db.prepare("INSERT INTO files(id, name, folder_id, storage_name, size, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)").run(fileId, normalizeDrawingName(fileName), folderId, storageName, body.length, timestamp, timestamp);
      sendJson(res, 201, mapFile(getFileRow(fileId)));
      return true;
    }
    if (resource === "files" && id && action === "content" && req.method === "GET") {
      const row = getFileRow(id);
      if (!row) throw Object.assign(new Error("文件不存在"), { status: 404 });
      if (url.searchParams.get("preview") !== "true") {
        db.prepare("UPDATE files SET last_opened_at = ? WHERE id = ?").run(now(), id);
      }
      const content = await readFile(storagePath(row.storage_name));
      res.writeHead(200, { "content-type": "application/vnd.excalidraw+json", "content-length": content.length, "x-workspace-file-name": encodeURIComponent(row.name) });
      res.end(content);
      return true;
    }
    if (resource === "files" && id && action === "content" && req.method === "PUT") {
      const row = getFileRow(id);
      if (!row) throw Object.assign(new Error("文件不存在"), { status: 404 });
      const body = await readBody(req);
      let parsed;
      try { parsed = JSON.parse(body.toString("utf8")); } catch { throw Object.assign(new Error("画板内容不是有效的 JSON"), { status: 400 }); }
      if (!isDrawing(parsed)) throw Object.assign(new Error("画板内容格式不正确"), { status: 400 });
      const tempPath = `${storagePath(row.storage_name)}.tmp`;
      await writeFile(tempPath, body);
      await rename(tempPath, storagePath(row.storage_name));
      db.prepare("UPDATE files SET size = ?, updated_at = ? WHERE id = ?").run(body.length, now(), id);
      sendJson(res, 200, mapFile(getFileRow(id)));
      return true;
    }
    if (resource === "files" && id && req.method === "PATCH") {
      const row = getFileRow(id);
      if (!row) throw Object.assign(new Error("文件不存在"), { status: 404 });
      const body = await readJson(req);
      db.prepare("UPDATE files SET name = ?, folder_id = ?, is_favorite = ?, updated_at = ? WHERE id = ?").run(
        body.name === undefined ? row.name : normalizeDrawingName(body.name),
        body.folderId === undefined ? row.folder_id : body.folderId || null,
        body.isFavorite === undefined ? row.is_favorite : Number(parseBoolean(body.isFavorite)),
        now(), id,
      );
      sendJson(res, 200, mapFile(getFileRow(id)));
      return true;
    }
    if (resource === "files" && id && req.method === "DELETE") {
      const row = getFileRow(id);
      if (!row) throw Object.assign(new Error("文件不存在"), { status: 404 });
      if (url.searchParams.get("permanent") === "true") {
        db.prepare("DELETE FROM files WHERE id = ?").run(id);
        await rm(storagePath(row.storage_name), { force: true });
      } else {
        db.prepare("UPDATE files SET is_deleted = 1, updated_at = ? WHERE id = ?").run(now(), id);
      }
      sendJson(res, 200, { ok: true });
      return true;
    }
    if (resource === "files" && id && action === "restore" && req.method === "POST") {
      if (!getFileRow(id)) throw Object.assign(new Error("文件不存在"), { status: 404 });
      db.prepare("UPDATE files SET is_deleted = 0, updated_at = ? WHERE id = ?").run(now(), id);
      sendJson(res, 200, mapFile(getFileRow(id)));
      return true;
    }

    sendJson(res, 404, { error: "接口不存在" });
    return true;
  } catch (error) {
    console.error("[workspace]", error);
    sendJson(res, error.status || 500, { error: error.message || "服务器错误" });
    return true;
  }
};

export const workspaceApiPlugin = () => ({
  name: "workspace-api",
  configureServer(server) {
    server.middlewares.use(async (req, res, next) => {
      if (!(await handleWorkspaceRequest(req, res))) next();
    });
  },
});

const serveStatic = (req, res, buildDir) => {
  const url = new URL(req.url, "http://localhost");
  const requested = path.normalize(decodeURIComponent(url.pathname)).replace(/^(\.\.[/\\])+/, "");
  let filePath = path.join(buildDir, requested === "/" ? "index.html" : requested);
  if (!filePath.startsWith(buildDir) || !existsSync(filePath) || statSync(filePath).isDirectory()) filePath = path.join(buildDir, "index.html");
  const ext = path.extname(filePath);
  const types = { ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".css": "text/css", ".svg": "image/svg+xml", ".png": "image/png", ".woff2": "font/woff2", ".json": "application/json" };
  res.writeHead(200, { "content-type": types[ext] || "application/octet-stream" });
  createReadStream(filePath).pipe(res);
};

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const buildDir = path.resolve(APP_ROOT, "excalidraw-app/build");
  if (!existsSync(buildDir)) {
    console.error("未找到生产构建，请先运行 yarn build");
    process.exit(1);
  }
  const port = Number(process.env.PORT || 5001);
  createServer(async (req, res) => {
    if (!(await handleWorkspaceRequest(req, res))) serveStatic(req, res, buildDir);
  }).listen(port, () => console.log(`Excalidraw File Manager: http://localhost:${port}`));
}
