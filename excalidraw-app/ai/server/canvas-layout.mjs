export const STORY_STAGE = Object.freeze({ width: 1280, height: 720 });

const DEFAULT_SPACE_PADDING = 60;
const DEFAULT_SECTION_PADDING = 24;
const DEFAULT_GAP = 24;
const BACKGROUND_ROLES = new Set([
  "background",
  "section-background",
  "section-frame",
  "group-outline",
]);

const insetRect = (rect, padding) => ({
  x: rect.x + padding,
  y: rect.y + padding,
  width: Math.max(1, rect.width - padding * 2),
  height: Math.max(1, rect.height - padding * 2),
});

const weightedLinearRects = (bounds, entries, direction, gap) => {
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

const gridRects = (bounds, count, columns, gap) => {
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

const allocateRects = (bounds, entries, layout) => {
  if (entries.length === 0) {
    return [];
  }
  const gap = layout.gap ?? DEFAULT_GAP;
  if (layout.mode === "row" || layout.mode === "column") {
    return weightedLinearRects(bounds, entries, layout.mode, gap);
  }
  return gridRects(bounds, entries.length, layout.columns, gap);
};

const textUnits = (value) =>
  [...String(value || "")].reduce(
    (sum, character) => sum + (/^[\x00-\xff]$/.test(character) ? 0.56 : 1),
    0,
  );

const preferredItemSize = (item) => {
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

const placeItemInRect = (item, rect) => {
  const preferred = preferredItemSize(item);
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
};

const layoutSectionItems = (state, section, sectionRect) => {
  const allItems = [...state.elements, ...state.libraryAssets];
  const sectionItems = allItems.filter(
    (item) => !item.parentId && item.sectionId === section.id,
  );
  const backgrounds = sectionItems.filter((item) =>
    BACKGROUND_ROLES.has(item.role),
  );
  const contentItems = sectionItems.filter(
    (item) => !BACKGROUND_ROLES.has(item.role),
  );

  backgrounds.forEach((background) => {
    background.x = sectionRect.x;
    background.y = sectionRect.y;
    background.width = sectionRect.width;
    background.height = sectionRect.height;
  });

  if (contentItems.length === 0) {
    return;
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
    return;
  }
  if (section.layout.mode === "overlay") {
    contentItems.forEach((item) => placeItemInRect(item, contentRect));
    return;
  }
  const cells = allocateRects(contentRect, contentItems, section.layout);
  contentItems.forEach((item, index) => placeItemInRect(item, cells[index]));
};

export const materializeCanvasLayout = (state) => {
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
    sections.forEach((section, index) =>
      layoutSectionItems(state, section, sectionRects[index]),
    );
    materializedSpaces.push({
      spaceId: spaceLayout.spaceId,
      sections: sections.map((section, index) => ({
        sectionId: section.id,
        bounds: sectionRects[index],
      })),
    });
  }
  state.layoutNeedsMaterialization = false;
  return { materialized: true, spaces: materializedSpaces };
};
