export type WorkspaceFile = {
  id: string;
  name: string;
  folderId: string | null;
  size: number;
  isFavorite: boolean;
  isDeleted: boolean;
  createdAt: string;
  updatedAt: string;
  lastOpenedAt: string | null;
};

export type WorkspaceFolder = {
  id: string;
  name: string;
  parentId: string | null;
  isDeleted: boolean;
  createdAt: string;
  updatedAt: string;
  itemCount: number;
};

export type WorkspaceStats = {
  fileCount: number;
  folderCount: number;
  usedBytes: number;
  capacityBytes: number;
};

export type WorkspaceScope = "all" | "recent" | "favorites" | "trash";
