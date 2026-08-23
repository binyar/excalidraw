import type { AssetPackItem } from "../workspace/assetPacks";

export type AdminAssetPack = {
  id: string;
  name: string;
  description: string;
  author: string;
  source: string;
  updated: string;
  itemCount: number;
  fileSize: number;
  builtin: boolean;
  previewItems: AssetPackItem[];
};

export type AdminAssetPackDetail = AdminAssetPack & {
  items: AssetPackItem[];
};

export type AdminAssetItemDeleteResult =
  | (AdminAssetPackDetail & {
      deletedItem: AssetPackItem;
      packDeleted: false;
    })
  | {
      id: string;
      source: string;
      deletedItem: AssetPackItem;
      packDeleted: true;
    };

export type AdminAssetPackList = {
  packs: AdminAssetPack[];
  totalCount: number;
  builtinCount: number;
  totalBytes: number;
};

const API_ROOT = "/api/admin/asset-packs";

const request = async <T>(path = "", options?: RequestInit): Promise<T> => {
  const response = await fetch(`${API_ROOT}${path}`, options);
  if (response.status === 401) {
    const next = `${window.location.pathname}${window.location.search}`;
    window.location.replace(`/login?next=${encodeURIComponent(next)}`);
    throw new Error("登录状态已失效，请重新登录");
  }
  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(payload?.error || `请求失败 (${response.status})`);
  }
  return payload as T;
};

export const assetAdminApi = {
  list: () => request<AdminAssetPackList>(),
  get: (id: string) =>
    request<AdminAssetPackDetail>(`/${encodeURIComponent(id)}`),
  updateBuiltin: (id: string, builtin: boolean) =>
    request<AdminAssetPack>(`/${encodeURIComponent(id)}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ builtin }),
    }),
  delete: (id: string) =>
    request<{ id: string; source: string; deleted: true }>(
      `/${encodeURIComponent(id)}`,
      { method: "DELETE" },
    ),
  deleteItem: (packId: string, itemIndex: number) =>
    request<AdminAssetItemDeleteResult>(
      `/${encodeURIComponent(packId)}/items/${itemIndex}`,
      { method: "DELETE" },
    ),
};
