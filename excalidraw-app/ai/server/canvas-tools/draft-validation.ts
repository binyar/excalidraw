import {
  assertManagedCanvasLayoutIntegrity,
  materializeCanvasLayout,
  STORY_STAGE,
} from "../canvas-layout.ts";

import {
  DEFAULT_SHAPE_BACKGROUND_COLOR,
  resolveReadableTextColor,
} from "./readable-color.ts";
import { assertCanvasDraftCapacity } from "./state-guards.ts";
import { validateStorySpaces } from "./story-spaces.ts";

import type {
  CanvasChildLayout,
  CanvasDraft,
  CanvasDraftElement,
  CanvasDraftLibraryAsset,
} from "../../../../src/ai/story/types.ts";
import type { CanvasDraftState } from "./state.ts";

type DraftItem = CanvasDraftElement | CanvasDraftLibraryAsset;
type CardChild = DraftItem & {
  parentId: string;
  layout: CanvasChildLayout;
};
type MergedCardText = { childId: string; parentId: string };
type ReadableTextColorRepair = {
  elementId: string;
  backgroundColor: string;
  requestedTextColor: string;
  resolvedTextColor: string;
};

const normalizeStorySpaceCoordinates = (state: CanvasDraftState) => {
  if (!state.story) {
    throw new Error("必须先完成故事规划");
  }
  const story = state.story;
  validateStorySpaces(story.beats);
  const allItems = [...state.elements, ...state.libraryAssets];
  const spacesByItemId = new Map<string, Set<string>>();
  const assignSpace = (itemId: string, spaceId: string) => {
    const spaces = spacesByItemId.get(itemId) || new Set<string>();
    spaces.add(spaceId);
    spacesByItemId.set(itemId, spaces);
  };
  story.beats.forEach((beat) =>
    beat.elementIds.forEach((itemId) => assignSpace(itemId, beat.spaceId)),
  );
  const sectionSpaceById = new Map(
    state.sections.map((section) => [section.id, section.spaceId]),
  );
  allItems.forEach((item) => {
    const sectionSpaceId = item.sectionId
      ? sectionSpaceById.get(item.sectionId)
      : undefined;
    if (sectionSpaceId) {
      assignSpace(item.id, sectionSpaceId);
    }
  });
  // Attach unlisted decoration to the nearest semantic item. This keeps page
  // accents with their chapter without forcing the Agent to pollute beat
  // narration with every divider or badge id.
  const assignedTopLevelItems = allItems.filter(
    (item) => !item.parentId && spacesByItemId.has(item.id),
  );
  allItems
    .filter((item) => !item.parentId && !spacesByItemId.has(item.id))
    .forEach((item) => {
      const centerX = item.x + item.width / 2;
      const centerY = item.y + item.height / 2;
      const nearest = assignedTopLevelItems
        .map((candidate) => ({
          candidate,
          distance:
            Math.abs(candidate.x + candidate.width / 2 - centerX) +
            Math.abs(candidate.y + candidate.height / 2 - centerY),
        }))
        .sort((left, right) => left.distance - right.distance)[0]?.candidate;
      for (const spaceId of spacesByItemId.get(nearest?.id) || []) {
        assignSpace(item.id, spaceId);
      }
    });
  // Card children inherit the coordinate space of their parent even though
  // only the semantic card is normally listed in the story beat.
  allItems.forEach((item) => {
    if (!item.parentId) {
      return;
    }
    for (const spaceId of spacesByItemId.get(item.parentId) || []) {
      assignSpace(item.id, spaceId);
    }
  });
  allItems.forEach((item) => {
    const spaces = spacesByItemId.get(item.id);
    if (spaces?.size === 1) {
      item.spaceId = [...spaces][0];
      item.storyScope = "scene";
    } else if (spaces && spaces.size > 1) {
      delete item.spaceId;
      item.storyScope = "master";
    }
  });

  const translations: Array<{
    spaceId: string;
    dx: number;
    dy: number;
    width: number;
    height: number;
  }> = [];
  const oversizedSpaceIds: string[] = [];
  const spaceIds = [...new Set(story.beats.map((beat) => beat.spaceId))];
  for (const spaceId of spaceIds) {
    const topLevelItems = allItems.filter(
      (item) =>
        !item.parentId &&
        spacesByItemId.get(item.id)?.size === 1 &&
        spacesByItemId.get(item.id)?.has(spaceId),
    );
    if (topLevelItems.length === 0) {
      continue;
    }
    const left = Math.min(...topLevelItems.map((item) => item.x));
    const top = Math.min(...topLevelItems.map((item) => item.y));
    const right = Math.max(...topLevelItems.map((item) => item.x + item.width));
    const bottom = Math.max(
      ...topLevelItems.map((item) => item.y + item.height),
    );
    const width = right - left;
    const height = bottom - top;
    const dx = STORY_STAGE.width / 2 - (left + right) / 2;
    const dy = STORY_STAGE.height / 2 - (top + bottom) / 2;
    allItems.forEach((item) => {
      const spaces = spacesByItemId.get(item.id);
      if (spaces?.size === 1 && spaces.has(spaceId)) {
        item.x += dx;
        item.y += dy;
      }
    });
    translations.push({ spaceId, dx, dy, width, height });
    if (width > STORY_STAGE.width - 120 || height > STORY_STAGE.height - 100) {
      oversizedSpaceIds.push(spaceId);
    }
  }
  return { translations, oversizedSpaceIds };
};

const CARD_SLOT_RATIOS: Record<
  Exclude<CanvasChildLayout["slot"], "badge">,
  readonly [number, number]
> = {
  header: [0, 0.22],
  media: [0.18, 0.62],
  body: [0.58, 0.82],
  footer: [0.8, 1],
  center: [0.18, 0.82],
};

const TEXT_SLOT_ORDER: Partial<Record<CanvasChildLayout["slot"], number>> = {
  header: 0,
  badge: 1,
  center: 2,
  body: 3,
  footer: 4,
};

const mergeLegacyCardTextIntoLabels = (
  state: CanvasDraftState,
): MergedCardText[] => {
  const parents = new Map(
    state.elements
      .filter((element) => element.type !== "text" && !element.parentId)
      .map((element) => [element.id, element]),
  );
  const textChildren = state.elements.filter(
    (element): element is CanvasDraftElement & { parentId: string } =>
      element.type === "text" && Boolean(element.parentId),
  );
  if (textChildren.length === 0) {
    return [];
  }
  const byParent = new Map<string, CanvasDraftElement[]>();
  for (const child of textChildren) {
    const parent = parents.get(child.parentId);
    if (!parent) {
      continue;
    }
    const group = byParent.get(parent.id) || [];
    group.push(child);
    byParent.set(parent.id, group);
  }
  const merged: MergedCardText[] = [];
  for (const [parentId, children] of byParent) {
    const parent = parents.get(parentId);
    if (!parent) {
      continue;
    }
    children.sort(
      (left, right) =>
        (left.layout ? TEXT_SLOT_ORDER[left.layout.slot] ?? 2 : 2) -
          (right.layout ? TEXT_SLOT_ORDER[right.layout.slot] ?? 2 : 2) ||
        (left.layout?.order || 0) - (right.layout?.order || 0) ||
        left.id.localeCompare(right.id),
    );
    const labels = [parent.label, ...children.map((child) => child.label)]
      .filter((label): label is string =>
        Boolean(typeof label === "string" && label.trim()),
      )
      .map((label) => label.trim());
    parent.label = [...new Set(labels)].join("\n");
    const representative =
      children.find((child) => child.layout?.slot === "body") || children[0];
    const hasMedia = state.libraryAssets.some(
      (asset) => asset.parentId === parentId && asset.layout?.slot === "media",
    );
    parent.style = {
      ...parent.style,
      ...(representative.style?.fontSize
        ? { fontSize: representative.style.fontSize }
        : {}),
      textAlign:
        representative.style?.textAlign ||
        (representative.layout?.align === "left" ||
        representative.layout?.align === "right"
          ? representative.layout.align
          : parent.style?.textAlign || "center"),
      verticalAlign:
        representative.style?.verticalAlign ||
        (hasMedia || representative.layout?.slot === "footer"
          ? "bottom"
          : representative.layout?.slot === "header"
          ? "top"
          : parent.style?.verticalAlign || "middle"),
    };
    children.forEach((child) => merged.push({ childId: child.id, parentId }));
  }
  const mergedIds = new Set(merged.map(({ childId }) => childId));
  state.elements = state.elements.filter(
    (element) => !mergedIds.has(element.id),
  );
  state.story?.beats.forEach((beat) => {
    beat.elementIds = [
      ...new Set(
        beat.elementIds.map((id) => {
          const item = merged.find(({ childId }) => childId === id);
          return item?.parentId || id;
        }),
      ),
    ];
  });
  return merged;
};

const resolveCardChildren = (state: CanvasDraftState) => {
  const parents = new Map(
    state.elements
      .filter((element) => element.type !== "text" && !element.parentId)
      .map((element) => [element.id, element]),
  );
  const children = [...state.elements, ...state.libraryAssets].flatMap(
    (child): CardChild[] => {
      if (!child.parentId) {
        return [];
      }
      if (!child.layout) {
        throw new Error(`卡片子元素 ${child.id} 缺少 layout`);
      }
      return [child as CardChild];
    },
  );
  for (const child of children) {
    const parent = parents.get(child.parentId);
    if (!parent) {
      throw new Error(
        `卡片子元素 ${child.id} 引用了不存在或不可作为容器的父元素 ${child.parentId}`,
      );
    }
  }
  const bySlot = new Map<string, CardChild[]>();
  for (const child of children) {
    const key = `${child.parentId}:${child.layout.slot}`;
    const group = bySlot.get(key) || [];
    group.push(child);
    bySlot.set(key, group);
  }
  for (const group of bySlot.values()) {
    const firstChild = group[0];
    if (!firstChild) {
      continue;
    }
    group.sort(
      (left, right) =>
        (left.layout.order || 0) - (right.layout.order || 0) ||
        left.id.localeCompare(right.id),
    );
    const parent = parents.get(firstChild.parentId);
    const layout = firstChild.layout;
    if (!parent) {
      continue;
    }
    const padding =
      layout.padding ?? Math.max(16, Math.min(40, parent.height * 0.08));
    const innerX = parent.x + padding;
    const innerY = parent.y + padding;
    const innerWidth = Math.max(1, parent.width - padding * 2);
    const innerHeight = Math.max(1, parent.height - padding * 2);
    const slot = layout.slot;
    if (slot === "badge") {
      group.forEach((child, index) => {
        const width = Math.min(child.width || 96, innerWidth * 0.38);
        const height = Math.min(child.height || 36, innerHeight * 0.18);
        child.width = width;
        child.height = height;
        child.x = innerX + innerWidth - width;
        child.y = innerY + index * (height + (child.layout.gap || 8));
      });
      continue;
    }
    const [startRatio, endRatio] = CARD_SLOT_RATIOS[slot];
    const regionY = innerY + innerHeight * startRatio;
    const regionHeight = innerHeight * (endRatio - startRatio);
    const gap = layout.gap ?? 10;
    const itemHeight = Math.max(
      1,
      (regionHeight - gap * Math.max(0, group.length - 1)) / group.length,
    );
    group.forEach((child, index) => {
      const regionItemY = regionY + index * (itemHeight + gap);
      const preferredWidth = child.width || innerWidth;
      const preferredHeight = child.height || itemHeight;
      const aspect = preferredWidth / Math.max(1, preferredHeight);
      let width = Math.min(preferredWidth, innerWidth);
      let height = Math.min(preferredHeight, itemHeight);
      if ("elements" in child) {
        width = Math.min(width, height * aspect);
        height = Math.min(height, width / Math.max(0.01, aspect));
      } else if ((child.layout.align || "center") === "stretch") {
        width = innerWidth;
      }
      const align = child.layout.align || "center";
      child.width = width;
      child.height = height;
      child.x =
        align === "left" || align === "stretch"
          ? innerX
          : align === "right"
          ? innerX + innerWidth - width
          : innerX + (innerWidth - width) / 2;
      child.y = regionItemY + (itemHeight - height) / 2;
    });
  }
};

export const validateAndRepairDraft = (state: CanvasDraftState) => {
  if (!state.story) {
    throw new Error("必须先调用 define_story");
  }
  if (state.elements.length + state.libraryAssets.length === 0) {
    throw new Error("画布草稿至少需要一个元素");
  }
  if (state.requireManagedLayout) {
    if (state.sections.length === 0 || state.spaceLayouts.length === 0) {
      throw new Error(
        "新 Story 必须先调用 define_canvas_sections 定义托管 Section 布局",
      );
    }
    const spacesByItemId = new Map();
    state.story.beats.forEach((beat) =>
      beat.elementIds.forEach((itemId) => {
        const spaces = spacesByItemId.get(itemId) || new Set();
        spaces.add(beat.spaceId);
        spacesByItemId.set(itemId, spaces);
      }),
    );
    const unmanaged = [...state.elements, ...state.libraryAssets].filter(
      (item) =>
        !item.parentId &&
        !item.sectionId &&
        (spacesByItemId.get(item.id)?.size || 0) <= 1,
    );
    if (unmanaged.length > 0) {
      throw new Error(
        `新 Story 的页面内容必须托管到 Section：${unmanaged
          .map((item) => item.id)
          .join("、")}`,
      );
    }
  }
  assertCanvasDraftCapacity(state);
  const mergedCardText = mergeLegacyCardTextIntoLabels(state);
  const canvasLayout = materializeCanvasLayout(state);
  resolveCardChildren(state);
  const canvasLayoutIntegrity = assertManagedCanvasLayoutIntegrity(state);
  const readableTextColors: ReadableTextColorRepair[] = [];
  state.elements.forEach((element) => {
    if (element.type === "text" || !element.label?.trim()) {
      return;
    }
    const backgroundColor =
      element.style?.backgroundColor ?? DEFAULT_SHAPE_BACKGROUND_COLOR;
    const preferredTextColor =
      element.style?.textColor ?? element.style?.strokeColor ?? "#212529";
    const textColor = resolveReadableTextColor(
      backgroundColor,
      preferredTextColor,
    );
    element.style = { ...(element.style || {}), textColor };
    if (textColor !== preferredTextColor) {
      readableTextColors.push({
        elementId: element.id,
        backgroundColor,
        requestedTextColor: preferredTextColor,
        resolvedTextColor: textColor,
      });
    }
  });
  const ids = new Set<string>();
  for (const item of [
    ...state.elements,
    ...state.libraryAssets,
    ...state.connectors,
  ]) {
    if (ids.has(item.id)) {
      throw new Error(`画布语义 id 重复：${item.id}`);
    }
    ids.add(item.id);
  }
  const connectableIds = new Set(state.elements.map((element) => element.id));
  for (const connector of state.connectors) {
    if (
      !connectableIds.has(connector.from) ||
      !connectableIds.has(connector.to)
    ) {
      throw new Error(`连接线 ${connector.id} 引用了不存在的元素`);
    }
  }
  if (state.directorPlan) {
    const contentById = new Map(
      state.directorPlan.content.map((content) => [content.id, content]),
    );
    const elementsById = new Map(
      state.elements.map((element) => [element.id, element]),
    );
    const assetsById = new Map(
      state.libraryAssets.map((asset) => [asset.id, asset]),
    );
    const connectorsById = new Map(
      state.connectors.map((connector) => [connector.id, connector]),
    );
    for (const content of state.directorPlan.content) {
      const element = elementsById.get(content.id);
      const asset = assetsById.get(content.id);
      const connector = connectorsById.get(content.id);
      const matchesKind =
        (content.kind === "text" && element?.type === "text") ||
        (content.kind === "shape" && element && element.type !== "text") ||
        (content.kind === "visual" && Boolean(element || asset)) ||
        (content.kind === "connector" && Boolean(connector));
      const executed = element || asset || connector;
      if (!matchesKind || !executed) {
        throw new Error(
          `画布执行结果未按 Director DSL 实现 ${content.kind} 内容 ${content.id}`,
        );
      }
      if (executed.role !== content.role) {
        throw new Error(`内容 ${content.id} 的 role 与 Director DSL 不一致`);
      }
      if (
        content.label !== undefined &&
        (!("label" in executed) || executed.label !== content.label)
      ) {
        throw new Error(`内容 ${content.id} 的文案与 Director DSL 不一致`);
      }
      if (
        content.sectionId !== undefined &&
        (!("sectionId" in executed) || executed.sectionId !== content.sectionId)
      ) {
        throw new Error(`内容 ${content.id} 的 Section 与 Director DSL 不一致`);
      }
      if (
        content.kind === "connector" &&
        (!connector ||
          connector.from !== content.from ||
          connector.to !== content.to)
      ) {
        throw new Error(`连接 ${content.id} 的端点与 Director DSL 不一致`);
      }
    }
    const undeclaredExecutionIds = [...ids].filter(
      (id) => !contentById.has(id),
    );
    if (undeclaredExecutionIds.length > 0) {
      throw new Error(
        `画布执行结果包含 Director DSL 未声明的内容：${undeclaredExecutionIds.join(
          "、",
        )}`,
      );
    }
  }
  const missingBeatReferences: Array<{ beatId: string; elementId: string }> =
    [];
  for (const beat of state.story.beats) {
    beat.elementIds.forEach((elementId) => {
      if (!ids.has(elementId)) {
        missingBeatReferences.push({ beatId: beat.id, elementId });
      }
    });
  }
  if (missingBeatReferences.length > 0) {
    throw new Error(
      `画布执行结果缺少 Director DSL 声明的内容：${missingBeatReferences
        .map(({ beatId, elementId }) => `${beatId}/${elementId}`)
        .join("、")}`,
    );
  }
  const storySpaces = normalizeStorySpaceCoordinates(state);
  return {
    missingBeatReferences,
    mergedCardText,
    canvasLayout,
    canvasLayoutIntegrity,
    storySpaces,
    readableTextColors,
  };
};

export const snapshot = (state: CanvasDraftState): CanvasDraft => {
  if (!state.story) {
    throw new Error("必须先完成故事规划");
  }
  return {
    schemaVersion: "1.0",
    id: state.story.id,
    title: state.story.title,
    summary: state.story.summary,
    beats: structuredClone(state.story.beats),
    spaceLayouts: structuredClone(state.spaceLayouts),
    sections: structuredClone(state.sections),
    elements: structuredClone(state.elements),
    libraryAssets: structuredClone(state.libraryAssets),
    connectors: structuredClone(state.connectors),
  };
};
