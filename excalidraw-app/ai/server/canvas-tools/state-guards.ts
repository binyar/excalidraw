import type { CanvasDraftState } from "./state.ts";

const MAX_CANVAS_DRAFT_ITEMS = 250;

export const assertCanvasDraftCapacity = (
  state: CanvasDraftState,
  additionalItems = 0,
) => {
  const nextCount =
    state.elements.length + state.libraryAssets.length + additionalItems;
  if (nextCount > MAX_CANVAS_DRAFT_ITEMS) {
    throw new Error(
      `画布草稿的元素和资源数量不能超过 ${MAX_CANVAS_DRAFT_ITEMS}，当前操作后将达到 ${nextCount}`,
    );
  }
};

export const assertMutable = (state: CanvasDraftState) => {
  if (state.frozen) {
    throw new Error("画布草稿已冻结，不能继续修改");
  }
};

export const assertDirectorMutable = (state: CanvasDraftState) => {
  if (state.directorFrozen) {
    throw new Error("Story Director Plan 已冻结，不能继续修改故事规划");
  }
};

export const assertDirectorFrozen = (state: CanvasDraftState) => {
  if (!state.requireDirectorPlan) {
    return;
  }
  if (!state.directorFrozen || !state.directorPlan) {
    throw new Error("必须先调用 finalize_story_plan 冻结完整动态故事 DSL");
  }
};
