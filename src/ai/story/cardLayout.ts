import type {
  CanvasChildLayout,
  CanvasDraft,
  CanvasDraftElement,
  CanvasDraftLibraryAsset,
} from "./types";

type CardChild = CanvasDraftElement | CanvasDraftLibraryAsset;

const TEXT_SLOT_ORDER: Record<CanvasChildLayout["slot"], number> = {
  header: 0,
  badge: 1,
  center: 2,
  media: 2,
  body: 3,
  footer: 4,
};

const mergeLegacyCardText = (
  draft: CanvasDraft,
): Pick<CanvasDraft, "elements" | "beats"> => {
  const elements = draft.elements.map((element) => ({
    ...element,
    style: element.style ? { ...element.style } : undefined,
  }));
  const parents = new Map(
    elements
      .filter((element) => element.type !== "text" && !element.parentId)
      .map((element) => [element.id, element]),
  );
  const children = elements.filter(
    (element) => element.type === "text" && element.parentId && element.layout,
  );
  const byParent = new Map<string, CanvasDraftElement[]>();
  children.forEach((child) => {
    if (!parents.has(child.parentId!)) {
      return;
    }
    byParent.set(child.parentId!, [
      ...(byParent.get(child.parentId!) || []),
      child,
    ]);
  });
  const childToParent = new Map<string, string>();
  byParent.forEach((group, parentId) => {
    const parent = parents.get(parentId)!;
    group.sort(
      (left, right) =>
        TEXT_SLOT_ORDER[left.layout!.slot] - TEXT_SLOT_ORDER[right.layout!.slot] ||
        (left.layout?.order || 0) - (right.layout?.order || 0) ||
        left.id.localeCompare(right.id),
    );
    parent.label = [parent.label, ...group.map((child) => child.label)]
      .filter((label): label is string => Boolean(label?.trim()))
      .filter((label, index, labels) => labels.indexOf(label) === index)
      .join("\n");
    const representative =
      group.find((child) => child.layout?.slot === "body") || group[0];
    const hasMedia = draft.libraryAssets.some(
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
    group.forEach((child) => childToParent.set(child.id, parentId));
  });
  return {
    elements: elements.filter((element) => !childToParent.has(element.id)),
    beats: draft.beats.map((beat) => ({
      ...beat,
      elementIds: [
        ...new Set(
          beat.elementIds.map((id) => childToParent.get(id) || id),
        ),
      ],
    })),
  };
};

const SLOT_RATIOS: Record<
  Exclude<CanvasChildLayout["slot"], "badge">,
  readonly [number, number]
> = {
  header: [0, 0.22],
  media: [0.18, 0.62],
  body: [0.58, 0.82],
  footer: [0.8, 1],
  center: [0.18, 0.82],
};

export const resolveCanvasCardLayout = (draft: CanvasDraft): CanvasDraft => {
  const migrated = mergeLegacyCardText(draft);
  const elements = migrated.elements.map((element) => ({ ...element }));
  const libraryAssets = draft.libraryAssets.map((asset) => ({ ...asset }));
  const parents = new Map(
    elements
      .filter((element) => element.type !== "text" && !element.parentId)
      .map((element) => [element.id, element]),
  );
  const groups = new Map<string, CardChild[]>();
  for (const child of [...elements, ...libraryAssets]) {
    if (!child.parentId || !child.layout) {
      continue;
    }
    const key = `${child.parentId}:${child.layout.slot}`;
    groups.set(key, [...(groups.get(key) || []), child]);
  }
  for (const group of groups.values()) {
    group.sort(
      (left, right) =>
        (left.layout?.order || 0) - (right.layout?.order || 0) ||
        left.id.localeCompare(right.id),
    );
    const parent = parents.get(group[0].parentId!);
    const layout = group[0].layout!;
    if (!parent) {
      throw new Error(`卡片子元素 ${group[0].id} 的 parentId 无效`);
    }
    const padding =
      layout.padding ?? Math.max(16, Math.min(40, parent.height * 0.08));
    const innerX = parent.x + padding;
    const innerY = parent.y + padding;
    const innerWidth = Math.max(1, parent.width - padding * 2);
    const innerHeight = Math.max(1, parent.height - padding * 2);
    if (layout.slot === "badge") {
      group.forEach((child, index) => {
        child.width = Math.min(child.width || 96, innerWidth * 0.38);
        child.height = Math.min(child.height || 36, innerHeight * 0.18);
        child.x = innerX + innerWidth - child.width;
        child.y =
          innerY + index * (child.height + (child.layout?.gap || 8));
      });
      continue;
    }
    const [startRatio, endRatio] = SLOT_RATIOS[layout.slot];
    const regionY = innerY + innerHeight * startRatio;
    const regionHeight = innerHeight * (endRatio - startRatio);
    const gap = layout.gap ?? 10;
    const itemHeight = Math.max(
      1,
      (regionHeight - gap * Math.max(0, group.length - 1)) / group.length,
    );
    group.forEach((child, index) => {
      const preferredWidth = child.width || innerWidth;
      const preferredHeight = child.height || itemHeight;
      let width = Math.min(preferredWidth, innerWidth);
      let height = Math.min(preferredHeight, itemHeight);
      if ("elements" in child) {
        const aspect = preferredWidth / Math.max(1, preferredHeight);
        width = Math.min(width, height * aspect);
        height = Math.min(height, width / Math.max(0.01, aspect));
      } else if ((child.layout?.align || "center") === "stretch") {
        width = innerWidth;
      }
      const align = child.layout?.align || "center";
      child.width = width;
      child.height = height;
      child.x =
        align === "left" || align === "stretch"
          ? innerX
          : align === "right"
            ? innerX + innerWidth - width
            : innerX + (innerWidth - width) / 2;
      child.y =
        regionY +
        index * (itemHeight + gap) +
        (itemHeight - height) / 2;
    });
  }
  return { ...draft, beats: migrated.beats, elements, libraryAssets };
};
