import { randomUUID } from "node:crypto";
import { readFile, rm } from "node:fs/promises";

import {
  createEmptyDrawing,
  isDrawing,
  normalizeDrawingName,
} from "./drawing.ts";
import { HttpError } from "./http.ts";
import { mapWorkspaceFile } from "./workspace-records.ts";

import type { DatabaseSync } from "node:sqlite";
import type { FileStorage } from "./file-storage.ts";
import type { WorkspaceFileRow } from "./workspace-records.ts";

type FilePatch = {
  name?: unknown;
  folderId?: unknown;
  isFavorite?: unknown;
};

const parseBoolean = (value: unknown) =>
  value === true || value === 1 || value === "true";

export const createWorkspaceFileService = (
  database: DatabaseSync,
  files: FileStorage,
  now: () => string,
) => {
  const getRow = (id: string) =>
    database.prepare("SELECT * FROM files WHERE id = ?").get(id) as
      | WorkspaceFileRow
      | undefined;

  const requireRow = (id: string) => {
    const row = getRow(id);
    if (!row) {
      throw new HttpError(404, "文件不存在");
    }
    return row;
  };

  const get = (id: string) => mapWorkspaceFile(requireRow(id));

  const create = async (name: unknown, folderId: unknown) => {
    const id = randomUUID();
    const storageName = `${id}.excalidraw`;
    const content = createEmptyDrawing();
    await files.replaceAtomically(files.storagePath(storageName), content);
    const timestamp = now();
    database
      .prepare(
        "INSERT INTO files(id, name, folder_id, storage_name, size, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
      )
      .run(
        id,
        normalizeDrawingName(name),
        typeof folderId === "string" ? folderId : null,
        storageName,
        Buffer.byteLength(content),
        timestamp,
        timestamp,
      );
    return get(id);
  };

  const readContent = async (id: string, preview: boolean) => {
    const row = requireRow(id);
    if (!preview) {
      database
        .prepare("UPDATE files SET last_opened_at = ? WHERE id = ?")
        .run(now(), id);
    }
    return {
      content: await readFile(files.storagePath(row.storage_name)),
      name: row.name,
    };
  };

  const writeContent = async (id: string, body: Buffer) => {
    const row = requireRow(id);
    let parsed: unknown;
    try {
      parsed = JSON.parse(body.toString("utf8"));
    } catch {
      throw new HttpError(400, "画板内容不是有效的 JSON");
    }
    if (!isDrawing(parsed)) {
      throw new HttpError(400, "画板内容格式不正确");
    }
    await files.serializeWrite(row.storage_name, async () => {
      await files.replaceAtomically(files.storagePath(row.storage_name), body);
      database
        .prepare("UPDATE files SET size = ?, updated_at = ? WHERE id = ?")
        .run(body.length, now(), id);
    });
    return get(id);
  };

  const update = (id: string, patch: FilePatch) => {
    const row = requireRow(id);
    database
      .prepare(
        "UPDATE files SET name = ?, folder_id = ?, is_favorite = ?, updated_at = ? WHERE id = ?",
      )
      .run(
        patch.name === undefined ? row.name : normalizeDrawingName(patch.name),
        patch.folderId === undefined
          ? row.folder_id
          : typeof patch.folderId === "string"
          ? patch.folderId
          : null,
        patch.isFavorite === undefined
          ? row.is_favorite
          : Number(parseBoolean(patch.isFavorite)),
        now(),
        id,
      );
    return get(id);
  };

  const remove = async (id: string, permanent: boolean) => {
    const row = requireRow(id);
    if (permanent) {
      database.prepare("DELETE FROM files WHERE id = ?").run(id);
      await rm(files.storagePath(row.storage_name), { force: true });
    } else {
      database
        .prepare("UPDATE files SET is_deleted = 1, updated_at = ? WHERE id = ?")
        .run(now(), id);
    }
  };

  const restore = (id: string) => {
    requireRow(id);
    database
      .prepare("UPDATE files SET is_deleted = 0, updated_at = ? WHERE id = ?")
      .run(now(), id);
    return get(id);
  };

  return {
    create,
    get,
    getRow,
    readContent,
    remove,
    restore,
    update,
    writeContent,
  };
};

export type WorkspaceFileService = ReturnType<
  typeof createWorkspaceFileService
>;
