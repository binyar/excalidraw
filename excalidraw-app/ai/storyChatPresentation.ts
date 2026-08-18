export type StoryProgressItem = {
  tone: "done" | "error" | "running" | "warning";
  label: string;
  startedAt?: string;
  elapsedMs?: number;
  groupKey?: "library-search";
};

const progressTone = (items: StoryProgressItem[]) => {
  if (items.some((item) => item.tone === "error")) {
    return "error" as const;
  }
  if (items.some((item) => item.tone === "warning")) {
    return "warning" as const;
  }
  if (items.some((item) => item.tone === "running")) {
    return "running" as const;
  }
  return "done" as const;
};

export const aggregateStoryProgress = (items: StoryProgressItem[]) => {
  const searches = items.filter((item) => item.groupKey === "library-search");
  if (searches.length === 0) {
    return items;
  }

  const tone = progressTone(searches);
  const completedCount = searches.filter((item) => item.tone === "done").length;
  const errorCount = searches.filter((item) => item.tone === "error").length;
  const firstSearchIndex = items.findIndex(
    (item) => item.groupKey === "library-search",
  );
  const aggregate: StoryProgressItem = {
    tone,
    groupKey: "library-search",
    label:
      tone === "error"
        ? `资源检索有 ${errorCount} 次失败（共 ${searches.length} 次）`
        : tone === "running"
        ? `正在检索 Excalidraw 资源库（${completedCount}/${searches.length} 次完成）`
        : `已完成：检索 Excalidraw 资源库（${searches.length} 次）`,
    startedAt: searches.find((item) => item.startedAt)?.startedAt,
    elapsedMs: [...searches]
      .reverse()
      .find((item) => item.elapsedMs !== undefined)?.elapsedMs,
  };

  const result = items.filter((item) => item.groupKey !== "library-search");
  result.splice(firstSearchIndex, 0, aggregate);
  return result;
};
