import type { StoryBeat } from "../../../../src/ai/story/types.ts";

const DEFAULT_SPACE_REASON = "章节之间没有必须保留的空间位置关系";

export type StoryBeatInput = Omit<
  StoryBeat,
  "spaceId" | "relationFromPrevious" | "relationReason"
> &
  Partial<
    Pick<StoryBeat, "spaceId" | "relationFromPrevious" | "relationReason">
  >;

export const withDefaultStorySpaces = (
  beats: readonly StoryBeatInput[],
  previousBeats: readonly StoryBeat[] = [],
): StoryBeat[] => {
  const previousById = new Map(previousBeats.map((beat) => [beat.id, beat]));
  return beats.map((beat, index) => {
    const previous = previousById.get(beat.id);
    return {
      ...beat,
      spaceId: previous?.spaceId || beat.spaceId || `page-${beat.id}`,
      relationFromPrevious:
        index === 0
          ? "new-page"
          : previous?.relationFromPrevious ||
            beat.relationFromPrevious ||
            "new-page",
      relationReason:
        previous?.relationReason ||
        beat.relationReason ||
        (index === 0 ? "故事首章建立初始页面" : DEFAULT_SPACE_REASON),
    };
  });
};

export const validateStorySpaces = (beats: readonly StoryBeat[]) => {
  const beatIds = new Set<string>();
  beats.forEach((beat, index) => {
    if (beatIds.has(beat.id)) {
      throw new Error(`故事节拍 id 重复：${beat.id}`);
    }
    beatIds.add(beat.id);
    if (!beat.spaceId || !beat.relationReason) {
      throw new Error(`故事节拍 ${beat.id} 缺少章节空间关系`);
    }
    if (index === 0 && beat.relationFromPrevious !== "new-page") {
      throw new Error("故事首章必须从独立页面开始");
    }
    if (index === 0) {
      return;
    }
    const previous = beats[index - 1];
    if (
      beat.relationFromPrevious === "same-space" &&
      beat.spaceId !== previous.spaceId
    ) {
      throw new Error(
        `节拍 ${beat.id} 选择 same-space 时必须复用上一章 spaceId ${previous.spaceId}`,
      );
    }
    if (
      beat.relationFromPrevious === "new-page" &&
      beat.spaceId === previous.spaceId
    ) {
      throw new Error(
        `节拍 ${beat.id} 选择 new-page 时必须创建不同于上一章的 spaceId`,
      );
    }
  });
};
