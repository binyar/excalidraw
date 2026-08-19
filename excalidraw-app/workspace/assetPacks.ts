export type AssetPackCategory =
  | "all"
  | "architecture"
  | "flow"
  | "ui"
  | "icons"
  | "characters"
  | "general";

export type AssetPackItem = {
  ref: string;
  itemName: string;
  itemIndex: number;
  width: number;
  height: number;
  elementCount: number;
};

export type AssetPack = {
  id: string;
  name: string;
  description: string;
  author: string;
  source: string;
  updated: string;
  itemCount: number;
  category: Exclude<AssetPackCategory, "all">;
  previewItems: AssetPackItem[];
  installed: boolean;
};

export type AssetPackDetail = AssetPack & {
  items: AssetPackItem[];
};

export type AssetPackItemPreview = AssetPackItem & {
  elements: ReadonlyArray<Record<string, unknown>>;
};

export const ASSET_PACK_CATEGORIES: Array<{
  id: AssetPackCategory;
  label: string;
}> = [
  { id: "all", label: "全部素材包" },
  { id: "architecture", label: "架构与云服务" },
  { id: "flow", label: "流程与图表" },
  { id: "ui", label: "界面与产品" },
  { id: "icons", label: "图标与标识" },
  { id: "characters", label: "人物与角色" },
  { id: "general", label: "通用素材" },
];

const API_ROOT = "/api/workspace/asset-packs";

const request = async <T>(path = "", options?: RequestInit): Promise<T> => {
  const response = await fetch(`${API_ROOT}${path}`, options);
  if (response.status === 401) {
    const next = `${window.location.pathname}${window.location.search}`;
    window.location.replace(`/login?next=${encodeURIComponent(next)}`);
    throw new Error("登录状态已失效，请重新登录");
  }
  if (!response.ok) {
    const payload = await response.json().catch(() => null);
    throw new Error(payload?.error || `请求失败 (${response.status})`);
  }
  return response.json() as Promise<T>;
};

export const assetPackApi = {
  list: () => request<{ packs: AssetPack[]; installedCount: number }>(),
  get: (id: string) => request<AssetPackDetail>(`/${encodeURIComponent(id)}`),
  getItemPreview: (packId: string, itemIndex: number) =>
    request<AssetPackItemPreview>(
      `/${encodeURIComponent(packId)}/items/${itemIndex}`,
    ),
  install: (id: string) =>
    request<AssetPackDetail>(`/${encodeURIComponent(id)}/install`, {
      method: "POST",
    }),
  uninstall: (id: string) =>
    request<{ id: string; installed: false }>(
      `/${encodeURIComponent(id)}/install`,
      { method: "DELETE" },
    ),
};

export const getAssetPackIdFromPath = (pathname = window.location.pathname) => {
  const match = pathname.match(/^\/assets\/([^/]+)\/?$/);
  return match ? decodeURIComponent(match[1]) : null;
};

export const isAssetLibraryPath = (pathname = window.location.pathname) =>
  pathname === "/assets" ||
  pathname === "/assets/" ||
  Boolean(getAssetPackIdFromPath(pathname));
