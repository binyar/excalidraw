import { Type } from "@earendil-works/pi-ai";

import {
  getLibraryCatalogItem,
  searchLibraryCatalog,
} from "../library-catalog.ts";

import { childLayoutSchema } from "./schemas.ts";
import {
  assertCanvasDraftCapacity,
  assertDirectorFrozen,
  assertMutable,
} from "./state-guards.ts";
import { defineTool, resultText } from "./tool-types.ts";

import type { CanvasDraftLibraryAsset } from "../../../../src/ai/story/types.ts";
import type { CanvasDraftState } from "./state.ts";

export type LibraryRefResolution = {
  ref: string;
  resolvedFromQuery: string | null;
};

type AssetToolOptions = {
  state: CanvasDraftState;
  installedAssetSources: string[];
  recentLibrarySearches: Map<
    string,
    Awaited<ReturnType<typeof searchLibraryCatalog>>
  >;
  resolveLibraryRef: (
    candidate: string,
  ) => Promise<LibraryRefResolution | null>;
};

export const createAssetTools = ({
  state,
  installedAssetSources,
  recentLibrarySearches,
  resolveLibraryRef,
}: AssetToolOptions) => [
  defineTool({
    name: "search_library_assets",
    label: "搜索已安装素材",
    description:
      "按当前用户的已安装素材配置搜索图标、人物、设备、云服务、界面控件或插画。工具必须保留，但不得读取未安装素材包。检索关键词属于内部工具参数；所有面向用户的资源名称、用途和说明必须使用中文。",
    parameters: Type.Object({
      query: Type.String({ minLength: 1, maxLength: 160 }),
      limit: Type.Optional(Type.Number({ minimum: 1, maximum: 12 })),
    }),
    executionMode: "sequential",
    async execute(_id, params) {
      const results = await searchLibraryCatalog(params.query, params.limit, {
        sources: installedAssetSources,
      });
      recentLibrarySearches.set(params.query.trim().toLowerCase(), results);
      return resultText(
        results.length
          ? `找到 ${results.length} 个可用资源条目。请使用 add_library_assets 并传入 ref 实例化需要的条目。`
          : installedAssetSources.length === 0
          ? "当前没有安装任何素材包，请直接使用基础画布元素继续。"
          : "已安装素材中没有匹配内容，请尝试更短的检索关键词或改用基础画布元素。",
        { kind: "library-search-results", query: params.query, results },
      );
    },
  }),
  defineTool({
    name: "add_library_assets",
    label: "添加已安装素材",
    description:
      "实例化当前用户已安装素材包中的条目。必须使用 search_library_assets 返回的真实 ref，不能绕过安装配置读取其他素材。可选资源缺失时会跳过该资源而不会让画布草稿失败，此时应继续使用基础画布元素。卡片内图标需要提供 parentId 和 layout，并省略 x/y，工具会确定性计算位置。所有资源角色和用户可见说明必须使用中文。",
    parameters: Type.Object({
      assets: Type.Array(
        Type.Object({
          id: Type.String({ minLength: 1, maxLength: 64 }),
          ref: Type.String({ minLength: 3, maxLength: 240 }),
          role: Type.Optional(Type.String({ maxLength: 64 })),
          sectionId: Type.Optional(
            Type.String({ minLength: 1, maxLength: 64 }),
          ),
          parentId: Type.Optional(Type.String({ minLength: 1, maxLength: 64 })),
          layout: Type.Optional(childLayoutSchema),
          x: Type.Optional(Type.Number({ minimum: -20_000, maximum: 20_000 })),
          y: Type.Optional(Type.Number({ minimum: -20_000, maximum: 20_000 })),
          width: Type.Optional(Type.Number({ minimum: 20, maximum: 4000 })),
          height: Type.Optional(Type.Number({ minimum: 20, maximum: 4000 })),
        }),
        { minItems: 1, maxItems: 24 },
      ),
    }),
    executionMode: "sequential",
    async execute(_id, params) {
      assertMutable(state);
      assertDirectorFrozen(state);
      const existingIds = new Set([
        ...state.elements.map((element) => element.id),
        ...state.libraryAssets.map((asset) => asset.id),
        ...state.connectors.map((connector) => connector.id),
      ]);
      const pendingAssets: CanvasDraftLibraryAsset[] = [];
      const resolvedQueries: string[] = [];
      const skippedAssets: Array<{
        id: string;
        query: string;
        reason: "no-match";
      }> = [];
      for (const asset of params.assets) {
        if (existingIds.has(asset.id)) {
          throw new Error(`画布语义 id 重复：${asset.id}`);
        }
        if (Boolean(asset.parentId) !== Boolean(asset.layout)) {
          throw new Error(`资源 ${asset.id} 必须同时提供 parentId 和 layout`);
        }
        if (
          asset.sectionId &&
          !state.sections.some((section) => section.id === asset.sectionId)
        ) {
          throw new Error(
            `资源 ${asset.id} 引用了不存在的 Section ${asset.sectionId}`,
          );
        }
        if (
          !asset.parentId &&
          !asset.sectionId &&
          (asset.x === undefined || asset.y === undefined)
        ) {
          throw new Error(
            `未托管到 Section 的顶层资源 ${asset.id} 必须提供 x 和 y`,
          );
        }
        const resolved = await resolveLibraryRef(asset.ref);
        if (!resolved) {
          skippedAssets.push({
            id: asset.id,
            query: asset.ref,
            reason: "no-match",
          });
          continue;
        }
        const { ref, resolvedFromQuery } = resolved;
        const item = await getLibraryCatalogItem(ref, {
          sources: installedAssetSources,
        });
        const requestedWidth = asset.width ?? item.width;
        const requestedHeight = asset.height ?? item.height;
        if (!requestedWidth || !requestedHeight) {
          throw new Error(`资源 ${asset.ref} 缺少有效尺寸`);
        }
        pendingAssets.push({
          ...structuredClone(asset),
          ref,
          x: asset.x ?? 0,
          y: asset.y ?? 0,
          width: requestedWidth,
          height: requestedHeight,
          sourceWidth: item.width,
          sourceHeight: item.height,
          libraryName: item.libraryName,
          itemName: item.itemName,
          // Catalog JSON is parsed at the storage boundary. Its entries are
          // Excalidraw library elements by contract.
          elements: item.elements as CanvasDraftLibraryAsset["elements"],
          ...(asset.sectionId
            ? {
                layoutFrame: {
                  x: asset.x ?? 0,
                  y: asset.y ?? 0,
                  width: requestedWidth,
                  height: requestedHeight,
                },
              }
            : {}),
        });
        if (resolvedFromQuery) {
          resolvedQueries.push(`“${resolvedFromQuery}”→“${item.itemName}”`);
        }
        existingIds.add(asset.id);
      }
      assertCanvasDraftCapacity(state, pendingAssets.length);
      state.libraryAssets.push(...pendingAssets);
      if (pendingAssets.some((asset) => asset.sectionId)) {
        state.layoutNeedsMaterialization = true;
      }
      return resultText(
        `已添加 ${pendingAssets.length} 个资源库条目。${
          resolvedQueries.length > 0
            ? ` 已自动选择：${resolvedQueries.join("、")}。`
            : ""
        }${
          skippedAssets.length > 0
            ? ` ${skippedAssets.length} 个可选素材未命中并已跳过，请直接使用基础画布元素继续。`
            : ""
        }`,
        {
          kind: "library-add-result",
          addedAssetIds: pendingAssets.map((asset) => asset.id),
          skippedAssets,
        },
      );
    },
  }),
];
