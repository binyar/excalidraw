import type { WorkspaceFile, WorkspaceFolder } from "../types.ts";

export type WorkspaceFileRow = {
  id: string;
  name: string;
  folder_id: string | null;
  storage_name: string;
  size: number;
  is_favorite: number;
  is_deleted: number;
  created_at: string;
  updated_at: string;
  last_opened_at: string | null;
};

export type WorkspaceFolderRow = {
  id: string;
  name: string;
  parent_id: string | null;
  is_deleted: number;
  created_at: string;
  updated_at: string;
};

export const mapWorkspaceFile = (row: WorkspaceFileRow): WorkspaceFile => ({
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

export const mapWorkspaceFolder = (
  row: WorkspaceFolderRow,
  itemCount: number,
): WorkspaceFolder => ({
  id: row.id,
  name: row.name,
  parentId: row.parent_id,
  isDeleted: Boolean(row.is_deleted),
  createdAt: row.created_at,
  updatedAt: row.updated_at,
  itemCount,
});
