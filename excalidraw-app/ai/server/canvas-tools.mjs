import { randomUUID } from "node:crypto";

import { Type } from "@earendil-works/pi-ai";

import {
  getLibraryCatalogItem,
  isLibraryCatalogRef,
  searchLibraryCatalog,
} from "./library-catalog.mjs";

const MAX_CANVAS_DRAFT_ITEMS = 250;

const assertCanvasDraftCapacity = (state, additionalItems = 0) => {
  const nextCount =
    state.elements.length + state.libraryAssets.length + additionalItems;
  if (nextCount > MAX_CANVAS_DRAFT_ITEMS) {
    throw new Error(
      `Canvas Draft 元素和资源数量不能超过 ${MAX_CANVAS_DRAFT_ITEMS}，当前操作后将达到 ${nextCount}`,
    );
  }
};

const colorSchema = Type.String({ minLength: 1, maxLength: 32 });
const styleSchema = Type.Object({
  strokeColor: Type.Optional(colorSchema),
  backgroundColor: Type.Optional(colorSchema),
  fillStyle: Type.Optional(
    Type.Union([
      Type.Literal("hachure"),
      Type.Literal("cross-hatch"),
      Type.Literal("solid"),
      Type.Literal("zigzag"),
    ]),
  ),
  strokeWidth: Type.Optional(Type.Number({ minimum: 1, maximum: 4 })),
  roughness: Type.Optional(Type.Number({ minimum: 0, maximum: 2 })),
  opacity: Type.Optional(Type.Number({ minimum: 0, maximum: 100 })),
  fontSize: Type.Optional(Type.Number({ minimum: 10, maximum: 96 })),
  textAlign: Type.Optional(
    Type.Union([
      Type.Literal("left"),
      Type.Literal("center"),
      Type.Literal("right"),
    ]),
  ),
  verticalAlign: Type.Optional(
    Type.Union([
      Type.Literal("top"),
      Type.Literal("middle"),
      Type.Literal("bottom"),
    ]),
  ),
});

const childLayoutSchema = Type.Object({
  slot: Type.Union([
    Type.Literal("header"),
    Type.Literal("media"),
    Type.Literal("body"),
    Type.Literal("footer"),
    Type.Literal("badge"),
    Type.Literal("center"),
  ]),
  align: Type.Optional(
    Type.Union([
      Type.Literal("left"),
      Type.Literal("center"),
      Type.Literal("right"),
      Type.Literal("stretch"),
    ]),
  ),
  order: Type.Optional(Type.Number({ minimum: 0, maximum: 20 })),
  padding: Type.Optional(Type.Number({ minimum: 0, maximum: 240 })),
  gap: Type.Optional(Type.Number({ minimum: 0, maximum: 120 })),
});

const elementSchema = Type.Object({
  id: Type.String({ minLength: 1, maxLength: 64 }),
  type: Type.Union([
    Type.Literal("rectangle"),
    Type.Literal("ellipse"),
    Type.Literal("diamond"),
    Type.Literal("text"),
  ]),
  role: Type.Optional(Type.String({ maxLength: 64 })),
  label: Type.Optional(Type.String({ maxLength: 500 })),
  parentId: Type.Optional(Type.String({ minLength: 1, maxLength: 64 })),
  layout: Type.Optional(childLayoutSchema),
  x: Type.Optional(Type.Number({ minimum: -20_000, maximum: 20_000 })),
  y: Type.Optional(Type.Number({ minimum: -20_000, maximum: 20_000 })),
  // Presentation canvases legitimately use small text, badges, separators,
  // bullets, and decorative marks. A blanket 20px minimum rejects valid
  // layouts before the tool can execute (for example 10px caption text).
  width: Type.Optional(Type.Number({ minimum: 1, maximum: 4000 })),
  height: Type.Optional(Type.Number({ minimum: 1, maximum: 4000 })),
  style: Type.Optional(styleSchema),
});

const assertMutable = (state) => {
  if (state.frozen) {
    throw new Error("Canvas Draft 已冻结，不能继续修改");
  }
};

const STORY_STAGE = Object.freeze({ width: 1280, height: 720 });
const DEFAULT_SPACE_REASON = "章节之间没有必须保留的空间位置关系";

const withDefaultStorySpaces = (beats, previousBeats = []) => {
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

const validateStorySpaces = (beats) => {
  const beatIds = new Set();
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

const normalizeStorySpaceCoordinates = (state) => {
  validateStorySpaces(state.story.beats);
  const allItems = [...state.elements, ...state.libraryAssets];
  const spacesByItemId = new Map();
  const assignSpace = (itemId, spaceId) => {
    const spaces = spacesByItemId.get(itemId) || new Set();
    spaces.add(spaceId);
    spacesByItemId.set(itemId, spaces);
  };
  state.story.beats.forEach((beat) =>
    beat.elementIds.forEach((itemId) => assignSpace(itemId, beat.spaceId)),
  );
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

  const translations = [];
  const oversizedSpaceIds = [];
  const spaceIds = [...new Set(state.story.beats.map((beat) => beat.spaceId))];
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

const CARD_SLOT_RATIOS = {
  header: [0, 0.22],
  media: [0.18, 0.62],
  body: [0.58, 0.82],
  footer: [0.8, 1],
  center: [0.18, 0.82],
};

const TEXT_SLOT_ORDER = {
  header: 0,
  badge: 1,
  center: 2,
  body: 3,
  footer: 4,
};

const mergeLegacyCardTextIntoLabels = (state) => {
  const parents = new Map(
    state.elements
      .filter((element) => element.type !== "text" && !element.parentId)
      .map((element) => [element.id, element]),
  );
  const textChildren = state.elements.filter(
    (element) => element.type === "text" && element.parentId,
  );
  if (textChildren.length === 0) {
    return [];
  }
  const byParent = new Map();
  for (const child of textChildren) {
    const parent = parents.get(child.parentId);
    if (!parent) {
      continue;
    }
    const group = byParent.get(parent.id) || [];
    group.push(child);
    byParent.set(parent.id, group);
  }
  const merged = [];
  for (const [parentId, children] of byParent) {
    const parent = parents.get(parentId);
    children.sort(
      (left, right) =>
        (TEXT_SLOT_ORDER[left.layout?.slot] ?? 2) -
          (TEXT_SLOT_ORDER[right.layout?.slot] ?? 2) ||
        (left.layout?.order || 0) - (right.layout?.order || 0) ||
        left.id.localeCompare(right.id),
    );
    const labels = [parent.label, ...children.map((child) => child.label)]
      .filter((label) => typeof label === "string" && label.trim())
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

const resolveCardChildren = (state) => {
  const parents = new Map(
    state.elements
      .filter((element) => element.type !== "text" && !element.parentId)
      .map((element) => [element.id, element]),
  );
  const children = [...state.elements, ...state.libraryAssets].filter(
    (element) => element.parentId,
  );
  for (const child of children) {
    const parent = parents.get(child.parentId);
    if (!parent) {
      throw new Error(
        `卡片子元素 ${child.id} 引用了不存在或不可作为容器的父元素 ${child.parentId}`,
      );
    }
    if (!child.layout) {
      throw new Error(`卡片子元素 ${child.id} 缺少 layout`);
    }
  }
  const bySlot = new Map();
  for (const child of children) {
    const key = `${child.parentId}:${child.layout.slot}`;
    const group = bySlot.get(key) || [];
    group.push(child);
    bySlot.set(key, group);
  }
  for (const group of bySlot.values()) {
    group.sort(
      (left, right) =>
        (left.layout.order || 0) - (right.layout.order || 0) ||
        left.id.localeCompare(right.id),
    );
    const parent = parents.get(group[0].parentId);
    const layout = group[0].layout;
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
      if (child.type !== "text" && child.elements) {
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

const validateAndRepairDraft = (state) => {
  if (!state.story) {
    throw new Error("必须先调用 define_story");
  }
  if (state.elements.length + state.libraryAssets.length === 0) {
    throw new Error("Canvas Draft 至少需要一个元素");
  }
  assertCanvasDraftCapacity(state);
  const mergedCardText = mergeLegacyCardTextIntoLabels(state);
  resolveCardChildren(state);
  const ids = new Set();
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
  const removedBeatReferences = [];
  for (const beat of state.story.beats) {
    beat.elementIds = beat.elementIds.filter((elementId) => {
      if (ids.has(elementId)) {
        return true;
      }
      removedBeatReferences.push({ beatId: beat.id, elementId });
      return false;
    });
  }
  const storySpaces = normalizeStorySpaceCoordinates(state);
  return { removedBeatReferences, mergedCardText, storySpaces };
};

const snapshot = (state) => ({
  schemaVersion: "1.0",
  id: state.story.id,
  title: state.story.title,
  summary: state.story.summary,
  beats: structuredClone(state.story.beats),
  elements: structuredClone(state.elements),
  libraryAssets: structuredClone(state.libraryAssets),
  connectors: structuredClone(state.connectors),
});

const resultText = (text, details) => ({
  content: [{ type: "text", text }],
  ...(details ? { details } : {}),
});

const animationBriefSchema = Type.Object({
  intent: Type.String({ minLength: 1, maxLength: 2000 }),
  tone: Type.Optional(Type.String({ maxLength: 80 })),
  preferredDurationMs: Type.Optional(
    Type.Number({ minimum: 1000, maximum: 120_000 }),
  ),
});

const parseAnimationBrief = (value) => {
  if (value && typeof value === "object") {
    return value;
  }
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) {
      throw new Error("动画简报缺少 intent");
    }
    try {
      const parsed = JSON.parse(trimmed);
      if (parsed && typeof parsed === "object") {
        return parsed;
      }
    } catch {
      // A plain-language brief is a valid shorthand for { intent: brief }.
      // The tool schema has always advertised string support, so the runtime
      // must not require that every string itself contains encoded JSON.
    }
    return { intent: trimmed };
  }
  throw new Error("动画简报格式无效，请传入包含 intent 的对象");
};

const getConnectorSpacingWarning = (connector, from, to) => {
  const fromCenterX = from.x + from.width / 2;
  const fromCenterY = from.y + from.height / 2;
  const toCenterX = to.x + to.width / 2;
  const toCenterY = to.y + to.height / 2;
  const deltaX = Math.abs(toCenterX - fromCenterX);
  const deltaY = Math.abs(toCenterY - fromCenterY);
  // Native arrow labels can wrap independently from the arrow shaft. Making
  // the required node gap grow with label length causes complex branch labels
  // to trigger an endless relayout loop.
  const requiredGap = 96;
  const horizontalGap = deltaX - (from.width + to.width) / 2;
  const verticalGap = deltaY - (from.height + to.height) / 2;
  const actualGap = deltaX >= deltaY ? horizontalGap : verticalGap;
  if (actualGap < requiredGap) {
    return `连接线 ${connector.id} 的节点净距为 ${Math.max(
      0,
      Math.round(actualGap),
    )}px，建议至少 ${requiredGap}px；连接已保留，可后续调整布局。`;
  }
  return null;
};

export const createCanvasTools = ({ state, animate }) => {
  const recentLibrarySearches = new Map();
  const resolveLibraryRef = async (candidate) => {
    if (isLibraryCatalogRef(candidate)) {
      return { ref: candidate, resolvedFromQuery: null };
    }
    const query = String(candidate || "").trim();
    const cachedResults = recentLibrarySearches.get(query.toLowerCase());
    const results = cachedResults || (await searchLibraryCatalog(query, 1));
    if (results.length === 0) {
      return null;
    }
    return { ref: results[0].ref, resolvedFromQuery: query };
  };

  return [
    {
      name: "define_story",
      label: "规划画布故事",
      description:
        "Define the complete story and ordered story beats before creating canvas elements.",
      parameters: Type.Object({
        id: Type.String({ minLength: 1, maxLength: 64 }),
        title: Type.String({ minLength: 1, maxLength: 160 }),
        summary: Type.String({ minLength: 1, maxLength: 1000 }),
        beats: Type.Array(
          Type.Object({
            id: Type.String({ minLength: 1, maxLength: 64 }),
            title: Type.String({ minLength: 1, maxLength: 160 }),
            description: Type.Optional(Type.String({ maxLength: 500 })),
            elementIds: Type.Array(Type.String({ maxLength: 64 }), {
              maxItems: 80,
            }),
          }),
          { minItems: 1, maxItems: 30 },
        ),
      }),
      executionMode: "sequential",
      async execute(_id, params) {
        assertMutable(state);
        if (state.editing && state.story && params.id !== state.story.id) {
          throw new Error(
            `二次编辑必须保留现有故事 id ${state.story.id}，不能新建 ${params.id}`,
          );
        }
        const previousBeats = state.story?.beats || [];
        state.story = {
          ...structuredClone(params),
          beats: withDefaultStorySpaces(params.beats, previousBeats),
        };
        return resultText(
          `故事“${params.title}”已规划为 ${params.beats.length} 个节拍；当前使用安全的独立页面默认值，请继续调用 define_story_spaces 判断章节空间关系。`,
        );
      },
    },
    {
      name: "define_story_spaces",
      label: "规划章节空间关系",
      description:
        "After define_story and before creating canvas elements, decide whether each chapter continues in the previous spatial world (same-space) or starts an independent presentation page (new-page). Decisions must be semantic and explainable, not random visual choices.",
      parameters: Type.Object({
        chapters: Type.Array(
          Type.Object({
            beatId: Type.String({ minLength: 1, maxLength: 64 }),
            spaceId: Type.String({ minLength: 1, maxLength: 64 }),
            relationFromPrevious: Type.Union([
              Type.Literal("same-space"),
              Type.Literal("new-page"),
            ]),
            reason: Type.String({ minLength: 2, maxLength: 300 }),
          }),
          { minItems: 1, maxItems: 30 },
        ),
      }),
      executionMode: "sequential",
      async execute(_id, params) {
        assertMutable(state);
        if (!state.story) {
          throw new Error("必须先调用 define_story");
        }
        const relationByBeatId = new Map(
          params.chapters.map((chapter) => [chapter.beatId, chapter]),
        );
        if (
          relationByBeatId.size !== state.story.beats.length ||
          state.story.beats.some((beat) => !relationByBeatId.has(beat.id))
        ) {
          throw new Error("define_story_spaces 必须覆盖全部故事节拍且不能重复");
        }
        const beats = state.story.beats.map((beat) => {
          const chapter = relationByBeatId.get(beat.id);
          return {
            ...beat,
            spaceId: chapter.spaceId,
            relationFromPrevious: chapter.relationFromPrevious,
            relationReason: chapter.reason,
          };
        });
        validateStorySpaces(beats);
        state.story.beats = beats;
        return resultText(
          `已规划 ${beats.length} 个章节空间：${
            new Set(beats.map((beat) => beat.spaceId)).size
          } 个独立坐标空间，${
            beats.filter((beat) => beat.relationFromPrevious === "same-space")
              .length
          } 个连续空间关系。`,
          {
            kind: "story-space-plan",
            chapters: beats.map((beat) => ({
              beatId: beat.id,
              spaceId: beat.spaceId,
              relationFromPrevious: beat.relationFromPrevious,
              reason: beat.relationReason,
            })),
          },
        );
      },
    },
    {
      name: "search_library_assets",
      label: "搜索画布资源库",
      description:
        "Search the bundled Excalidraw resource catalog by English keywords before creating common icons, people, devices, cloud services, UI controls, or illustrations.",
      parameters: Type.Object({
        query: Type.String({ minLength: 1, maxLength: 160 }),
        limit: Type.Optional(Type.Number({ minimum: 1, maximum: 12 })),
      }),
      executionMode: "sequential",
      async execute(_id, params) {
        const results = await searchLibraryCatalog(params.query, params.limit);
        recentLibrarySearches.set(params.query.trim().toLowerCase(), results);
        return resultText(
          results.length
            ? `找到 ${results.length} 个可用资源条目。请使用 add_library_assets 并传入 ref 实例化需要的条目。`
            : "没有找到匹配资源，请尝试更短的英文关键词或改用基础画布元素。",
          { kind: "library-search-results", query: params.query, results },
        );
      },
    },
    {
      name: "add_library_assets",
      label: "添加资源库内容",
      description:
        "Instantiate selected bundled library entries. Use a real ref returned by search_library_assets. A missing optional asset is skipped without failing the draft, so continue with a basic canvas element when needed. For an icon inside a card, provide parentId and layout and omit x/y; the tool computes its position deterministically.",
      parameters: Type.Object({
        assets: Type.Array(
          Type.Object({
            id: Type.String({ minLength: 1, maxLength: 64 }),
            ref: Type.String({ minLength: 3, maxLength: 240 }),
            role: Type.Optional(Type.String({ maxLength: 64 })),
            parentId: Type.Optional(
              Type.String({ minLength: 1, maxLength: 64 }),
            ),
            layout: Type.Optional(childLayoutSchema),
            x: Type.Optional(
              Type.Number({ minimum: -20_000, maximum: 20_000 }),
            ),
            y: Type.Optional(
              Type.Number({ minimum: -20_000, maximum: 20_000 }),
            ),
            width: Type.Optional(Type.Number({ minimum: 20, maximum: 4000 })),
            height: Type.Optional(Type.Number({ minimum: 20, maximum: 4000 })),
          }),
          { minItems: 1, maxItems: 24 },
        ),
      }),
      executionMode: "sequential",
      async execute(_id, params) {
        assertMutable(state);
        const existingIds = new Set([
          ...state.elements.map((element) => element.id),
          ...state.libraryAssets.map((asset) => asset.id),
          ...state.connectors.map((connector) => connector.id),
        ]);
        const pendingAssets = [];
        const resolvedQueries = [];
        const skippedAssets = [];
        for (const asset of params.assets) {
          if (existingIds.has(asset.id)) {
            throw new Error(`画布语义 id 重复：${asset.id}`);
          }
          if (Boolean(asset.parentId) !== Boolean(asset.layout)) {
            throw new Error(`资源 ${asset.id} 必须同时提供 parentId 和 layout`);
          }
          if (
            !asset.parentId &&
            (asset.x === undefined || asset.y === undefined)
          ) {
            throw new Error(`顶层资源 ${asset.id} 必须提供 x 和 y`);
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
          const item = await getLibraryCatalogItem(ref);
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
            elements: item.elements,
          });
          if (resolvedFromQuery) {
            resolvedQueries.push(`“${resolvedFromQuery}”→“${item.itemName}”`);
          }
          existingIds.add(asset.id);
        }
        assertCanvasDraftCapacity(state, pendingAssets.length);
        state.libraryAssets.push(...pendingAssets);
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
    },
    {
      name: "add_canvas_elements",
      label: "添加画布元素",
      description:
        "Add editable shapes or standalone text. Put all card copy directly in the parent shape label and control it with style.textAlign/style.verticalAlign; never create child text. Only library icons use parentId + layout. Top-level elements require explicit geometry.",
      parameters: Type.Object({
        elements: Type.Array(elementSchema, { minItems: 1, maxItems: 80 }),
      }),
      executionMode: "sequential",
      async execute(_id, params) {
        assertMutable(state);
        const existingIds = new Set([
          ...state.elements.map((element) => element.id),
          ...state.connectors.map((connector) => connector.id),
        ]);
        const pendingElements = [];
        for (const element of params.elements) {
          if (existingIds.has(element.id)) {
            throw new Error(`画布语义 id 重复：${element.id}`);
          }
          if (Boolean(element.parentId) !== Boolean(element.layout)) {
            throw new Error(
              `元素 ${element.id} 必须同时提供 parentId 和 layout`,
            );
          }
          if (element.type === "text" && element.parentId) {
            throw new Error(
              `卡片内文字 ${element.id} 必须直接写入父图形 ${element.parentId} 的 label；只有图标资源可以使用 parentId + layout`,
            );
          }
          if (
            !element.parentId &&
            (element.x === undefined ||
              element.y === undefined ||
              element.width === undefined ||
              element.height === undefined)
          ) {
            throw new Error(
              `顶层元素 ${element.id} 必须提供 x、y、width 和 height`,
            );
          }
          const nextElement = {
            ...structuredClone(element),
            x: element.x ?? 0,
            y: element.y ?? 0,
            width: element.width ?? (element.type === "text" ? 240 : 200),
            height: element.height ?? (element.type === "text" ? 48 : 120),
          };
          existingIds.add(element.id);
          pendingElements.push(nextElement);
        }
        assertCanvasDraftCapacity(state, pendingElements.length);
        state.elements.push(...pendingElements);
        return resultText(`已添加 ${params.elements.length} 个画布元素。`);
      },
    },
    {
      name: "update_canvas_elements",
      label: "修改现有画布元素",
      description:
        "Update existing semantic elements in place during a second edit. Omitted fields preserve their current values and geometry.",
      parameters: Type.Object({
        updates: Type.Array(
          Type.Object({
            elementId: Type.String({ minLength: 1, maxLength: 64 }),
            label: Type.Optional(Type.String({ maxLength: 500 })),
            role: Type.Optional(Type.String({ maxLength: 64 })),
            x: Type.Optional(
              Type.Number({ minimum: -20_000, maximum: 20_000 }),
            ),
            y: Type.Optional(
              Type.Number({ minimum: -20_000, maximum: 20_000 }),
            ),
            width: Type.Optional(Type.Number({ minimum: 1, maximum: 4000 })),
            height: Type.Optional(Type.Number({ minimum: 1, maximum: 4000 })),
            style: Type.Optional(styleSchema),
          }),
          { minItems: 1, maxItems: 80 },
        ),
      }),
      executionMode: "sequential",
      async execute(_id, params) {
        assertMutable(state);
        const resolved = params.updates.map((update) => {
          const element = state.elements.find(
            (candidate) => candidate.id === update.elementId,
          );
          if (!element) {
            throw new Error(`找不到元素：${update.elementId}`);
          }
          return { element, update };
        });
        resolved.forEach(({ element, update }) => {
          const fields = { ...update };
          delete fields.elementId;
          const style = fields.style;
          delete fields.style;
          Object.assign(element, fields);
          if (style) {
            element.style = { ...element.style, ...style };
          }
        });
        return resultText(`已原位修改 ${resolved.length} 个现有画布元素。`);
      },
    },
    {
      name: "remove_canvas_items",
      label: "删除现有画布内容",
      description:
        "Remove existing semantic elements, library assets, or connectors requested by the user. Dependent connectors and beat references are cleaned automatically.",
      parameters: Type.Object({
        ids: Type.Array(Type.String({ minLength: 1, maxLength: 64 }), {
          minItems: 1,
          maxItems: 80,
        }),
      }),
      executionMode: "sequential",
      async execute(_id, params) {
        assertMutable(state);
        const requested = new Set(params.ids);
        const removed = new Set();
        const removeMatching = (items) =>
          items.filter((item) => {
            const shouldRemove =
              requested.has(item.id) ||
              (item.parentId && requested.has(item.parentId));
            if (shouldRemove) {
              removed.add(item.id);
            }
            return !shouldRemove;
          });
        state.elements = removeMatching(state.elements);
        state.libraryAssets = removeMatching(state.libraryAssets);
        state.connectors = state.connectors.filter((connector) => {
          const shouldRemove =
            requested.has(connector.id) ||
            removed.has(connector.from) ||
            removed.has(connector.to);
          if (shouldRemove) {
            removed.add(connector.id);
          }
          return !shouldRemove;
        });
        state.story?.beats.forEach((beat) => {
          beat.elementIds = beat.elementIds.filter((id) => !removed.has(id));
        });
        const missing = params.ids.filter((id) => !removed.has(id));
        if (removed.size === 0) {
          throw new Error(`找不到要删除的画布内容：${missing.join("、")}`);
        }
        return resultText(
          `已删除 ${removed.size} 个画布条目${
            missing.length ? `；未找到 ${missing.join("、")}` : ""
          }。`,
        );
      },
    },
    {
      name: "update_element_styles",
      label: "设置元素样式",
      description: "Update visual styles for existing draft elements.",
      parameters: Type.Object({
        updates: Type.Array(
          Type.Object({
            elementId: Type.String({ minLength: 1, maxLength: 64 }),
            style: styleSchema,
          }),
          { minItems: 1, maxItems: 80 },
        ),
      }),
      executionMode: "sequential",
      async execute(_id, params) {
        assertMutable(state);
        const nextStyles = new Map();
        for (const update of params.updates) {
          const element = state.elements.find(
            (candidate) => candidate.id === update.elementId,
          );
          if (!element) {
            throw new Error(`找不到元素：${update.elementId}`);
          }
          nextStyles.set(element.id, { ...element.style, ...update.style });
        }
        for (const [elementId, style] of nextStyles) {
          const element = state.elements.find(
            (candidate) => candidate.id === elementId,
          );
          element.style = style;
        }
        return resultText(`已更新 ${params.updates.length} 个元素的样式。`);
      },
    },
    {
      name: "layout_canvas_elements",
      label: "布局画布元素",
      description:
        "Arrange existing draft elements horizontally, vertically, or in a grid.",
      parameters: Type.Object({
        elementIds: Type.Array(Type.String(), { minItems: 1, maxItems: 80 }),
        direction: Type.Union([
          Type.Literal("horizontal"),
          Type.Literal("vertical"),
          Type.Literal("grid"),
        ]),
        originX: Type.Number({ minimum: -20_000, maximum: 20_000 }),
        originY: Type.Number({ minimum: -20_000, maximum: 20_000 }),
        gapX: Type.Number({ minimum: 0, maximum: 2000 }),
        gapY: Type.Number({ minimum: 0, maximum: 2000 }),
        columns: Type.Optional(Type.Number({ minimum: 1, maximum: 20 })),
      }),
      executionMode: "sequential",
      async execute(_id, params) {
        assertMutable(state);
        const arrangedElements = params.elementIds.map((elementId) => {
          const element = state.elements.find(
            (candidate) => candidate.id === elementId,
          );
          if (!element) {
            throw new Error(`找不到元素：${elementId}`);
          }
          return element;
        });
        let cursorX = params.originX;
        let cursorY = params.originY;
        arrangedElements.forEach((element, index) => {
          if (params.direction === "horizontal") {
            element.x = cursorX;
            element.y = params.originY;
            cursorX += element.width + params.gapX;
          } else if (params.direction === "vertical") {
            element.x = params.originX;
            element.y = cursorY;
            cursorY += element.height + params.gapY;
          } else {
            const columns =
              params.columns || Math.ceil(Math.sqrt(params.elementIds.length));
            const column = index % columns;
            const row = Math.floor(index / columns);
            const maxWidth = Math.max(
              ...arrangedElements.map((candidate) => candidate.width),
            );
            const maxHeight = Math.max(
              ...arrangedElements.map((candidate) => candidate.height),
            );
            element.x = params.originX + column * (maxWidth + params.gapX);
            element.y = params.originY + row * (maxHeight + params.gapY);
          }
        });
        return resultText(`已完成 ${params.elementIds.length} 个元素的布局。`);
      },
    },
    {
      name: "connect_canvas_elements",
      label: "连接画布元素",
      description:
        "Optionally create editable arrows only for explicit business relationships such as process flow, causality, dependency, hierarchy, or data flow. Never use arrows for presentation order, visual guidance, decoration, or animation sequence.",
      parameters: Type.Object({
        connectors: Type.Array(
          Type.Object({
            id: Type.String({ minLength: 1, maxLength: 64 }),
            from: Type.String({ minLength: 1, maxLength: 64 }),
            to: Type.String({ minLength: 1, maxLength: 64 }),
            label: Type.Optional(Type.String({ maxLength: 160 })),
            role: Type.Optional(Type.String({ maxLength: 64 })),
            relationship: Type.Union([
              Type.Literal("process-flow"),
              Type.Literal("causal"),
              Type.Literal("dependency"),
              Type.Literal("hierarchy"),
              Type.Literal("data-flow"),
            ]),
            meaning: Type.String({ minLength: 2, maxLength: 200 }),
            style: Type.Optional(styleSchema),
          }),
          { minItems: 1, maxItems: 120 },
        ),
      }),
      executionMode: "sequential",
      async execute(_id, params) {
        assertMutable(state);
        const spacingWarnings = [];
        const elementIds = new Set(state.elements.map((element) => element.id));
        const allIds = new Set([
          ...elementIds,
          ...state.connectors.map((connector) => connector.id),
        ]);
        for (const connector of params.connectors) {
          if (allIds.has(connector.id)) {
            throw new Error(`画布语义 id 重复：${connector.id}`);
          }
          if (
            !elementIds.has(connector.from) ||
            !elementIds.has(connector.to)
          ) {
            throw new Error(`连接线 ${connector.id} 引用了不存在的元素`);
          }
          if (
            /(阅读|展示|下一页|下一个|动画|出场|视觉|装饰|排版|顺序)/.test(
              connector.meaning,
            )
          ) {
            throw new Error(
              `连接线 ${connector.id} 没有表达有效业务关系；阅读、展示和动画顺序应通过布局与时间轴表达`,
            );
          }
          const from = state.elements.find(
            (element) => element.id === connector.from,
          );
          const to = state.elements.find(
            (element) => element.id === connector.to,
          );
          const spacingWarning = getConnectorSpacingWarning(
            connector,
            from,
            to,
          );
          if (spacingWarning) {
            spacingWarnings.push(spacingWarning);
          }
          allIds.add(connector.id);
        }
        for (const connector of params.connectors) {
          state.connectors.push(structuredClone(connector));
        }
        return resultText(
          `已添加 ${params.connectors.length} 条连接线。${
            spacingWarnings.length > 0 ? ` ${spacingWarnings.join(" ")}` : ""
          }`,
          spacingWarnings.length > 0
            ? { kind: "connector-spacing-warnings", warnings: spacingWarnings }
            : undefined,
        );
      },
    },
    {
      name: "finalize_canvas_draft",
      label: "冻结画布 Draft",
      description:
        "Validate and freeze the complete canvas draft before delegating animation.",
      parameters: Type.Object({
        animationBrief: Type.Union([animationBriefSchema, Type.String()]),
      }),
      executionMode: "sequential",
      async execute(_id, params) {
        assertMutable(state);
        const animationBrief = parseAnimationBrief(params.animationBrief);
        if (
          typeof animationBrief.intent !== "string" ||
          animationBrief.intent.trim().length === 0
        ) {
          throw new Error("动画简报缺少 intent");
        }
        const repairs = validateAndRepairDraft(state);
        state.frozen = true;
        state.animationBrief = structuredClone(animationBrief);
        return resultText(
          `Canvas Draft 已冻结：${state.elements.length} 个基础元素、${
            state.libraryAssets.length
          } 个资源条目、${state.connectors.length} 条连接线。${
            repairs.removedBeatReferences.length > 0
              ? ` 已自动清理 ${repairs.removedBeatReferences.length} 个未成功创建的故事节拍引用。`
              : ""
          }`,
          { kind: "canvas-draft", draft: snapshot(state), repairs },
        );
      },
    },
    {
      name: "delegate_animation",
      label: "委派动画子 Agent",
      description:
        "Delegate the frozen canvas draft to the specialist animation sub-agent. This is the only tool that produces a final story artifact.",
      parameters: Type.Object({}),
      executionMode: "sequential",
      async execute(_id, _params, signal) {
        if (!state.frozen || !state.animationBrief) {
          throw new Error("必须先调用 finalize_canvas_draft 冻结画布");
        }
        const draft = snapshot(state);
        const animation = await animate(draft, state.animationBrief, signal);
        const artifact = {
          kind: "story-artifact",
          artifactId: randomUUID(),
          summary: `${draft.title}画布与动画已完成`,
          canvas: draft,
          animation,
        };
        return resultText(
          `故事“${draft.title}”已完成：${draft.elements.length} 个基础元素、${draft.libraryAssets.length} 个资源条目，动画总时长 ${animation.durationMs}ms。`,
          artifact,
        );
      },
    },
  ];
};

export const createCanvasDraftState = (existingCanvas = null) => ({
  story: existingCanvas
    ? {
        id: existingCanvas.id,
        title: existingCanvas.title,
        summary: existingCanvas.summary,
        beats: withDefaultStorySpaces(existingCanvas.beats || []),
      }
    : null,
  elements: structuredClone(existingCanvas?.elements || []),
  libraryAssets: structuredClone(existingCanvas?.libraryAssets || []),
  connectors: structuredClone(existingCanvas?.connectors || []),
  frozen: false,
  animationBrief: null,
  editing: Boolean(existingCanvas),
});
