import { describe, expect, it } from "vitest";

import { aggregateStoryProgress } from "./storyChatPresentation";

describe("aggregateStoryProgress", () => {
  it("collapses repeated library searches while preserving surrounding steps", () => {
    expect(
      aggregateStoryProgress([
        { tone: "done", label: "故事已规划" },
        {
          tone: "done",
          label: "检索 clock",
          groupKey: "library-search",
        },
        {
          tone: "done",
          label: "检索 city",
          groupKey: "library-search",
        },
        { tone: "running", label: "正在创建画布" },
      ]),
    ).toEqual([
      { tone: "done", label: "故事已规划" },
      {
        tone: "done",
        label: "已完成：检索 Excalidraw 资源库（2 次）",
        groupKey: "library-search",
        startedAt: undefined,
        elapsedMs: undefined,
      },
      { tone: "running", label: "正在创建画布" },
    ]);
  });

  it("keeps a search group running until every call completes", () => {
    expect(
      aggregateStoryProgress([
        {
          tone: "done",
          label: "检索 clock",
          groupKey: "library-search",
        },
        {
          tone: "running",
          label: "检索 city",
          groupKey: "library-search",
        },
      ])[0],
    ).toMatchObject({
      tone: "running",
      label: "正在检索 Excalidraw 资源库（1/2 次完成）",
    });
  });
});
