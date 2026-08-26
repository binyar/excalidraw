import { randomUUID } from "node:crypto";
import { rm } from "node:fs/promises";

import { normalizeName } from "./drawing.ts";
import { HttpError } from "./http.ts";

import type { DatabaseSync } from "node:sqlite";
import type { FileStorage } from "./file-storage.ts";
import type { WorkspaceQueryService } from "./workspace-query-service.ts";
import type { WorkspaceFolderRow } from "./workspace-records.ts";

type StorageRow = { storage_name: string };
type DescendantRow = { id: string };

export const createFolderService = (
  database: DatabaseSync,
  files: FileStorage,
  queries: WorkspaceQueryService,
  now: () => string,
) => {
  const getRow = (id: string) =>
    database.prepare("SELECT * FROM folders WHERE id = ?").get(id) as
      | WorkspaceFolderRow
      | undefined;

  const requireRow = (id: string) => {
    const row = getRow(id);
    if (!row) {
      throw new HttpError(404, "文件夹不存在");
    }
    return row;
  };

  const descendants = (folderId: string) =>
    (
      database
        .prepare(
          `WITH RECURSIVE descendants(id) AS (
             SELECT id FROM folders WHERE id = ?
             UNION ALL SELECT f.id FROM folders f JOIN descendants d ON f.parent_id = d.id
           ) SELECT id FROM descendants`,
        )
        .all(folderId) as DescendantRow[]
    ).map((row) => row.id);

  const create = (name: unknown, parentId: unknown) => {
    const normalizedParentId = typeof parentId === "string" ? parentId : null;
    if (normalizedParentId && !getRow(normalizedParentId)) {
      throw new HttpError(404, "父文件夹不存在");
    }
    const id = randomUUID();
    const timestamp = now();
    database
      .prepare(
        "INSERT INTO folders(id, name, parent_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?)",
      )
      .run(
        id,
        normalizeName(name, "新建文件夹"),
        normalizedParentId,
        timestamp,
        timestamp,
      );
    return queries.mapFolder(requireRow(id));
  };

  const rename = (id: string, name: unknown) => {
    const row = requireRow(id);
    database
      .prepare("UPDATE folders SET name = ?, updated_at = ? WHERE id = ?")
      .run(normalizeName(name, row.name), now(), id);
    return queries.mapFolder(requireRow(id));
  };

  const remove = async (id: string, permanent: boolean) => {
    requireRow(id);
    const ids = descendants(id);
    const placeholders = ids.map(() => "?").join(",");
    if (permanent) {
      const stored = database
        .prepare(
          `SELECT storage_name FROM files WHERE folder_id IN (${placeholders})`,
        )
        .all(...ids) as StorageRow[];
      database.exec("BEGIN");
      try {
        database
          .prepare(`DELETE FROM files WHERE folder_id IN (${placeholders})`)
          .run(...ids);
        database
          .prepare(`DELETE FROM folders WHERE id IN (${placeholders})`)
          .run(...ids);
        database.exec("COMMIT");
      } catch (error) {
        database.exec("ROLLBACK");
        throw error;
      }
      await Promise.all(
        stored.map(({ storage_name }) =>
          rm(files.storagePath(storage_name), { force: true }),
        ),
      );
    } else {
      database
        .prepare(
          `UPDATE files SET is_deleted = 1, updated_at = ? WHERE folder_id IN (${placeholders})`,
        )
        .run(now(), ...ids);
      database
        .prepare(
          `UPDATE folders SET is_deleted = 1, updated_at = ? WHERE id IN (${placeholders})`,
        )
        .run(now(), ...ids);
    }
  };

  const restore = (id: string) => {
    requireRow(id);
    const ids = descendants(id);
    const placeholders = ids.map(() => "?").join(",");
    database
      .prepare(
        `UPDATE folders SET is_deleted = 0, updated_at = ? WHERE id IN (${placeholders})`,
      )
      .run(now(), ...ids);
    database
      .prepare(
        `UPDATE files SET is_deleted = 0, updated_at = ? WHERE folder_id IN (${placeholders})`,
      )
      .run(now(), ...ids);
  };

  return { create, remove, rename, restore };
};

export type FolderService = ReturnType<typeof createFolderService>;
