import type {
  CanvasDraftElement,
  CanvasDraftLibraryAsset,
  CanvasElementStyle,
  CanvasLayoutIntent,
  CanvasLayoutSection,
  CanvasSpaceLayout,
} from "../../../src/ai/story/types";

type Rect = { x: number; y: number; width: number; height: number };
type WeightedEntry = { weight?: number };
type ManagedLayoutItem = (CanvasDraftElement | CanvasDraftLibraryAsset) & {
  label?: string;
  type?: CanvasDraftElement["type"];
  style?: CanvasElementStyle;
  weight?: number;
};
type ManagedLayoutState = {
  elements: CanvasDraftElement[];
  libraryAssets: CanvasDraftLibraryAsset[];
  sections: CanvasLayoutSection[];
  spaceLayouts: CanvasSpaceLayout[];
  layoutNeedsMaterialization: boolean;
};
type LayoutEvaluation = {
  fits: boolean;
  minFontSize: number;
  totalFontSize: number;
};

export const STORY_STAGE = Object.freeze({ width: 1280, height: 720 });

const DEFAULT_SPACE_PADDING = 60;
const DEFAULT_SECTION_PADDING = 24;
const DEFAULT_GAP = 24;
const MIN_READABLE_FONT_SIZE = 10;
const DEFAULT_FONT_SIZE = 20;
const TEXT_LINE_HEIGHT = 1.3;
const SHAPE_TEXT_PADDING_X = 20;
const SHAPE_TEXT_PADDING_Y = 16;
const BACKGROUND_ROLES = new Set([
  "background",
  "section-background",
  "section-frame",
  "group-outline",
]);

const insetRect = (rect: Rect, padding: number): Rect => ({
  x: rect.x + padding,
  y: rect.y + padding,
  width: Math.max(1, rect.width - padding * 2),
  height: Math.max(1, rect.height - padding * 2),
});

const weightedLinearRects = (
  bounds: Rect,
  entries: WeightedEntry[],
  direction: "row" | "column",
  gap: number,
): Rect[] => {
  const totalGap = gap * Math.max(0, entries.length - 1);
  const available = Math.max(
    1,
    (direction === "row" ? bounds.width : bounds.height) - totalGap,
  );
  const totalWeight = entries.reduce(
    (sum, entry) => sum + Math.max(0.1, entry.weight || 1),
    0,
  );
  let cursor = direction === "row" ? bounds.x : bounds.y;
  return entries.map((entry, index) => {
    const extent =
      index === entries.length - 1
        ? direction === "row"
          ? bounds.x + bounds.width - cursor
          : bounds.y + bounds.height - cursor
        : (available * Math.max(0.1, entry.weight || 1)) / totalWeight;
    const rect =
      direction === "row"
        ? { x: cursor, y: bounds.y, width: extent, height: bounds.height }
        : { x: bounds.x, y: cursor, width: bounds.width, height: extent };
    cursor += extent + gap;
    return rect;
  });
};

const gridRects = (
  bounds: Rect,
  count: number,
  columns: number | undefined,
  gap: number,
): Rect[] => {
  const columnCount = Math.max(
    1,
    Math.min(count, columns || Math.ceil(Math.sqrt(count))),
  );
  const rowCount = Math.ceil(count / columnCount);
  const cellWidth = Math.max(
    1,
    (bounds.width - gap * Math.max(0, columnCount - 1)) / columnCount,
  );
  const cellHeight = Math.max(
    1,
    (bounds.height - gap * Math.max(0, rowCount - 1)) / rowCount,
  );
  return Array.from({ length: count }, (_, index) => ({
    x: bounds.x + (index % columnCount) * (cellWidth + gap),
    y: bounds.y + Math.floor(index / columnCount) * (cellHeight + gap),
    width: cellWidth,
    height: cellHeight,
  }));
};

const allocateRects = (
  bounds: Rect,
  entries: WeightedEntry[],
  layout: CanvasLayoutIntent,
): Rect[] => {
  if (entries.length === 0) {
    return [];
  }
  const gap = layout.gap ?? DEFAULT_GAP;
  if (layout.mode === "row" || layout.mode === "column") {
    return weightedLinearRects(bounds, entries, layout.mode, gap);
  }
  return gridRects(bounds, entries.length, layout.columns, gap);
};

const textUnits = (value: unknown): number =>
  [...String(value || "")].reduce(
    (sum, character) => sum + (character.charCodeAt(0) <= 0xff ? 0.56 : 1),
    0,
  );

const wrappedLineCount = (
  value: unknown,
  fontSize: number,
  availableWidth: number,
): number => {
  const unitsPerLine = Math.max(1, availableWidth / Math.max(1, fontSize));
  return String(value || "")
    .split("\n")
    .reduce(
      (count, line) =>
        count + Math.max(1, Math.ceil(textUnits(line) / unitsPerLine)),
      0,
    );
};

const labelFitsRect = (
  item: ManagedLayoutItem,
  rect: Rect,
  fontSize: number,
): boolean => {
  if (!item.label?.trim()) {
    return true;
  }
  const isStandaloneText = item.type === "text";
  const availableWidth = Math.max(
    1,
    rect.width - (isStandaloneText ? 0 : SHAPE_TEXT_PADDING_X * 2),
  );
  const availableHeight = Math.max(
    1,
    rect.height - (isStandaloneText ? 0 : SHAPE_TEXT_PADDING_Y * 2),
  );
  const lineCount = wrappedLineCount(item.label, fontSize, availableWidth);
  return lineCount * fontSize * TEXT_LINE_HEIGHT <= availableHeight;
};

const fittingFontSize = (
  item: ManagedLayoutItem,
  rect: Rect,
): { fits: boolean; fontSize: number } => {
  if (!item.label?.trim()) {
    return { fits: true, fontSize: item.style?.fontSize ?? DEFAULT_FONT_SIZE };
  }
  const preferredFontSize =
    item.layoutFrame?.fontSize || item.style?.fontSize || DEFAULT_FONT_SIZE;
  for (
    let fontSize = preferredFontSize;
    fontSize >= MIN_READABLE_FONT_SIZE;
    fontSize -= 1
  ) {
    if (labelFitsRect(item, rect, fontSize)) {
      return { fits: true, fontSize };
    }
  }
  return { fits: false, fontSize: MIN_READABLE_FONT_SIZE };
};

const preferredItemSize = (item: ManagedLayoutItem) => {
  const preferredFrame = item.layoutFrame;
  if (item.type !== "text") {
    return {
      width: Math.max(1, preferredFrame?.width || item.width || 200),
      height: Math.max(1, preferredFrame?.height || item.height || 120),
    };
  }
  const fontSize = preferredFrame?.fontSize || item.style?.fontSize || 20;
  const lines = String(item.label || item.id).split("\n");
  return {
    width: Math.max(
      40,
      Math.min(720, Math.max(...lines.map(textUnits), 1) * fontSize + 12),
    ),
    height: Math.max(24, lines.length * fontSize * 1.3 + 8),
  };
};

const placeItemInRect = (
  item: ManagedLayoutItem,
  rect: Rect,
  { stretchLabeledContent = false }: { stretchLabeledContent?: boolean } = {},
) => {
  const preferred = preferredItemSize(item);
  if (stretchLabeledContent && item.label?.trim()) {
    const fit = fittingFontSize(item, rect);
    item.width = rect.width;
    item.height = rect.height;
    item.x = rect.x;
    item.y = rect.y;
    item.style = { ...(item.style || {}), fontSize: fit.fontSize };
    return fit;
  }
  const scale = Math.min(
    1,
    rect.width / preferred.width,
    rect.height / preferred.height,
  );
  item.width = Math.max(1, preferred.width * scale);
  item.height = Math.max(1, preferred.height * scale);
  item.x = rect.x + (rect.width - item.width) / 2;
  item.y = rect.y + (rect.height - item.height) / 2;
  if (scale < 1 && item.style?.fontSize) {
    item.style.fontSize = Math.max(
      10,
      (item.layoutFrame?.fontSize || item.style.fontSize) * scale,
    );
  }
  return fittingFontSize(item, {
    x: item.x,
    y: item.y,
    width: item.width,
    height: item.height,
  });
};

const evaluateCells = (
  items: ManagedLayoutItem[],
  cells: Rect[],
): LayoutEvaluation => {
  const fits = items.map((item, index) => fittingFontSize(item, cells[index]));
  return {
    fits: fits.every((result) => result.fits),
    minFontSize: Math.min(...fits.map((result) => result.fontSize)),
    totalFontSize: fits.reduce((sum, result) => sum + result.fontSize, 0),
  };
};

const chooseContentLayout = (
  bounds: Rect,
  items: ManagedLayoutItem[],
  requestedLayout: CanvasLayoutIntent,
) => {
  const requestedCells = allocateRects(bounds, items, requestedLayout);
  const requestedEvaluation = evaluateCells(items, requestedCells);
  if (requestedEvaluation.fits || items.length < 2) {
    return {
      cells: requestedCells,
      effectiveLayout: requestedLayout,
      reflowed: false,
      evaluation: requestedEvaluation,
    };
  }

  const candidates = Array.from({ length: items.length }, (_, index) => {
    const layout: CanvasLayoutIntent = {
      mode: "grid" as const,
      columns: index + 1,
      gap: requestedLayout.gap,
    };
    const cells = allocateRects(bounds, items, layout);
    return { layout, cells, evaluation: evaluateCells(items, cells) };
  }).sort(
    (left, right) =>
      Number(right.evaluation.fits) - Number(left.evaluation.fits) ||
      right.evaluation.minFontSize - left.evaluation.minFontSize ||
      right.evaluation.totalFontSize - left.evaluation.totalFontSize,
  );
  const best = candidates[0];
  return {
    cells: best.cells,
    effectiveLayout: best.layout,
    reflowed: true,
    evaluation: best.evaluation,
  };
};

const layoutSectionItems = (
  state: ManagedLayoutState,
  section: CanvasLayoutSection,
  sectionRect: Rect,
) => {
  const allItems: ManagedLayoutItem[] = [
    ...state.elements,
    ...state.libraryAssets,
  ];
  const sectionItems = allItems.filter(
    (item) => !item.parentId && item.sectionId === section.id,
  );
  const backgrounds = sectionItems.filter((item) =>
    BACKGROUND_ROLES.has(item.role ?? ""),
  );
  const contentItems = sectionItems.filter(
    (item) => !BACKGROUND_ROLES.has(item.role ?? ""),
  );

  backgrounds.forEach((background) => {
    background.x = sectionRect.x;
    background.y = sectionRect.y;
    background.width = sectionRect.width;
    background.height = sectionRect.height;
  });

  if (contentItems.length === 0) {
    return { sectionId: section.id, reflowed: false };
  }
  const contentRect = insetRect(
    sectionRect,
    section.layout.padding ?? DEFAULT_SECTION_PADDING,
  );
  if (section.layout.mode === "free") {
    contentItems.forEach((item) => {
      item.x = contentRect.x + (item.layoutFrame?.x ?? item.x ?? 0);
      item.y = contentRect.y + (item.layoutFrame?.y ?? item.y ?? 0);
    });
    return { sectionId: section.id, reflowed: false };
  }
  if (section.layout.mode === "overlay") {
    contentItems.forEach((item) => placeItemInRect(item, contentRect));
    return { sectionId: section.id, reflowed: false };
  }
  const placement = chooseContentLayout(
    contentRect,
    contentItems,
    section.layout,
  );
  contentItems.forEach((item, index) =>
    placeItemInRect(item, placement.cells[index], {
      stretchLabeledContent: true,
    }),
  );
  if (!placement.evaluation.fits) {
    throw new Error(
      `Section ${
        section.id
      } 的内容在可读字号下无法排入舞台，请拆分内容或减少单幕信息量：${contentItems
        .filter(
          (item, index) => !fittingFontSize(item, placement.cells[index]).fits,
        )
        .map((item) => item.id)
        .join("、")}`,
    );
  }
  return {
    sectionId: section.id,
    requestedMode: section.layout.mode,
    effectiveMode: placement.effectiveLayout.mode,
    effectiveColumns: placement.effectiveLayout.columns,
    reflowed: placement.reflowed,
  };
};

const rectsOverlap = (left: Rect, right: Rect): boolean =>
  left.x < right.x + right.width &&
  left.x + left.width > right.x &&
  left.y < right.y + right.height &&
  left.y + left.height > right.y;

const unionRects = (rects: Rect[]): Rect => {
  const left = Math.min(...rects.map((rect) => rect.x));
  const top = Math.min(...rects.map((rect) => rect.y));
  const right = Math.max(...rects.map((rect) => rect.x + rect.width));
  const bottom = Math.max(...rects.map((rect) => rect.y + rect.height));
  return { x: left, y: top, width: right - left, height: bottom - top };
};

export const assertManagedCanvasLayoutIntegrity = (
  state: ManagedLayoutState,
) => {
  const sectionsById = new Map(
    state.sections.map((section) => [section.id, section]),
  );
  const childrenByParent = new Map<string, ManagedLayoutItem[]>();
  const allItems: ManagedLayoutItem[] = [
    ...state.elements,
    ...state.libraryAssets,
  ];
  for (const item of allItems) {
    if (!item.parentId) {
      continue;
    }
    const children = childrenByParent.get(item.parentId) || [];
    children.push(item);
    childrenByParent.set(item.parentId, children);
  }
  const visualRect = (item: ManagedLayoutItem): Rect =>
    unionRects([
      { x: item.x, y: item.y, width: item.width, height: item.height },
      ...(childrenByParent.get(item.id) || []).map(visualRect),
    ]);
  const contentItems = allItems.filter(
    (item): item is ManagedLayoutItem & { sectionId: string } =>
      !item.parentId &&
      Boolean(item.sectionId) &&
      !BACKGROUND_ROLES.has(item.role ?? ""),
  );
  const violations: string[] = [];

  for (const item of contentItems) {
    if (
      !labelFitsRect(
        item,
        { x: item.x, y: item.y, width: item.width, height: item.height },
        item.style?.fontSize || DEFAULT_FONT_SIZE,
      )
    ) {
      violations.push(`文字溢出 ${item.id}`);
    }
  }
  for (let leftIndex = 0; leftIndex < contentItems.length; leftIndex += 1) {
    const left = contentItems[leftIndex];
    const leftSection = sectionsById.get(left.sectionId);
    for (
      let rightIndex = leftIndex + 1;
      rightIndex < contentItems.length;
      rightIndex += 1
    ) {
      const right = contentItems[rightIndex];
      const rightSection = sectionsById.get(right.sectionId);
      if (
        !leftSection ||
        !rightSection ||
        leftSection.spaceId !== rightSection.spaceId
      ) {
        continue;
      }
      if (
        left.sectionId === right.sectionId &&
        (leftSection.layout.mode === "overlay" ||
          leftSection.layout.mode === "free")
      ) {
        continue;
      }
      if (rectsOverlap(visualRect(left), visualRect(right))) {
        violations.push(`元素重叠 ${left.id}/${right.id}`);
      }
    }
  }
  if (violations.length > 0) {
    throw new Error(`托管布局完整性校验失败：${violations.join("；")}`);
  }
  return { valid: true, checkedItems: contentItems.length };
};

export const materializeCanvasLayout = (state: ManagedLayoutState) => {
  if (!state.layoutNeedsMaterialization || state.sections.length === 0) {
    return { materialized: false, spaces: [] };
  }
  const sectionsById = new Map(
    state.sections.map((section) => [section.id, section]),
  );
  for (const item of [...state.elements, ...state.libraryAssets]) {
    if (item.sectionId && !sectionsById.has(item.sectionId)) {
      throw new Error(
        `画布条目 ${item.id} 引用了不存在的 Section ${item.sectionId}`,
      );
    }
  }

  const materializedSpaces = [];
  for (const spaceLayout of state.spaceLayouts) {
    const sections = state.sections
      .filter((section) => section.spaceId === spaceLayout.spaceId)
      .sort(
        (left, right) =>
          (left.order || 0) - (right.order || 0) ||
          left.id.localeCompare(right.id),
      );
    if (sections.length === 0) {
      continue;
    }
    const stageRect = insetRect(
      { x: 0, y: 0, ...STORY_STAGE },
      spaceLayout.layout.padding ?? DEFAULT_SPACE_PADDING,
    );
    const sectionRects = allocateRects(stageRect, sections, spaceLayout.layout);
    const sectionPlacements = sections.map((section, index) =>
      layoutSectionItems(state, section, sectionRects[index]),
    );
    materializedSpaces.push({
      spaceId: spaceLayout.spaceId,
      sections: sections.map((section, index) => ({
        bounds: sectionRects[index],
        ...sectionPlacements[index],
      })),
    });
  }
  state.layoutNeedsMaterialization = false;
  return { materialized: true, spaces: materializedSpaces };
};
