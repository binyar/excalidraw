import {
  isLibraryCatalogRef,
  searchLibraryCatalog,
} from "./library-catalog.ts";
import { createAssetTools } from "./canvas-tools/asset-tools.ts";
import { createElementTools } from "./canvas-tools/element-tools.ts";
import { createFinalizeTools } from "./canvas-tools/finalize-tools.ts";
import { createStoryTools } from "./canvas-tools/story-tools.ts";
import { ASSET_ENHANCEMENT_SKILL_ID } from "./skill-catalog.ts";

import type { AgentTool } from "@earendil-works/pi-agent-core";
import type { CanvasToolOptions } from "./canvas-tools/tool-types.ts";

export { resolveReadableTextColor } from "./canvas-tools/readable-color.ts";
export { selectRandomPageTransition } from "./canvas-tools/director-plan.ts";
export { createCanvasDraftState } from "./canvas-tools/state.ts";

export const createCanvasTools = ({
  state,
  animate,
  assetSources = [],
  enabledSkillIds = [ASSET_ENHANCEMENT_SKILL_ID],
  random = Math.random,
}: CanvasToolOptions) => {
  const installedAssetSources = [...new Set(assetSources.map(String))];
  const installedAssetSourceSet = new Set(installedAssetSources);
  const recentLibrarySearches = new Map<
    string,
    Awaited<ReturnType<typeof searchLibraryCatalog>>
  >();

  const resolveLibraryRef = async (candidate: string) => {
    if (isLibraryCatalogRef(candidate)) {
      const ref = String(candidate);
      if (/^素材-\d+-\d+$/.test(ref)) {
        return { ref, resolvedFromQuery: null };
      }
      const source = ref.slice(0, ref.lastIndexOf("#"));
      if (!installedAssetSourceSet.has(source)) {
        return null;
      }
      return { ref, resolvedFromQuery: null };
    }
    const query = String(candidate || "").trim();
    const cachedResults = recentLibrarySearches.get(query.toLowerCase());
    const results =
      cachedResults ||
      (await searchLibraryCatalog(query, 1, {
        sources: installedAssetSources,
      }));
    if (results.length === 0) {
      return null;
    }
    return { ref: results[0].ref, resolvedFromQuery: query };
  };

  const tools = [
    ...createStoryTools({ state, random }),
    ...createAssetTools({
      state,
      installedAssetSources,
      recentLibrarySearches,
      resolveLibraryRef,
    }),
    ...createElementTools(state),
    ...createFinalizeTools({ state, animate }),
  ];

  const enabledTools = enabledSkillIds.includes(ASSET_ENHANCEMENT_SKILL_ID)
    ? tools
    : tools.filter(
        (tool) =>
          tool.name !== "search_library_assets" &&
          tool.name !== "add_library_assets",
      );
  // Pi validates every call against its concrete TypeBox schema before
  // execution. Erase the heterogeneous schema tuple only at the Agent boundary.
  return enabledTools as unknown as AgentTool[];
};
