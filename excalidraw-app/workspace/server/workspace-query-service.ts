import { mapWorkspaceFile, mapWorkspaceFolder } from "./workspace-records.ts";

import type { DatabaseSync, SQLInputValue } from "node:sqlite";
import type {
  WorkspaceFileRow,
  WorkspaceFolderRow,
} from "./workspace-records.ts";

type CountRow = { count: number };
type FileStatsRow = CountRow & { size: number };

const SORT_COLUMNS = new Set(["name", "created_at", "updated_at", "size"]);

export const createWorkspaceQueryService = (database: DatabaseSync) => {
  const folderItemCount = (folderId: string) =>
    (
      database
        .prepare(
          "SELECT (SELECT COUNT(*) FROM files WHERE folder_id = ? AND is_deleted = 0) + (SELECT COUNT(*) FROM folders WHERE parent_id = ? AND is_deleted = 0) count",
        )
        .get(folderId, folderId) as CountRow
    ).count || 0;

  const mapFolder = (row: WorkspaceFolderRow) =>
    mapWorkspaceFolder(row, folderItemCount(row.id));

  const listFolders = () =>
    (
      database
        .prepare(
          "SELECT * FROM folders WHERE is_deleted = 0 ORDER BY name COLLATE NOCASE",
        )
        .all() as WorkspaceFolderRow[]
    ).map(mapFolder);

  const listItems = (url: URL) => {
    const scope = url.searchParams.get("scope") || "all";
    const folderId = url.searchParams.get("folderId") || null;
    const query = (url.searchParams.get("query") || "").trim();
    const requestedSort = url.searchParams.get("sort") || "";
    const sort = SORT_COLUMNS.has(requestedSort) ? requestedSort : "updated_at";
    const order = url.searchParams.get("order") === "asc" ? "ASC" : "DESC";
    const params: SQLInputValue[] = [];
    const fileWhere: string[] = [];
    const folderWhere: string[] = [];

    if (scope === "trash") {
      fileWhere.push("is_deleted = 1");
      folderWhere.push("is_deleted = 1");
    } else {
      fileWhere.push("is_deleted = 0");
      folderWhere.push("is_deleted = 0");
    }
    if (scope === "favorites") {
      fileWhere.push("is_favorite = 1");
    }
    if (scope === "recent") {
      fileWhere.push("last_opened_at IS NOT NULL");
    }
    if (folderId && scope === "all" && !query) {
      fileWhere.push("folder_id = ?");
      folderWhere.push("parent_id = ?");
      params.push(folderId, folderId);
    } else if (scope === "all" && !query) {
      fileWhere.push("folder_id IS NULL");
      folderWhere.push("parent_id IS NULL");
    }
    const fileParams = [
      ...params.slice(0, folderId && scope === "all" ? 1 : 0),
    ];
    const folderParams = [...params.slice(folderId && scope === "all" ? 1 : 0)];
    if (query) {
      fileWhere.push("name LIKE ?");
      folderWhere.push("name LIKE ?");
      fileParams.push(`%${query}%`);
      folderParams.push(`%${query}%`);
    }
    const files = (
      database
        .prepare(
          `SELECT * FROM files WHERE ${fileWhere.join(" AND ")} ORDER BY ${
            scope === "recent" ? "last_opened_at" : sort
          } ${order}`,
        )
        .all(...fileParams) as WorkspaceFileRow[]
    ).map(mapWorkspaceFile);
    const folders =
      scope === "recent" || scope === "favorites"
        ? []
        : (
            database
              .prepare(
                `SELECT * FROM folders WHERE ${folderWhere.join(
                  " AND ",
                )} ORDER BY ${sort === "size" ? "name" : sort} ${order}`,
              )
              .all(...folderParams) as WorkspaceFolderRow[]
          ).map(mapFolder);
    return { files, folders };
  };

  const stats = () => {
    const fileStats = database
      .prepare(
        "SELECT COUNT(*) count, COALESCE(SUM(size), 0) size FROM files WHERE is_deleted = 0",
      )
      .get() as FileStatsRow;
    const folderStats = database
      .prepare("SELECT COUNT(*) count FROM folders WHERE is_deleted = 0")
      .get() as CountRow;
    return {
      fileCount: fileStats.count,
      folderCount: folderStats.count,
      usedBytes: fileStats.size,
      capacityBytes: 10 * 1024 ** 3,
    };
  };

  return { listFolders, listItems, mapFolder, stats };
};

export type WorkspaceQueryService = ReturnType<
  typeof createWorkspaceQueryService
>;
