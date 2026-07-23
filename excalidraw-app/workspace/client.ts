import type {
  WorkspaceFile,
  WorkspaceFolder,
  WorkspaceScope,
  WorkspaceStats,
} from "./types";

const API_ROOT = "/api/workspace";

const request = async <T>(url: string, options?: RequestInit): Promise<T> => {
  const response = await fetch(`${API_ROOT}${url}`, options);
  if (response.status === 401) {
    const next = `${window.location.pathname}${window.location.search}`;
    window.location.replace(`/login?next=${encodeURIComponent(next)}`);
    throw new Error("登录状态已失效，请重新登录");
  }
  if (!response.ok) {
    const payload = await response.json().catch(() => null);
    throw new Error(payload?.error || `请求失败 (${response.status})`);
  }
  const contentType = response.headers.get("content-type") || "";
  return (
    contentType.includes("json") ? response.json() : response.blob()
  ) as Promise<T>;
};

export const workspaceApi = {
  list: (params: {
    scope: WorkspaceScope;
    folderId?: string | null;
    query?: string;
    sort?: string;
    order?: "asc" | "desc";
  }) => {
    const search = new URLSearchParams();
    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined && value !== null && value !== "") {
        search.set(key, String(value));
      }
    });
    return request<{
      files: WorkspaceFile[];
      folders: WorkspaceFolder[];
      stats: WorkspaceStats;
    }>(`/items?${search}`);
  },
  folders: () => request<{ folders: WorkspaceFolder[] }>("/folders"),
  createFolder: (name: string, parentId?: string | null) =>
    request<WorkspaceFolder>("/folders", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name, parentId }),
    }),
  updateFolder: (id: string, name: string) =>
    request<WorkspaceFolder>(`/folders/${id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name }),
    }),
  deleteFolder: (id: string, permanent = false) =>
    request<{ ok: true }>(`/folders/${id}?permanent=${permanent}`, {
      method: "DELETE",
    }),
  restoreFolder: (id: string) =>
    request<{ ok: true }>(`/folders/${id}/restore`, { method: "POST" }),
  createFile: (name: string, folderId?: string | null) =>
    request<WorkspaceFile>("/files", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name, folderId }),
    }),
  getFile: (id: string) => request<WorkspaceFile>(`/files/${id}`),
  importFile: (file: File, folderId?: string | null) =>
    request<WorkspaceFile>("/import", {
      method: "POST",
      headers: {
        "content-type": "application/vnd.excalidraw+json",
        "x-file-name": encodeURIComponent(file.name),
        ...(folderId ? { "x-folder-id": folderId } : {}),
      },
      body: file,
    }),
  updateFile: (
    id: string,
    patch: Partial<Pick<WorkspaceFile, "name" | "folderId" | "isFavorite">>,
  ) =>
    request<WorkspaceFile>(`/files/${id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(patch),
    }),
  deleteFile: (id: string, permanent = false) =>
    request<{ ok: true }>(`/files/${id}?permanent=${permanent}`, {
      method: "DELETE",
    }),
  restoreFile: (id: string) =>
    request<WorkspaceFile>(`/files/${id}/restore`, { method: "POST" }),
  getContent: (id: string) => request<Blob>(`/files/${id}/content`),
};

export const downloadWorkspaceFile = async (file: WorkspaceFile) => {
  const blob = await workspaceApi.getContent(file.id);
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = file.name;
  anchor.click();
  URL.revokeObjectURL(url);
};
